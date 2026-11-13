import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { differenceInHours, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateRequest } from '@/hooks/data/useRequests';
import type { PatientVisit } from '@/hooks/data/usePatientData';
import type { RequestType } from '@/lib/database.types';
import { REQUEST_TYPES } from '@/lib/requests';
import { formatTime, formatVisitWhen } from '@/lib/format';
import { cn } from '@/lib/utils';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface RequestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  /** Future visits the request can be about. */
  upcoming: PatientVisit[];
  /** Pre-fill when opened from a visit ("Request a change"). */
  initialVisitId?: string | null;
  initialType?: RequestType;
}

/** New request from a patient (or their family) to the agency office. */
const RequestFormDialog: React.FC<RequestFormDialogProps> = ({
  open,
  onOpenChange,
  patientId,
  upcoming,
  initialVisitId,
  initialType,
}) => {
  const create = useCreateRequest();
  const [type, setType] = useState<RequestType>('change_time');
  const [visitId, setVisitId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(initialType ?? 'change_time');
    setVisitId(initialVisitId ?? '');
    setDate('');
    setTime('');
    setDetails('');
    setError(null);
  }, [open, initialType, initialVisitId]);

  const def = REQUEST_TYPES.find((t) => t.value === type)!;
  const visit = upcoming.find((v) => v.row.id === visitId);
  const shortNotice = type === 'cancel_visit' && visit && differenceInHours(visit.start, new Date()) < 24;

  const submit = async () => {
    setError(null);
    if (def.needsVisit && !visitId) return setError('Please choose which visit this is about.');
    if (type === 'extra_visit' && !date) return setError('Please choose a date for the extra visit.');
    if (date && date < format(new Date(), 'yyyy-MM-dd')) return setError('The date must be today or later.');
    if (details.trim().length < 5) return setError('Please tell the office a little more.');
    try {
      await create.mutateAsync({
        patientId,
        type,
        details,
        visitId: def.needsVisit ? visitId : null,
        preferredDate: def.wantsDate ? date : null,
        preferredTime: def.wantsDate ? time : null,
      });
      toast.success('Request sent to the office');
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New request</DialogTitle>
          <DialogDescription>The office will reply here, usually within one working day. For anything urgent, please phone the office.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>What do you need?</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {REQUEST_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    'rounded-lg border p-2.5 text-left text-sm hover:bg-gray-50',
                    type === t.value && 'border-primary bg-primary/5 ring-1 ring-primary',
                  )}
                >
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{def.hint}</p>
          </div>

          {def.needsVisit && (
            <div>
              <Label htmlFor="req-visit">Which visit?</Label>
              <select id="req-visit" className={selectClass} value={visitId} onChange={(e) => setVisitId(e.target.value)}>
                <option value="">Choose a visit</option>
                {upcoming.map((v) => (
                  <option key={v.row.id} value={v.row.id}>
                    {format(v.start, 'EEE')} {formatVisitWhen(v.start)}-{formatTime(v.end)} · {v.carer}
                  </option>
                ))}
              </select>
              {upcoming.length === 0 && <p className="text-xs text-muted-foreground mt-1">You have no upcoming visits.</p>}
              {shortNotice && (
                <p className="text-xs text-amber-800 mt-1">
                  This visit is less than 24 hours away. Your agreement may still charge for short-notice cancellations.
                </p>
              )}
            </div>
          )}

          {def.wantsDate && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="req-date">{type === 'extra_visit' ? 'Date' : 'New date (optional)'}</Label>
                <Input id="req-date" type="date" min={format(new Date(), 'yyyy-MM-dd')} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-time">Preferred time (optional)</Label>
                <Input id="req-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="req-details">Details</Label>
            <Textarea
              id="req-details"
              rows={4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={
                type === 'cancel_visit'
                  ? 'e.g. Mum has a hospital appointment that morning, she will be out from 9 until 12.'
                  : type === 'change_caregiver'
                    ? 'e.g. Mum gets on really well with Amira and would like her to come more often.'
                    : 'Tell the office what you need.'
              }
            />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Sending...' : 'Send request'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestFormDialog;
