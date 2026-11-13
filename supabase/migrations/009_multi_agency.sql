-- CareNest: one login, several agencies.
-- A caregiver can work for several agencies and a patient can get care from several,
-- with the same email and password. Office (admin) logins stay tied to one agency.
--
-- How it works: profiles.agency_id + profiles.role are the agency the person is
-- CURRENTLY using. Every existing security rule already checks "my agency", so they
-- keep working. switch_agency() moves the person to another agency they belong to;
-- join_agency() adds a new one with its agency code.
--
-- Run AFTER 008_security.sql. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- One record per person per agency (instead of one record per person) ----------

do $$
declare
  c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname in ('caregivers', 'patients') and con.contype = 'u'
      and array_length(con.conkey, 1) = 1
      and (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) = 'user_id'
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

create unique index if not exists caregivers_agency_user_idx on public.caregivers (agency_id, user_id) where user_id is not null;
create unique index if not exists patients_agency_user_idx on public.patients (agency_id, user_id) where user_id is not null;
create index if not exists caregivers_user_idx on public.caregivers (user_id);
create index if not exists patients_user_idx on public.patients (user_id);

-- ---------- "Who am I" now means "who am I in the agency I'm using" ----------

create or replace function public.my_caregiver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.caregivers c
  where c.user_id = auth.uid() and c.agency_id = public.my_agency_id()
    and c.status = 'active' and public.my_role() = 'caregiver';
$$;

create or replace function public.my_patient_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.patients p
  where p.user_id = auth.uid() and p.agency_id = public.my_agency_id() and public.my_role() = 'patient';
$$;

drop policy if exists "Caregivers view own record" on public.caregivers;
create policy "Caregivers view own record" on public.caregivers
  for select to authenticated using (user_id = auth.uid() and agency_id = public.my_agency_id());

drop policy if exists "Patients view own record" on public.patients;
create policy "Patients view own record" on public.patients
  for select to authenticated using (user_id = auth.uid() and agency_id = public.my_agency_id());

