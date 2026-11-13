import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import InvoiceDocument from '@/components/billing/InvoiceDocument';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { useAgency, useInvoice } from '@/hooks/data/useBilling';
import { useMyPatient } from '@/hooks/data/usePatientData';

/** A patient's own invoice, ready to print or save as PDF. */
const PatientInvoiceDetails: React.FC = () => {
  const { invoiceId } = useParams();
  const { data, isLoading, error, refetch } = useInvoice(invoiceId);
  const { data: agency } = useAgency();
  const { data: patient } = useMyPatient();

  if (isLoading) return <Layout title="Invoice" role="patient"><LoadingState /></Layout>;
  if (error || !data) {
    return <Layout title="Invoice" role="patient"><ErrorState error={error ?? new Error('Invoice not found')} onRetry={refetch} /></Layout>;
  }

  return (
    <Layout title={`Invoice ${data.invoice.number}`} role="patient">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-2 mb-4">
        <Button variant="ghost" asChild>
          <Link to="/patient/invoices"><ArrowLeft className="h-4 w-4 mr-2" />All invoices</Link>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />Print / PDF
        </Button>
      </div>
      <InvoiceDocument invoice={data.invoice} lines={data.lines} payments={data.payments} agency={agency} billTo={patient} />
      <p className="print:hidden text-xs text-muted-foreground text-center mt-4">
        Questions about this invoice? Send a request or contact the office.
      </p>
    </Layout>
  );
};

export default PatientInvoiceDetails;
