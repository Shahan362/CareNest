import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseISO, subDays } from 'date-fns';
import { CalendarClock, CreditCard, Download, FileText, Search, Wand2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import CreateInvoiceDialog from '@/components/admin/billing/CreateInvoiceDialog';
import GenerateInvoicesDialog from '@/components/admin/billing/GenerateInvoicesDialog';
import RecordPaymentDialog from '@/components/admin/billing/RecordPaymentDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import { usePatientRows } from '@/hooks/data/useAgencyData';
import { useInvoices, usePayments } from '@/hooks/data/useBilling';
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  PAYMENT_METHOD_LABEL,
  displayStatus,
  roundMoney,
  type InvoiceDisplayStatus,
} from '@/lib/billing';
import { formatDate, formatGBP, fullName } from '@/lib/format';
import type { InvoiceSummary } from '@/lib/database.types';
import { cn } from '@/lib/utils';

// Stable empty list so memoised values don't recalculate on every render while loading.
const EMPTY: never[] = [];

type Tab = 'invoices' | 'payments';
type StatusFilter = 'all' | 'unpaid' | InvoiceDisplayStatus;

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const AdminBilling: React.FC = () => {
  const navigate = useNavigate();
  const invoicesQuery = useInvoices();
  const paymentsQuery = usePayments();
  const { data: patients = [] } = usePatientRows();

  const [tab, setTab] = useState<Tab>('invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [payFor, setPayFor] = useState<InvoiceSummary | null>(null);

  const patientName = (id: string) => fullName(patients.find((p) => p.id === id)) || 'Unknown patient';
  const invoices = invoicesQuery.data ?? EMPTY;
  const payments = paymentsQuery.data ?? EMPTY;
  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  const stats = useMemo(() => {
    const open = invoices.filter((i) => i.status === 'sent');
    const overdue = open.filter((i) => displayStatus(i) === 'overdue');
    const monthAgo = subDays(new Date(), 30);
    const recent = payments.filter((p) => parseISO(p.paid_on) >= monthAgo);
    return {
      outstanding: roundMoney(open.reduce((t, i) => t + Number(i.balance), 0)),
      openCount: open.length,
      overdue: roundMoney(overdue.reduce((t, i) => t + Number(i.balance), 0)),
      overdueCount: overdue.length,
      paid30: roundMoney(recent.reduce((t, p) => t + Number(p.amount), 0)),
      paid30Count: recent.length,
      drafts: invoices.filter((i) => i.status === 'draft').length,
    };
  }, [invoices, payments]);

  const term = search.trim().toLowerCase();
  const filteredInvoices = invoices.filter((i) => {
    const s = displayStatus(i);
    if (statusFilter === 'unpaid' && !['sent', 'part_paid', 'overdue'].includes(s)) return false;
    if (statusFilter !== 'all' && statusFilter !== 'unpaid' && s !== statusFilter) return false;
    if (!term) return true;
    return i.number.toLowerCase().includes(term) || patientName(i.patient_id).toLowerCase().includes(term);
  });
  const filteredPayments = payments.filter((p) => {
    if (!term) return true;
    const inv = invoiceById.get(p.invoice_id);
    return (
      (inv?.number ?? '').toLowerCase().includes(term) ||
      (inv ? patientName(inv.patient_id) : '').toLowerCase().includes(term) ||
      (p.reference ?? '').toLowerCase().includes(term)
    );
  });

  const exportCsv = () => {
    if (tab === 'invoices') {
      downloadCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Invoice', 'Patient', 'Issue date', 'Due date', 'Status', 'Total (GBP)', 'Paid (GBP)', 'Balance (GBP)'],
        ...filteredInvoices.map((i) => [
          i.number, patientName(i.patient_id), formatDate(i.issue_date), formatDate(i.due_date),
          INVOICE_STATUS_LABEL[displayStatus(i)], Number(i.total), Number(i.paid), Number(i.balance),
        ]),
      ]);
    } else {
      downloadCsv(`payments-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Date', 'Invoice', 'Patient', 'Method', 'Reference', 'Amount (GBP)'],
        ...filteredPayments.map((p) => {
          const inv = invoiceById.get(p.invoice_id);
          return [formatDate(p.paid_on), inv?.number ?? '', inv ? patientName(inv.patient_id) : '', PAYMENT_METHOD_LABEL[p.method], p.reference ?? '', Number(p.amount)];
        }),
      ]);
    }
  };

  const loading = invoicesQuery.isLoading || paymentsQuery.isLoading;
  const error = invoicesQuery.error || paymentsQuery.error;

  const renderInvoices = () => {
    if (invoices.length === 0) {
      return (
        <EmptyState
          title="No invoices yet"
          description="Invoices are built from completed visits. Mark visits as completed in the Calendar or Scheduler, then create an invoice."
          action={<Button onClick={() => setCreateOpen(true)}><FileText className="h-4 w-4 mr-2" />New Invoice</Button>}
        />
      );
    }
    if (filteredInvoices.length === 0) return <EmptyState title="No invoices match your filters" />;
    return (
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
          <tr>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Issued</th>
            <th className="px-4 py-3">Due</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3 text-right">Balance</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filteredInvoices.map((i) => {
            const s = displayStatus(i);
            return (
              <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/billing/${i.id}`)}>
                <td className="px-4 py-3 font-medium font-mono">{i.number}</td>
                <td className="px-4 py-3">{patientName(i.patient_id)}</td>
                <td className="px-4 py-3">{formatDate(i.issue_date)}</td>
                <td className="px-4 py-3">{formatDate(i.due_date)}</td>
                <td className="px-4 py-3 text-right">{formatGBP(i.total)}</td>
                <td className="px-4 py-3 text-right">{i.status === 'void' ? '-' : formatGBP(i.balance)}</td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap', INVOICE_STATUS_STYLE[s])}>
                    {INVOICE_STATUS_LABEL[s]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {i.status === 'sent' && Number(i.balance) > 0 && (
                    <button
                      className="text-primary hover:underline mr-3"
                      onClick={(e) => { e.stopPropagation(); setPayFor(i); }}
                    >
                      Record payment
                    </button>
                  )}
                  <span className="text-primary">View</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const renderPayments = () => {
    if (payments.length === 0) return <EmptyState title="No payments recorded yet" description="Open an invoice and choose Record payment when money comes in." />;
    if (filteredPayments.length === 0) return <EmptyState title="No payments match your search" />;
    return (
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filteredPayments.map((p) => {
            const inv = invoiceById.get(p.invoice_id);
            return (
              <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/billing/${p.invoice_id}`)}>
                <td className="px-4 py-3">{formatDate(p.paid_on)}</td>
                <td className="px-4 py-3 font-mono">{inv?.number ?? '-'}</td>
                <td className="px-4 py-3">{inv ? patientName(inv.patient_id) : '-'}</td>
                <td className="px-4 py-3">{PAYMENT_METHOD_LABEL[p.method]}</td>
                <td className="px-4 py-3">{p.reference ?? '-'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatGBP(p.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <Layout title="Billing & Payments" role="admin">
      <div className="flex flex-wrap justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold">Billing & Payments</h2>
          <p className="text-gray-600 text-sm">Invoices are built from completed visits × each patient's hourly rate.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={loading}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => setGenerateOpen(true)}>
            <Wand2 className="h-4 w-4 mr-2" />Generate monthly
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />New Invoice
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button className="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:border-primary/40" onClick={() => { setTab('invoices'); setStatusFilter('unpaid'); }}>
          <p className="text-sm text-gray-500">Outstanding</p>
          <p className="text-2xl font-bold text-gray-900">{formatGBP(stats.outstanding)}</p>
          <p className="mt-2 flex items-center text-gray-500 text-sm">
            <FileText className="h-4 w-4 mr-1" />{stats.openCount} unpaid invoice{stats.openCount === 1 ? '' : 's'}
            {stats.drafts > 0 && ` · ${stats.drafts} draft${stats.drafts === 1 ? '' : 's'}`}
          </p>
        </button>
        <button className="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:border-primary/40" onClick={() => { setTab('invoices'); setStatusFilter('overdue'); }}>
          <p className="text-sm text-gray-500">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{formatGBP(stats.overdue)}</p>
          <p className="mt-2 flex items-center text-gray-500 text-sm">
            <CalendarClock className="h-4 w-4 mr-1" />{stats.overdueCount} past due date
          </p>
        </button>
        <button className="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:border-primary/40" onClick={() => setTab('payments')}>
          <p className="text-sm text-gray-500">Received (last 30 days)</p>
          <p className="text-2xl font-bold text-green-600">{formatGBP(stats.paid30)}</p>
          <p className="mt-2 flex items-center text-gray-500 text-sm">
            <CreditCard className="h-4 w-4 mr-1" />{stats.paid30Count} payment{stats.paid30Count === 1 ? '' : 's'}
          </p>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 flex">
          {(['invoices', 'payments'] as Tab[]).map((t) => (
            <button
              key={t}
              className={cn('px-4 py-3 text-sm font-medium capitalize', tab === t ? 'border-b-2 border-primary text-primary' : 'text-gray-600')}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-4">
          <div className="mb-4 flex flex-col md:flex-row gap-2">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder={tab === 'invoices' ? 'Search by invoice number or patient...' : 'Search by invoice, patient or reference...'}
                className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {tab === 'invoices' && (
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="unpaid">Unpaid (sent, part paid, overdue)</option>
                {(Object.keys(INVOICE_STATUS_LABEL) as InvoiceDisplayStatus[]).map((s) => (
                  <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>
                ))}
              </select>
            )}
          </div>

          <div className="overflow-x-auto">
            {loading ? <LoadingState /> : error ? (
              <ErrorState error={error} onRetry={() => { invoicesQuery.refetch(); paymentsQuery.refetch(); }} />
            ) : tab === 'invoices' ? renderInvoices() : renderPayments()}
          </div>
        </div>
      </div>

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => navigate(`/admin/billing/${id}`)} />
      <GenerateInvoicesDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <RecordPaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} invoice={payFor} />
    </Layout>
  );
};

export default AdminBilling;
