# CareNest: Project Guide

This guide explains how CareNest is built: the code, the database, and how to deploy it. It is updated as each part of the app is made functional.

**Last updated:** 10/11/2026 (stage 4: settings)

---

## 1. What CareNest is

CareNest is a homecare scheduling platform with three kinds of users:

| User | What they do |
|---|---|
| **Admin** (agency) | Registers the agency, manages patients and caregivers, schedules visits, handles billing |
| **Caregiver** | Sees their schedule, checklists and patients |
| **Patient** | Sees their visits and care plan, and sends requests and feedback |

Each agency is separate. An admin only ever sees their own agency's data.

---

## 2. Tech stack

| Part | Technology | Why |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Fast dev server, typed code |
| UI | Tailwind CSS + shadcn/ui (Radix) | Ready-made accessible components in `src/components/ui` |
| Forms | react-hook-form + zod | Form state and validation |
| Data fetching | TanStack React Query | Caching, loading states, refetching after saves |
| Backend | **Supabase** (Postgres database + Auth) | Relational data, built-in login, row-level security |
| Hosting (planned) | **Vercel** for the website, Supabase for the backend | Both have free tiers |

---

## 3. Running the project locally

```bash
npm install          # .npmrc already sets legacy-peer-deps
npm run dev          # opens http://localhost:8080
```

You need a `.env.local` file in the project root (it is git-ignored):

```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Copy `.env.example` to start. Both values come from **Supabase → Project Settings → API Keys**.
The publishable key is safe to use in the browser. **Never** put the `secret` / `service_role` key in this project.

---

## 4. Folder structure

```
supabase/
  migrations/            SQL scripts that build the database (run in order)
src/
  App.tsx                All routes; wraps the app in AuthProvider
  main.tsx               Entry point
  lib/
    supabase.ts          Supabase client, Role/Profile types
    database.types.ts    TypeScript shapes of each database table
    format.ts            £ money, UK dates, ages, names
    visits.ts            Visit rules: care tasks, lengths, statuses, clash check, repeats
    billing.ts           Invoice/payment labels, overdue & part-paid rules
    caregiver.ts         Check-in window, "late" rule, hours worked, maps link
    requests.ts          Request types/statuses, feedback kinds, "Amira K." carer names
  contexts/
    AuthContext.tsx      Who is logged in (session + profile), signOut()
  hooks/
    data/useAgencyData.ts   Load/save patients, caregivers, visits (React Query)
    data/useBilling.ts      Invoices, payments, unbilled visits, agency details
    data/useCaregiverData.ts  Caregiver side: my record, my visits, my patients,
                            check-in / check-out / no access, care notes; admin concerns
    data/usePatientData.ts  Patient side: my record, my carers (names only), my visits, contacts
    data/useRequests.ts     Requests and feedback (patient creates, admin answers)
    data/useMessages.ts     Conversations with the office, office inbox, unread count
    data/useNotifications.ts  Notifications list, unread count, mark read, clear
    useNavBadges.ts         Unread badges for the menus
    useAdminViews.ts        Turns database rows into what admin screens display
                            (useAdminPatients, useAdminCaregivers, useAdminVisits)
    useCaregiverFilters.ts  Search/region/heatmap filters on Caregivers page
    useCaregiverManagement.ts  Dialog open/close state on Caregivers page
  components/
    auth/ProtectedRoute.tsx  Blocks pages unless logged in with the right role
    layout/                  Header, Sidebar, BottomNav, Layout
    account/MyAccount.tsx    Name, phone, login email, password (admin + caregiver)
    care/CareNotesList.tsx   Read-only list of care notes (caregiver + admin screens)
    caregiver/               MyVisitCard, NotLinkedNotice, EmergencyInfo
    patient/                 RequestFormDialog, PatientVisitDialog
    billing/InvoiceDocument.tsx  Printable invoice (admin + patient)
    messages/ChatThread.tsx  Conversation view with read receipts (all roles)
    notifications/NotificationsView.tsx  Notifications list (all roles)
    realtime/RealtimeSync.tsx  Live updates: refreshes screens, pop-ups for new notifications
    admin/                   Admin dialogs, tables, workload & heatmap widgets
      VisitFormDialog.tsx      Create/edit a visit (used by Dashboard, Calendar, Scheduler)
      VisitDetailsDialog.tsx   View a visit; mark completed / cancel / find caregiver
      PatientFormDialog.tsx    Add/edit/delete a patient
      CaregiverFormDialog.tsx  Add/edit/delete a caregiver
      scheduler/               WeekGrid, filters, unassigned panel, caregiver suggestions
      billing/                 New invoice, generate monthly, record payment
    ui/                      shadcn/ui building blocks
  pages/
    LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage
    admin/  caregiver/  patient/   One file per screen
  types/admin.ts         View models used by admin screens
