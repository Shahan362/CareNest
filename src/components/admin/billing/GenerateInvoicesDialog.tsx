import React, { useEffect, useState } from 'react';
import { addDays, addMonths, format, parseISO, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { useCaregiverRows, usePatientRows } from '@/hooks/data/useAgencyData';
import { createInvoice, fetchUnbilledVisits, useAgency } from '@/hooks/data/useBilling';
import { formatGBP, fullName } from '@/lib/format';
import { PAYMENT_TERMS, roundMoney, visitHours } from '@/lib/billing';
import { durationMinutes } from '@/lib/visits';
import type { PatientRow, VisitRow } from '@/lib/database.types';
import { visitLineDescription } from './CreateInvoiceDialog';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface PreviewRow {
  patient: PatientRow;
  visits: VisitRow[];
  total: number;
}

/** Creates one draft invoice per patient for all their unbilled completed visits in a month. */
const GenerateInvoicesDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const { data: patients = [] } = usePatientRows();
  const { data: caregivers = [] } = useCaregiverRows();
  const qc = useQueryClient();
  const { data: agency } = useAgency();
  const defaultTerms = agency?.default_payment_terms ?? 14;
  const termOptions = Array.from(new Set([0, ...PAYMENT_TERMS, defaultTerms])).sort((a, b) => a - b);

  const [month, setMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [terms, setTerms] = useState(14);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [skipped, setSkipped] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setPreview(null);
  }, [open, month]);

  useEffect(() => {
    if (open) setTerms(defaultTerms);
  }, [open, defaultTerms]);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const from = parseISO(`${month}-01T00:00:00`);
      const to = addMonths(from, 1);
      const visits = await fetchUnbilledVisits(patients.map((p) => p.id), from.toISOString(), to.toISOString());
      const byPatient = new Map<string, VisitRow[]>();
      visits.forEach((v) => byPatient.set(v.patient_id, [...(byPatient.get(v.patient_id) ?? []), v]));

      const rows: PreviewRow[] = [];
      const noRate: PatientRow[] = [];
      for (const p of patients) {
        const pv = byPatient.get(p.id);
        if (!pv?.length) continue;
        if (Number(p.hourly_rate) <= 0) {
          noRate.push(p);
          continue;
        }
        const total = roundMoney(pv.reduce((t, v) => t + roundMoney(visitHours(durationMinutes(v)) * Number(p.hourly_rate)), 0));
        rows.push({ patient: p, visits: pv, total });
      }
      setPreview(rows);
      setSkipped(noRate);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    if (!preview?.length) return;
    setCreating(true);
    const from = parseISO(`${month}-01T00:00:00`);
    const periodEnd = format(addDays(addMonths(from, 1), -1), 'yyyy-MM-dd');
    const issue = format(new Date(), 'yyyy-MM-dd');
    let ok = 0;
    const failed: string[] = [];
    for (const row of preview) {
      const rate = Number(row.patient.hourly_rate);
      try {
        await createInvoice({
          patient_id: row.patient.id,
          period_start: format(from, 'yyyy-MM-dd'),
          period_end: periodEnd,
          issue_date: issue,
          due_date: format(addDays(new Date(), terms), 'yyyy-MM-dd'),
          status: 'draft',
          notes: '',
          lines: row.visits.map((v) => ({
            visit_id: v.id,
            description: visitLineDescription(v, fullName(caregivers.find((c) => c.id === v.caregiver_id))),
            quantity: visitHours(durationMinutes(v)),
            unit_price: rate,
          })),
        });
        ok++;
      } catch {
        failed.push(fullName(row.patient));
      }
    }
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['unbilled'] });
    setCreating(false);
    if (failed.length) toast.error(`Could not create invoices for: ${failed.join(', ')}`);
    if (ok) toast.success(`${ok} draft invoice${ok === 1 ? '' : 's'} created. Review them, then mark as sent.`);
    onOpenChange(false);
  };

  const grandTotal = roundMoney((preview ?? []).reduce((t, r) => t + r.total, 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Monthly Invoices</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Creates one <b>draft</b> invoice per patient for all their completed visits in the month that haven't been billed yet.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="gen-month">Month</Label>
            <Input id="gen-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gen-terms">Due in</Label>
            <select id="gen-terms" className={selectClass} value={terms} onChange={(e) => setTerms(Number(e.target.value))}>
              {termOptions.map((d) => <option key={d} value={d}>{d === 0 ? 'On receipt' : `${d} days`}</option>)}
            </select>
          </div>
        </div>

        {preview === null ? (
          <Button variant="outline" onClick={loadPreview} disabled={loading || !month}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking visits...</> : 'Preview'}
          </Button>
        ) : preview.length === 0 ? (
          <p className="text-sm border rounded-md p-3">No unbilled completed visits for this month.</p>
        ) : (
          <div className="border rounded-md divide-y text-sm">
            {preview.map((r) => (
              <div key={r.patient.id} className="flex justify-between p-2">
                <span>{fullName(r.patient)} <span className="text-muted-foreground">({r.visits.length} visits)</span></span>
                <span className="font-medium">{formatGBP(r.total)}</span>
              </div>
            ))}
            <div className="flex justify-between p-2 font-bold bg-gray-50">
              <span>{preview.length} invoices</span>
              <span>{formatGBP(grandTotal)}</span>
            </div>
          </div>
        )}
        {skipped.length > 0 && (
          <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md p-2">
            Skipped (no hourly rate set): {skipped.map(fullName).join(', ')}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={generate} disabled={!preview?.length || creating}>
            {creating ? 'Creating...' : `Create ${preview?.length ?? 0} drafts`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateInvoicesDialog;
