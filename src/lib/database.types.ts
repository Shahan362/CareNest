// Row shapes of the Supabase tables (see supabase/migrations).

export type CarePlan = 'basic' | 'comprehensive' | 'advanced';
export type RecordStatus = 'active' | 'inactive';
export type Availability = 'full-time' | 'part-time' | 'contract';
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'missed';

export interface CaregiverRow {
  id: string;
  agency_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  region: string | null;
  availability: Availability;
  max_hours_per_week: number;
  start_date: string | null;
  status: RecordStatus;
  created_at: string;
}

export interface PatientRow {
  id: string;
  agency_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  care_plan: CarePlan;
  primary_caregiver_id: string | null;
  hourly_rate: number;
  status: RecordStatus;
  notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  gp_practice: string | null;
  created_at: string;
}

export interface VisitRow {
  id: string;
  agency_id: string;
  patient_id: string;
  caregiver_id: string | null;
  start_time: string;
  end_time: string;
  status: VisitStatus;
  tasks: string[];
  notes: string | null;
  /** Set by the caregiver's check-in / check-out (005_caregiver_visits.sql). */
  checked_in_at: string | null;
  checked_out_at: string | null;
  tasks_done: string[];
  created_at: string;
}

/** A care record entry written by a caregiver (or the office). */
export interface CareNoteRow {
  id: string;
  agency_id: string;
  patient_id: string;
  visit_id: string | null;
  author_id: string | null;
  author_name: string;
  body: string;
  is_concern: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

/** Patient details a caregiver may see (from the my_patients() function: no rates or billing email). */
export interface MyPatientRow {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  care_plan: CarePlan;
  notes: string | null;
  status: RecordStatus;
  is_primary: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  gp_practice: string | null;
}

/** Fields the admin can edit (everything except ids and timestamps). */
export type CaregiverInput = Omit<CaregiverRow, 'id' | 'agency_id' | 'user_id' | 'created_at'>;
export type PatientInput = Omit<PatientRow, 'id' | 'agency_id' | 'user_id' | 'created_at'>;
export type VisitInput = Omit<VisitRow, 'id' | 'agency_id' | 'created_at' | 'checked_in_at' | 'checked_out_at' | 'tasks_done'>;

// ---------- Billing ----------

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export type PaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'cheque' | 'direct_debit' | 'other';

export interface InvoiceRow {
  id: string;
  agency_id: string;
  patient_id: string;
  number: string;
  period_start: string | null;
  period_end: string | null;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  notes: string | null;
  created_at: string;
}

/** Row from the invoice_summaries view: invoice plus calculated totals. */
export interface InvoiceSummary extends InvoiceRow {
  total: number;
  paid: number;
  balance: number;
  line_count: number;
}

export interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  visit_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

export interface PaymentRow {
  id: string;
  agency_id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface AgencyRow {
  id: string;
  name: string;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  code: string;
  cqc_provider_id: string | null;
  default_payment_terms: number;
  default_hourly_rate: number;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  invoice_footer: string | null;
  created_at: string;
}

/** Agency fields an admin can edit in Settings. */
export type AgencyInput = Omit<AgencyRow, 'id' | 'code' | 'created_at'>;

// ---------- Patient side (006_patient_side.sql) ----------

export type RequestType = 'change_time' | 'cancel_visit' | 'extra_visit' | 'change_caregiver' | 'change_care' | 'other';
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export interface CareRequestRow {
  id: string;
  agency_id: string;
  patient_id: string;
  visit_id: string | null;
  type: RequestType;
  details: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: RequestStatus;
  admin_response: string | null;
  responded_at: string | null;
  responded_by: string | null;
  created_by: string | null;
  created_at: string;
}

export type FeedbackKind = 'compliment' | 'suggestion' | 'complaint';

export interface FeedbackRow {
  id: string;
  agency_id: string;
  patient_id: string;
  caregiver_id: string | null;
  kind: FeedbackKind;
  message: string;
  status: 'open' | 'resolved';
  admin_response: string | null;
  responded_at: string | null;
  responded_by: string | null;
  created_at: string;
}

/** A carer as a patient sees them (from my_caregivers(): names only). */
export interface MyCaregiverRow {
  id: string;
  first_name: string;
  last_name: string;
  is_primary: boolean;
}

// ---------- Messages and notifications (007_messages_notifications.sql) ----------

export interface MessageRow {
  id: string;
  agency_id: string;
  /** The caregiver / patient whose conversation with the office this is. */
  thread_user_id: string;
  sender_id: string | null;
  sender_name: string;
  from_office: boolean;
  body: string;
  read_at: string | null;
  created_at: string;
}

/** One conversation in the office inbox (from office_threads()). */
export interface OfficeThread {
  thread_user_id: string;
  name: string;
  role: 'caregiver' | 'patient' | null;
  last_body: string;
  last_at: string;
  last_from_office: boolean;
  unread: number;
}

export interface NotificationRow {
  id: string;
  agency_id: string | null;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  group_count: number;
  read_at: string | null;
  created_at: string;
}
