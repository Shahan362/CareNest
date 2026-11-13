import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { MyCaregiverRow, PatientRow, VisitRow } from '@/lib/database.types';
import { carerName } from '@/lib/requests';

// Data hooks for the patient side. Row Level Security limits everything to the
// signed-in patient's own record, visits, invoices, requests and feedback.

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const EMPTY: never[] = [];

/** The patient record linked to the signed-in user (null if the agency removed it). */
export function useMyPatient() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['me', 'patient', user?.id],
    enabled: !!user,
    queryFn: async () =>
      unwrap(await supabase.from('patients').select('*').eq('user_id', user!.id).maybeSingle()) as PatientRow | null,
  });
}

/** Carers who visit (or are primary for) this patient: names only. */
export function useMyCaregivers() {
  return useQuery({
    queryKey: ['me', 'caregivers'],
    queryFn: async () => unwrap(await supabase.rpc('my_caregivers')) as MyCaregiverRow[],
  });
}

export interface PatientVisit {
  row: VisitRow;
  start: Date;
  end: Date;
  carer: string;
}

/** The patient's visits starting within [from, to), with the carer's name. */
export function usePatientVisits(from: string, to: string) {
  const me = useMyPatient();
  const caregivers = useMyCaregivers();
  const visits = useQuery({
    queryKey: ['visits', 'patient', me.data?.id, from, to],
    enabled: !!me.data,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('visits')
          .select('*')
          .eq('patient_id', me.data!.id)
          .gte('start_time', from)
          .lt('start_time', to)
          .order('start_time'),
      ) as VisitRow[],
  });

  const rows = visits.data ?? EMPTY;
  const carers = caregivers.data ?? EMPTY;
  const data = useMemo<PatientVisit[]>(() => {
    const byId = new Map(carers.map((c) => [c.id, c]));
    return rows.map((row) => ({
      row,
      start: parseISO(row.start_time),
      end: parseISO(row.end_time),
      carer: carerName(row.caregiver_id ? byId.get(row.caregiver_id) : null),
    }));
  }, [rows, carers]);

  return {
    data,
    patient: me.data ?? null,
    caregivers: carers,
    isLoading: me.isLoading || visits.isLoading || caregivers.isLoading,
    error: me.error ?? visits.error ?? caregivers.error,
    notLinked: me.data === null,
    refetch: () => {
      me.refetch();
      visits.refetch();
      caregivers.refetch();
    },
  };
}

export function useUpdateMyContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      emergency_contact_name: string;
      emergency_contact_phone: string;
      emergency_contact_relation: string;
      gp_practice: string;
    }) =>
      unwrap(
        await supabase.rpc('update_my_contacts', {
          p_emergency_contact_name: a.emergency_contact_name,
          p_emergency_contact_phone: a.emergency_contact_phone,
          p_emergency_contact_relation: a.emergency_contact_relation,
          p_gp_practice: a.gp_practice,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'patient'] }),
  });
}
