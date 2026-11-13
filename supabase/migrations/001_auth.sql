-- CareNest: authentication, agencies and user profiles.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Tables ----------

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  email text,
  phone text,
  address text,
  postcode text,
  -- Short code that caregivers and patients enter to join this agency.
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'caregiver', 'patient')),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  date_of_birth date,
  address text,
  postcode text,
  created_at timestamptz not null default now()
);

-- Removed field: caregivers no longer pick a job role (safe if it never existed).
alter table public.profiles drop column if exists job_role;

create index if not exists profiles_agency_id_idx on public.profiles (agency_id);

-- ---------- Helpers (security definer avoids recursive RLS checks) ----------

create or replace function public.my_agency_id()
returns uuid language sql stable security definer set search_path = public as $$
  select agency_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Lets the signup page check an agency code before creating the account.
create or replace function public.agency_code_exists(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agencies where code = upper(trim(p_code)));
$$;

grant execute on function public.agency_code_exists(text) to anon, authenticated;

create or replace function public.generate_agency_code()
returns text language plpgsql as $$
declare
  new_code text;
begin
  loop
    -- 8 characters, no easily confused letters/digits.
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
      into new_code
      from generate_series(1, 8);
    exit when not exists (select 1 from public.agencies where code = new_code);
  end loop;
  return new_code;
end;
$$;

-- ---------- Create agency + profile when a user signs up ----------

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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;

-- Agencies: members can see their own agency; only its admin can edit it.
drop policy if exists "Members can view their agency" on public.agencies;
create policy "Members can view their agency" on public.agencies
  for select to authenticated using (id = public.my_agency_id());

drop policy if exists "Admins can update their agency" on public.agencies;
create policy "Admins can update their agency" on public.agencies
  for update to authenticated
  using (id = public.my_agency_id() and public.my_role() = 'admin')
  with check (id = public.my_agency_id());

-- Profiles: everyone sees their own; admins see everyone in their agency.
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "Admins can view agency profiles" on public.profiles;
create policy "Admins can view agency profiles" on public.profiles
  for select to authenticated
  using (agency_id = public.my_agency_id() and public.my_role() = 'admin');

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  -- Users cannot change their own role or move to another agency.
  with check (id = auth.uid() and role = public.my_role() and agency_id = public.my_agency_id());
