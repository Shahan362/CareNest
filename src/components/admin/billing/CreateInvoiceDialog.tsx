import React, { useEffect, useMemo, useState } from 'react';
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useCaregiverRows, usePatientRows } from '@/hooks/data/useAgencyData';
import { useAgency, useCreateInvoice, useUnbilledVisits, type NewInvoiceLine } from '@/hooks/data/useBilling';
import { formatDate, formatGBP, formatTime, fullName } from '@/lib/format';
import { PAYMENT_TERMS, roundMoney, visitHours } from '@/lib/billing';
import { durationMinutes } from '@/lib/visits';
import type { VisitRow } from '@/lib/database.types';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface ExtraLine {
  key: number;
  description: string;
  quantity: string;
  unit_price: string;
}

/** Text for an invoice line that bills a visit. */
export function visitLineDescription(v: VisitRow, caregiverName?: string) {
  const when = `${formatDate(v.start_time)} ${formatTime(v.start_time)}-${formatTime(v.end_time)}`;
  const tasks = v.tasks.length ? ` (${v.tasks.join(', ')})` : '';
  const by = caregiverName ? `, ${caregiverName}` : '';
  return `Care visit ${when}${by}${tasks}`;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (invoiceId: string) => void;
}

const CreateInvoiceDialog: React.FC<CreateInvoiceDialogProps> = ({ open, onOpenChange, onCreated }) => {
  const { data: patients = [] } = usePatientRows();
  const { data: caregivers = [] } = useCaregiverRows();
  const create = useCreateInvoice();
  const { data: agency } = useAgency();
  const defaultTerms = agency?.default_payment_terms ?? 14;
  const termOptions = Array.from(new Set([0, ...PAYMENT_TERMS, defaultTerms])).sort((a, b) => a - b);

  const lastMonth = subMonths(new Date(), 1);
  const [patientId, setPatientId] = useState('');
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [terms, setTerms] = useState<number>(14);
  const [notes, setNotes] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPatientId('');
    setNotes('');
    setExcluded(new Set());
    setExtras([]);
    setError(null);
    setIssueDate(format(new Date(), 'yyyy-MM-dd'));
    setTerms(defaultTerms);
  }, [open, defaultTerms]);

  const patient = patients.find((p) => p.id === patientId);
  const rate = Number(patient?.hourly_rate ?? 0);
  // Period end is inclusive, so query up to the start of the next day.
  const toExclusive = periodEnd ? addDays(new Date(`${periodEnd}T00:00:00`), 1).toISOString() : '';
  const fromIso = periodStart ? new Date(`${periodStart}T00:00:00`).toISOString() : '';
  const unbilled = useUnbilledVisits(patientId || null, fromIso, toExclusive);
  const cgName = (id: string | null) => fullName(caregivers.find((c) => c.id === id));

  const visitLines = useMemo(
    () =>
      (unbilled.data ?? []).map((v) => {
        const hours = visitHours(durationMinutes(v));
        return { visit: v, hours, amount: roundMoney(hours * rate) };
      }),
    [unbilled.data, rate],
  );

  const includedVisits = visitLines.filter((l) => !excluded.has(l.visit.id));
  const validExtras = extras.filter((e) => e.description.trim() && Number(e.quantity) > 0 && Number(e.unit_price) >= 0);
  const total = roundMoney(
    includedVisits.reduce((t, l) => t + l.amount, 0) +
      validExtras.reduce((t, e) => t + roundMoney(Number(e.quantity) * Number(e.unit_price)), 0),
  );

  const toggleVisit = (id: string) =>
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (status: 'draft' | 'sent') => {
    setError(null);
    if (!patientId) return setError('Please choose a patient.');
    if (periodStart > periodEnd) return setError('The period end must be after the start.');
    const lines: NewInvoiceLine[] = [
      ...includedVisits.map((l) => ({
        visit_id: l.visit.id,
        description: visitLineDescription(l.visit, cgName(l.visit.caregiver_id)),
        quantity: l.hours,
        unit_price: rate,
      })),
      ...validExtras.map((e) => ({
        description: e.description.trim(),
        quantity: Number(e.quantity),
        unit_price: Number(e.unit_price),
      })),
    ];
    if (lines.length === 0) return setError('Add at least one visit or extra line.');

    try {
      const id = await create.mutateAsync({
        patient_id: patientId,
        period_start: periodStart,
        period_end: periodEnd,
        issue_date: issueDate,
        due_date: format(addDays(new Date(`${issueDate}T00:00:00`), terms), 'yyyy-MM-dd'),
        status,
        notes,
        lines,
      });
      toast.success(status === 'draft' ? 'Draft invoice saved' : 'Invoice created');
      onOpenChange(false);
      onCreated?.(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <Label htmlFor="inv-patient">Patient</Label>
              <select id="inv-patient" className={selectClass} value={patientId} onChange={(e) => { setPatientId(e.target.value); setExcluded(new Set()); }}>
                <option value="">Choose a patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)} - {formatGBP(p.hourly_rate)}/hour{p.status === 'inactive' ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="inv-from">Period from</Label>
              <Input id="inv-from" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="inv-to">Period to</Label>
              <Input id="inv-to" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="inv-issue">Issue date</Label>
                <Input id="inv-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="inv-terms">Due in</Label>
                <select id="inv-terms" className={selectClass} value={terms} onChange={(e) => setTerms(Number(e.target.value))}>
                  {termOptions.map((d) => (
                    <option key={d} value={d}>{d === 0 ? 'On receipt' : `${d} days`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {patient && rate === 0 && (
            <div className="flex gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              This patient's hourly rate is £0. Set it on the Patients page first, or visits will be billed at £0.
            </div>
          )}

          {patientId && (
            <div>
              <h3 className="font-medium mb-2">Completed visits not yet billed</h3>
              {unbilled.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading visits...
                </div>
              ) : visitLines.length === 0 ? (
                <p className="text-sm text-muted-foreground border rounded-md p-3">
                  No unbilled completed visits in this period. Only visits marked <b>Completed</b> can be billed. You can still add extra lines below.
                </p>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600">
                      <tr>
                        <th className="p-2 w-8" />
                        <th className="p-2 text-left">Visit</th>
                        <th className="p-2 text-left">Caregiver</th>
                        <th className="p-2 text-right">Hours</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visitLines.map((l) => (
                        <tr key={l.visit.id} className={excluded.has(l.visit.id) ? 'opacity-50' : ''}>
                          <td className="p-2">
                            <Checkbox checked={!excluded.has(l.visit.id)} onCheckedChange={() => toggleVisit(l.visit.id)} aria-label="Include visit" />
                          </td>
                          <td className="p-2">
                            {formatDate(l.visit.start_time)} {formatTime(l.visit.start_time)}-{formatTime(l.visit.end_time)}
                          </td>
                          <td className="p-2">{cgName(l.visit.caregiver_id) || '-'}</td>
                          <td className="p-2 text-right">{l.hours}</td>
                          <td className="p-2 text-right">{formatGBP(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Extra lines</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExtras((x) => [...x, { key: Date.now(), description: '', quantity: '1', unit_price: '' }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>
            {extras.length === 0 ? (
              <p className="text-xs text-muted-foreground">For example a late-cancellation fee, mileage or equipment.</p>
            ) : (
              <div className="space-y-2">
                {extras.map((e) => {
                  const update = (patch: Partial<ExtraLine>) =>
                    setExtras((x) => x.map((y) => (y.key === e.key ? { ...y, ...patch } : y)));
                  return (
                    <div key={e.key} className="grid grid-cols-[1fr_70px_100px_36px] gap-2 items-center">
                      <Input placeholder="Description" value={e.description} onChange={(ev) => update({ description: ev.target.value })} />
                      <Input type="number" min="0" step="0.25" placeholder="Qty" value={e.quantity} onChange={(ev) => update({ quantity: ev.target.value })} aria-label="Quantity" />
                      <Input type="number" min="0" step="0.01" placeholder="£ each" value={e.unit_price} onChange={(ev) => update({ unit_price: ev.target.value })} aria-label="Unit price" />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setExtras((x) => x.filter((y) => y.key !== e.key))} aria-label="Remove line">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="inv-notes">Notes on invoice (optional)</Label>
            <Textarea id="inv-notes" rows={2} placeholder="e.g. bank details or payment instructions" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-between items-center border-t pt-3">
            <span className="text-sm text-muted-foreground">
              {includedVisits.length} visit{includedVisits.length === 1 ? '' : 's'}
              {validExtras.length > 0 && ` + ${validExtras.length} extra`}
            </span>
            <span className="text-lg font-bold">Total {formatGBP(total)}</span>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" disabled={create.isPending} onClick={() => submit('draft')}>Save as draft</Button>
          <Button disabled={create.isPending} onClick={() => submit('sent')}>
            {create.isPending ? 'Creating...' : 'Create & mark sent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateInvoiceDialog;
