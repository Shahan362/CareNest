-- CareNest: messages (caregiver / patient <-> office) and in-app notifications.
-- Run AFTER 006_patient_side.sql. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- =====================================================================
-- Messages
-- =====================================================================
-- Each caregiver or patient has ONE conversation with the office (all admins share it).
-- There is no direct carer <-> patient chat: agencies keep contact through the office
-- for professional boundaries and so there is a record. Messages are never deleted.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  -- The caregiver / patient whose conversation with the office this is.
  thread_user_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null default auth.uid(),
  sender_name text not null default '',
  from_office boolean not null default false,
  body text not null check (length(trim(body)) between 1 and 4000),
  -- When the other side read it.
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_idx on public.messages (thread_user_id, created_at);
create index if not exists messages_agency_idx on public.messages (agency_id, created_at desc);

-- Sender, name and side always come from the logged-in user, never from the app.
create or replace function public.set_message_sender()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.sender_id := auth.uid();
    new.sender_name := coalesce(public.my_display_name(), 'Unknown');
    new.from_office := public.my_role() = 'admin';
    new.read_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_sender on public.messages;
create trigger messages_set_sender
  before insert on public.messages
  for each row execute function public.set_message_sender();

alter table public.messages enable row level security;

drop policy if exists "Office reads agency messages" on public.messages;
create policy "Office reads agency messages" on public.messages
  for select to authenticated using (public.is_agency_admin(agency_id));

drop policy if exists "Users read own conversation" on public.messages;
create policy "Users read own conversation" on public.messages
  for select to authenticated using (thread_user_id = auth.uid());

drop policy if exists "Send messages" on public.messages;
create policy "Send messages" on public.messages
  for insert to authenticated
  with check (
    agency_id = public.my_agency_id()
    and (
      -- A caregiver / patient writing in their own conversation
      (thread_user_id = auth.uid() and public.my_role() in ('caregiver', 'patient'))
      -- The office writing to a caregiver / patient in its agency
      or (public.my_role() = 'admin' and exists (
        select 1 from public.profiles p
        where p.id = thread_user_id and p.agency_id = public.my_agency_id() and p.role in ('caregiver', 'patient')
      ))
    )
  );

-- Mark the other side's messages in a conversation as read.
create or replace function public.mark_thread_read(p_thread_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean := public.my_role() = 'admin';
  v_agency uuid := public.my_agency_id();
begin
  if is_admin then
    update public.messages set read_at = now()
    where thread_user_id = p_thread_user_id and agency_id = v_agency and not from_office and read_at is null;
    -- Every admin's "new message" notification for this conversation is now done.
    update public.notifications set read_at = now()
    where type = 'message' and read_at is null and agency_id = v_agency
      and link = '/admin/messages?u=' || p_thread_user_id::text;
  elsif p_thread_user_id = auth.uid() then
    update public.messages set read_at = now()
    where thread_user_id = auth.uid() and from_office and read_at is null;
    update public.notifications set read_at = now()
    where user_id = auth.uid() and type = 'message' and read_at is null;
  end if;
end;
$$;

-- The office inbox: one row per conversation with its last message and unread count.
create or replace function public.office_threads()
returns table (
  thread_user_id uuid,
  name text,
  role text,
  last_body text,
  last_at timestamptz,
  last_from_office boolean,
  unread int
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select * from public.messages
    where agency_id = public.my_agency_id() and public.my_role() = 'admin'
  ),
  last_msg as (
    select distinct on (thread_user_id) thread_user_id, body, created_at, from_office
    from mine order by thread_user_id, created_at desc
  ),
  counts as (
    select thread_user_id, (count(*) filter (where not from_office and read_at is null))::int as n
    from mine group by thread_user_id
  )
  select l.thread_user_id,
         coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email, 'Former user'),
         p.role, l.body, l.created_at, l.from_office, c.n
  from last_msg l
  join counts c using (thread_user_id)
  left join public.profiles p on p.id = l.thread_user_id
  order by l.created_at desc;
$$;

-- =====================================================================
-- Notifications
-- =====================================================================
-- Created only by the database when something happens, so they can't be skipped or faked.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  -- Repeated alerts (e.g. 10 new visits at once) are grouped into one with a count.
  group_count int not null default 1,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- p_ids null = mark all as read.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------- Helpers used by the triggers ----------

