import { addDays, addWeeks, format, isWeekend, parseISO } from 'date-fns';
import type { VisitRow, VisitStatus } from '@/lib/database.types';

// Shared rules and labels for visits, used by the scheduler, calendar and dashboard.

export const CARE_TASKS = [
  'Personal care',
  'Medication',
  'Meal preparation',
  'Mobility support',
  'Wound care',
  'Vital signs check',
  'Continence care',
  'Companionship',
  'Domestic help',
  'Shopping / errands',
] as const;

export const DURATIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 45, label: '45 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1.5 hours' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
];

export const STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Missed',
};

export const STATUS_STYLE: Record<VisitStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200 line-through',
  missed: 'bg-red-100 text-red-800 border-red-200',
};

/** Visits that still take up a caregiver's time. */
export const isActiveVisit = (v: Pick<VisitRow, 'status'>) => v.status !== 'cancelled';

export const durationMinutes = (v: Pick<VisitRow, 'start_time' | 'end_time'>) =>
  Math.round((parseISO(v.end_time).getTime() - parseISO(v.start_time).getTime()) / 60000);

export const durationLabel = (minutes: number) => {
  const preset = DURATIONS.find((d) => d.minutes === minutes);
  if (preset) return preset.label;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h}h`, m && `${m}min`].filter(Boolean).join(' ');
};

/** Combine a local date ("2026-11-09") and time ("09:30") into a Date. */
export const combineDateTime = (date: string, time: string) => new Date(`${date}T${time}:00`);

export const toDateInput = (d: Date | string) => format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd');
export const toTimeInput = (d: Date | string) => format(typeof d === 'string' ? parseISO(d) : d, 'HH:mm');

/** True when two time ranges overlap. */
const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

/** The caregiver's existing visits that clash with [start, end). */
export function findConflicts(
  visits: VisitRow[],
  caregiverId: string,
  start: Date,
  end: Date,
  ignoreVisitId?: string,
) {
  return visits.filter(
    (v) =>
      v.caregiver_id === caregiverId &&
      v.id !== ignoreVisitId &&
      isActiveVisit(v) &&
      overlaps(start, end, parseISO(v.start_time), parseISO(v.end_time)),
  );
}

export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly';

export const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon-Fri)' },
  { value: 'weekly', label: 'Every week on the same day' },
];

/** Start times for a repeating visit, covering `weeks` weeks from the first visit. */
export function repeatStarts(first: Date, rule: RepeatRule, weeks: number): Date[] {
  if (rule === 'none') return [first];
  if (rule === 'weekly') return Array.from({ length: weeks }, (_, i) => addWeeks(first, i));
  const out: Date[] = [];
  const days = weeks * 7;
  for (let i = 0; i < days; i++) {
    const d = addDays(first, i);
    if (rule === 'weekdays' && isWeekend(d)) continue;
    out.push(d);
  }
  return out;
}
