-- CareNest: agency settings (billing defaults, bank details, CQC ID) and account sync.
-- Run AFTER 003. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- New agency settings ----------

alter table public.agencies add column if not exists cqc_provider_id text;
alter table public.agencies add column if not exists default_payment_terms int not null default 14;
alter table public.agencies add column if not exists default_hourly_rate numeric(10, 2) not null default 0;
alter table public.agencies add column if not exists bank_account_name text;
alter table public.agencies add column if not exists bank_sort_code text;
alter table public.agencies add column if not exists bank_account_number text;
alter table public.agencies add column if not exists invoice_footer text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agencies_payment_terms_check') then
    alter table public.agencies add constraint agencies_payment_terms_check check (default_payment_terms between 0 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agencies_hourly_rate_check') then
    alter table public.agencies add constraint agencies_hourly_rate_check check (default_hourly_rate >= 0);
  end if;
end $$;

-- ---------- Admins can edit details, but not the agency code directly ----------
-- The code is changed only through regenerate_agency_code(), which makes a safe random one.

revoke update on public.agencies from authenticated;
grant update (
  name, registration_number, email, phone, address, postcode, cqc_provider_id,
  default_payment_terms, default_hourly_rate,
  bank_account_name, bank_sort_code, bank_account_number, invoice_footer
) on public.agencies to authenticated;

create or replace function public.regenerate_agency_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid := public.my_agency_id();
  v_code text;
begin
  if v_agency is null or public.my_role() <> 'admin' then
    raise exception 'Only an agency admin can change the agency code.';
  end if;
  v_code := public.generate_agency_code();
  update public.agencies set code = v_code where id = v_agency;
  return v_code;
end;
$$;

revoke execute on function public.regenerate_agency_code() from anon;
grant execute on function public.regenerate_agency_code() to authenticated;

-- ---------- Keep profiles.email in step with the login email ----------
-- Runs when a user confirms an email change.

create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();