-- "Tue 18/11 08:00" in UK time.
create or replace function public.fmt_when(p_ts timestamptz)
returns text language sql stable as $$
  select to_char(p_ts at time zone 'Europe/London', 'Dy DD/MM HH24:MI');
$$;

create or replace function public.notify(
  p_user uuid, p_agency uuid, p_type text, p_title text, p_body text, p_link text, p_group boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then
    return;
  end if;
  if p_group then
    update public.notifications
    set group_count = group_count + 1, body = p_body, title = p_title, created_at = now()
    where user_id = p_user and type = p_type and link is not distinct from p_link and read_at is null
      and created_at > now() - interval '12 hours';
    if found then
      return;
    end if;
  end if;
  insert into public.notifications (agency_id, user_id, type, title, body, link)
  values (p_agency, p_user, p_type, p_title, left(p_body, 300), p_link);
end;
$$;

create or replace function public.notify_admins(
  p_agency uuid, p_type text, p_title text, p_body text, p_link text, p_group boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  for a in select id from public.profiles where agency_id = p_agency and role = 'admin' loop
    perform public.notify(a.id, p_agency, p_type, p_title, p_body, p_link, p_group);
  end loop;
end;
$$;

create or replace function public.patient_name(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select trim(first_name || ' ' || last_name) from public.patients where id = p_id;
$$;

-- "Amira K." as patients see carers.
create or replace function public.carer_short_name(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select trim(first_name || ' ' || coalesce(left(last_name, 1) || '.', '')) from public.caregivers where id = p_id;
$$;

-- ---------- Visits: tell the carer and patient about changes (next 14 days only) ----------

create or replace function public.notify_visit_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  soon_new boolean;
  soon_old boolean;
  cg_new uuid;
  cg_old uuid;
  pt_user uuid;
  pname text;
begin
  if tg_op = 'DELETE' then
    if old.caregiver_id is not null and old.status = 'scheduled'
       and old.start_time between now() and now() + interval '14 days' then
      perform public.notify(
        (select user_id from public.caregivers where id = old.caregiver_id), old.agency_id, 'visit_removed',
        'A visit was taken off your schedule', public.fmt_when(old.start_time) || ' with ' || public.patient_name(old.patient_id),
        '/caregiver/schedule');
    end if;
    return old;
  end if;

  soon_new := new.start_time between now() and now() + interval '14 days';
  cg_new := (select user_id from public.caregivers where id = new.caregiver_id);
  pt_user := (select user_id from public.patients where id = new.patient_id);
  pname := public.patient_name(new.patient_id);

  if tg_op = 'INSERT' then
    if new.status = 'scheduled' and soon_new then
      perform public.notify(cg_new, new.agency_id, 'visit_assigned', 'New visit added to your schedule',
        public.fmt_when(new.start_time) || ' with ' || pname, '/caregiver/schedule', true);
    end if;
    return new;
  end if;

  -- UPDATE. Ignore the caregiver's own check-in / check-out (status and times only).
  soon_old := old.start_time between now() and now() + interval '14 days';
  if not (soon_new or soon_old) then
    return new;
  end if;
  cg_old := (select user_id from public.caregivers where id = old.caregiver_id);

  -- Cancelled
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.notify(cg_old, new.agency_id, 'visit_cancelled', 'Visit cancelled',
      public.fmt_when(old.start_time) || ' with ' || pname || '. You don''t need to go.', '/caregiver/schedule');
    perform public.notify(pt_user, new.agency_id, 'visit_cancelled', 'Visit cancelled',
      'Your visit on ' || public.fmt_when(old.start_time) || ' has been cancelled.', '/patient/visits');
    return new;
  end if;

  -- Restored after a cancellation
  if old.status = 'cancelled' and new.status = 'scheduled' then
    perform public.notify(cg_new, new.agency_id, 'visit_assigned', 'Visit back on your schedule',
      public.fmt_when(new.start_time) || ' with ' || pname, '/caregiver/schedule', true);
    perform public.notify(pt_user, new.agency_id, 'visit_changed', 'Visit reinstated',
      'Your visit on ' || public.fmt_when(new.start_time) || ' is going ahead.', '/patient/visits');
    return new;
  end if;

  if new.status <> 'scheduled' then
    return new;
  end if;

  -- Different carer
  if new.caregiver_id is distinct from old.caregiver_id then
    perform public.notify(cg_old, new.agency_id, 'visit_removed', 'A visit was taken off your schedule',
      public.fmt_when(old.start_time) || ' with ' || pname, '/caregiver/schedule');
    if soon_new then
      perform public.notify(cg_new, new.agency_id, 'visit_assigned', 'New visit added to your schedule',
        public.fmt_when(new.start_time) || ' with ' || pname, '/caregiver/schedule', true);
      perform public.notify(pt_user, new.agency_id, 'carer_changed', 'Your carer has changed',
        public.fmt_when(new.start_time) || ': ' || coalesce(public.carer_short_name(new.caregiver_id), 'carer to be confirmed'),
        '/patient/visits');
    end if;
    return new;
  end if;

  -- Same carer, new time
  if new.start_time <> old.start_time or new.end_time <> old.end_time then
    perform public.notify(cg_new, new.agency_id, 'visit_changed', 'Visit time changed',
      pname || ': now ' || public.fmt_when(new.start_time) || ' (was ' || public.fmt_when(old.start_time) || ')',
      '/caregiver/visits/' || new.id);
    perform public.notify(pt_user, new.agency_id, 'visit_changed', 'Your visit time has changed',
      'Now ' || public.fmt_when(new.start_time) || ' (was ' || public.fmt_when(old.start_time) || ')', '/patient/visits');
  end if;
  return new;
end;
$$;

drop trigger if exists visits_notify on public.visits;
create trigger visits_notify
  after insert or update or delete on public.visits
  for each row execute function public.notify_visit_change();

-- ---------- Requests ----------

create or replace function public.request_type_label(p_type text)
returns text language sql immutable as $$
  select case p_type
    when 'change_time' then 'Change a visit time'
    when 'cancel_visit' then 'Cancel a visit'
    when 'extra_visit' then 'Extra visit'
    when 'change_caregiver' then 'Change carer'
    when 'change_care' then 'Change care'
    else 'Other request' end;
$$;

create or replace function public.notify_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(new.agency_id, 'request', 'New request from ' || public.patient_name(new.patient_id),
      public.request_type_label(new.type) || ': ' || new.details, '/admin/requests');
  elsif old.status = 'pending' and new.status in ('approved', 'declined') then
    perform public.notify((select user_id from public.patients where id = new.patient_id), new.agency_id, 'request_answered',
      'Your request was ' || new.status,
      public.request_type_label(new.type) || coalesce(': ' || new.admin_response, ''), '/patient/requests');
  elsif old.status = 'pending' and new.status = 'withdrawn' then
    perform public.notify_admins(new.agency_id, 'request', public.patient_name(new.patient_id) || ' withdrew a request',
      public.request_type_label(new.type), '/admin/requests');
  end if;
  return new;
end;
$$;

drop trigger if exists care_requests_notify on public.care_requests;
create trigger care_requests_notify
  after insert or update of status on public.care_requests
  for each row execute function public.notify_request();

-- ---------- Feedback ----------

create or replace function public.notify_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(new.agency_id, 'feedback',
      case new.kind when 'complaint' then 'New complaint from ' when 'compliment' then 'Compliment from ' else 'Suggestion from ' end
        || public.patient_name(new.patient_id),
      new.message, '/admin/requests');
    -- Compliments about a carer go straight to them (complaints are handled by the office).
    if new.kind = 'compliment' and new.caregiver_id is not null then
      perform public.notify((select user_id from public.caregivers where id = new.caregiver_id), new.agency_id, 'compliment',
        'You received a compliment', new.message, '/caregiver/notifications');
    end if;
  elsif old.status = 'open' and new.status = 'resolved' and new.admin_response is not null then
    perform public.notify((select user_id from public.patients where id = new.patient_id), new.agency_id, 'feedback_reply',
      'The office replied to your ' || new.kind, new.admin_response, '/patient/feedback');
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_notify on public.feedback;
create trigger feedback_notify
  after insert or update of status on public.feedback
  for each row execute function public.notify_feedback();

-- ---------- Care notes: concerns ----------

create or replace function public.notify_concern()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.is_concern then
    perform public.notify_admins(new.agency_id, 'concern', 'Concern raised: ' || public.patient_name(new.patient_id),
      new.author_name || ': ' || new.body, '/admin');
  elsif tg_op = 'UPDATE' and new.is_concern and old.resolved_at is null and new.resolved_at is not null
        and new.author_id is not null and new.author_id is distinct from new.resolved_by then
    perform public.notify(new.author_id, new.agency_id, 'concern_resolved',
      'The office has dealt with your concern', 'About ' || public.patient_name(new.patient_id) || ': ' || new.body,
      '/caregiver/patients/' || new.patient_id);
  end if;
  return new;
end;
$$;

drop trigger if exists care_notes_notify on public.care_notes;
create trigger care_notes_notify
  after insert or update of resolved_at on public.care_notes
  for each row execute function public.notify_concern();

-- ---------- Invoices and payments ----------
-- Deferred so that the invoice lines (added after the invoice row) are counted in the total.

create or replace function public.notify_invoice_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  became_sent boolean;
  v_total numeric;
begin
  if tg_op = 'INSERT' then
    became_sent := new.status = 'sent';
  else
    became_sent := new.status = 'sent' and old.status = 'draft';
  end if;
  if became_sent then
    select coalesce(sum(amount), 0) into v_total from public.invoice_lines where invoice_id = new.id;
    perform public.notify((select user_id from public.patients where id = new.patient_id), new.agency_id, 'invoice',
      'New invoice ' || new.number,
      '£' || to_char(v_total, 'FM999,999,990.00') || ' due by ' || to_char(new.due_date, 'DD/MM/YYYY'),
      '/patient/invoices/' || new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_notify on public.invoices;
create constraint trigger invoices_notify
  after insert or update on public.invoices
  deferrable initially deferred
  for each row execute function public.notify_invoice_sent();

create or replace function public.notify_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  perform public.notify((select user_id from public.patients where id = inv.patient_id), new.agency_id, 'payment',
    'Payment received', '£' || to_char(new.amount, 'FM999,999,990.00') || ' for ' || inv.number || '. Thank you.',
    '/patient/invoices/' || inv.id);
  return new;
end;
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify
  after insert on public.payments
  for each row execute function public.notify_payment();

-- ---------- New sign-ups ----------

create or replace function public.notify_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('caregiver', 'patient') then
    perform public.notify_admins(new.agency_id, 'signup',
      coalesce(nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), ''), new.email)
        || ' joined as a ' || new.role,
      new.email, case new.role when 'caregiver' then '/admin/caregivers' else '/admin/patients' end);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_notify_signup on public.profiles;
create trigger profiles_notify_signup
  after insert on public.profiles
  for each row execute function public.notify_signup();

-- ---------- Messages ----------

create or replace function public.notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if new.from_office then
    select role into v_role from public.profiles where id = new.thread_user_id;
    perform public.notify(new.thread_user_id, new.agency_id, 'message', 'New message from the office',
      new.body, '/' || coalesce(v_role, 'patient') || '/messages', true);
  else
    perform public.notify_admins(new.agency_id, 'message', 'New message from ' || new.sender_name,
      new.body, '/admin/messages?u=' || new.thread_user_id::text, true);
  end if;
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_message();

-- =====================================================================
-- Live updates (Supabase Realtime)
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

-- =====================================================================
-- Function permissions (security fix)
-- =====================================================================
-- Postgres lets everyone (PUBLIC) run new functions by default, so revoking from "anon"
-- alone was not enough. Every function now runs only for logged-in users, except the
-- agency-code check that the signup page needs before login.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
      and p.proname in (
        'my_agency_id', 'my_role', 'is_agency_admin', 'my_caregiver_id', 'my_patient_id', 'is_my_patient', 'my_display_name',
        'create_invoice', 'void_invoice', 'regenerate_agency_code',
        'my_patients', 'check_in_visit', 'check_out_visit', 'report_no_access',
        'my_caregivers', 'update_my_contacts', 'withdraw_request',
        'mark_thread_read', 'office_threads', 'mark_notifications_read'
      )
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;

  -- Internal helpers: only the database itself uses these.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('generate_agency_code', 'notify', 'notify_admins', 'patient_name', 'carer_short_name')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.agency_code_exists(text) to anon, authenticated;
