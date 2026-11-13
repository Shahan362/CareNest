import { useMemo } from 'react';
import { addWeeks, endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import type { Caregiver, Patient, PatientForDialog } from '@/types/admin';
import type { CaregiverRow, PatientRow, VisitRow } from '@/lib/database.types';
import {
  useCaregiverRows,
  usePatientRows,
  useUpcomingVisits,
  useVisitRows,
} from '@/hooks/data/useAgencyData';
import { ageFromDob, capitalize, formatGBP, formatVisitWhen, fullName, hoursBetween, initials } from '@/lib/format';

// Turns database rows into the shapes the admin screens display.

type UpcomingVisit = Pick<VisitRow, 'patient_id' | 'start_time'>;

function nextVisitByPatient(upcoming: UpcomingVisit[]) {
  const map = new Map<string, string>();
  // Visits are sorted by start time, so the first one per patient is the next one.
  for (const v of upcoming) if (!map.has(v.patient_id)) map.set(v.patient_id, v.start_time);
  return map;
}

export function toPatientView(
  p: PatientRow,
  caregiversById: Map<string, CaregiverRow>,
  nextVisit: Map<string, string>,
): PatientForDialog {
  const cg = p.primary_caregiver_id ? caregiversById.get(p.primary_caregiver_id) : undefined;
  return {
    id: p.id,
    name: fullName(p),
    age: ageFromDob(p.date_of_birth),
    carePlan: capitalize(p.care_plan),
    status: capitalize(p.status),
    caregiver: cg ? fullName(cg) : 'Not assigned',
    nextVisit: formatVisitWhen(nextVisit.get(p.id)),
    phone: p.phone ?? undefined,
    email: p.email ?? undefined,
    address: p.address ?? undefined,
    postcode: p.postcode ?? undefined,
    hourlyRate: `${formatGBP(p.hourly_rate)} / hour`,
    hasAccount: !!p.user_id,
    notes: p.notes ?? undefined,
    emergencyContact: p.emergency_contact_name
      ? [p.emergency_contact_name, p.emergency_contact_relation && `(${p.emergency_contact_relation})`, p.emergency_contact_phone]
          .filter(Boolean)
          .join(' ')
      : undefined,
    gpPractice: p.gp_practice ?? undefined,
  };
}

/** A visit with the names it needs for display. */
export interface VisitView {
  row: VisitRow;
  start: Date;
  end: Date;
  minutes: number;
  patientName: string;
  caregiverName: string | null;
}

/** Visits in [from, to) joined with patient and caregiver names. */
export function useAdminVisits(from: string, to: string) {
  const visits = useVisitRows(from, to);
  const patients = usePatientRows();
  const caregivers = useCaregiverRows();

  const views = useMemo<VisitView[]>(() => {
    const pById = new Map((patients.data ?? []).map((p) => [p.id, p]));
    const cById = new Map((caregivers.data ?? []).map((c) => [c.id, c]));
    return (visits.data ?? []).map((v) => {
      const start = parseISO(v.start_time);
      const end = parseISO(v.end_time);
      const cg = v.caregiver_id ? cById.get(v.caregiver_id) : undefined;
      return {
        row: v,
        start,
        end,
        minutes: Math.round((end.getTime() - start.getTime()) / 60000),
        patientName: fullName(pById.get(v.patient_id)) || 'Unknown patient',
        caregiverName: cg ? fullName(cg) : null,
      };
    });
  }, [visits.data, patients.data, caregivers.data]);

  return {
    visits: views,
    patients: patients.data ?? [],
    caregivers: caregivers.data ?? [],
    isLoading: visits.isLoading || patients.isLoading || caregivers.isLoading,
    error: visits.error || patients.error || caregivers.error,
    refetch: () => {
      visits.refetch();
      patients.refetch();
      caregivers.refetch();
    },
  };
}

/** Patients page data. */
export function useAdminPatients() {
  const patients = usePatientRows();
  const caregivers = useCaregiverRows();
  const upcoming = useUpcomingVisits();

  const views = useMemo(() => {
    const cgById = new Map((caregivers.data ?? []).map((c) => [c.id, c]));
    const next = nextVisitByPatient(upcoming.data ?? []);
    return (patients.data ?? []).map((p) => ({ row: p, view: toPatientView(p, cgById, next) }));
  }, [patients.data, caregivers.data, upcoming.data]);

  return {
    patients: views,
    isLoading: patients.isLoading || caregivers.isLoading,
    error: patients.error || caregivers.error || upcoming.error,
  };
}

/**
 * Caregivers page data. Workload numbers come from visits:
 * this week's hours, plus per-day totals for a window of weeks (used by the heatmap).
 */
export function useAdminCaregivers() {
  const caregivers = useCaregiverRows();
  const patients = usePatientRows();
  const upcoming = useUpcomingVisits();

  // Load visits from 4 weeks back to 8 weeks ahead so the heatmap can page through weeks.
  const range = useMemo(() => {
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    return { from: addWeeks(thisWeek, -4).toISOString(), to: addWeeks(thisWeek, 9).toISOString() };
  }, []);
  const visits = useVisitRows(range.from, range.to);

  const views = useMemo<{ row: CaregiverRow; view: Caregiver }[]>(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const patientById = new Map((patients.data ?? []).map((p) => [p.id, p]));
    const next = nextVisitByPatient(upcoming.data ?? []);
    const activeVisits = (visits.data ?? []).filter((v) => v.status !== 'cancelled');

    return (caregivers.data ?? []).map((cg) => {
      const mine = activeVisits.filter((v) => v.caregiver_id === cg.id);

      // Per-day totals for the heatmap.
      const daily: Caregiver['weeklyUtilization'] = {};
      const dailyPatients: Record<string, Set<string>> = {};
      for (const v of mine) {
        const key = format(parseISO(v.start_time), 'yyyy-MM-dd');
        daily[key] ??= { hours: 0, visits: 0, patients: 0 };
        dailyPatients[key] ??= new Set();
        daily[key].hours = Math.round((daily[key].hours + hoursBetween(v.start_time, v.end_time)) * 10) / 10;
        daily[key].visits += 1;
        dailyPatients[key].add(v.patient_id);
        daily[key].patients = dailyPatients[key].size;
      }

      const thisWeek = mine.filter((v) => {
        const d = parseISO(v.start_time);
        return d >= weekStart && d <= weekEnd;
      });
      const assignedHours = Math.round(thisWeek.reduce((t, v) => t + hoursBetween(v.start_time, v.end_time), 0) * 10) / 10;

      // Patients: those with this caregiver as primary, plus anyone they visit in the loaded window.
      const patientIds = new Set<string>();
      (patients.data ?? []).forEach((p) => p.primary_caregiver_id === cg.id && patientIds.add(p.id));
      mine.forEach((v) => patientIds.add(v.patient_id));
      const patientsList: Patient[] = [...patientIds]
        .map((id) => patientById.get(id))
        .filter((p): p is PatientRow => !!p)
        .map((p) => ({
          id: p.id,
          name: fullName(p),
          age: ageFromDob(p.date_of_birth),
          carePlan: capitalize(p.care_plan),
          status: capitalize(p.status),
          nextVisit: formatVisitWhen(next.get(p.id)),
          contactInfo: p.phone ?? '',
        }));

      const view: Caregiver = {
        id: cg.id,
        name: fullName(cg),
        specialty: cg.specialty || 'General care',
        status: capitalize(cg.status),
        availability: capitalize(cg.availability),
        region: cg.region || 'Not set',
        assignedHours,
        maxHours: cg.status === 'active' ? Number(cg.max_hours_per_week) : 0,
        visits: thisWeek.length,
        photo: initials(cg),
        email: cg.email ?? '',
        phone: cg.phone ?? '',
        hasAccount: !!cg.user_id,
        patientsList,
        patients: patientsList.length,
        weeklyUtilization: daily,
      };
      return { row: cg, view };
    });
  }, [caregivers.data, patients.data, upcoming.data, visits.data]);

  const regions = useMemo(
    () => Array.from(new Set(views.map((c) => c.view.region))).sort(),
    [views],
  );

  return {
    caregivers: views,
    regions,
    isLoading: caregivers.isLoading || patients.isLoading || visits.isLoading,
    error: caregivers.error || patients.error || visits.error,
    refetch: () => {
      caregivers.refetch();
      patients.refetch();
      visits.refetch();
      upcoming.refetch();
    },
  };
}
