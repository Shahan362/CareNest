-- CareNest: pick your agency from a list when signing up (instead of typing a code).
-- Caregivers and patients search agencies by name, branch or postcode. The list shows
-- name, branch, address and postcode, but NEVER the agency code (codes stay private;
-- typing a code is still accepted as an alternative).
--
-- Run AFTER 009_multi_agency.sql. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Branch name ----------

alter table public.agencies add column if not exists branch_name text;
grant update (branch_name) on public.agencies to authenticated;

-- ---------- Public agency search (used before sign-in) ----------
-- At least 2 characters, at most 20 results, so the whole list can't be downloaded at once.

drop function if exists public.search_agencies(text);
create function public.search_agencies(p_query text)
returns table (id uuid, name text, branch_name text, address text, postcode text)
language sql stable security definer set search_path = public as $$
  with q as (
    select lower(trim(coalesce(p_query, ''))) as t,
           replace(lower(coalesce(p_query, '')), ' ', '') as nospace
  )
  select a.id, a.name, a.branch_name, a.address, a.postcode
  from public.agencies a, q
  where length(q.t) >= 2
    and (
      lower(a.name) like '%' || q.t || '%'
      or lower(coalesce(a.branch_name, '')) like '%' || q.t || '%'
      or lower(coalesce(a.address, '')) like '%' || q.t || '%'
      or replace(lower(coalesce(a.postcode, '')), ' ', '') like '%' || q.nospace || '%'
    )
  order by (lower(a.name) like q.t || '%') desc, a.name, a.branch_name
  limit 20;
$$;

revoke execute on function public.search_agencies(text) from public;
grant execute on function public.search_agencies(text) to anon, authenticated;

-- ---------- Sign-up: agency chosen from the list (agency_id) or by code ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := new.raw_user_meta_data;
  user_role text := meta ->> 'role';
  v_agency_id uuid;
begin
  if user_role = 'admin' then
    insert into public.agencies (name, branch_name, registration_number, email, phone, address, postcode, code)
    values (
      meta ->> 'agency_name',
      nullif(trim(meta ->> 'branch_name'), ''),
      meta ->> 'registration_number',
      new.email,
      meta ->> 'phone',
      meta ->> 'address',
      meta ->> 'postcode',
      public.generate_agency_code()
    )
    returning id into v_agency_id;
  elsif user_role in ('caregiver', 'patient') then
    if coalesce(meta ->> 'agency_id', '') ~ '^[0-9a-fA-F-]{36}$' then
      select id into v_agency_id from public.agencies where id = (meta ->> 'agency_id')::uuid;
    else
      select id into v_agency_id from public.agencies where code = upper(trim(meta ->> 'agency_code'));
    end if;
    if v_agency_id is null then
      raise exception 'Please choose your agency from the list, or check the agency code.';
    end if;
  else
    raise exception 'Invalid role';
  end if;

  insert into public.profiles (
    id, role, agency_id, email, first_name, last_name, phone, date_of_birth, address, postcode
  ) values (
    new.id, user_role, v_agency_id, new.email, meta ->> 'first_name', meta ->> 'last_name', meta ->> 'phone',
    nullif(meta ->> 'date_of_birth', '')::date, meta ->> 'address', meta ->> 'postcode'
  );

  if user_role = 'caregiver' then
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

-- ---------- Join another agency: by picking it from the list, or by code ----------

create or replace function public.join_agency_by_id(p_agency_id uuid, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me public.profiles;
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
  if not exists (select 1 from public.agencies where id = p_agency_id) then
    raise exception 'That agency was not found.';
  end if;
  if exists (select 1 from public.caregivers where user_id = uid and agency_id = p_agency_id)
     or exists (select 1 from public.patients where user_id = uid and agency_id = p_agency_id) then
    raise exception 'You already belong to this agency.';
  end if;

  if p_role = 'caregiver' then
    update public.caregivers set user_id = uid
      where agency_id = p_agency_id and lower(email) = lower(me.email) and user_id is null;
    if not found then
      insert into public.caregivers (agency_id, user_id, first_name, last_name, email, phone)
      values (p_agency_id, uid, coalesce(me.first_name, ''), coalesce(me.last_name, ''), me.email, me.phone);
    end if;
  else
    update public.patients set user_id = uid
      where agency_id = p_agency_id and lower(email) = lower(me.email) and user_id is null;
    if not found then
      insert into public.patients (agency_id, user_id, first_name, last_name, email, phone, date_of_birth, address, postcode)
      values (p_agency_id, uid, coalesce(me.first_name, ''), coalesce(me.last_name, ''), me.email, me.phone,
              me.date_of_birth, me.address, me.postcode);
    end if;
  end if;

  who := coalesce(nullif(trim(coalesce(me.first_name, '') || ' ' || coalesce(me.last_name, '')), ''), me.email);
  perform public.notify_admins(p_agency_id, 'signup', who || ' joined as a ' || p_role, me.email,
    case p_role when 'caregiver' then '/admin/caregivers' else '/admin/patients' end);

  update public.profiles set agency_id = p_agency_id, role = p_role where id = uid;
  return p_role;
end;
$$;

create or replace function public.join_agency(p_code text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
begin
  select id into v_agency from public.agencies where code = upper(trim(p_code));
  if v_agency is null then
    raise exception 'This agency code is not valid. Check it with the agency.';
  end if;
  return public.join_agency_by_id(v_agency, p_role);
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('join_agency', 'join_agency_by_id')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
