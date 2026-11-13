import type { FeedbackKind, RequestStatus, RequestType } from '@/lib/database.types';

// Labels and rules for patient requests and feedback (006_patient_side.sql).

export const REQUEST_TYPES: { value: RequestType; label: string; hint: string; needsVisit: boolean; wantsDate: boolean }[] = [
  { value: 'change_time', label: 'Change a visit time', hint: 'Move one visit to a different time or day.', needsVisit: true, wantsDate: true },
  { value: 'cancel_visit', label: 'Cancel a visit', hint: 'e.g. a hospital appointment or family visiting.', needsVisit: true, wantsDate: false },
  { value: 'extra_visit', label: 'Book an extra visit', hint: 'A one-off visit on top of your usual care.', needsVisit: false, wantsDate: true },
  { value: 'change_caregiver', label: 'Change my carer', hint: 'Ask for a different or regular carer.', needsVisit: false, wantsDate: false },
  { value: 'change_care', label: 'Change my care', hint: 'More or less help, different tasks or visit times every week.', needsVisit: false, wantsDate: false },
  { value: 'other', label: 'Something else', hint: 'Anything else you need from the office.', needsVisit: false, wantsDate: false },
];

export const REQUEST_TYPE_LABEL = Object.fromEntries(REQUEST_TYPES.map((t) => [t.value, t.label])) as Record<RequestType, string>;

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Waiting for the office',
  approved: 'Approved',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

export const REQUEST_STATUS_STYLE: Record<RequestStatus, string> = {
  pending: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  declined: 'bg-red-100 text-red-800 border-red-200',
  withdrawn: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const FEEDBACK_KINDS: { value: FeedbackKind; label: string; hint: string }[] = [
  { value: 'compliment', label: 'Compliment', hint: 'Tell us what went well. We pass compliments on to the carer.' },
  { value: 'suggestion', label: 'Suggestion', hint: 'An idea to make your care better.' },
  { value: 'complaint', label: 'Complaint', hint: 'Something went wrong. The office will look into it and reply.' },
];

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  compliment: 'Compliment',
  suggestion: 'Suggestion',
  complaint: 'Complaint',
};

export const FEEDBACK_KIND_STYLE: Record<FeedbackKind, string> = {
  compliment: 'bg-green-100 text-green-800 border-green-200',
  suggestion: 'bg-blue-100 text-blue-800 border-blue-200',
  complaint: 'bg-amber-100 text-amber-900 border-amber-200',
};

/** "Amira K." — how carers are named to patients. */
export const carerName = (c: { first_name: string; last_name: string } | null | undefined) =>
  c ? `${c.first_name} ${c.last_name ? `${c.last_name.charAt(0)}.` : ''}`.trim() : 'Not assigned yet';