```

### How data flows on an admin page

```
Supabase table ──► hooks/data/useAgencyData.ts ──► hooks/useAdminViews.ts ──► page component
   (rows)            (React Query: fetch/save)       (rows → display shape)     (tables, dialogs)
```

When a dialog saves, the hook updates Supabase and React Query refetches the affected lists, so every table refreshes on its own.

---

## 5. Authentication

### Sign up
- **Agency (admin):** fills in agency details. The database creates the agency and gives it a unique **8-character agency code** (for example `K7M2QX9P`).
- **Caregiver / Patient:** must enter a valid agency code. The signup page checks the code first (`agency_code_exists`) and shows an error if it is wrong.
  The agency code doubles as verification: caregivers only get it from their agency.
- If Supabase email confirmation is on, the user sees "Check your email" and must click the link before signing in.

### Log in
- Email + password only. **The role comes from the database**, not from anything the user picks, and the user is sent to `/admin`, `/caregiver` or `/patient`.

### Page protection
- `ProtectedRoute` wraps each role's pages. If you are logged out you go to the login page. If you have the wrong role (for example a patient opening `/admin`) you are redirected to your own dashboard.

### Where admins find the agency code
- The profile menu at the top right of any admin page.

### Password reset
- `/forgot-password` sends an email. The link opens `/reset-password`, where the user sets a new password.

---

## 6. Database

Run the SQL files in `supabase/migrations/` **in order** in **Supabase → SQL Editor → New query → paste → Run**. Each file is safe to run more than once.

| File | Creates |
|---|---|
| `001_auth.sql` | `agencies`, `profiles`, signup trigger, agency codes |
| `002_patients_caregivers_visits.sql` | `caregivers`, `patients`, `visits`, and links signups to these records |
| `003_billing.sql` | `invoices`, `invoice_lines`, `payments`, invoice numbering, `invoice_summaries` view |
| `004_settings.sql` | Agency billing defaults, bank details, CQC ID; safe agency-code reset; email sync |
| `005_caregiver_visits.sql` | Visit check-in/out columns, `care_notes`, caregiver visit functions, `my_patients()`, profile-to-record sync, re-linking logins |
| `006_patient_side.sql` | `care_requests`, `feedback`, emergency contact + GP on patients, `my_caregivers()`, patients read own care notes |
| `007_messages_notifications.sql` | `messages`, `notifications`, the triggers that create notifications, Realtime, function permission fix |
| `008_security.sql` | Two-step verification enforced for admins, inactive caregivers lose access, "Download my data" |
| `009_multi_agency.sql` | One login for several agencies: caregivers and patients can join more agencies with a code and switch between them |
| `010_agency_directory.sql` | Find your agency from a searchable list at sign-up (name, branch, address, postcode; never the code), agency branch name |

### Tables

```
agencies ─┬─< profiles      (one login account per user: role + agency)
          ├─< caregivers ─┐  (care staff records; user_id set if they have a login)
          ├─< patients ───┤  (patient records; user_id set if they have a login)
          ├─< visits >────┘  (patient_id, caregiver_id, start/end time, status, tasks)
          ├─< care_notes       (patient_id, visit_id, author, body, concern flag)
          ├─< care_requests    (patient_id, visit_id, type, details, status, office reply)
          ├─< feedback         (patient_id, caregiver_id, kind, message, office reply)
          ├─< messages         (thread_user_id = caregiver/patient, from_office, body, read_at)
          └─< notifications    (user_id, type, title, body, link, group_count, read_at)
