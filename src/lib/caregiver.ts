import { parseISO } from 'date-fns';
import type { VisitRow } from '@/lib/database.types';

// Rules for the caregiver's visit buttons. They mirror the checks in the database
// functions (005_caregiver_visits.sql) so buttons only show when the action will work.

const MIN = 60_000;
export const CHECK_IN_EARLY_MINUTES = 60;
export const CHECK_IN_LATE_HOURS = 4;
/** A visit counts as "late" once it is this many minutes past its start without a check-in. */
export const LATE_AFTER_MINUTES = 15;

type V = Pick<VisitRow, 'status' | 'start_time' | 'end_time'>;

export function checkInState(v: V, now = new Date()): 'too_early' | 'open' | 'too_late' | 'not_scheduled' {
  if (v.status !== 'scheduled') return 'not_scheduled';
  const start = parseISO(v.start_time).getTime();
  const end = parseISO(v.end_time).getTime();
  if (now.getTime() < start - CHECK_IN_EARLY_MINUTES * MIN) return 'too_early';
  if (now.getTime() > end + CHECK_IN_LATE_HOURS * 60 * MIN) return 'too_late';
  return 'open';
}

/** Scheduled, past its start time by more than LATE_AFTER_MINUTES, and nobody checked in. */
export const isLate = (v: V, now = new Date()) =>
  v.status === 'scheduled' && now.getTime() > parseISO(v.start_time).getTime() + LATE_AFTER_MINUTES * MIN;

/** Minutes between two timestamps (for "worked 52 min"). */
export const minutesBetween = (from: string, to: string) =>
  Math.max(0, Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / MIN));

/** Opens the address in the phone's maps app. */
export const mapsUrl = (address: string | null, postcode: string | null) => {
  const q = [address, postcode].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
};

/** Hours actually worked on a visit: check-in to check-out, else the planned length for completed visits. */
export function workedMinutes(v: Pick<VisitRow, 'status' | 'start_time' | 'end_time' | 'checked_in_at' | 'checked_out_at'>) {
  if (v.status !== 'completed') return 0;
  if (v.checked_in_at && v.checked_out_at) return minutesBetween(v.checked_in_at, v.checked_out_at);
  return minutesBetween(v.start_time, v.end_time);
}

export const hoursLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
};
