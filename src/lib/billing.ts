import { isBefore, parseISO, startOfDay } from 'date-fns';
import type { InvoiceStatus, InvoiceSummary, PaymentMethod } from '@/lib/database.types';

// Billing labels and rules shared by the billing screens.

/** What the admin sees: stored status plus states worked out from dates and payments. */
export type InvoiceDisplayStatus = InvoiceStatus | 'overdue' | 'part_paid';

export function displayStatus(inv: Pick<InvoiceSummary, 'status' | 'due_date' | 'paid' | 'balance'>): InvoiceDisplayStatus {
  if (inv.status !== 'sent') return inv.status;
  if (Number(inv.balance) <= 0) return 'paid';
  if (isBefore(parseISO(inv.due_date), startOfDay(new Date()))) return 'overdue';
  if (Number(inv.paid) > 0) return 'part_paid';
  return 'sent';
}

export const INVOICE_STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  part_paid: 'Part paid',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
};

export const INVOICE_STATUS_STYLE: Record<InvoiceDisplayStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-800',
  part_paid: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid: 'bg-green-100 text-green-800',
  void: 'bg-gray-100 text-gray-500 line-through',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  cheque: 'Cheque',
  direct_debit: 'Direct debit',
  other: 'Other',
};

export const PAYMENT_TERMS = [7, 14, 30] as const;

/** Round to pence. */
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

/** Hours for a visit, rounded to 2 decimals (e.g. 45 min -> 0.75). */
export const visitHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
