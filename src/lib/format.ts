import { differenceInYears, format, isToday, isTomorrow, isValid, parseISO } from 'date-fns';

// All money is in GBP and all dates use UK format (DD/MM/YYYY, 24-hour time).

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export const formatGBP = (amount: number | string | null | undefined) => gbp.format(Number(amount ?? 0));

const toDate = (value: Date | string) => (typeof value === 'string' ? parseISO(value) : value);

export const formatDate = (value: Date | string | null | undefined) => {
  if (!value) return '';
  const d = toDate(value);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '';
};

export const formatTime = (value: Date | string) => format(toDate(value), 'HH:mm');

export const formatDateTime = (value: Date | string) => format(toDate(value), 'dd/MM/yyyy HH:mm');

/** "Today, 09:00", "Tomorrow, 14:30" or "12/11/2026, 10:00". */
export const formatVisitWhen = (value: Date | string | null | undefined) => {
  if (!value) return 'None scheduled';
  const d = toDate(value);
  if (isToday(d)) return `Today, ${formatTime(d)}`;
  if (isTomorrow(d)) return `Tomorrow, ${formatTime(d)}`;
  return `${formatDate(d)}, ${formatTime(d)}`;
};

export const ageFromDob = (dob: string | null | undefined): number | null => {
  if (!dob) return null;
  const d = parseISO(dob);
  return isValid(d) ? differenceInYears(new Date(), d) : null;
};

export const capitalize = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** "full-time" -> "Full-time" */
export const labelFromSlug = capitalize;

export const fullName = (p: { first_name: string; last_name: string } | null | undefined) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : '';

export const initials = (p: { first_name: string; last_name: string }) =>
  `${p.first_name.charAt(0)}${p.last_name.charAt(0)}`.toUpperCase();

/** Duration in hours between two ISO timestamps. */
export const hoursBetween = (start: string, end: string) =>
  Math.max(0, (parseISO(end).getTime() - parseISO(start).getTime()) / 3_600_000);