create or replace function public.update_my_contacts(
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_emergency_contact_relation text,
  p_gp_practice text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.patients
  set emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
      emergency_contact_phone = nullif(trim(p_emergency_contact_phone), ''),
      emergency_contact_relation = nullif(trim(p_emergency_contact_relation), ''),
      gp_practice = nullif(trim(p_gp_practice), '')
  where id = public.my_patient_id();
  if not found then
    raise exception 'Your account is not linked to a patient record.';
  end if;
end;
$$;

drop function if exists public.my_caregivers();
create function public.my_caregivers()
returns table (id uuid, first_name text, last_name text, is_primary boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.first_name, c.last_name, c.id = p.primary_caregiver_id
  from public.patients p
  join public.caregivers c on c.agency_id = p.agency_id
  where p.id = public.my_patient_id()
    and (
      c.id = p.primary_caregiver_id
      or exists (select 1 from public.visits v where v.patient_id = p.id and v.caregiver_id = c.id)
    )
  order by c.first_name, c.last_name;
$$;

-- Name / phone / email changes apply to the person's records in every agency.
create or replace function public.sync_profile_to_records()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('caregiver', 'patient') then
    update public.caregivers
    set first_name = coalesce(new.first_name, first_name),
        last_name = coalesce(new.last_name, last_name),
        phone = new.phone,
        email = new.email
    where user_id = new.id;
    update public.patients
    set first_name = coalesce(new.first_name, first_name),
        last_name = coalesce(new.last_name, last_name),
        phone = new.phone,
        email = new.email
    where user_id = new.id;
  end if;
  return new;
end;
$$;

-- When an agency adds a caregiver / patient whose email already has a CareNest login,
-- link the record to that login (the person then sees the agency in their list).
-- Never links office logins, and never gives one person two records in the same agency.
create or replace function public.link_existing_login()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null and new.email is not null then
    select pr.id into new.user_id
    from public.profiles pr
    where lower(pr.email) = lower(new.email)
      and pr.role <> 'admin'
      and not exists (select 1 from public.caregivers c where c.user_id = pr.id and c.agency_id = new.agency_id and c.id <> new.id)
      and not exists (select 1 from public.patients p where p.user_id = pr.id and p.agency_id = new.agency_id and p.id <> new.id)
    limit 1;
  end if;
  return new;
end;
$$;

-- ---------- My agencies, switching and joining ----------

drop function if exists public.my_agencies();
create function public.my_agencies()
returns table (
  agency_id uuid,
  name text,
  postcode text,
  address text,
  role text,
  status text,
  is_current boolean,
  unread int
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select c.agency_id, 'caregiver'::text as role, c.status from public.caregivers c where c.user_id = auth.uid()
    union all
    select p.agency_id, 'patient', p.status from public.patients p where p.user_id = auth.uid()
    union all
    select pr.agency_id, 'admin', 'active' from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'
  )
  select m.agency_id, a.name, a.postcode, a.address, m.role, m.status,
         m.agency_id = public.my_agency_id(),
         (select count(*)::int from public.notifications n
           where n.user_id = auth.uid() and n.agency_id = m.agency_id and n.read_at is null)
  from mine m
  join public.agencies a on a.id = m.agency_id
  order by a.name;
$$;

create or replace function public.switch_agency(p_agency_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if public.my_role() = 'admin' then
    raise exception 'Office accounts belong to one agency.';
  end if;
  if exists (select 1 from public.caregivers where user_id = auth.uid() and agency_id = p_agency_id) then
    v_role := 'caregiver';
  elsif exists (select 1 from public.patients where user_id = auth.uid() and agency_id = p_agency_id) then
    v_role := 'patient';
  else
    raise exception 'You don''t belong to that agency.';
  end if;
  update public.profiles set agency_id = p_agency_id, role = v_role where id = auth.uid();
  return v_role;
end;
$$;

create or replace function public.join_agency(p_code text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me public.profiles;
  v_agency uuid;
  who text;
begin
  select * into me from public.profiles where id = uid;
  if me.id is null then
    raise exception 'Please sign in again.';
  end if;
  if me.role = 'admin' then
    raise exception 'Office accounts belong to one agency. Use a separate email to join another agency.';
  end if;
  if p_role not in ('caregiver', 'patient') then
    raise exception 'Choose caregiver or patient.';
  end if;
  select id into v_agency from public.agencies where code = upper(trim(p_code));
  if v_agency is null then
    raise exception 'This agency code is not valid. Check it with the agency.';
  end if;
  if exists (select 1 from public.caregivers where user_id = uid and agency_id = v_agency)
     or exists (select 1 from public.patients where user_id = uid and agency_id = v_agency) then
    raise exception 'You already belong to this agency.';
  end if;

  if p_role = 'caregiver' then
    -- Use the record the agency already made for this email, if there is one.
    update public.caregivers set user_id = uid
      where agency_id = v_agency and lower(email) = lower(me.email) and user_id is null;
    if not found then
      insert into public.caregivers (agency_id, user_id, first_name, last_name, email, phone)
      values (v_agency, uid, coalesce(me.first_name, ''), coalesce(me.last_name, ''), me.email, me.phone);
    end if;
  else
    update public.patients set user_id = uid
      where agency_id = v_agency and lower(email) = lower(me.email) and user_id is null;
    if not found then
      insert into public.patients (agency_id, user_id, first_name, last_name, email, phone, date_of_birth, address, postcode)
      values (v_agency, uid, coalesce(me.first_name, ''), coalesce(me.last_name, ''), me.email, me.phone,
              me.date_of_birth, me.address, me.postcode);
    end if;
  end if;

  who := coalesce(nullif(trim(coalesce(me.first_name, '') || ' ' || coalesce(me.last_name, '')), ''), me.email);
  perform public.notify_admins(v_agency, 'signup', who || ' joined as a ' || p_role, me.email,
    case p_role when 'caregiver' then '/admin/caregivers' else '/admin/patients' end);

  update public.profiles set agency_id = v_agency, role = p_role where id = uid;
  return p_role;
end;
$$;

-- ---------- Messages: each agency has its own conversation with the person ----------

drop policy if exists "Users read own conversation" on public.messages;
create policy "Users read own conversation" on public.messages
  for select to authenticated using (thread_user_id = auth.uid() and agency_id = public.my_agency_id());

drop policy if exists "Send messages" on public.messages;
create policy "Send messages" on public.messages
  for insert to authenticated
  with check (
    agency_id = public.my_agency_id()
    and (
      (thread_user_id = auth.uid() and public.my_role() in ('caregiver', 'patient'))
      or (public.my_role() = 'admin' and (
        exists (select 1 from public.caregivers c where c.user_id = thread_user_id and c.agency_id = public.my_agency_id())
        or exists (select 1 from public.patients p where p.user_id = thread_user_id and p.agency_id = public.my_agency_id())
      ))
    )
  );

create or replace function public.mark_thread_read(p_thread_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean := public.my_role() = 'admin';
  v_agency uuid := public.my_agency_id();
begin
  if is_admin then
    update public.messages set read_at = now()
    where thread_user_id = p_thread_user_id and agency_id = v_agency and not from_office and read_at is null;
    update public.notifications set read_at = now()
    where type = 'message' and read_at is null and agency_id = v_agency
      and link = '/admin/messages?u=' || p_thread_user_id::text;
  elsif p_thread_user_id = auth.uid() then
    update public.messages set read_at = now()
    where thread_user_id = auth.uid() and agency_id = v_agency and from_office and read_at is null;
    update public.notifications set read_at = now()
    where user_id = auth.uid() and agency_id = v_agency and type = 'message' and read_at is null;
  end if;
end;
$$;

-- The person's role IN THIS AGENCY (they may be a patient somewhere else).
create or replace function public.agency_role_of(p_user uuid, p_agency uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.caregivers where user_id = p_user and agency_id = p_agency) then 'caregiver'
    when exists (select 1 from public.patients where user_id = p_user and agency_id = p_agency) then 'patient'
  end;
$$;

drop function if exists public.office_threads();
create function public.office_threads()
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
         public.agency_role_of(l.thread_user_id, public.my_agency_id()),
         l.body, l.created_at, l.from_office, c.n
  from last_msg l
  join counts c using (thread_user_id)
  left join public.profiles p on p.id = l.thread_user_id
  order by l.created_at desc;
$$;

create or replace function public.notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.from_office then
    perform public.notify(new.thread_user_id, new.agency_id, 'message', 'New message from the office',
      new.body, '/' || coalesce(public.agency_role_of(new.thread_user_id, new.agency_id), 'patient') || '/messages', true);
  else
    perform public.notify_admins(new.agency_id, 'message', 'New message from ' || new.sender_name,
      new.body, '/admin/messages?u=' || new.thread_user_id::text, true);
  end if;
  return new;
end;
$$;

-- ---------- Notifications: show the ones for the agency in use ----------

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select to authenticated
  using (user_id = auth.uid() and (agency_id is null or agency_id = public.my_agency_id()));

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid() and (agency_id is null or agency_id = public.my_agency_id()));

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null
    and (agency_id is null or agency_id = public.my_agency_id())
    and (p_ids is null or id = any (p_ids));
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
    where user_id = p_user and agency_id is not distinct from p_agency and type = p_type
      and link is not distinct from p_link and read_at is null
      and created_at > now() - interval '12 hours';
    if found then
      return;
    end if;
  end if;
  insert into public.notifications (agency_id, user_id, type, title, body, link)
  values (p_agency, p_user, p_type, p_title, left(p_body, 300), p_link);
end;
$$;

-- ---------- "Download my data": what the agency in use holds about you ----------

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_agency uuid := public.my_agency_id();
  v_cg uuid := public.my_caregiver_id();
  v_pt uuid := public.my_patient_id();
  v_out jsonb;
begin
  v_out := jsonb_build_object(
    'exported_at', now(),
    'agency', (select jsonb_build_object('name', a.name, 'postcode', a.postcode) from public.agencies a where a.id = v_agency),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.messages m
                          where m.agency_id = v_agency and (m.thread_user_id = uid or m.sender_id = uid)), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.notifications n
                               where n.user_id = uid and n.agency_id is not distinct from v_agency), '[]'::jsonb)
  );

  if v_cg is not null then
    v_out := v_out || jsonb_build_object(
      'caregiver_record', (select to_jsonb(c) from public.caregivers c where c.id = v_cg),
      'visits', coalesce((select jsonb_agg(to_jsonb(v) order by v.start_time) from public.visits v where v.caregiver_id = v_cg), '[]'::jsonb),
      'care_notes_written', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.care_notes n
                                      where n.author_id = uid and n.agency_id = v_agency), '[]'::jsonb)
    );
  end if;

  if v_pt is not null then
    v_out := v_out || jsonb_build_object(
      'patient_record', (select to_jsonb(p) from public.patients p where p.id = v_pt),
      'visits', coalesce((select jsonb_agg(to_jsonb(v) order by v.start_time) from public.visits v where v.patient_id = v_pt), '[]'::jsonb),
      'care_notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.care_notes n where n.patient_id = v_pt and not n.is_concern), '[]'::jsonb),
      'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.issue_date) from public.invoice_summaries i where i.patient_id = v_pt and i.status <> 'draft'), '[]'::jsonb),
      'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.care_requests r where r.patient_id = v_pt), '[]'::jsonb),
      'feedback', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.feedback f where f.patient_id = v_pt), '[]'::jsonb)
    );
  end if;

  return v_out;
end;
$$;

-- ---------- Permissions ----------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('my_caregiver_id', 'my_patient_id', 'update_my_contacts', 'my_caregivers', 'my_agencies',
                        'switch_agency', 'join_agency', 'mark_thread_read', 'office_threads',
                        'mark_notifications_read', 'export_my_data')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;

  -- Internal helpers and triggers: only the database itself uses these.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('notify', 'agency_role_of', 'link_existing_login', 'sync_profile_to_records', 'notify_message')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
