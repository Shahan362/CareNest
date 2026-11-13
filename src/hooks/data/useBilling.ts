import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  AgencyInput,
  AgencyRow,
  InvoiceLineRow,
  InvoiceStatus,
  InvoiceSummary,
  PaymentMethod,
  PaymentRow,
  VisitRow,
} from '@/lib/database.types';

// Data hooks for invoices and payments. RLS limits everything to the admin's agency.

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const keys = {
  invoices: ['invoices'] as const,
  invoice: (id: string) => ['invoices', id] as const,
  payments: ['payments'] as const,
};

function useInvalidateBilling() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
    qc.invalidateQueries({ queryKey: ['unbilled'] });
  };
}

export function useInvoices() {
  return useQuery({
    queryKey: keys.invoices,
    queryFn: async () =>
      unwrap(
        await supabase.from('invoice_summaries').select('*').order('issue_date', { ascending: false }).order('number', { ascending: false }),
      ) as InvoiceSummary[],
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: keys.invoice(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const invoice = unwrap(await supabase.from('invoice_summaries').select('*').eq('id', id as string).single()) as InvoiceSummary;
      const [lines, payments] = await Promise.all([
        supabase.from('invoice_lines').select('*').eq('invoice_id', id as string).order('sort_order'),
        supabase.from('payments').select('*').eq('invoice_id', id as string).order('paid_on'),
      ]);
      return {
        invoice,
        lines: unwrap(lines) as InvoiceLineRow[],
        payments: unwrap(payments) as PaymentRow[],
      };
    },
  });
}

export function usePayments() {
  return useQuery({
    queryKey: keys.payments,
    queryFn: async () =>
      unwrap(await supabase.from('payments').select('*').order('paid_on', { ascending: false })) as PaymentRow[],
  });
}

export function useAgency() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['agency', profile?.agency_id],
    enabled: !!profile?.agency_id,
    queryFn: async () =>
      unwrap(await supabase.from('agencies').select('*').eq('id', profile!.agency_id).single()) as AgencyRow,
  });
}

export function useSaveAgency() {
  const qc = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<AgencyInput>) => {
      const row = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]));
      unwrap(await supabase.from('agencies').update(row).eq('id', profile!.agency_id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agency'] });
      refreshProfile();
    },
  });
}

export function useRegenerateAgencyCode() {
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('regenerate_agency_code')) as string,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agency'] });
      refreshProfile();
    },
  });
}

/** Completed visits in [from, to] for these patients that are not on any invoice yet. */
export async function fetchUnbilledVisits(patientIds: string[], from: string, to: string) {
  if (patientIds.length === 0) return [] as VisitRow[];
  const visits = unwrap(
    await supabase
      .from('visits')
      .select('*')
      .in('patient_id', patientIds)
      .eq('status', 'completed')
      .gte('start_time', from)
      .lt('start_time', to)
      .order('start_time'),
  ) as VisitRow[];
  if (visits.length === 0) return visits;

  // Remove visits already on an invoice (in chunks to keep the URL short).
  const billed = new Set<string>();
  for (let i = 0; i < visits.length; i += 150) {
    const ids = visits.slice(i, i + 150).map((v) => v.id);
    const rows = unwrap(await supabase.from('invoice_lines').select('visit_id').in('visit_id', ids)) as { visit_id: string }[];
    rows.forEach((r) => billed.add(r.visit_id));
  }
  return visits.filter((v) => !billed.has(v.id));
}

export function useUnbilledVisits(patientId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['unbilled', patientId, from, to],
    enabled: !!patientId && !!from && !!to,
    queryFn: () => fetchUnbilledVisits([patientId as string], from, to),
  });
}

export interface NewInvoiceLine {
  visit_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface NewInvoice {
  patient_id: string;
  period_start: string | null;
  period_end: string | null;
  issue_date: string;
  due_date: string;
  status: Extract<InvoiceStatus, 'draft' | 'sent'>;
  notes: string;
  lines: NewInvoiceLine[];
}

export async function createInvoice(inv: NewInvoice) {
  return unwrap(
    await supabase.rpc('create_invoice', {
      p_patient_id: inv.patient_id,
      p_period_start: inv.period_start,
      p_period_end: inv.period_end,
      p_issue_date: inv.issue_date,
      p_due_date: inv.due_date,
      p_status: inv.status,
      p_notes: inv.notes,
      p_lines: inv.lines,
    }),
  ) as string;
}

export function useCreateInvoice() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: createInvoice, onSuccess: invalidate });
}

export function useSetInvoiceStatus() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceStatus }) =>
      unwrap(await supabase.from('invoices').update({ status }).eq('id', id).select().single()),
    onSuccess: invalidate,
  });
}

export function useVoidInvoice() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('void_invoice', { p_invoice_id: id })),
    onSuccess: invalidate,
  });
}

/** Only drafts can be deleted; issued invoices should be voided to keep the record. */
export function useDeleteInvoice() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await supabase.from('invoices').delete().eq('id', id).eq('status', 'draft')),
    onSuccess: invalidate,
  });
}

export function useRecordPayment() {
  const invalidate = useInvalidateBilling();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (p: { invoice_id: string; amount: number; paid_on: string; method: PaymentMethod; reference: string; notes: string }) =>
      unwrap(
        await supabase
          .from('payments')
          .insert({ ...p, reference: p.reference || null, notes: p.notes || null, agency_id: profile?.agency_id })
          .select()
          .single(),
      ),
    onSuccess: invalidate,
  });
}

export function useDeletePayment() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('payments').delete().eq('id', id)),
    onSuccess: invalidate,
  });
}
