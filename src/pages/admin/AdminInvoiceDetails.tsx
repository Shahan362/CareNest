import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CreditCard, Printer, Send, Trash2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import RecordPaymentDialog from '@/components/admin/billing/RecordPaymentDialog';
import InvoiceDocument from '@/components/billing/InvoiceDocument';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePatientRows } from '@/hooks/data/useAgencyData';
import {
  useAgency,
  useDeleteInvoice,
  useDeletePayment,
  useInvoice,
  useSetInvoiceStatus,
  useVoidInvoice,
} from '@/hooks/data/useBilling';
import { formatDate, formatGBP } from '@/lib/format';

type Confirm = 'void' | 'delete' | null;

const AdminInvoiceDetails: React.FC = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useInvoice(invoiceId);
  const { data: agency } = useAgency();
  const { data: patients = [] } = usePatientRows();
  const setStatus = useSetInvoiceStatus();
  const voidInvoice = useVoidInvoice();
  const deleteInvoice = useDeleteInvoice();
  const deletePayment = useDeletePayment();
  const [payOpen, setPayOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  if (isLoading) return <Layout title="Invoice" role="admin"><LoadingState /></Layout>;
  if (error || !data) {
    return <Layout title="Invoice" role="admin"><ErrorState error={error ?? new Error('Invoice not found')} onRetry={refetch} /></Layout>;
  }

  const { invoice, lines, payments } = data;
  const patient = patients.find((p) => p.id === invoice.patient_id);

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.success(message);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Layout title={`Invoice ${invoice.number}`} role="admin">
      {/* Toolbar (hidden when printing) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-2 mb-4">
        <Button variant="ghost" asChild>
          <Link to="/admin/billing"><ArrowLeft className="h-4 w-4 mr-2" />Back to Billing</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'draft' && (
            <>
              <Button variant="outline" className="text-red-700" onClick={() => setConfirm('delete')}>
                <Trash2 className="h-4 w-4 mr-2" />Delete draft
              </Button>
              <Button onClick={() => run(() => setStatus.mutateAsync({ id: invoice.id, status: 'sent' }), 'Invoice marked as sent')}>
                <Send className="h-4 w-4 mr-2" />Mark as sent
              </Button>
            </>
          )}
          {(invoice.status === 'sent' || invoice.status === 'paid') && Number(invoice.paid) === 0 && (
            <Button variant="outline" className="text-red-700" onClick={() => setConfirm('void')}>
              <Ban className="h-4 w-4 mr-2" />Void
            </Button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'draft' && Number(invoice.balance) > 0 && (
            <Button onClick={() => setPayOpen(true)}>
              <CreditCard className="h-4 w-4 mr-2" />Record payment
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />Print / PDF
          </Button>
        </div>
      </div>

      <InvoiceDocument
        invoice={invoice}
        lines={lines}
        payments={payments}
        agency={agency}
        billTo={patient}
        onDeletePayment={(p) => {
          if (window.confirm(`Delete the ${formatGBP(p.amount)} payment from ${formatDate(p.paid_on)}?`)) {
            run(() => deletePayment.mutateAsync(p.id), 'Payment deleted');
          }
        }}
      />

      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={invoice} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'void' ? `Void ${invoice.number}?` : `Delete draft ${invoice.number}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'void'
                ? 'The invoice stays on record marked as Void, and its visits become available to bill again.'
                : 'The draft is removed completely and its visits become available to bill again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (confirm === 'void') {
                  await run(() => voidInvoice.mutateAsync(invoice.id), 'Invoice voided');
                } else {
                  await run(() => deleteInvoice.mutateAsync(invoice.id), 'Draft deleted');
                  navigate('/admin/billing');
                }
                setConfirm(null);
              }}
            >
              {confirm === 'void' ? 'Void invoice' : 'Delete draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default AdminInvoiceDetails;
