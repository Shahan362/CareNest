-- CareNest: patient side (requests, feedback, emergency contact / GP, what patients can see).
-- Run AFTER 005_caregiver_visits.sql. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Emergency contact and GP ----------
-- Carers need these in an emergency; the patient (or family) and the office can update them.

alter table public.patients add column if not exists emergency_contact_name text;
alter table public.patients add column if not exists emergency_contact_phone text;
alter table public.patients add column if not exists emergency_contact_relation text;
alter table public.patients add column if not exists gp_practice text;

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
  where user_id = auth.uid();
  if not found then
    raise exception 'Your account is not linked to a patient record.';
  end if;
end;
$$;

revoke execute on function public.update_my_contacts(text, text, text, text) from anon;
grant execute on function public.update_my_contacts(text, text, text, text) to authenticated;

-- Caregivers now also see the emergency contact and GP (replaces the 005 version).
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
  is_primary boolean,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  gp_practice text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.date_of_birth, p.phone, p.address, p.postcode,
         p.care_plan, p.notes, p.status, p.primary_caregiver_id = public.my_caregiver_id(),
         p.emergency_contact_name, p.emergency_contact_phone, p.emergency_contact_relation, p.gp_practice
  from public.patients p
  where public.my_caregiver_id() is not null
    and public.is_my_patient(p.id)
  order by p.first_name, p.last_name;
$$;

revoke execute on function public.my_patients() from anon;
grant execute on function public.my_patients() to authenticated;

-- ---------- Patients only see their carers' names ----------
-- The old policy let patients read the whole caregiver row (personal phone, email, max hours).

drop policy if exists "View caregivers on my visits" on public.caregivers;

drop function if exists public.my_caregivers();
create function public.my_caregivers()
returns table (id uuid, first_name text, last_name text, is_primary boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.first_name, c.last_name, c.id = p.primary_caregiver_id
  from public.patients p
  join public.caregivers c on c.agency_id = p.agency_id
  where p.user_id = auth.uid()
    and (
      c.id = p.primary_caregiver_id
      or exists (select 1 from public.visits v where v.patient_id = p.id and v.caregiver_id = c.id)
    )
  order by c.first_name, c.last_name;
$$;

revoke execute on function public.my_caregivers() from anon;
grant execute on function public.my_caregivers() to authenticated;

-- ---------- Patients read their own care notes (not concerns) ----------
-- Concerns can be safeguarding matters, so only the office and carers see them.

drop policy if exists "Patients read own care notes" on public.care_notes;
create policy "Patients read own care notes" on public.care_notes
  for select to authenticated
  using (patient_id = public.my_patient_id() and not is_concern);

-- ---------- Requests (patient -> office) ----------

create table if not exists public.care_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  -- The visit the request is about (change time / cancel), if any.
  visit_id uuid references public.visits (id) on delete set null,
  type text not null check (type in ('change_time', 'cancel_visit', 'extra_visit', 'change_caregiver', 'change_care', 'other')),
  details text not null check (length(trim(details)) > 0),
  preferred_date date,
  preferred_time time,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  admin_response text,
  responded_at timestamptz,
  responded_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists care_requests_agency_idx on public.care_requests (agency_id, status, created_at desc);
create index if not exists care_requests_patient_idx on public.care_requests (patient_id, created_at desc);

alter table public.care_requests enable row level security;

drop policy if exists "Admins manage requests" on public.care_requests;
create policy "Admins manage requests" on public.care_requests
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

drop policy if exists "Patients view own requests" on public.care_requests;
create policy "Patients view own requests" on public.care_requests
  for select to authenticated
  using (patient_id = public.my_patient_id());

drop policy if exists "Patients create requests" on public.care_requests;
create policy "Patients create requests" on public.care_requests
  for insert to authenticated
  with check (
    patient_id = public.my_patient_id()
    and agency_id = public.my_agency_id()
    and status = 'pending'
    and admin_response is null
    and responded_at is null
    and responded_by is null
    and (visit_id is null or exists (
      select 1 from public.visits v where v.id = visit_id and v.patient_id = public.my_patient_id()
    ))
  );

-- Patients can withdraw a request the office hasn't answered yet (no other changes).
create or replace function public.withdraw_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.care_requests set status = 'withdrawn'
  where id = p_request_id and patient_id = public.my_patient_id() and status = 'pending';
  if not found then
    raise exception 'This request can no longer be withdrawn.';
  end if;
end;
$$;

revoke execute on function public.withdraw_request(uuid) from anon;
grant execute on function public.withdraw_request(uuid) to authenticated;

-- ---------- Feedback: compliments, suggestions, complaints ----------
-- CQC expects agencies to record complaints and how they responded.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  caregiver_id uuid references public.caregivers (id) on delete set null,
  kind text not null check (kind in ('compliment', 'suggestion', 'complaint')),
  message text not null check (length(trim(message)) > 0),
  status text not null default 'open' check (status in ('open', 'resolved')),
  admin_response text,
  responded_at timestamptz,
  responded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists feedback_agency_idx on public.feedback (agency_id, status, created_at desc);
create index if not exists feedback_patient_idx on public.feedback (patient_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "Admins manage feedback" on public.feedback;
create policy "Admins manage feedback" on public.feedback
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

drop policy if exists "Patients view own feedback" on public.feedback;
create policy "Patients view own feedback" on public.feedback
  for select to authenticated
  using (patient_id = public.my_patient_id());

drop policy if exists "Patients give feedback" on public.feedback;
create policy "Patients give feedback" on public.feedback
  for insert to authenticated
  with check (
    patient_id = public.my_patient_id()
    and agency_id = public.my_agency_id()
    and status = 'open'
    and admin_response is null
    and responded_at is null
    and responded_by is null
    and (caregiver_id is null or exists (
      select 1 from public.visits v where v.caregiver_id = feedback.caregiver_id and v.patient_id = public.my_patient_id()
    ) or exists (
      select 1 from public.patients p where p.id = public.my_patient_id() and p.primary_caregiver_id = feedback.caregiver_id
    ))
  );
