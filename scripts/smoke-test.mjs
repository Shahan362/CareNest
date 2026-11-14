// CareNest end-to-end smoke test against the real Supabase project.
//
//   node scripts/smoke-test.mjs
//
// It signs up a brand-new test agency (admin), a caregiver and a patient, runs the main
// day-to-day flows as each of them, and checks the security rules. Every run uses new
// "smoketest+<run>-...@example.com" accounts in their own agency, so it never touches real data.
// Needs "Confirm email" OFF in Supabase (Authentication -> Providers -> Email).
// Cleanup SQL is printed at the end.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ---------- Setup ----------

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const run = Date.now().toString(36);
const email = (who) => `smoketest+${run}-${who}@example.com`;
const PASSWORD = 'Smoke-test-2026!';

let passed = 0;
let failed = 0;
const failures = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
/** Throws on Supabase errors, returns data. */
function must({ data, error }, what = 'query') {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
async function notificationsOf(c) {
  return must(await c.from('notifications').select('*').order('created_at', { ascending: false }), 'notifications');
}

const admin = client();
const carer = client();
const family = client();
const ids = {};

console.log(`\nCareNest smoke test, run ${run}\n`);

// ---------- 1. Accounts ----------
console.log('1. Accounts and sign-up');

await step('Agency admin signs up and gets an agency code', async () => {
  const d = must(
    await admin.auth.signUp({
      email: email('admin'),
      password: PASSWORD,
      options: {
        data: { role: 'admin', agency_name: `Smoke Test Care ${run}`, registration_number: '12345678', phone: '020 7946 0000', address: '1 Test Street, London', postcode: 'N1 1AA' },
      },
    }),
    'signUp',
  );
  ok(d.session, 'No session after sign-up. Is "Confirm email" switched off?');
  const p = must(await admin.from('profiles').select('*, agency:agencies(code, name)').single(), 'profile');
  ok(p.role === 'admin', `role is ${p.role}`);
  ok(/^[A-Z0-9]{8}$/.test(p.agency.code), `bad code ${p.agency.code}`);
  ids.adminId = p.id;
  ids.agencyId = p.agency_id;
  ids.code = p.agency.code;
});

await step('Admin adds a caregiver and a patient (no logins yet)', async () => {
  const cg = must(
    await admin.from('caregivers').insert({ agency_id: ids.agencyId, first_name: 'Amira', last_name: 'Khan', email: email('carer'), phone: '07700 900001', region: 'North London', max_hours_per_week: 40 }).select().single(),
    'insert caregiver',
  );
  const pt = must(
    await admin.from('patients').insert({
      agency_id: ids.agencyId, first_name: 'Margaret', last_name: 'Ellis', email: email('family'), phone: '020 7946 0001',
      address: '12 Rose Lane, London', postcode: 'N6 5AB', care_plan: 'comprehensive', hourly_rate: 28.5,
      primary_caregiver_id: cg.id, notes: 'Key safe 1234. Allergic to penicillin.', date_of_birth: '1941-03-02',
    }).select().single(),
    'insert patient',
  );
  ids.caregiverId = cg.id;
  ids.patientId = pt.id;
});

await step('Caregiver signs up with the agency code and is linked (no duplicate)', async () => {
  must(await carer.auth.signUp({ email: email('carer'), password: PASSWORD, options: { data: { role: 'caregiver', first_name: 'Amira', last_name: 'Khan', phone: '07700 900001', agency_code: ids.code } } }), 'signUp');
  const rows = must(await admin.from('caregivers').select('id, user_id').eq('agency_id', ids.agencyId), 'caregivers');
  ok(rows.length === 1, `expected 1 caregiver, got ${rows.length}`);
  ok(rows[0].user_id, 'caregiver record not linked to the login');
});

await step('Patient (family) signs up and is linked', async () => {
  must(await family.auth.signUp({ email: email('family'), password: PASSWORD, options: { data: { role: 'patient', first_name: 'Margaret', last_name: 'Ellis', phone: '020 7946 0001', agency_code: ids.code, date_of_birth: '1941-03-02', address: '12 Rose Lane, London', postcode: 'N6 5AB' } } }), 'signUp');
  const rows = must(await admin.from('patients').select('id, user_id').eq('agency_id', ids.agencyId), 'patients');
  ok(rows.length === 1 && rows[0].user_id, 'patient record missing or not linked');
  ids.familyUserId = rows[0].user_id;
});

await step('Wrong agency code is rejected', async () => {
  const bad = client();
  const { error } = await bad.auth.signUp({ email: email('intruder'), password: PASSWORD, options: { data: { role: 'caregiver', first_name: 'X', last_name: 'Y', agency_code: 'ZZZZZZZZ' } } });
  ok(error, 'sign-up with a wrong code was accepted');
});

await step('Admin was notified about both sign-ups', async () => {
  const n = await notificationsOf(admin);
  ok(n.filter((x) => x.type === 'signup').length >= 2, `signup notifications: ${n.filter((x) => x.type === 'signup').length}`);
});

// ---------- 2. Scheduling ----------
console.log('\n2. Scheduling');

const soon = new Date(Date.now() + 10 * 60_000);
const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
inTwoDays.setMinutes(0, 0, 0);

await step('Admin books two visits; caregiver gets ONE grouped notification', async () => {
  const v = must(
    await admin.from('visits').insert([
      { agency_id: ids.agencyId, patient_id: ids.patientId, caregiver_id: ids.caregiverId, start_time: soon.toISOString(), end_time: new Date(soon.getTime() + 3_600_000).toISOString(), tasks: ['Personal care', 'Medication', 'Meal preparation'] },
      { agency_id: ids.agencyId, patient_id: ids.patientId, caregiver_id: ids.caregiverId, start_time: inTwoDays.toISOString(), end_time: new Date(inTwoDays.getTime() + 3_600_000).toISOString(), tasks: ['Personal care'] },
    ]).select(),
    'insert visits',
  );
  ids.visitNow = v.find((x) => new Date(x.start_time).getTime() === soon.getTime())?.id ?? v[0].id;
  ids.visitLater = v.find((x) => x.id !== ids.visitNow).id;
  const n = (await notificationsOf(carer)).filter((x) => x.type === 'visit_assigned');
  ok(n.length === 1, `expected 1 visit_assigned notification, got ${n.length}`);
  ok(n[0].group_count === 2, `group_count ${n[0].group_count}`);
});

await step('Caregiver sees care details but NOT the hourly rate', async () => {
  const mine = must(await carer.rpc('my_patients'), 'my_patients');
  ok(mine.length === 1 && mine[0].notes?.includes('penicillin'), 'patient / care notes missing');
  ok(!('hourly_rate' in mine[0]), 'hourly_rate leaked to caregiver');
  const direct = must(await carer.from('patients').select('hourly_rate'), 'patients');
  ok(direct.length === 0, 'caregiver can read the patients table directly');
});

await step('Caregiver cannot edit a visit directly', async () => {
  const r = must(await carer.from('visits').update({ start_time: new Date().toISOString() }).eq('id', ids.visitNow).select(), 'update');
  ok(r.length === 0, 'caregiver changed a visit time');
});

// ---------- 3. Visit day ----------
console.log('\n3. Visit day (check-in / check-out)');

await step('Caregiver checks in', async () => {
  const v = must(await carer.rpc('check_in_visit', { p_visit_id: ids.visitNow }), 'check_in');
  ok(v.status === 'in_progress' && v.checked_in_at, `status ${v.status}`);
});

await step('Second check-in elsewhere is refused', async () => {
  const { error } = await carer.rpc('check_in_visit', { p_visit_id: ids.visitLater });
  ok(error, 'was allowed to check in to two visits');
});

await step('Check-out needs a proper note', async () => {
  const { error } = await carer.rpc('check_out_visit', { p_visit_id: ids.visitNow, p_tasks_done: [], p_note: 'ok', p_concern: false });
  ok(error, 'short note accepted');
});

await step('Caregiver checks out with a note and raises a concern', async () => {
  const v = must(
    await carer.rpc('check_out_visit', { p_visit_id: ids.visitNow, p_tasks_done: ['Personal care', 'Medication', 'Not a planned task'], p_note: 'Margaret was cheerful. Tablets taken 08:20. Did not want breakfast.', p_concern: true }),
    'check_out',
  );
  ok(v.status === 'completed' && v.checked_out_at, `status ${v.status}`);
  ok(v.tasks_done.length === 2, `tasks_done kept unplanned task: ${v.tasks_done}`);
});

await step('Note author name comes from the profile (cannot be faked)', async () => {
  must(await carer.from('care_notes').insert({ agency_id: ids.agencyId, patient_id: ids.patientId, visit_id: ids.visitNow, author_id: ids.adminId, author_name: 'The Manager', body: 'Extra note: left the heating on low.', is_concern: false }), 'insert note');
  const notes = must(await admin.from('care_notes').select('author_name, body').eq('patient_id', ids.patientId), 'notes');
  ok(notes.every((n) => n.author_name === 'Amira Khan'), `author names: ${notes.map((n) => n.author_name)}`);
});

await step('Admin is told about the concern and can resolve it; caregiver is told', async () => {
  const n = await notificationsOf(admin);
  ok(n.some((x) => x.type === 'concern'), 'no concern notification');
  const c = must(await admin.from('care_notes').select('id').eq('is_concern', true).is('resolved_at', null), 'concerns');
  ok(c.length === 1, `open concerns ${c.length}`);
  must(await admin.from('care_notes').update({ resolved_at: new Date().toISOString(), resolved_by: ids.adminId }).eq('id', c[0].id), 'resolve');
  ok((await notificationsOf(carer)).some((x) => x.type === 'concern_resolved'), 'caregiver not told');
});

await step('Caregiver cannot edit or delete care notes', async () => {
  const u = must(await carer.from('care_notes').update({ body: 'changed' }).eq('patient_id', ids.patientId).select(), 'update');
  const d = must(await carer.from('care_notes').delete().eq('patient_id', ids.patientId).select(), 'delete');
  ok(u.length === 0 && d.length === 0, 'caregiver changed the care record');
});

// ---------- 4. Patient / family ----------
console.log('\n4. Patient and family');

await step('Family sees visits and the normal note, but NOT the concern', async () => {
  const visits = must(await family.from('visits').select('id, status'), 'visits');
  ok(visits.length === 2, `visits ${visits.length}`);
  const notes = must(await family.from('care_notes').select('body, is_concern'), 'notes');
  ok(notes.length === 1 && !notes[0].is_concern, `family saw ${notes.length} notes incl. concern=${notes.some((x) => x.is_concern)}`);
});

await step('Family sees carer names only (no phone)', async () => {
  const c = must(await family.rpc('my_caregivers'), 'my_caregivers');
  ok(c.length === 1 && c[0].first_name === 'Amira' && !('phone' in c[0]), 'unexpected carer data');
  const direct = must(await family.from('caregivers').select('phone'), 'caregivers');
  ok(direct.length === 0, 'family can read caregiver records');
});

await step('Family adds emergency contact; caregiver can see it', async () => {
  must(await family.rpc('update_my_contacts', { p_emergency_contact_name: 'Sarah Ellis', p_emergency_contact_phone: '07700 900123', p_emergency_contact_relation: 'Daughter', p_gp_practice: 'Highgate Group Practice' }), 'update_my_contacts');
  const mine = must(await carer.rpc('my_patients'), 'my_patients');
  ok(mine[0].emergency_contact_phone === '07700 900123', 'caregiver cannot see the emergency contact');
});

await step('Request reaches the office and the answer reaches the family', async () => {
  must(await family.from('care_requests').insert({ agency_id: ids.agencyId, patient_id: ids.patientId, visit_id: ids.visitLater, type: 'cancel_visit', details: 'Hospital appointment that morning.' }), 'insert request');
  const reqs = must(await admin.from('care_requests').select('id, status'), 'requests');
  ok(reqs.length === 1 && reqs[0].status === 'pending', 'admin cannot see the request');
  ok((await notificationsOf(admin)).some((x) => x.type === 'request'), 'admin not notified');
  must(await admin.from('care_requests').update({ status: 'approved', admin_response: 'Done, get well soon.', responded_at: new Date().toISOString(), responded_by: ids.adminId }).eq('id', reqs[0].id), 'approve');
  ok((await notificationsOf(family)).some((x) => x.type === 'request_answered'), 'family not notified');
});

await step('Family cannot approve their own request', async () => {
  must(await family.from('care_requests').insert({ agency_id: ids.agencyId, patient_id: ids.patientId, type: 'other', details: 'Please send a new care folder.' }), 'insert');
  const mine = must(await family.from('care_requests').select('id').eq('status', 'pending'), 'select');
  const r = must(await family.from('care_requests').update({ status: 'approved' }).eq('id', mine[0].id).select(), 'update');
  ok(r.length === 0, 'patient approved their own request');
  must(await family.rpc('withdraw_request', { p_request_id: mine[0].id }), 'withdraw');
});

await step('Compliment goes to the carer, complaint goes to the office', async () => {
  must(await family.from('feedback').insert([
    { agency_id: ids.agencyId, patient_id: ids.patientId, caregiver_id: ids.caregiverId, kind: 'compliment', message: 'Amira is wonderful with Mum.' },
    { agency_id: ids.agencyId, patient_id: ids.patientId, kind: 'complaint', message: 'Carer arrived 40 minutes late on Tuesday.' },
  ]), 'insert feedback');
  ok((await notificationsOf(carer)).some((x) => x.type === 'compliment'), 'carer not told about the compliment');
  ok((await notificationsOf(admin)).filter((x) => x.type === 'feedback').length >= 2, 'admin not told about feedback');
});

// ---------- 5. Changes, cancellations ----------
console.log('\n5. Changes made by the office');

await step('Moving a visit tells the carer and the family', async () => {
  must(await admin.from('visits').update({ start_time: new Date(inTwoDays.getTime() + 3_600_000).toISOString(), end_time: new Date(inTwoDays.getTime() + 7_200_000).toISOString() }).eq('id', ids.visitLater), 'move');
  ok((await notificationsOf(carer)).some((x) => x.type === 'visit_changed'), 'carer not told');
  ok((await notificationsOf(family)).some((x) => x.type === 'visit_changed'), 'family not told');
});

await step('Cancelling a visit tells the carer and the family', async () => {
  must(await admin.from('visits').update({ status: 'cancelled' }).eq('id', ids.visitLater), 'cancel');
  ok((await notificationsOf(carer)).some((x) => x.type === 'visit_cancelled'), 'carer not told');
  ok((await notificationsOf(family)).some((x) => x.type === 'visit_cancelled'), 'family not told');
});

// ---------- 6. Messages ----------
console.log('\n6. Messages');

await step('Caregiver messages the office; office inbox shows it unread', async () => {
  const me = must(await carer.auth.getUser(), 'getUser').user;
  ids.carerUserId = me.id;
  must(await carer.from('messages').insert({ agency_id: ids.agencyId, thread_user_id: me.id, body: 'Running 10 minutes late, traffic on the A1.' }), 'send');
  const threads = must(await admin.rpc('office_threads'), 'office_threads');
  ok(threads.length === 1 && threads[0].unread === 1 && threads[0].name === 'Amira Khan', JSON.stringify(threads));
  ok((await notificationsOf(admin)).some((x) => x.type === 'message'), 'admin not notified');
});

await step('Office reads and replies; read receipt and notification work', async () => {
  must(await admin.rpc('mark_thread_read', { p_thread_user_id: ids.carerUserId }), 'mark read');
  const m = must(await carer.from('messages').select('read_at').eq('from_office', false), 'messages');
  ok(m[0].read_at, 'not marked as seen');
  must(await admin.from('messages').insert({ agency_id: ids.agencyId, thread_user_id: ids.carerUserId, body: "Thanks, I'll let Margaret know." }), 'reply');
  const reply = must(await carer.from('messages').select('from_office, sender_name').eq('from_office', true), 'reply');
  ok(reply.length === 1 && reply[0].sender_name.length > 0, 'reply missing');
  ok((await notificationsOf(carer)).some((x) => x.type === 'message'), 'carer not notified');
});

await step('Messages cannot be faked or read by others', async () => {
  // Caregiver pretends to be the office
  must(await carer.from('messages').insert({ agency_id: ids.agencyId, thread_user_id: ids.carerUserId, body: 'fake', from_office: true, sender_name: 'Office' }), 'insert');
  const last = must(await admin.from('messages').select('from_office, sender_name').eq('body', 'fake').single(), 'select');
  ok(last.from_office === false && last.sender_name === 'Amira Khan', 'sender details were faked');
  const famView = must(await family.from('messages').select('id').eq('thread_user_id', ids.carerUserId), 'family read');
  ok(famView.length === 0, "family can read the carer's messages");
  const { error } = await family.from('messages').insert({ agency_id: ids.agencyId, thread_user_id: ids.carerUserId, body: 'hello' });
  ok(error, "family could write into the carer's conversation");
});

// ---------- 7. Billing ----------
console.log('\n7. Billing');

await step('Sent invoice notifies the family with the right total', async () => {
  must(
    await admin.rpc('create_invoice', {
      p_patient_id: ids.patientId, p_period_start: null, p_period_end: null,
      p_issue_date: new Date().toISOString().slice(0, 10), p_due_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      p_status: 'sent', p_notes: null,
      p_lines: [{ visit_id: ids.visitNow, description: 'Care visit', quantity: 1, unit_price: 28.5 }],
    }),
    'create_invoice',
  );
  await sleep(300);
  const n = (await notificationsOf(family)).find((x) => x.type === 'invoice');
  ok(n, 'family not notified');
  ok(n.body.includes('£28.50'), `wrong total in "${n.body}"`);
});

await step('The same visit cannot be billed twice', async () => {
  const { error } = await admin.rpc('create_invoice', {
    p_patient_id: ids.patientId, p_period_start: null, p_period_end: null, p_issue_date: '2026-11-13', p_due_date: '2026-11-27',
    p_status: 'draft', p_notes: null, p_lines: [{ visit_id: ids.visitNow, description: 'Again', quantity: 1, unit_price: 28.5 }],
  });
  ok(error, 'visit billed twice');
});

await step('Family sees sent invoices but never drafts', async () => {
  must(await admin.rpc('create_invoice', { p_patient_id: ids.patientId, p_period_start: null, p_period_end: null, p_issue_date: '2026-11-13', p_due_date: '2026-11-27', p_status: 'draft', p_notes: null, p_lines: [{ description: 'Mileage', quantity: 10, unit_price: 0.45 }] }), 'draft');
  const mine = must(await family.from('invoice_summaries').select('status, total'), 'invoices');
  ok(mine.length === 1 && mine[0].status === 'sent', `family sees ${mine.map((i) => i.status)}`);
});

await step('Payment marks the invoice paid and thanks the family', async () => {
  const inv = must(await admin.from('invoice_summaries').select('id, total').eq('status', 'sent').single(), 'invoice');
  must(await admin.from('payments').insert({ agency_id: ids.agencyId, invoice_id: inv.id, amount: inv.total, paid_on: '2026-11-13', method: 'bank_transfer' }), 'payment');
  const after = must(await admin.from('invoices').select('status').eq('id', inv.id).single(), 'status');
  ok(after.status === 'paid', `status ${after.status}`);
  ok((await notificationsOf(family)).some((x) => x.type === 'payment'), 'family not thanked');
});

// ---------- 8. Isolation ----------
console.log('\n8. Isolation between agencies');

await step('Caregiver and family cannot see the admin-only tables', async () => {
  const a = must(await carer.from('invoices').select('id'), 'invoices');
  const b = must(await carer.from('care_requests').select('id'), 'requests');
  const c = must(await family.from('profiles').select('id'), 'profiles');
  ok(a.length === 0 && b.length === 0, 'caregiver sees billing or requests');
  ok(c.length === 1, `family sees ${c.length} profiles`);
});

await step('Users cannot make themselves admin', async () => {
  // The database either refuses with an error or changes nothing; both are fine.
  await carer.from('profiles').update({ role: 'admin' }).eq('id', ids.carerUserId);
  const p = must(await carer.from('profiles').select('role').single(), 'profile');
  ok(p.role === 'caregiver', `role became ${p.role}`);
});

await step('Notifications: mark all read', async () => {
  must(await family.rpc('mark_notifications_read', { p_ids: null }), 'mark');
  const n = await notificationsOf(family);
  ok(n.every((x) => x.read_at), 'some still unread');
});

// ---------- 9. Access and data export (008) ----------
console.log('\n9. Inactive caregivers and data export (needs 008)');

await step('An inactive caregiver loses access to patients', async () => {
  must(await admin.from('caregivers').update({ status: 'inactive' }).eq('id', ids.caregiverId), 'deactivate');
  const mine = must(await carer.rpc('my_patients'), 'my_patients');
  ok(mine.length === 0, `inactive caregiver sees ${mine.length} patients`);
  must(await admin.from('caregivers').update({ status: 'active' }).eq('id', ids.caregiverId), 'reactivate');
  ok(must(await carer.rpc('my_patients'), 'my_patients').length === 1, 'access not restored');
});

await step('"Download my data" works and leaves out concern notes', async () => {
  const d = must(await family.rpc('export_my_data'), 'export_my_data');
  ok(d.patient_record?.first_name === 'Margaret', 'no patient record in export');
  ok(Array.isArray(d.visits) && d.visits.length === 2, `visits ${d.visits?.length}`);
  ok(d.care_notes.every((n) => !n.is_concern), 'concern notes in the export');
  const c = must(await carer.rpc('export_my_data'), 'carer export');
  ok(c.caregiver_record && c.care_notes_written.length >= 1, 'carer export incomplete');
});

// ---------- 10. One login, several agencies (009) ----------
console.log('\n10. One login, several agencies (needs 009)');

const admin2 = client();
const stranger = client();

await step('A second agency signs up', async () => {
  must(await admin2.auth.signUp({ email: email('admin2'), password: PASSWORD, options: { data: { role: 'admin', agency_name: `Smoke Test Care ${run} B`, postcode: 'E1 6AN' } } }), 'signUp');
  const p = must(await admin2.from('profiles').select('agency_id, agency:agencies(code)').single(), 'profile');
  ids.agency2 = p.agency_id;
  ids.code2 = p.agency.code;
});

await step('Caregiver joins the second agency with its code, same login', async () => {
  const role = must(await carer.rpc('join_agency', { p_code: ids.code2, p_role: 'caregiver' }), 'join_agency');
  ok(role === 'caregiver', `role ${role}`);
  const list = must(await carer.rpc('my_agencies'), 'my_agencies');
  ok(list.length === 2, `agencies ${list.length}`);
  ok(list.find((a) => a.is_current)?.agency_id === ids.agency2, 'not switched to the new agency');
  const n = await notificationsOf(admin2);
  ok(n.some((x) => x.type === 'signup'), 'second agency was not told about the new caregiver');
});

await step('Agencies stay separate: in agency B the carer sees none of agency A', async () => {
  ok(must(await carer.rpc('my_patients'), 'my_patients').length === 0, 'sees agency A patients');
  ok(must(await carer.from('visits').select('id'), 'visits').length === 0, 'sees agency A visits');
  ok(must(await carer.from('messages').select('id'), 'messages').length === 0, 'sees agency A messages');
  ok(must(await admin2.from('caregivers').select('id, agency_id'), 'caregivers').every((c) => c.agency_id === ids.agency2), 'agency B sees agency A records');
});

await step('Messages and notifications follow the agency in use', async () => {
  const me = must(await carer.auth.getUser(), 'user').user;
  must(await admin2.from('messages').insert({ agency_id: ids.agency2, thread_user_id: me.id, body: 'Welcome to agency B' }), 'agency B message');
  ok((await notificationsOf(carer)).some((x) => x.body === 'Welcome to agency B'), 'agency B notification missing while in B');
  must(await carer.rpc('switch_agency', { p_agency_id: ids.agencyId }), 'switch back');
  ok(!(await notificationsOf(carer)).some((x) => x.body === 'Welcome to agency B'), 'agency B notification shown while in A');
  ok(must(await carer.from('messages').select('agency_id'), 'messages').every((m) => m.agency_id === ids.agencyId), 'agency B messages shown in A');
  ok(must(await carer.rpc('my_patients'), 'my_patients').length === 1, 'agency A patients missing after switching back');
});

await step('A patient at one agency can be a caregiver at another', async () => {
  must(await family.rpc('join_agency', { p_code: ids.code2, p_role: 'caregiver' }), 'join');
  const p = must(await family.from('profiles').select('role, agency_id').single(), 'profile');
  ok(p.role === 'caregiver' && p.agency_id === ids.agency2, `now ${p.role}`);
  ok(must(await family.from('patients').select('id'), 'patients').length === 0, 'patient record visible in agency B');
  const back = must(await family.rpc('switch_agency', { p_agency_id: ids.agencyId }), 'switch back');
  ok(back === 'patient', `back as ${back}`);
  ok(must(await family.from('visits').select('id'), 'visits').length === 2, 'patient visits missing after switching back');
});

await step('Joining and switching are checked', async () => {
  ok((await carer.rpc('join_agency', { p_code: ids.code2, p_role: 'patient' })).error, 'joined the same agency twice');
  ok((await carer.rpc('join_agency', { p_code: 'ZZZZZZZZ', p_role: 'caregiver' })).error, 'joined with a wrong code');
  ok((await admin.rpc('join_agency', { p_code: ids.code2, p_role: 'caregiver' })).error, 'an office login joined another agency');
  must(await stranger.auth.signUp({ email: email('stranger'), password: PASSWORD, options: { data: { role: 'caregiver', first_name: 'S', last_name: 'T', agency_code: ids.code2 } } }), 'signUp');
  ok((await stranger.rpc('switch_agency', { p_agency_id: ids.agencyId })).error, 'switched into an agency without belonging to it');
});

await step('An agency adding someone who already has a login links it to them', async () => {
  must(await admin2.from('patients').insert({ agency_id: ids.agency2, first_name: 'Amira', last_name: 'Khan', email: email('carer') }), 'insert');
  // The carer is already a caregiver at agency B, so no second record in the same agency gets linked.
  const rows = must(await admin2.from('patients').select('user_id').eq('email', email('carer')), 'patients');
  ok(rows.length === 1 && rows[0].user_id === null, 'linked a second record in the same agency');
  must(await admin.from('caregivers').insert({ agency_id: ids.agencyId, first_name: 'S', last_name: 'T', email: email('stranger') }), 'insert');
  const list = must(await stranger.rpc('my_agencies'), 'my_agencies');
  ok(list.length === 2, `stranger now has ${list.length} agencies`);
});

// ---------- 11. Find your agency at sign-up (010) ----------
console.log('\n11. Find your agency at sign-up (needs 010)');

await step('Agency search works before sign-in by name, branch and postcode, and never shows codes', async () => {
  must(await admin2.from('agencies').update({ branch_name: `Branch ${run}` }).eq('id', ids.agency2), 'set branch');
  const anon = client();
  const byName = must(await anon.rpc('search_agencies', { p_query: `Smoke Test Care ${run} B` }), 'search name');
  ok(byName.some((a) => a.id === ids.agency2), 'not found by name');
  ok(byName.every((a) => !('code' in a)), 'search results include agency codes');
  const byBranch = must(await anon.rpc('search_agencies', { p_query: `branch ${run}` }), 'search branch');
  ok(byBranch.some((a) => a.id === ids.agency2 && a.branch_name === `Branch ${run}`), 'not found by branch');
  const byPostcode = must(await anon.rpc('search_agencies', { p_query: 'e16an' }), 'search postcode');
  ok(byPostcode.some((a) => a.id === ids.agency2), 'not found by postcode without the space');
  ok(must(await anon.rpc('search_agencies', { p_query: 'a' }), 'short').length === 0, 'one letter returned results');
});

await step('Caregiver signs up by picking the agency from the list (no code)', async () => {
  const picker = client();
  must(await picker.auth.signUp({ email: email('picker'), password: PASSWORD, options: { data: { role: 'caregiver', first_name: 'Pia', last_name: 'Picker', agency_id: ids.agency2 } } }), 'signUp');
  const p = must(await picker.from('profiles').select('role, agency_id').single(), 'profile');
  ok(p.role === 'caregiver' && p.agency_id === ids.agency2, 'joined the wrong agency');
  ok(must(await admin2.from('caregivers').select('id').eq('email', email('picker')), 'record').length === 1, 'no caregiver record');
  const role = must(await picker.rpc('join_agency_by_id', { p_agency_id: ids.agencyId, p_role: 'patient' }), 'join by id');
  ok(role === 'patient', `joined as ${role}`);
  ok(must(await picker.rpc('my_agencies'), 'my_agencies').length === 2, 'second agency not added');
});

await step('Sign-up with an unknown agency is refused', async () => {
  const { error } = await client().auth.signUp({ email: email('noagency'), password: PASSWORD, options: { data: { role: 'patient', first_name: 'N', last_name: 'A', agency_id: '00000000-0000-0000-0000-000000000000' } } });
  ok(error, 'signed up with an agency that does not exist');
});

// ---------- Summary ----------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log('\nFailures:\n - ' + failures.join('\n - '));
console.log(`
Test agency: "Smoke Test Care ${run}" (code ${ids.code ?? '?'}). To remove ALL smoke-test data later, run in the SQL Editor:
  delete from public.agencies where name like 'Smoke Test Care %';
  delete from auth.users where email like 'smoketest+%@example.com';
`);
process.exit(failed ? 1 : 0);
