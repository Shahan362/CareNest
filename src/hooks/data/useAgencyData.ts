import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  CaregiverInput,
  CaregiverRow,
  PatientInput,
  PatientRow,
  VisitInput,
  VisitRow,
} from '@/lib/database.types';

// Data hooks for the admin side. Row Level Security in Supabase makes sure
// every query only returns rows from the signed-in admin's agency.

export const queryKeys = {
  caregivers: ['caregivers'] as const,
  patients: ['patients'] as const,
  visits: (from: string, to: string) => ['visits', from, to] as const,
  upcomingVisits: ['visits', 'upcoming'] as const,
};

/** Throws Supabase errors so React Query can surface them. */
function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

function friendlyError(message: string) {
  if (/caregivers_agency_email_idx|patients_agency_email_idx/.test(message)) {
    return 'Someone with this email already exists in your agency.';
  }
  return message;
}

function useAgencyId() {
  const { profile } = useAuth();
  return profile?.agency_id ?? null;
}

/** Empty strings from forms become null in the database. */
function clean<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === '' ? null : v])) as T;
}

// ---------- Caregivers ----------

export function useCaregiverRows() {
  return useQuery({
    queryKey: queryKeys.caregivers,
    queryFn: async () =>
      unwrap(await supabase.from('caregivers').select('*').order('first_name')) as CaregiverRow[],
  });
}

export function useSaveCaregiver() {
  const qc = useQueryClient();
  const agencyId = useAgencyId();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<CaregiverInput> }) => {
      const row = clean(input);
      if (id) return unwrap(await supabase.from('caregivers').update(row).eq('id', id).select().single());
      return unwrap(await supabase.from('caregivers').insert({ ...row, agency_id: agencyId }).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.caregivers }),
  });
}

export function useDeleteCaregiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('caregivers').delete().eq('id', id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.caregivers });
      qc.invalidateQueries({ queryKey: queryKeys.patients });
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });
}

// ---------- Patients ----------

export function usePatientRows() {
  return useQuery({
    queryKey: queryKeys.patients,
    queryFn: async () =>
      unwrap(await supabase.from('patients').select('*').order('first_name')) as PatientRow[],
  });
}

export function useSavePatient() {
  const qc = useQueryClient();
  const agencyId = useAgencyId();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<PatientInput> }) => {
      const row = clean(input);
      if (id) return unwrap(await supabase.from('patients').update(row).eq('id', id).select().single());
      return unwrap(await supabase.from('patients').insert({ ...row, agency_id: agencyId }).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.patients }),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('patients').delete().eq('id', id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients });
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });
}

// ---------- Visits ----------

/** Visits that start within [from, to). Both are ISO timestamps; nothing is fetched until both are set. */
export function useVisitRows(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.visits(from, to),
    enabled: !!from && !!to,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('visits')
          .select('*')
          .gte('start_time', from)
          .lt('start_time', to)
          .order('start_time'),
      ) as VisitRow[],
  });
}

/** Future visits that are still going to happen (for "next visit" columns). */
export function useUpcomingVisits() {
  return useQuery({
    queryKey: queryKeys.upcomingVisits,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('visits')
          .select('id, patient_id, caregiver_id, start_time')
          .gte('start_time', new Date().toISOString())
          .in('status', ['scheduled', 'in_progress'])
          .order('start_time')
          .limit(2000),
      ) as Pick<VisitRow, 'id' | 'patient_id' | 'caregiver_id' | 'start_time'>[],
  });
}

export function useSaveVisit() {
  const qc = useQueryClient();
  const agencyId = useAgencyId();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<VisitInput> }) => {
      const row = clean(input);
      if (id) return unwrap(await supabase.from('visits').update(row).eq('id', id).select().single());
      return unwrap(await supabase.from('visits').insert({ ...row, agency_id: agencyId }).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visits'] }),
  });
}

/** Scheduled visits with no caregiver, from the start of today onwards. */
export function useUnassignedVisits() {
  return useQuery({
    queryKey: ['visits', 'unassigned'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return unwrap(
        await supabase
          .from('visits')
          .select('*')
          .is('caregiver_id', null)
          .eq('status', 'scheduled')
          .gte('start_time', today.toISOString())
          .order('start_time')
          .limit(500),
      ) as VisitRow[];
    },
  });
}

/** Create one or more visits at once (used for repeating visits). */
export function useCreateVisits() {
  const qc = useQueryClient();
  const agencyId = useAgencyId();
  return useMutation({
    mutationFn: async (inputs: Partial<VisitInput>[]) =>
      unwrap(
        await supabase
          .from('visits')
          .insert(inputs.map((i) => ({ ...clean(i), agency_id: agencyId })))
          .select(),
      ) as VisitRow[],
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visits'] }),
  });
}

/** A caregiver's visits within [from, to), used for clash checks in the visit form. */
export function useCaregiverVisits(caregiverId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['visits', 'caregiver', caregiverId, from, to],
    enabled: !!caregiverId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('visits')
          .select('*')
          .eq('caregiver_id', caregiverId as string)
          .lt('start_time', to)
          .gt('end_time', from),
      ) as VisitRow[],
  });
}

export function useDeleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('visits').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visits'] }),
  });
}
