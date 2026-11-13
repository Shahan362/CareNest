-- CareNest: caregiver side (check-in / check-out, care notes, safe patient info).
-- Run AFTER 004_settings.sql. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Visit check-in / check-out ----------
-- Scheduled times stay as planned (used for billing); these record what actually happened.

alter table public.visits add column if not exists checked_in_at timestamptz;
alter table public.visits add column if not exists checked_out_at timestamptz;
-- Which of the planned tasks the caregiver ticked off at check-out.
alter table public.visits add column if not exists tasks_done text[] not null default '{}';

-- ---------- Care notes ----------
-- The daily care record. Notes are never edited or deleted by caregivers (it is a legal record);
-- a correction is written as a new note.

create table if not exists public.care_notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  visit_id uuid references public.visits (id) on delete set null,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  -- Name at the time of writing, so the note still reads correctly if the account is removed.
  author_name text not null,
  body text not null check (length(trim(body)) > 0),
  -- A concern is flagged to the office (shown on the admin dashboard until resolved).
  is_concern boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists care_notes_patient_idx on public.care_notes (patient_id, created_at desc);
create index if not exists care_notes_visit_idx on public.care_notes (visit_id);
create index if not exists care_notes_open_concerns_idx on public.care_notes (agency_id)
  where is_concern and resolved_at is null;

-- ---------- Helpers ----------

-- True when the signed-in caregiver looks after this patient (primary caregiver or has a visit with them).
create or replace function public.is_my_patient(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient_id
      and (
        p.primary_caregiver_id = public.my_caregiver_id()
        or exists (select 1 from public.visits v where v.patient_id = p.id and v.caregiver_id = public.my_caregiver_id())
      )
  );
$$;

create or replace function public.my_display_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email)
  from public.profiles where id = auth.uid();
$$;

-- The author's name always comes from their profile, never from what the app sends.
create or replace function public.set_care_note_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    new.author_name := coalesce(public.my_display_name(), new.author_name, 'Unknown');
  end if;
  return new;
end;
$$;

drop trigger if exists care_notes_set_author on public.care_notes;
create trigger care_notes_set_author
  before insert on public.care_notes
  for each row execute function public.set_care_note_author();

-- ---------- Caregivers no longer read the patients table directly ----------
-- The table holds the hourly rate and billing email, which caregivers should not see.
-- They get the care-related columns through this function instead.

drop policy if exists "Caregivers view their patients" on public.patients;

