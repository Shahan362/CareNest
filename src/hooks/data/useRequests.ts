import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CareRequestRow, FeedbackKind, FeedbackRow, RequestType } from '@/lib/database.types';

// Patient requests and feedback. The same queries serve both sides:
// Row Level Security returns a patient's own rows, or the whole agency's rows for an admin.

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function useRequests() {
  return useQuery({
    queryKey: ['care_requests'],
    queryFn: async () =>
      unwrap(await supabase.from('care_requests').select('*').order('created_at', { ascending: false }).limit(500)) as CareRequestRow[],
  });
}

export function useFeedback() {
  return useQuery({
    queryKey: ['feedback'],
    queryFn: async () =>
      unwrap(await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(500)) as FeedbackRow[],
  });
}

// ---------- Patient actions ----------

export function useCreateRequest() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (a: {
      patientId: string;
      type: RequestType;
      details: string;
      visitId?: string | null;
      preferredDate?: string | null;
      preferredTime?: string | null;
    }) =>
      unwrap(
        await supabase
          .from('care_requests')
          .insert({
            agency_id: profile!.agency_id,
            patient_id: a.patientId,
            type: a.type,
            details: a.details.trim(),
            visit_id: a.visitId || null,
            preferred_date: a.preferredDate || null,
            preferred_time: a.preferredTime || null,
          })
          .select()
          .single(),
      ) as CareRequestRow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care_requests'] }),
  });
}

export function useWithdrawRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('withdraw_request', { p_request_id: id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care_requests'] }),
  });
}

export function useGiveFeedback() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (a: { patientId: string; kind: FeedbackKind; message: string; caregiverId?: string | null }) =>
      unwrap(
        await supabase
          .from('feedback')
          .insert({
            agency_id: profile!.agency_id,
            patient_id: a.patientId,
            kind: a.kind,
            message: a.message.trim(),
            caregiver_id: a.caregiverId || null,
          })
          .select()
          .single(),
      ) as FeedbackRow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  });
}

// ---------- Admin actions ----------

export function useRespondToRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (a: { id: string; status: 'approved' | 'declined'; response: string }) =>
      unwrap(
        await supabase
          .from('care_requests')
          .update({
            status: a.status,
            admin_response: a.response.trim() || null,
            responded_at: new Date().toISOString(),
            responded_by: user!.id,
          })
          .eq('id', a.id),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care_requests'] }),
  });
}

export function useResolveFeedback() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (a: { id: string; response: string }) =>
      unwrap(
        await supabase
          .from('feedback')
          .update({
            status: 'resolved',
            admin_response: a.response.trim() || null,
            responded_at: new Date().toISOString(),
            responded_by: user!.id,
          })
          .eq('id', a.id),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  });
}
