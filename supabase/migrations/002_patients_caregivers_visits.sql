-- CareNest: patients, caregivers and visits.
-- Run AFTER 001_auth.sql. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Caregivers ----------
-- A caregiver record belongs to an agency. user_id is set when the caregiver has a login.

create table if not exists public.caregivers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  specialty text,
  region text,
  availability text not null default 'full-time' check (availability in ('full-time', 'part-time', 'contract')),
  max_hours_per_week numeric(5, 1) not null default 40,
  start_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index if not exists caregivers_agency_id_idx on public.caregivers (agency_id);
-- One record per email within an agency (used to link signups to admin-created records).
create unique index if not exists caregivers_agency_email_idx on public.caregivers (agency_id, lower(email)) where email is not null;

-- ---------- Patients ----------

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  email text,
  phone text,
  address text,
  postcode text,
  care_plan text not null default 'basic' check (care_plan in ('basic', 'comprehensive', 'advanced')),
  primary_caregiver_id uuid references public.caregivers (id) on delete set null,
  -- Price charged per hour of care, in GBP. Used to build invoices.
  hourly_rate numeric(10, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists patients_agency_id_idx on public.patients (agency_id);
create unique index if not exists patients_agency_email_idx on public.patients (agency_id, lower(email)) where email is not null;

-- ---------- Visits ----------

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  -- Null means the visit is not assigned to a caregiver yet.
  caregiver_id uuid references public.caregivers (id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled', 'missed')),
  tasks text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists visits_agency_start_idx on public.visits (agency_id, start_time);
create index if not exists visits_caregiver_start_idx on public.visits (caregiver_id, start_time);
create index if not exists visits_patient_start_idx on public.visits (patient_id, start_time);

-- ---------- Helpers ----------

create or replace function public.is_agency_admin(p_agency_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and agency_id = p_agency_id
  );
$$;

create or replace function public.my_caregiver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.caregivers where user_id = auth.uid();
$$;

create or replace function public.my_patient_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.patients where user_id = auth.uid();
$$;

-- ---------- Signup: also create or link the caregiver / patient record ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := new.raw_user_meta_data;
  user_role text := meta ->> 'role';
  v_agency_id uuid;
begin
  if user_role = 'admin' then
    insert into public.agencies (name, registration_number, email, phone, address, postcode, code)
    values (
      meta ->> 'agency_name',
      meta ->> 'registration_number',
      new.email,
      meta ->> 'phone',
      meta ->> 'address',
      meta ->> 'postcode',
      public.generate_agency_code()
    )
    returning id into v_agency_id;
  elsif user_role in ('caregiver', 'patient') then
    select id into v_agency_id from public.agencies where code = upper(trim(meta ->> 'agency_code'));
    if v_agency_id is null then
      raise exception 'Invalid agency code';
    end if;
  else
    raise exception 'Invalid role';
  end if;

  insert into public.profiles (
    id, role, agency_id, email, first_name, last_name, phone, date_of_birth, address, postcode
  ) values (
    new.id,
    user_role,
    v_agency_id,
    new.email,
    meta ->> 'first_name',
    meta ->> 'last_name',
    meta ->> 'phone',
    nullif(meta ->> 'date_of_birth', '')::date,
    meta ->> 'address',
    meta ->> 'postcode'
  );

  if user_role = 'caregiver' then
    -- Link to a record the admin already created with the same email, otherwise create one.
    update public.caregivers set user_id = new.id
      where agency_id = v_agency_id and lower(email) = lower(new.email) and user_id is null;
    if not found then
      insert into public.caregivers (agency_id, user_id, first_name, last_name, email, phone)
      values (v_agency_id, new.id, coalesce(meta ->> 'first_name', ''), coalesce(meta ->> 'last_name', ''), new.email, meta ->> 'phone');
    end if;
  elsif user_role = 'patient' then
    update public.patients set user_id = new.id
      where agency_id = v_agency_id and lower(email) = lower(new.email) and user_id is null;
    if not found then
      insert into public.patients (agency_id, user_id, first_name, last_name, email, phone, date_of_birth, address, postcode)
      values (
        v_agency_id, new.id, coalesce(meta ->> 'first_name', ''), coalesce(meta ->> 'last_name', ''), new.email,
        meta ->> 'phone', nullif(meta ->> 'date_of_birth', '')::date, meta ->> 'address', meta ->> 'postcode'
      );
    end if;
  end if;

  return new;
end;
$$;

-- ---------- Row Level Security ----------

alter table public.caregivers enable row level security;
alter table public.patients enable row level security;
alter table public.visits enable row level security;

-- Admins: full access to their own agency's data.
drop policy if exists "Admins manage caregivers" on public.caregivers;
create policy "Admins manage caregivers" on public.caregivers
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

drop policy if exists "Admins manage patients" on public.patients;
create policy "Admins manage patients" on public.patients
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

drop policy if exists "Admins manage visits" on public.visits;
create policy "Admins manage visits" on public.visits
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

-- Caregivers: see their own record, their visits, and the patients they visit.
drop policy if exists "Caregivers view own record" on public.caregivers;
create policy "Caregivers view own record" on public.caregivers
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Caregivers view own visits" on public.visits;
create policy "Caregivers view own visits" on public.visits
  for select to authenticated using (caregiver_id = public.my_caregiver_id());

drop policy if exists "Caregivers view their patients" on public.patients;
create policy "Caregivers view their patients" on public.patients
  for select to authenticated using (
    primary_caregiver_id = public.my_caregiver_id()
    or exists (select 1 from public.visits v where v.patient_id = patients.id and v.caregiver_id = public.my_caregiver_id())
  );

-- Patients: see their own record and their own visits.
drop policy if exists "Patients view own record" on public.patients;
create policy "Patients view own record" on public.patients
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Patients view own visits" on public.visits;
create policy "Patients view own visits" on public.visits
  for select to authenticated using (patient_id = public.my_patient_id());

-- Caregivers and patients can see the names of caregivers on their visits.
drop policy if exists "View caregivers on my visits" on public.caregivers;
create policy "View caregivers on my visits" on public.caregivers
  for select to authenticated using (
    exists (select 1 from public.visits v where v.caregiver_id = caregivers.id and v.patient_id = public.my_patient_id())
  );
