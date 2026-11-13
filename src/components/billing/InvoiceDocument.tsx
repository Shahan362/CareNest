import React from 'react';
import { Trash2 } from 'lucide-react';
import type { AgencyRow, InvoiceLineRow, InvoiceSummary, PaymentRow } from '@/lib/database.types';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_STYLE, PAYMENT_METHOD_LABEL, displayStatus } from '@/lib/billing';
import { formatDate, formatGBP, fullName } from '@/lib/format';
import { cn } from '@/lib/utils';

interface InvoiceDocumentProps {
  invoice: InvoiceSummary;
  lines: InvoiceLineRow[];
  payments: PaymentRow[];
  agency: AgencyRow | null | undefined;
  billTo: { first_name: string; last_name: string; address?: string | null; postcode?: string | null; email?: string | null } | null | undefined;
  /** Admin only: shows a delete button on each payment. */
  onDeletePayment?: (payment: PaymentRow) => void;
}

/** The printable invoice. Used by the admin invoice page and the patient's invoice page. */
const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({ invoice, lines, payments, agency, billTo, onDeletePayment }) => {
  const status = displayStatus(invoice);
  return (
        <div className="bg-white rounded-lg border p-6 sm:p-10 max-w-4xl mx-auto print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-col sm:flex-row justify-between gap-6 mb-8">
        <div>
          <h2 className="text-2xl font-bold">{agency?.name ?? 'Agency'}</h2>
          <div className="text-sm text-gray-600 mt-1 space-y-0.5">
            {agency?.address && <p>{agency.address}</p>}
            {agency?.postcode && <p>{agency.postcode}</p>}
            {agency?.phone && <p>{agency.phone}</p>}
            {agency?.email && <p>{agency.email}</p>}
            {agency?.registration_number && <p>Company no. {agency.registration_number}</p>}
            {agency?.cqc_provider_id && <p>CQC provider ID {agency.cqc_provider_id}</p>}
          </div>
        </div>
        <div className="sm:text-right">
          <h1 className="text-3xl font-bold tracking-tight">INVOICE</h1>
          <p className="font-mono text-lg">{invoice.number}</p>
          <span className={cn('inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium print:hidden', INVOICE_STATUS_STYLE[status])}>
            {INVOICE_STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 mb-8 text-sm">
        <div>
          <p className="text-gray-500 uppercase text-xs font-semibold mb-1">Bill to</p>
          <p className="font-medium">{fullName(billTo) || 'Patient'}</p>
          {billTo?.address && <p className="whitespace-pre-line">{billTo.address}</p>}
          {billTo?.postcode && <p>{billTo.postcode}</p>}
          {billTo?.email && <p>{billTo.email}</p>}
        </div>
        <div className="sm:text-right space-y-1">
          <p><span className="text-gray-500">Issue date:</span> {formatDate(invoice.issue_date)}</p>
          <p><span className="text-gray-500">Due date:</span> <b>{formatDate(invoice.due_date)}</b></p>
          {invoice.period_start && invoice.period_end && (
            <p><span className="text-gray-500">Care period:</span> {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}</p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 px-2 text-right">Qty / Hours</th>
              <th className="py-2 px-2 text-right">Rate</th>
              <th className="py-2 pl-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-gray-100">
                <td className="py-2 pr-2">{l.description}</td>
                <td className="py-2 px-2 text-right">{Number(l.quantity)}</td>
                <td className="py-2 px-2 text-right">{formatGBP(l.unit_price)}</td>
                <td className="py-2 pl-2 text-right">{formatGBP(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mt-4">
        <div className="w-full sm:w-64 text-sm space-y-1">
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span>{formatGBP(invoice.total)}</span></div>
          {Number(invoice.paid) > 0 && (
            <div className="flex justify-between text-green-700"><span>Paid</span><span>-{formatGBP(invoice.paid)}</span></div>
          )}
          <div className="flex justify-between font-bold"><span>Balance due</span><span>{formatGBP(invoice.balance)}</span></div>
          <p className="text-xs text-gray-500 pt-1">No VAT charged.</p>
        </div>
      </div>

      {agency?.bank_account_number && invoice.status !== 'void' && (
        <div className="mt-8 text-sm rounded-md border p-4 bg-gray-50 print:bg-white">
          <p className="text-gray-500 uppercase text-xs font-semibold mb-2">How to pay</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <span className="text-gray-500">Account name</span><span>{agency.bank_account_name}</span>
            <span className="text-gray-500">Sort code</span><span className="font-mono">{agency.bank_sort_code}</span>
            <span className="text-gray-500">Account number</span><span className="font-mono">{agency.bank_account_number}</span>
            <span className="text-gray-500">Reference</span><span className="font-mono font-semibold">{invoice.number}</span>
          </div>
        </div>
      )}

      {invoice.notes && (
        <div className="mt-8 text-sm">
          <p className="text-gray-500 uppercase text-xs font-semibold mb-1">Notes</p>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}

      {agency?.invoice_footer && (
        <p className="mt-8 text-xs text-gray-500 whitespace-pre-line border-t pt-4">{agency.invoice_footer}</p>
      )}

      {payments.length > 0 && (
        <div className="mt-8 text-sm">
          <p className="text-gray-500 uppercase text-xs font-semibold mb-2">Payments received</p>
          <div className="divide-y border rounded-md">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 gap-2">
                <span>
                  {formatDate(p.paid_on)} · {PAYMENT_METHOD_LABEL[p.method]}
                  {p.reference && <span className="text-gray-500"> · {p.reference}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <b>{formatGBP(p.amount)}</b>
                  {onDeletePayment && (
                    <button
                      className="print:hidden text-gray-400 hover:text-red-600 p-1"
                      aria-label="Delete payment"
                      onClick={() => onDeletePayment(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceDocument;
