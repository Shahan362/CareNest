import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useInvoices } from '@/hooks/data/useBilling';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_STYLE, displayStatus } from '@/lib/billing';
import { formatDate, formatGBP } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The patient's invoices. Drafts are never shown (Row Level Security). */
const PatientInvoices: React.FC = () => {
  const { data, isLoading, error, refetch } = useInvoices();
  const invoices = data ?? [];
  const toPay = invoices.filter((i) => i.status === 'sent').reduce((sum, i) => sum + Number(i.balance), 0);

  return (
    <Layout title="Invoices" role="patient">
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-lg border">
          <EmptyState title="No invoices yet" description="Your agency sends invoices for completed visits, usually once a month." />
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm">
            {toPay > 0 ? <>You have <b>{formatGBP(toPay)}</b> to pay.</> : 'Everything is paid. Thank you.'}
          </p>
          <ul className="space-y-2">
            {invoices.map((i) => {
              const status = displayStatus(i);
              return (
                <li key={i.id}>
                  <Link to={`/patient/invoices/${i.id}`} className="flex items-center gap-3 bg-white rounded-lg border p-4 hover:shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium font-mono">{i.number}</p>
                      <p className="text-xs text-gray-500">
                        {i.period_start && i.period_end ? `Care ${formatDate(i.period_start)} - ${formatDate(i.period_end)} · ` : ''}
                        Due {formatDate(i.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatGBP(i.total)}</p>
                      {Number(i.balance) > 0 && i.status !== 'void' && Number(i.balance) !== Number(i.total) && (
                        <p className="text-xs text-gray-500">{formatGBP(i.balance)} left to pay</p>
                      )}
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', INVOICE_STATUS_STYLE[status])}>
                      {INVOICE_STATUS_LABEL[status]}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Layout>
  );
};

export default PatientInvoices;