drop function if exists public.my_patients();
create function public.my_patients()
returns table (
  id uuid,
  first_name text,
  last_name text,
  date_of_birth date,
  phone text,
  address text,
  postcode text,
  care_plan text,
  notes text,
  status text,
  is_primary boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.date_of_birth, p.phone, p.address, p.postcode,
         p.care_plan, p.notes, p.status, p.primary_caregiver_id = public.my_caregiver_id()
  from public.patients p
  where public.my_caregiver_id() is not null
    and public.is_my_patient(p.id)
  order by p.first_name, p.last_name;
$$;

revoke execute on function public.my_patients() from anon;
grant execute on function public.my_patients() to authenticated;

-- ---------- Visit actions for caregivers ----------
-- Caregivers cannot update visits directly (they could change times or patients).
-- These functions allow only the steps of a real visit.

create or replace function public.check_in_visit(p_visit_id uuid)
returns public.visits language plpgsql security definer set search_path = public as $$
declare
  v public.visits;
  me uuid := public.my_caregiver_id();
begin
  select * into v from public.visits where id = p_visit_id for update;
  if v.id is null or me is null or v.caregiver_id is distinct from me then
    raise exception 'This visit is not assigned to you.';
  end if;
  if v.status <> 'scheduled' then
    raise exception 'This visit is already %.', replace(v.status, '_', ' ');
  end if;
  if now() < v.start_time - interval '60 minutes' then
    raise exception 'You can check in from 1 hour before the visit starts.';
  end if;
  if now() > v.end_time + interval '4 hours' then
    raise exception 'This visit ended more than 4 hours ago. Please contact the office.';
  end if;
  if exists (select 1 from public.visits where caregiver_id = me and status = 'in_progress') then
    raise exception 'Please check out of your current visit first.';
  end if;

  update public.visits set status = 'in_progress', checked_in_at = now()
  where id = p_visit_id returning * into v;
  return v;
end;
$$;

create or replace function public.check_out_visit(
  p_visit_id uuid,
  p_tasks_done text[],
  p_note text,
  p_concern boolean default false
)
returns public.visits language plpgsql security definer set search_path = public as $$
declare
  v public.visits;
begin
  select * into v from public.visits where id = p_visit_id for update;
  if v.id is null or v.caregiver_id is distinct from public.my_caregiver_id() then
    raise exception 'This visit is not assigned to you.';
  end if;
  if v.status <> 'in_progress' then
    raise exception 'You need to check in before checking out.';
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Please write a care note (at least 10 characters).';
  end if;

  insert into public.care_notes (agency_id, patient_id, visit_id, author_name, body, is_concern)
  values (v.agency_id, v.patient_id, v.id, coalesce(public.my_display_name(), 'Caregiver'), trim(p_note), coalesce(p_concern, false));

  update public.visits
  set status = 'completed',
      checked_out_at = now(),
      -- Only keep ticks for tasks that were actually planned.
      tasks_done = array(select t from unnest(coalesce(p_tasks_done, '{}')) t where t = any (v.tasks))
  where id = p_visit_id returning * into v;
  return v;
end;
$$;

-- The caregiver arrived but could not get in (patient out, refused care, in hospital...).
-- The visit becomes "missed" (not billed) and the office gets a concern to follow up.
create or replace function public.report_no_access(p_visit_id uuid, p_reason text)
returns public.visits language plpgsql security definer set search_path = public as $$
declare
  v public.visits;
begin
  select * into v from public.visits where id = p_visit_id for update;
  if v.id is null or v.caregiver_id is distinct from public.my_caregiver_id() then
    raise exception 'This visit is not assigned to you.';
  end if;
  if v.status not in ('scheduled', 'in_progress') then
    raise exception 'This visit is already %.', replace(v.status, '_', ' ');
  end if;
  if now() < v.start_time - interval '60 minutes' then
    raise exception 'You can only report this once the visit is due.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please say what happened.';
  end if;

  insert into public.care_notes (agency_id, patient_id, visit_id, author_name, body, is_concern)
  values (v.agency_id, v.patient_id, v.id, coalesce(public.my_display_name(), 'Caregiver'),
          'No access: ' || trim(p_reason), true);

  update public.visits
  set status = 'missed', checked_out_at = now()
  where id = p_visit_id returning * into v;
  return v;
end;
$$;

revoke execute on function public.check_in_visit(uuid) from anon;
revoke execute on function public.check_out_visit(uuid, text[], text, boolean) from anon;
revoke execute on function public.report_no_access(uuid, text) from anon;
grant execute on function public.check_in_visit(uuid) to authenticated;
grant execute on function public.check_out_visit(uuid, text[], text, boolean) to authenticated;
grant execute on function public.report_no_access(uuid, text) to authenticated;

-- ---------- Care notes security ----------

alter table public.care_notes enable row level security;

drop policy if exists "Admins manage care notes" on public.care_notes;
create policy "Admins manage care notes" on public.care_notes
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

-- Caregivers read the notes of the patients they look after (continuity of care).
drop policy if exists "Caregivers read their patients' notes" on public.care_notes;
create policy "Caregivers read their patients' notes" on public.care_notes
  for select to authenticated
  using (public.my_caregiver_id() is not null and public.is_my_patient(patient_id));

-- Caregivers can add extra notes (but not edit or delete any).
drop policy if exists "Caregivers add notes" on public.care_notes;
create policy "Caregivers add notes" on public.care_notes
  for insert to authenticated
  with check (
    public.my_caregiver_id() is not null
    and author_id = auth.uid()
    and agency_id = public.my_agency_id()
    and public.is_my_patient(patient_id)
    and resolved_at is null
    and (visit_id is null or exists (
      select 1 from public.visits v
      where v.id = visit_id and v.caregiver_id = public.my_caregiver_id() and v.patient_id = care_notes.patient_id
    ))
  );

-- ---------- Keep caregiver / patient records in step with the user's own profile ----------
-- When a caregiver edits their name or phone in "My profile", the admin sees the change too.

create or replace function public.sync_profile_to_records()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'caregiver' then
    update public.caregivers
    set first_name = coalesce(new.first_name, first_name),
        last_name = coalesce(new.last_name, last_name),
        phone = new.phone,
        email = new.email
    where user_id = new.id;
  elsif new.role = 'patient' then
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

drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  after update of first_name, last_name, phone, email on public.profiles
  for each row execute function public.sync_profile_to_records();

-- ---------- Re-link records the admin adds for people who already have a login ----------
-- e.g. a caregiver record was deleted and added again with the same email.

create or replace function public.link_existing_login()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted_role text;
begin
  wanted_role := case tg_table_name when 'caregivers' then 'caregiver' else 'patient' end;
  if new.user_id is null and new.email is not null then
    select pr.id into new.user_id
    from public.profiles pr
    where pr.agency_id = new.agency_id
      and pr.role = wanted_role
      and lower(pr.email) = lower(new.email)
      and not exists (select 1 from public.caregivers c where c.user_id = pr.id)
      and not exists (select 1 from public.patients p where p.user_id = pr.id)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists caregivers_link_login on public.caregivers;
create trigger caregivers_link_login
  before insert or update of email on public.caregivers
  for each row execute function public.link_existing_login();

drop trigger if exists patients_link_login on public.patients;
create trigger patients_link_login
  before insert or update of email on public.patients
  for each row execute function public.link_existing_login();
