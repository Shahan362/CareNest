import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CareNoteRow, CaregiverRow, MyPatientRow, VisitRow } from '@/lib/database.types';
import { fullName } from '@/lib/format';

// Data hooks for the caregiver side. Row Level Security limits every query to the
// signed-in caregiver's own visits and the patients they look after. Visit changes
// go through database functions (check_in_visit, check_out_visit, report_no_access)
// so a caregiver can't edit times, patients or other people's visits.

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const EMPTY: never[] = [];

/** The caregiver record linked to the signed-in user (null if the admin removed it). */
export function useMyCaregiver() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['me', 'caregiver', user?.id],
    enabled: !!user,
    queryFn: async () =>
      unwrap(await supabase.from('caregivers').select('*').eq('user_id', user!.id).maybeSingle()) as CaregiverRow | null,
  });
}

/** Patients this caregiver looks after (safe columns only). */
export function useMyPatients() {
  return useQuery({
    queryKey: ['me', 'patients'],
    queryFn: async () => unwrap(await supabase.rpc('my_patients')) as MyPatientRow[],
  });
}

/** The caregiver's visits starting within [from, to). */
export function useMyVisitRows(from: string, to: string) {
  const { data: me } = useMyCaregiver();
  return useQuery({
    queryKey: ['visits', 'mine', me?.id, from, to],
    enabled: !!me,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('visits')
          .select('*')
          .eq('caregiver_id', me!.id)
          .gte('start_time', from)
          .lt('start_time', to)
          .order('start_time'),
      ) as VisitRow[],
  });
}

/** The visit the caregiver is currently checked in to, if any. */
export function useCurrentVisit() {
  const { data: me } = useMyCaregiver();
  return useQuery({
    queryKey: ['visits', 'mine', me?.id, 'current'],
    enabled: !!me,
    queryFn: async () =>
      unwrap(
        await supabase.from('visits').select('*').eq('caregiver_id', me!.id).eq('status', 'in_progress').maybeSingle(),
      ) as VisitRow | null,
  });
}

export function useMyVisit(id: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'one', id],
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from('visits').select('*').eq('id', id!).maybeSingle()) as VisitRow | null,
  });
}

/** A visit with its patient's details attached. */
export interface MyVisit {
  row: VisitRow;
  start: Date;
  end: Date;
  patient: MyPatientRow | null;
  patientName: string;
}

/** Joins visits with patient details from my_patients(). */
export function useMyVisits(from: string, to: string) {
  const me = useMyCaregiver();
  const visits = useMyVisitRows(from, to);
  const patients = useMyPatients();
  const rows = visits.data ?? EMPTY;
  const patientRows = patients.data ?? EMPTY;

  const data = useMemo<MyVisit[]>(() => {
    const byId = new Map(patientRows.map((p) => [p.id, p]));
    return rows.map((row) => {
      const patient = byId.get(row.patient_id) ?? null;
      return {
        row,
        start: parseISO(row.start_time),
        end: parseISO(row.end_time),
        patient,
        patientName: patient ? fullName(patient) : 'Patient',
      };
    });
  }, [rows, patientRows]);

  return {
    data,
    patients: patientRows,
    isLoading: me.isLoading || visits.isLoading || patients.isLoading,
    error: me.error ?? visits.error ?? patients.error,
    /** True when the login has no caregiver record, or the agency marked it inactive. */
    notLinked: me.data === null || me.data?.status === 'inactive',
    refetch: () => {
      visits.refetch();
      patients.refetch();
    },
  };
}

/** Care notes, newest first, for one patient or one visit. */
export function useCareNotes(filter: { patientId?: string; visitId?: string }, limit = 50) {
  const { patientId, visitId } = filter;
  return useQuery({
    queryKey: ['care_notes', patientId ?? null, visitId ?? null, limit],
    enabled: !!(patientId || visitId),
    queryFn: async () => {
      let q = supabase.from('care_notes').select('*').order('created_at', { ascending: false }).limit(limit);
      if (patientId) q = q.eq('patient_id', patientId);
      if (visitId) q = q.eq('visit_id', visitId);
      return unwrap(await q) as CareNoteRow[];
    },
  });
}

// ---------- Visit actions ----------

function useVisitAction<TArgs>(fn: (args: TArgs) => Promise<VisitRow>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
      qc.invalidateQueries({ queryKey: ['care_notes'] });
    },
  });
}

export function useCheckIn() {
  return useVisitAction(async (visitId: string) =>
    unwrap(await supabase.rpc('check_in_visit', { p_visit_id: visitId })) as VisitRow,
  );
}

export function useCheckOut() {
  return useVisitAction(
    async (a: { visitId: string; tasksDone: string[]; note: string; concern: boolean }) =>
      unwrap(
        await supabase.rpc('check_out_visit', {
          p_visit_id: a.visitId,
          p_tasks_done: a.tasksDone,
          p_note: a.note,
          p_concern: a.concern,
        }),
      ) as VisitRow,
  );
}

export function useReportNoAccess() {
  return useVisitAction(
    async (a: { visitId: string; reason: string }) =>
      unwrap(await supabase.rpc('report_no_access', { p_visit_id: a.visitId, p_reason: a.reason })) as VisitRow,
  );
}

/** Add an extra note to a patient's care record (optionally about a visit). */
export function useAddCareNote() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (a: { patientId: string; visitId?: string | null; body: string; concern: boolean }) =>
      unwrap(
        await supabase
          .from('care_notes')
          .insert({
            agency_id: profile!.agency_id,
            patient_id: a.patientId,
            visit_id: a.visitId ?? null,
            author_id: profile!.id,
            // The database replaces this with the name on the author's profile.
            author_name: 'Caregiver',
            body: a.body.trim(),
            is_concern: a.concern,
          })
          .select()
          .single(),
      ) as CareNoteRow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care_notes'] }),
  });
}

// ---------- Admin: concerns ----------

/** Unresolved concerns raised by caregivers (admin dashboard). */
export function useOpenConcerns() {
  return useQuery({
    queryKey: ['care_notes', 'open_concerns'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('care_notes')
          .select('*')
          .eq('is_concern', true)
          .is('resolved_at', null)
          .order('created_at', { ascending: false })
          .limit(50),
      ) as CareNoteRow[],
  });
}

export function useResolveConcern() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await supabase
          .from('care_notes')
          .update({ resolved_at: new Date().toISOString(), resolved_by: user!.id })
          .eq('id', id),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care_notes'] }),
  });
}
