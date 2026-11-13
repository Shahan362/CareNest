import { describe, expect, it, vi, afterEach } from 'vitest';
import { findConflicts, repeatStarts, durationLabel, durationMinutes } from './visits';
import { displayStatus, roundMoney, visitHours } from './billing';
import { checkInState, isLate, workedMinutes, hoursLabel, mapsUrl } from './caregiver';
import { carerName } from './requests';
import { formatGBP, formatDate, ageFromDob } from './format';
import type { VisitRow } from './database.types';

// Unit tests for the business rules the screens rely on. Run with: npm test

const visit = (over: Partial<VisitRow>): VisitRow => ({
  id: 'v1', agency_id: 'a', patient_id: 'p', caregiver_id: 'c1',
  start_time: '2026-11-16T09:00:00.000Z', end_time: '2026-11-16T10:00:00.000Z',
  status: 'scheduled', tasks: [], notes: null, checked_in_at: null, checked_out_at: null, tasks_done: [],
  created_at: '2026-11-01T00:00:00.000Z', ...over,
});

afterEach(() => vi.useRealTimers());

describe('visits: repeats', () => {
  const monday = new Date('2026-11-16T09:00:00');

  it('weekdays for 2 weeks gives 10 visits and skips weekends', () => {
    const starts = repeatStarts(monday, 'weekdays', 2);
    expect(starts).toHaveLength(10);
    expect(starts.every((d) => d.getDay() !== 0 && d.getDay() !== 6)).toBe(true);
  });

  it('daily and weekly', () => {
    expect(repeatStarts(monday, 'daily', 1)).toHaveLength(7);
    expect(repeatStarts(monday, 'weekly', 4).map((d) => d.getDate())).toEqual([16, 23, 30, 7]);
    expect(repeatStarts(monday, 'none', 4)).toHaveLength(1);
  });
});

describe('visits: clashes', () => {
  const existing = [visit({ id: 'a' }), visit({ id: 'b', status: 'cancelled', start_time: '2026-11-16T11:00:00.000Z', end_time: '2026-11-16T12:00:00.000Z' })];

  it('finds an overlapping visit for the same caregiver', () => {
    const c = findConflicts(existing, 'c1', new Date('2026-11-16T09:30:00.000Z'), new Date('2026-11-16T10:30:00.000Z'));
    expect(c.map((v) => v.id)).toEqual(['a']);
  });

  it('back-to-back visits do not clash', () => {
    expect(findConflicts(existing, 'c1', new Date('2026-11-16T10:00:00.000Z'), new Date('2026-11-16T11:00:00.000Z'))).toHaveLength(0);
  });

  it('ignores cancelled visits, other caregivers and the visit being edited', () => {
    expect(findConflicts(existing, 'c1', new Date('2026-11-16T11:15:00.000Z'), new Date('2026-11-16T11:45:00.000Z'))).toHaveLength(0);
    expect(findConflicts(existing, 'c2', new Date('2026-11-16T09:30:00.000Z'), new Date('2026-11-16T10:30:00.000Z'))).toHaveLength(0);
    expect(findConflicts(existing, 'c1', new Date('2026-11-16T09:30:00.000Z'), new Date('2026-11-16T10:30:00.000Z'), 'a')).toHaveLength(0);
  });

  it('duration labels', () => {
    expect(durationMinutes(visit({}))).toBe(60);
    expect(durationLabel(60)).toBe('1 hour');
    expect(durationLabel(75)).toBe('1h 15min');
  });
});

describe('billing', () => {
  it('works out overdue, part paid and paid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00'));
    expect(displayStatus({ status: 'sent', due_date: '2026-11-19', paid: 0, balance: 50 })).toBe('overdue');
    expect(displayStatus({ status: 'sent', due_date: '2026-11-30', paid: 10, balance: 40 })).toBe('part_paid');
    expect(displayStatus({ status: 'sent', due_date: '2026-11-19', paid: 50, balance: 0 })).toBe('paid');
    expect(displayStatus({ status: 'draft', due_date: '2026-11-01', paid: 0, balance: 50 })).toBe('draft');
    expect(displayStatus({ status: 'void', due_date: '2026-11-01', paid: 0, balance: 50 })).toBe('void');
  });

  it('money and hours rounding', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(visitHours(45)).toBe(0.75);
    expect(visitHours(20)).toBe(0.33);
    expect(formatGBP(1234.5)).toBe('£1,234.50');
  });
});

describe('caregiver check-in rules (same as the database)', () => {
  const v = visit({ start_time: '2026-11-16T09:00:00.000Z', end_time: '2026-11-16T10:00:00.000Z' });

  it('opens 1 hour before the start and closes 4 hours after the end', () => {
    expect(checkInState(v, new Date('2026-11-16T07:59:00.000Z'))).toBe('too_early');
    expect(checkInState(v, new Date('2026-11-16T08:00:00.000Z'))).toBe('open');
    expect(checkInState(v, new Date('2026-11-16T14:00:00.000Z'))).toBe('open');
    expect(checkInState(v, new Date('2026-11-16T14:01:00.000Z'))).toBe('too_late');
    expect(checkInState({ ...v, status: 'completed' }, new Date('2026-11-16T09:00:00.000Z'))).toBe('not_scheduled');
  });

  it('a visit is late 15 minutes after its start without a check-in', () => {
    expect(isLate(v, new Date('2026-11-16T09:15:00.000Z'))).toBe(false);
    expect(isLate(v, new Date('2026-11-16T09:16:00.000Z'))).toBe(true);
    expect(isLate({ ...v, status: 'in_progress' }, new Date('2026-11-16T09:30:00.000Z'))).toBe(false);
  });

  it('hours worked use the real check-in/out times when present', () => {
    expect(workedMinutes(visit({ status: 'completed', checked_in_at: '2026-11-16T09:05:00.000Z', checked_out_at: '2026-11-16T09:55:00.000Z' }))).toBe(50);
    expect(workedMinutes(visit({ status: 'completed' }))).toBe(60);
    expect(workedMinutes(visit({ status: 'missed' }))).toBe(0);
    expect(hoursLabel(90)).toBe('1h 30m');
    expect(hoursLabel(45)).toBe('45 min');
  });

  it('maps link', () => {
    expect(mapsUrl('12 Rose Lane', 'N6 5AB')).toContain('12%20Rose%20Lane%2C%20N6%205AB');
    expect(mapsUrl(null, null)).toBeNull();
  });
});

describe('names and dates (UK)', () => {
  it('patients see carers as first name + initial', () => {
    expect(carerName({ first_name: 'Amira', last_name: 'Khan' })).toBe('Amira K.');
    expect(carerName(null)).toBe('Not assigned yet');
  });

  it('UK date format and age', () => {
    expect(formatDate('2026-03-02')).toBe('02/03/2026');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00'));
    expect(ageFromDob('1941-03-02')).toBe(85);
  });
});
