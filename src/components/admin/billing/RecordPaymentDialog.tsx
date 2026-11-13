import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRecordPayment } from '@/hooks/data/useBilling';
import { PAYMENT_METHOD_LABEL } from '@/lib/billing';
import { formatGBP } from '@/lib/format';
import type { InvoiceSummary, PaymentMethod } from '@/lib/database.types';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceSummary | null;
}

const RecordPaymentDialog: React.FC<RecordPaymentDialogProps> = ({ open, onOpenChange, invoice }) => {
  const record = useRecordPayment();
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(Number(invoice.balance) > 0 ? Number(invoice.balance).toFixed(2) : '');
    setPaidOn(format(new Date(), 'yyyy-MM-dd'));
    setMethod('bank_transfer');
    setReference('');
    setError(null);
  }, [open, invoice]);

  if (!invoice) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return setError('Enter an amount greater than £0.');
    if (value > Number(invoice.balance) + 0.001) {
      return setError(`That is more than the balance of ${formatGBP(invoice.balance)}.`);
    }
    try {
      await record.mutateAsync({ invoice_id: invoice.id, amount: value, paid_on: paidOn, method, reference, notes: '' });
      toast.success(`Payment of ${formatGBP(value)} recorded`);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment · {invoice.number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <p className="text-sm text-muted-foreground">
            Total {formatGBP(invoice.total)} · Paid {formatGBP(invoice.paid)} · <b>Balance {formatGBP(invoice.balance)}</b>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pay-amount">Amount (£)</Label>
              <Input id="pay-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-date">Date received</Label>
              <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="pay-method">Method</Label>
            <select id="pay-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input id="pay-ref" placeholder="e.g. bank reference or cheque number" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={record.isPending}>{record.isPending ? 'Saving...' : 'Record Payment'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RecordPaymentDialog;
