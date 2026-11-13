-- CareNest: invoices and payments.
-- Run AFTER 002. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Invoices ----------

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete restrict,
  -- e.g. INV-2026-0001, unique per agency. Filled in automatically.
  number text not null,
  period_start date,
  period_end date,
  issue_date date not null default current_date,
  due_date date not null,
  -- draft: being prepared, not visible to the patient
  -- sent: issued to the patient; paid: fully paid; void: cancelled
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  notes text,
  created_at timestamptz not null default now(),
  unique (agency_id, number),
  check (due_date >= issue_date)
);

create index if not exists invoices_agency_idx on public.invoices (agency_id, issue_date desc);
create index if not exists invoices_patient_idx on public.invoices (patient_id);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  -- Set when the line bills a visit. Null for extra lines (fees, mileage...).
  visit_id uuid references public.visits (id) on delete set null,
  description text not null,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  amount numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,
  sort_order int not null default 0
);

create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
-- A visit can only be billed once.
create unique index if not exists invoice_lines_visit_unique on public.invoice_lines (visit_id) where visit_id is not null;

-- ---------- Payments ----------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'card', 'cash', 'cheque', 'direct_debit', 'other')),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_agency_idx on public.payments (agency_id, paid_on desc);

-- ---------- Invoice numbers (per agency, per year) ----------

create table if not exists public.invoice_counters (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  year int not null,
  last_number int not null default 0,
  primary key (agency_id, year)
);

alter table public.invoice_counters enable row level security;
-- No policies: only the security-definer trigger below touches this table.

create or replace function public.set_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n int;
  y int := extract(year from coalesce(new.issue_date, current_date))::int;
begin
  if new.number is null or new.number = '' then
    insert into public.invoice_counters (agency_id, year, last_number)
    values (new.agency_id, y, 1)
    on conflict (agency_id, year) do update set last_number = invoice_counters.last_number + 1
    returning last_number into n;
    new.number := 'INV-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_set_number on public.invoices;
create trigger invoices_set_number
  before insert on public.invoices
  for each row execute function public.set_invoice_number();

-- ---------- Totals view ----------
-- security_invoker makes the view respect the RLS rules of the tables underneath.

create or replace view public.invoice_summaries with (security_invoker = true) as
select
  i.*,
  coalesce(l.total, 0)::numeric(12, 2) as total,
  coalesce(p.paid, 0)::numeric(12, 2) as paid,
  (coalesce(l.total, 0) - coalesce(p.paid, 0))::numeric(12, 2) as balance,
  coalesce(l.line_count, 0) as line_count
from public.invoices i
left join (
  select invoice_id, sum(amount) as total, count(*) as line_count from public.invoice_lines group by invoice_id
) l on l.invoice_id = i.id
left join (
  select invoice_id, sum(amount) as paid from public.payments group by invoice_id
) p on p.invoice_id = i.id;

-- ---------- Create an invoice with its lines in one step ----------
-- p_lines: [{"visit_id": "...", "description": "...", "quantity": 1.5, "unit_price": 25}, ...]
-- Runs with the caller's permissions, so RLS still applies.

create or replace function public.create_invoice(
  p_patient_id uuid,
  p_period_start date,
  p_period_end date,
  p_issue_date date,
  p_due_date date,
  p_status text,
  p_notes text,
  p_lines jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_agency uuid;
  v_invoice uuid;
begin
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'An invoice needs at least one line.';
  end if;

  select agency_id into v_agency from public.patients where id = p_patient_id;
  if v_agency is null then
    raise exception 'Patient not found.';
  end if;

  insert into public.invoices (agency_id, patient_id, number, period_start, period_end, issue_date, due_date, status, notes)
  values (v_agency, p_patient_id, '', p_period_start, p_period_end, p_issue_date, p_due_date, p_status, nullif(p_notes, ''))
  returning id into v_invoice;

  insert into public.invoice_lines (invoice_id, visit_id, description, quantity, unit_price, sort_order)
  select
    v_invoice,
    nullif(l ->> 'visit_id', '')::uuid,
    l ->> 'description',
    (l ->> 'quantity')::numeric,
    (l ->> 'unit_price')::numeric,
    ord
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  return v_invoice;
exception
  when unique_violation then
    raise exception 'One or more of these visits has already been billed on another invoice.';
end;
$$;

-- Voiding keeps the invoice for the record but frees its visits so they can be billed again.
create or replace function public.void_invoice(p_invoice_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if exists (select 1 from public.payments where invoice_id = p_invoice_id) then
    raise exception 'This invoice has payments recorded. Delete the payments first.';
  end if;
  update public.invoice_lines set visit_id = null where invoice_id = p_invoice_id;
  update public.invoices set status = 'void' where id = p_invoice_id;
end;
$$;

-- Keep the status in step with payments: fully paid -> 'paid', otherwise back to 'sent'.
create or replace function public.sync_invoice_paid_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_total numeric;
  v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_total from public.invoice_lines where invoice_id = v_invoice;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_invoice;
  update public.invoices
    set status = case when v_paid >= v_total and v_total > 0 then 'paid' else 'sent' end
    where id = v_invoice and status in ('sent', 'paid', 'draft') and (v_paid > 0 or status = 'paid');
  return null;
end;
$$;

drop trigger if exists payments_sync_status on public.payments;
create trigger payments_sync_status
  after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_paid_status();

grant execute on function public.create_invoice(uuid, date, date, date, date, text, text, jsonb) to authenticated;
grant execute on function public.void_invoice(uuid) to authenticated;

-- ---------- Row Level Security ----------

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;

drop policy if exists "Admins manage invoices" on public.invoices;
create policy "Admins manage invoices" on public.invoices
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

drop policy if exists "Admins manage invoice lines" on public.invoice_lines;
create policy "Admins manage invoice lines" on public.invoice_lines
  for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_agency_admin(i.agency_id)))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_agency_admin(i.agency_id)));

drop policy if exists "Admins manage payments" on public.payments;
create policy "Admins manage payments" on public.payments
  for all to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

-- Patients see their own issued invoices (never drafts), their lines and payments.
drop policy if exists "Patients view own invoices" on public.invoices;
create policy "Patients view own invoices" on public.invoices
  for select to authenticated
  using (patient_id = public.my_patient_id() and status <> 'draft');

drop policy if exists "Patients view own invoice lines" on public.invoice_lines;
create policy "Patients view own invoice lines" on public.invoice_lines
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and i.patient_id = public.my_patient_id() and i.status <> 'draft'
  ));

drop policy if exists "Patients view own payments" on public.payments;
create policy "Patients view own payments" on public.payments
  for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.patient_id = public.my_patient_id()));
