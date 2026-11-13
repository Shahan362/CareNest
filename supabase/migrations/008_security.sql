-- CareNest: two-factor login enforced for admins, inactive caregivers losing access,
-- and "Download my data".
-- Run AFTER 007_messages_notifications.sql. Safe to run more than once.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Two-factor login ----------
-- Admin rights need: an admin profile in that agency AND, if the admin has turned on
-- two-factor login, a session that passed the second step (aal2).
create or replace function public.is_agency_admin(p_agency_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and agency_id = p_agency_id
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  );
$$;

-- A caregiver the agency marks "inactive" (left the agency) loses access to patients and visits.
create or replace function public.my_caregiver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.caregivers c
  where c.user_id = auth.uid() and c.status = 'active';
$$;

-- ---------- "Download my data" (UK GDPR right of access) ----------
-- Everything the signed-in user can see about themselves, as one JSON document.

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_role text;
  v_cg uuid;
  v_pt uuid;
  v_out jsonb;
begin
  select role into v_role from public.profiles where id = uid;
  select id into v_cg from public.caregivers where user_id = uid;
  select id into v_pt from public.patients where user_id = uid;

  v_out := jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.messages m where m.thread_user_id = uid or m.sender_id = uid), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.notifications n where n.user_id = uid), '[]'::jsonb)
  );

  if v_cg is not null then
    v_out := v_out || jsonb_build_object(
      'caregiver_record', (select to_jsonb(c) from public.caregivers c where c.id = v_cg),
      'visits', coalesce((select jsonb_agg(to_jsonb(v) order by v.start_time) from public.visits v where v.caregiver_id = v_cg), '[]'::jsonb),
      'care_notes_written', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.care_notes n where n.author_id = uid), '[]'::jsonb)
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

-- ---------- Permissions for the new functions ----------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_agency_admin', 'my_caregiver_id', 'export_my_data')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