```

| Table | Key columns |
|---|---|
| `agencies` | name, registration_number, cqc_provider_id, email, phone, address, postcode, **code**, default_payment_terms, default_hourly_rate, bank_account_name / sort_code / account_number, invoice_footer |
| `profiles` | id (= auth user), **role** (admin/caregiver/patient), agency_id, names, contact |
| `caregivers` | names, email, phone, specialty, region, availability, max_hours_per_week, start_date, status, user_id |
| `patients` | names, date_of_birth, contact, address, postcode, care_plan (basic/comprehensive/advanced), primary_caregiver_id, **hourly_rate (£)**, status, notes, emergency_contact_name / phone / relation, gp_practice, user_id |
| `visits` | patient_id, caregiver_id (empty = unassigned), start_time, end_time, status (scheduled/in_progress/completed/cancelled/missed), tasks[], notes, **checked_in_at, checked_out_at, tasks_done[]** |
| `care_notes` | patient_id, visit_id, author_id, author_name, body, **is_concern**, resolved_at, resolved_by |
| `care_requests` | patient_id, visit_id, type (change_time / cancel_visit / extra_visit / change_caregiver / change_care / other), details, preferred_date, preferred_time, status (pending / approved / declined / withdrawn), admin_response, responded_at |
| `feedback` | patient_id, caregiver_id, kind (compliment / suggestion / complaint), message, status (open / resolved), admin_response |
| `messages` | thread_user_id (whose conversation with the office), sender_id, sender_name, from_office, body, read_at |
| `notifications` | user_id, type, title, body, link, group_count, read_at |

### Caregiver visit rules (005)
Caregivers can't edit the `visits` table directly. They use three database functions that only allow the real steps of a visit:

| Function | Allowed when | What it does |
|---|---|---|
| `check_in_visit` | The visit is theirs and `scheduled`, from **1 hour before** the start until **4 hours after** the end, and they aren't checked in anywhere else | status becomes `in_progress`, records `checked_in_at` |
| `check_out_visit` | They are checked in to it; a care note of 10+ characters is required | saves the care note (optionally as a **concern**), records ticked tasks, status becomes `completed`, records `checked_out_at` |
| `report_no_access` | The visit is due or in progress | status becomes `missed` (not billed) and a concern note "No access: ..." is saved so the office follows up |

- **Billing uses the planned times**, not the check-in/out times (normal for planned UK homecare). Actual times are shown to the admin on the visit and used for "hours worked" on the caregiver's home page.
- A visit is **Late** when it is still `scheduled` 15 minutes after its start. Admins see a red "Late" badge on the dashboard and in visit details.
- **Care notes are a legal record.** Caregivers can add notes but can't edit or delete them; a correction is a new note. The database fills in the author's name from their profile.
- **Concerns** appear on the admin dashboard until an admin clicks **Mark resolved**.
- Caregivers get patient details through `my_patients()`, which leaves out the hourly rate and billing email.

### Patient side rules (006)
- **Requests reach the office.** A patient (or a family member using their login) sends a request; it shows on **Admin → Requests** and on the dashboard. The admin replies with **Approve** or **Decline** (a reason is required to decline). Approving does not change the schedule by itself: the admin uses **Edit the visit** / **Book the visit** on the request first.
- Patients can **withdraw** a request only while it's still pending (`withdraw_request`). They can't edit or delete requests.
- **Feedback** is compliments, suggestions or complaints, optionally about a carer. Complaints need a written reply before they can be closed, because CQC inspectors ask to see complaint records.
- **What patients see:** their own record, visits (with actual arrival/leaving times, tasks done and the carer's note), invoices that are sent/paid/void (never drafts), requests and feedback.
- **Concern notes are hidden from patients**, because they can be safeguarding matters.
- **Carers' privacy:** patients get carers' names only, through `my_caregivers()` ("Amira K."), not their phone, email or hours.
- **Emergency contact and GP:** the patient edits them on their profile (`update_my_contacts`), the admin in the patient form, and carers see them on the visit page.

### Finding your agency at sign-up (010)
- Caregivers and patients **pick their agency from a searchable list** instead of typing a code: type at least 2 letters of the agency name, branch, town or postcode (spaces in postcodes don't matter) and choose from up to 20 matches.
- The list shows **name, branch, address and postcode**. It **never shows agency codes**: those stay private. "I have an agency code instead" still works.
- Agencies can add a **Branch name** (e.g. "Camden") at sign-up or in **Settings → Agency**, so people pick the right office of a chain.
- The same picker is used for **Switch or join agency → Join another agency**.
- Anyone who picks an agency can join it, so the office gets a notification for every new caregiver or patient. A caregiver sees nothing until the office gives them visits; someone who joined by mistake can be set to Inactive or removed.

### One login, several agencies (009)
- A **caregiver** can work for several agencies and a **patient** can get care from several, with the **same email and password**. A person can even be a caregiver at one agency and a patient at another (but only one role per agency).
- **Joining:** signed in, open the menu (your initial, top right) → **Switch or join agency** → **Join another agency**, enter that agency's code and choose caregiver or patient. If the agency already added you with that email, your existing record is used. Signing up again with the same email is refused with a message explaining this.
- **Choosing:** after signing in, someone with more than one agency sees **Choose an agency**: only *their* agencies, searchable by name or postcode, with their role and unread notifications for each. Agency codes are never listed.
- **Switching:** the same screen, from the top-right menu or "Switch" under the page title on phones. The whole app then shows that agency.
- **Kept separate:** visits, patients, notes, messages, notifications, invoices and "Download my data" are always for the agency in use. Agency A never sees anything from agency B.
- **Office (admin) logins belong to one agency** and can't join others (they see everyone's health information). Use a different email for a second agency's office.
- **Agency adds someone who already has a login:** the record is linked to that login automatically, and the agency appears in the person's list next time they sign in.
- How it works: `profiles.agency_id` / `profiles.role` hold the agency **in use**; `switch_agency()` and `join_agency()` change it after checking the person really belongs there, so all the existing "my agency" security rules keep working.

### Access and privacy (008)
- **One office login per agency for now.** Signing up as "Agency" always creates a *new* agency. Inviting more office colleagues is planned for later (see section 11).
- **Caregivers who leave:** set their status to **Inactive** on the Caregivers page. They can no longer see any patients, visits or notes (`my_caregiver_id()` ignores inactive carers).
- **Two-step verification (2FA):** anyone can turn it on in their profile / **Settings → My account** with an authenticator app (QR code). After the password they're asked for the 6-digit code. **For admins the database enforces it**: once an admin has turned it on, `is_agency_admin()` refuses data until the session has passed the second step (`aal2`). It needs TOTP switched on in **Supabase → Authentication → Multi-Factor** (on by default). Changing your password asks for the code again.
- **Download my data** (UK GDPR right of access): profile / My account → **Download my data** gives a JSON file of everything the user can see about themselves (`export_my_data()`); for patients it leaves out concern notes.
- **Privacy policy and terms:** `/privacy` and `/terms` (linked from login and signup; signing up requires ticking the box). They are templates written for UK GDPR: the agency must check them and add its details.

### Messages and notifications (007)
- **Who can message whom:** each caregiver and patient has **one conversation with the office**; every admin in the agency sees and answers it. There is **no direct carer-to-patient chat**, which is normal in UK agencies (professional boundaries, carers' personal time, and a record of what was said). Messages can't be edited or deleted. Patients are pointed to **Requests** for visit changes so they're tracked.
- **Read receipts:** "Sent" / "Seen" under your last message. Opening a conversation marks it read (`mark_thread_read`).
- **Notifications are created by the database** (triggers), never by the app, so they can't be skipped:

| Who | Gets told when |
|---|---|
| Caregiver | a visit is added, moved, cancelled, reinstated or taken off their schedule; a patient sends them a compliment; the office resolves a concern they raised; the office messages them |
| Patient | a visit time or carer changes, or a visit is cancelled / reinstated; a request is approved or declined; the office replies to feedback; a new invoice is sent; a payment is recorded; the office messages them |
| Admin (all admins) | a new request (or a withdrawn one); new feedback (complaint, compliment, suggestion); a concern is raised; a caregiver or patient signs up; a message arrives |

- **No spam:** visit alerts are only sent for visits in the **next 14 days**; repeated alerts of the same kind (e.g. 20 repeating visits, or several messages) are **grouped into one** with a "×20" count. A caregiver's own check-in/out never triggers alerts.
- **Live:** with Supabase Realtime the bell count, menu badges and conversations update instantly and a pop-up appears. If Realtime is blocked, counts still refresh every minute and on every page change.
- **Security fix:** Postgres lets everyone run new functions by default, so earlier "revoke from anon" lines weren't enough. 007 removes that default for every CareNest function; only `agency_code_exists` stays open for the signup page.

### Billing rules
- An invoice is built from **completed** visits: hours × the patient's hourly rate, plus optional extra lines (fees, mileage).
- The rate is copied onto each invoice line, so changing a patient's rate later never changes old invoices.
- **A visit can only be billed once** (unique index on `invoice_lines.visit_id`).
- Numbers are automatic per agency per year: `INV-2026-0001`.
- Statuses: `draft` (not visible to the patient) → `sent` → `paid`, or `void`. **Overdue** and **Part paid** are calculated from the due date and payments, not stored.
- Recording payments updates the status automatically (a database trigger sets `paid` when the balance reaches £0).
- Drafts can be deleted. Issued invoices are **voided** instead (kept on record); voiding frees their visits to be billed again. An invoice with payments can't be voided until the payments are deleted.
- No VAT: homecare from CQC-registered providers is normally VAT-exempt. Check with an accountant for your situation.
- Patients will be able to see their own sent/paid invoices (not drafts) once the patient pages are built.

### Visit statuses
`scheduled` → `in_progress` → `completed`, or `cancelled` / `missed`.
Cancelled visits stay in the database (for history and reports) but don't count towards caregiver hours or clash checks.
Use **Delete** only for visits created by mistake.

### Admin-created records vs. signups
An admin can add a patient or caregiver who has no account (for example an elderly patient without email).
If that person later signs up with **the same email and the agency's code**, the signup trigger (`handle_new_user`) links their new login to the existing record instead of creating a duplicate.
It also works the other way round: if an admin deletes a record and adds it again with the email of someone who already has a login, the new record is linked to that login (`link_existing_login`).
When a caregiver or patient changes their name or phone in their profile, their caregiver/patient record is updated too, so the office always sees current details.

### Security (Row Level Security)
RLS is switched on for every table, so the database itself enforces these rules even if someone bypasses the website:

| Who | Can see / change |
|---|---|
| Admin | Everything in **their own** agency (`is_agency_admin`) |
| Caregiver | Their own record and visits; care details of their patients (no rates); care notes of their patients (add only). Visit changes only through the check-in/out functions |
| Patient | Their own record, visits, non-concern care notes, sent invoices, requests and feedback (create; withdraw pending requests); carers' names only |
| Anyone not logged in | Only the yes/no "does this agency code exist" check |

Users cannot change their own role or move themselves to another agency.
Admins can edit their agency's details but **not the agency code directly**. It can only be replaced with a new random code through `regenerate_agency_code()`.

---

## 7. Progress

### Done
- [x] Supabase connected
- [x] Signup / login / logout / forgot and reset password
- [x] Role-based page protection
- [x] Agency codes; caregiver job-role field removed
- [x] **Admin → Patients:** list, search, status filter, add, edit, delete, details (next visit, caregiver, £ rate, account status)
- [x] **Admin → Caregivers:** list with assigned patients, add, edit, delete, details; workload tab and heatmap calculated from real visits; CSV export

- [x] **Visit form** (shared): patient, caregiver or unassigned, date, start, length, care tasks, notes; repeat daily / weekdays / weekly for up to 12 weeks; warns when the caregiver is already booked
- [x] **Admin → Scheduler:** weekly grid per caregiver with hours vs. max; click + to add; drag a visit to another day or caregiver (time is kept); unassigned-visits panel (drag onto grid or click for suggestions); suggestions ranked by free at that time → primary caregiver → hours left
- [x] **Admin → Calendar:** month view (Monday first) with navigation, search, caregiver and status filters; day list with details, edit, mark completed, cancel
- [x] **Admin → Dashboard:** live counts, today's schedule, recent activity, upcoming visits, quick actions

- [x] **Admin → Billing:** invoices from completed visits, extra lines, drafts, generate monthly invoices for all patients, printable invoice / PDF, record and delete payments, outstanding / overdue / received stats, CSV export
- [x] **Admin → Reports:** visits (completion rate, weekly care hours chart), caregivers (hours, missed, utilisation), revenue (invoiced vs received chart, completed-but-not-billed value), patients (by care plan, hours each); date ranges; CSV export

- [x] **Admin → Settings:** agency details (Companies House no., CQC provider ID, contact, address); agency code copy / generate new; billing defaults (payment terms, default hourly rate); bank details and footer printed on invoices; my details, change login email, change password (checks current password)

- [x] **Caregiver → Home:** "checked in" banner or next visit, today's visits, coming up (7 days), visits left today, completed this week, hours worked vs planned
- [x] **Caregiver → Schedule:** week view (Monday first), previous / next / this week, visit count and planned hours
- [x] **Caregiver → Visit page** (`/caregiver/visits/:id`): patient address with maps link, tap-to-call phone, care plan and office instructions; check in; tick tasks; care note (draft kept if the page reloads); raise a concern; check out; "couldn't get in / refused care"; add a later note; recent care notes
- [x] **Caregiver → My patients:** list with search and next visit; patient page with upcoming visits and full care record
- [x] **Caregiver → Profile:** work details from the agency (read only); my details, login email, password
- [x] **Admin additions:** concerns panel with "Mark resolved" on the dashboard; Late badges; actual check-in/out times, ticked tasks and care notes in visit details; care record in patient details
- Removed (unrealistic without a backend): caregiver Certifications upload, the separate Checklist and Notes pages (now part of the visit page), the Settings menu item for non-admins

- [x] **Patient → Home:** next visit and carer (or "your carer is with you now"), next 7 days, recent visits, requests waiting, amount to pay
- [x] **Patient → My visits:** upcoming / past by day, visit details with arrival and leaving times, care given and the carer's note; "Request a change to this visit"
- [x] **Patient → Care plan:** plan level and what it covers, hourly rate, regular weekly visits worked out from bookings, carers, the office's notes
- [x] **Patient → Requests:** change time, cancel (24-hour notice warning), extra visit, change carer, change care, other; office replies; withdraw while pending
- [x] **Patient → Invoices:** list with amount to pay; printable invoice with bank details
- [x] **Patient → Feedback:** compliment / suggestion / complaint, optionally about a carer; office replies
- [x] **Patient → Profile:** address (read only), emergency contact and GP (editable), login details
- [x] **Admin → Requests & Feedback:** open/all filter; approve / decline with reply; edit or book the visit straight from the request; reply and close feedback. Dashboard card with open counts. Patient form and details now include emergency contact and GP
- Removed: patient Settings page (every toggle was fake), US insurance / physician fields, star ratings of carers' "roles", medication-refill and equipment request types, "priority" on requests

- [x] **Messages (all roles):** caregiver and patient chat with the office (emergency reminder and office phone); admin inbox with unread counts, search and "new message"; read receipts; live updates
- [x] **Notifications (all roles):** created by database triggers for real events; bell with unread count; menu badges; pop-ups; mark read / all read; clear read
- [x] Mobile menus now include Messages; the bell's fake red dot is gone

- [x] **Go-live fixes:** inactive caregivers lose access; two-step verification (enforced for admins); privacy policy and terms pages; "Download my data"; each page loads only when opened (first download 1.5 MB → 0.7 MB); friendly error screen; unused files removed; lint errors fixed
- [x] **Tests:** 14 unit tests for the business rules (`npm test`) and an end-to-end smoke test against the real Supabase project (`npm run test:smoke`)

**All planned stages are complete.** See section 11 for what a real agency would still add before going live.

---

## 8. Testing

### Automatic tests
| Command | What it checks |
|---|---|
| `npm test` | 14 unit tests of the rules the screens use: repeating visits, clash checks, overdue/part-paid invoices, check-in window and "late" rule, hours worked, UK dates and money |
| `npm run test:smoke` | Signs up a throw-away test agency, carer and family in **your Supabase project** and runs 46 checks of the real flows and security rules (sign-up linking, visits, check-in/out, care notes, concerns, requests, feedback, messages, invoices, payments, who-can-see-what, inactive caregivers, data export, one login across two agencies, agency search at sign-up). Needs "Confirm email" OFF. It prints SQL to delete the test data afterwards. |

### Manual test scenario: one month at an agency

Use this to check everything works together. It takes about 15 minutes.

1. **Set up the agency.** Sign up as an Agency, e.g. "Sunrise Homecare Ltd".
   Go to **Settings → Agency** and add the CQC provider ID (e.g. `1-123456789`) and address.
   Go to **Settings → Billing**: payment terms 14 days, default rate £28.50, and bank details (any test numbers, e.g. `12-34-56` / `12345678`).
2. **Add staff.** On **Caregivers**, add two caregivers:
   - Amira Khan: full-time, 40h, North London, email `amira@example.com`
   - Tom Price: part-time, 20h, North London
3. **Add patients.** On **Patients**, add two patients. Check the hourly rate pre-fills as £28.50.
   - Margaret Ellis: Comprehensive, primary caregiver Amira
   - George Hall: Basic, rate changed to £25.00, no primary caregiver
4. **Schedule care.** On **Scheduler → Schedule Visit**:
   - Margaret: every weekday at 08:00, 1 hour, Personal care + Medication, for 4 weeks. Amira is filled in for you.
   - George: every week on Tuesday at 14:00, 2 hours, Domestic help, **unassigned**
5. **Assign and check clashes.** In the Unassigned panel, click George's visit. Suggestions should show Amira and Tom as free. Assign Tom.
   Then add a visit for Margaret at 08:30 with Amira. You should see the yellow "already booked" warning.
6. **Deliver care.** For any past visits (or edit a visit's date to yesterday), open it and choose **Mark completed**. Mark one as **Missed** using Edit → Status.
7. **Check reports.** **Reports → Visits** shows the completion rate. **Revenue** shows "Completed, not yet billed".
8. **Bill.** **Billing → Generate monthly** for this month. You get one draft per patient.
   Open Margaret's draft, check the bank details and reference appear, then **Mark as sent** and **Print / PDF**.
9. **Get paid.** **Record payment** for half the amount. The status becomes **Part paid**. Record the rest and it becomes **Paid**.
10. **Caregiver joins.** Copy the agency code from **Settings**, log out, and sign up as a Caregiver with `amira@example.com` and that code.
    Log back in as admin: Amira's details now say **App Account: Signed up**, and no duplicate was created.
11. **Security check.** Log in as the caregiver and open `/admin` in the address bar. You should be sent back to the caregiver dashboard.

### Caregiver day (stage 5)
12. **Book today.** As admin, add a visit for Margaret **today**, starting 30 minutes from now, 1 hour, Amira, tasks Personal care + Medication + Meal preparation. Add a second visit for George today with Amira that started 30 minutes ago.
13. **Amira's morning.** Log in as Amira. Home shows "Visits left today: 2" and the next visit. George's visit shows a red **Late** badge (also on the admin dashboard).
14. **Check in.** Open Margaret's visit. Check the address, "Open in maps", tap-to-call phone and the office's care instructions. Press **Check in**: the status becomes *In progress* and Home shows the yellow "checked in" banner.
    Try checking in to George's visit at the same time: you get "Please check out of your current visit first."
15. **Check out.** Tick Personal care and Medication only. Write: "Margaret was cheerful. Helped with a wash and dressing. Morning tablets taken 08:20. Did not want breakfast, said she wasn't hungry." Tick **Raise a concern**. Press check out: you are warned Meal preparation isn't ticked; press **Check out anyway**.
    The visit is *Completed* with check-in/out times; Meal preparation shows "(not done)".
16. **No access.** Open George's visit, choose **Couldn't get in / patient refused care**, pick "No answer at the door", add details and press **Report to office**. It becomes *Missed*.
17. **Office follow-up.** Log in as admin. **Dashboard → Concerns from caregivers** shows both notes. Open Margaret's visit: actual times, ticked tasks and the care note are there. Click **Mark resolved** on the concerns.
    On **Patients → Margaret → details**, the care record lists the note. In **Billing**, Margaret's visit is now billable; George's missed visit is not.
18. **Care record continuity.** Book Tom for Margaret tomorrow. Log in as Tom: **My patients → Margaret** shows Amira's note from today. Tom can't see Margaret's hourly rate anywhere.
19. **Profile sync.** As Amira, change your phone number in **Profile**. As admin, Amira's caregiver record shows the new number.

### Patient and family (stage 6)
20. **Margaret's daughter logs in.** Sign up as a Patient with Margaret's email and the agency code (the record links, no duplicate). Home shows the next visit and "Amira K.", plus the amount to pay from step 9.
21. **Profile.** Add emergency contact "Sarah Ellis (Daughter) 07700 900123" and GP "Highgate Group Practice". Log in as Amira: the visit page shows them with tap-to-call.
22. **Visit history.** **My visits → Past**: open the visit from step 15. You see arrival/leaving times, the tasks done and Amira's note, but not the concern flag, and not George's "No access" note.
23. **Care plan.** Shows "Comprehensive", £28.50/hour, and "Monday-Friday 08:00, 1 hour, Personal care, Medication" as the regular pattern.
24. **Requests.** Request a **Cancel a visit** for tomorrow's visit ("hospital appointment"): the 24-hour warning appears. Then request **Book an extra visit** next Saturday 10:00. Both show "Waiting for the office".
25. **Office answers.** As admin: the dashboard shows "2 requests waiting". On **Requests**, click **Edit the visit** on the cancellation, set status Cancelled, save, then **Approve** with "Done, get well soon". For the extra visit, click **Book the visit** (patient, date and time are pre-filled), save, then **Approve**.
    Try **Decline** with an empty reply: you're asked for a reason.
26. **Patient sees replies.** As Margaret's daughter: both requests are under "Answered" with the office's reply, and the cancelled visit shows as *Cancelled* in **My visits**.
27. **Feedback.** Send a **Compliment** about Amira and a **Complaint** ("Carer arrived 40 minutes late on Tuesday"). As admin, **Requests → Feedback**: the complaint can't be closed without a reply; reply and close. The patient sees the reply.
28. **Invoices.** **Invoices** lists Margaret's sent invoice; open it and print. Drafts never appear. Bank details and the reference are shown.
29. **Privacy check.** As the patient, nothing shows Amira's phone number or Margaret's hourly-rate history beyond her own invoices.

### Messages and notifications (stage 7)
Use two browsers (or one normal + one private window) so you can watch things arrive live.
30. **Visit alerts.** Admin in window A, Amira in window B. As admin, add a visit for Amira tomorrow. Within a second Amira gets a pop-up "New visit added to your schedule" and the bell shows 1. Move it to 15:00: "Visit time changed (was ...)". Cancel it: "Visit cancelled. You don't need to go."
31. **Grouping.** As admin, add a repeating visit for Amira every weekday for 4 weeks. Amira gets **one** notification "New visit added to your schedule ×10" (only the next 14 days count), not twenty.
32. **Patient alerts.** Change the carer on one of Margaret's visits from Amira to Tom. Margaret's daughter gets "Your carer has changed: Tue 18/11 08:00: Tom P.".
33. **Messages.** As Amira, open **Messages** and write "Running 10 minutes late for Margaret, traffic on the A1." The admin's Messages badge shows 1 and a pop-up appears. The admin opens it from **Messages**: Amira's message now shows "Seen". Reply "Thanks, I'll let her know." Amira sees it live.
34. **Office starts a conversation.** As admin, **Messages → +** and choose Margaret's daughter (patient). Send "Reminder: Amira will come at 10:00 on Friday." Patients without an app login are not in the list.
35. **Requests and feedback alerts.** As the patient, send a request and a complaint: every admin gets a notification. Answer them: the patient is notified. Send a **compliment about Amira**: Amira gets "You received a compliment".
36. **Concern loop.** As Amira, check out of a visit with **Raise a concern**: admins are notified. The admin clicks **Mark resolved**: Amira gets "The office has dealt with your concern".
37. **Money alerts.** As admin, mark a draft invoice as **sent**: the patient gets "New invoice INV-2026-0001 · £... due by ...". Record a payment: "Payment received".
38. **Sign-up alert.** Sign up a new caregiver with the agency code: admins get "... joined as a caregiver".
39. **Housekeeping.** On any **Notifications** page: click an item (it opens the right page and is marked read), **Mark all as read**, then **Clear read**.

---

## 9. Deployment

### A. Supabase (backend)
1. Run every file in `supabase/migrations/` in order (see section 6).
2. **Authentication → URL Configuration**
   - **Site URL:** your live address, for example `https://carenest.vercel.app`
   - **Redirect URLs:** add `https://carenest.vercel.app/**` (and keep `http://localhost:8080/**` for local development)
3. **Authentication → Sign In / Providers → Email:** keep **Confirm email** ON for production.
4. **Emails:** Supabase's built-in email sender only allows a few emails per hour. Before going live, set up your own SMTP provider (for example Resend, SendGrid or Brevo) in **Authentication → Emails → SMTP Settings**.

### A2. Go-live checklist (before real patients)
- [ ] Your own email provider (SMTP) set up, then **Confirm email turned back ON**
- [ ] Supabase **paid plan** with backups (free projects pause after a week without use), UK/EU region
- [ ] Every admin has **two-step verification** turned on
- [ ] Privacy policy and terms checked and filled in with your agency's details (`src/pages/LegalPages.tsx`)
- [ ] Registered with the **ICO** and a data protection impact assessment (DPIA) done for health data
- [ ] Test data removed (the smoke test prints the SQL)
- [ ] Run `npm test` and `npm run test:smoke` after every change

### B. Vercel (website)
1. Push the project to GitHub.
2. On [vercel.com](https://vercel.com), choose **Add New → Project** and import the repository.
3. Vercel detects Vite automatically: build command `npm run build`, output folder `dist`.
4. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Click **Deploy**.
6. **Page refresh fix:** this is a single-page app, so the project root has a `vercel.json` (already included) that stops refreshing on `/admin/patients` from returning a 404:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
7. Put the Vercel address into Supabase's Site URL and Redirect URLs (step A2).

### C. Before real patient data
- Health data is sensitive. In the UK, check UK GDPR / Data Protection Act requirements and your Supabase region (choose an EU/UK region).
- Turn on Supabase backups (paid plans) and consider Supabase's compliance options.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails with `ERESOLVE` | The `.npmrc` file (`legacy-peer-deps=true`) must be in the project root |
| App says "Missing VITE_SUPABASE_URL" | Create `.env.local` (section 3) and restart `npm run dev` |
| "Could not find the function agency_code_exists" | `001_auth.sql` has not been run in Supabase |
| "relation public.patients does not exist" | `002_patients_caregivers_visits.sql` has not been run |
| Caregiver pages say "Could not find the function public.my_patients" or `care_notes` does not exist | `005_caregiver_visits.sql` has not been run |
| Patient pages say "Could not find the function public.my_caregivers" or `care_requests` does not exist | `006_patient_side.sql` has not been run |
| Messages / Notifications say `office_threads`, `messages` or `notifications` does not exist | `007_messages_notifications.sql` has not been run |
| "Download my data" gives an error | `008_security.sql` has not been run |
| "Switch or join agency" shows an error / `my_agencies` does not exist | `009_multi_agency.sql` has not been run |
| "Could not search agencies" at sign-up | `010_agency_directory.sql` has not been run |
| "Two-step verification is switched off for this project" | Supabase → Authentication → Multi-Factor → enable TOTP |
| Admin pages show no data after turning on 2FA | Sign out and in again and enter the 6-digit code (the database only gives admins data after the second step) |
| Notifications only appear after a refresh | Realtime isn't reaching the browser. In Supabase → **Database → Publications → supabase_realtime**, check `messages` and `notifications` are ticked (007 does this). Counts still refresh every minute |
| Caregiver sees "Your account is not linked to a caregiver record" | The admin deleted their caregiver record. Re-add it with the **same email**; it links automatically (after 005) |
| Signup says "Database error saving new user" | Usually a wrong agency code or a migration that wasn't run |
| "email rate limit exceeded" | Supabase's built-in email sender allows only a few emails per hour. For testing, turn off **Confirm email**; for production, set up your own SMTP (section 9 A4) |
| Confirmation email never arrives | Built-in email limit reached. Wait an hour, turn off "Confirm email" for testing, or set up SMTP |
| Email link opens the wrong site | Fix Site URL / Redirect URLs in Supabase (section 9 A2) |
| Logged in but every page redirects to login | The user has no row in `profiles`; they signed up before `001_auth.sql` was run. Delete the user in Supabase → Authentication and sign up again |

---

## 11. What a real agency would add before going live

CareNest now covers the full day-to-day loop (rota → visits → care notes → billing → requests → messages). These are the things a real UK provider would normally still need, and why they were left out of this project:

| Feature | Why it matters | What it needs |
|---|---|---|
| Email / SMS / push alerts | People don't keep the app open; carers need rota changes on their phone | An email provider (Resend, SendGrid) or SMS (Twilio) called from a Supabase Edge Function on new notifications |
| GPS check-in (electronic visit verification) | Proves the carer was at the address; many councils require it | Browser location on check-in, compared with the patient's postcode |
| Medication records (eMAR) | Medication errors are a major CQC risk | A medication list per patient and a "given / refused / not given" record per dose |
| More office logins | An agency usually has several office staff; today each agency has one admin login | Admin invites colleagues by email (invitation link), plus remove access when someone leaves |
| Staff compliance | DBS checks, right-to-work and training must be kept up to date (CQC Regulation 19) | Document storage (Supabase Storage), expiry dates and reminders |
| Payroll / timesheets | Carers are paid for hours and mileage | Export of check-in/out hours and travel per carer |
| Two-carer (double-up) visits | Hoists and some patients need two carers | More than one caregiver per visit |
| Data retention | UK GDPR: don't keep data longer than needed | A scheduled job (pg_cron) to clear old read notifications and archive records |

