import React, { useMemo, useState } from 'react';
import {
  addDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Calendar, Download, PieChart, Users } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import { useCaregiverRows, usePatientRows, useVisitRows } from '@/hooks/data/useAgencyData';
import { fetchUnbilledVisits, useInvoices, usePayments } from '@/hooks/data/useBilling';
import { capitalize, formatGBP, fullName, hoursBetween } from '@/lib/format';
import { roundMoney, visitHours } from '@/lib/billing';
import { durationMinutes } from '@/lib/visits';
import { cn } from '@/lib/utils';

// Chart colours (validated for colour-blind separation and contrast on white).
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';
const GRID = '#e5e7eb';
const AXIS_TEXT = '#52514e';

// Stable empty list so memoised values don't recalculate on every render while loading.
const EMPTY: never[] = [];

type ReportId = 'visits' | 'caregivers' | 'revenue' | 'patients';
type RangeId = 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear';

const REPORTS: { id: ReportId; name: string; icon: React.ElementType }[] = [
  { id: 'visits', name: 'Visits', icon: Calendar },
  { id: 'caregivers', name: 'Caregivers', icon: Users },
  { id: 'revenue', name: 'Revenue', icon: BarChart3 },
  { id: 'patients', name: 'Patients', icon: PieChart },
];

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisYear', label: 'This year' },
];

function rangeDates(id: RangeId): { start: Date; end: Date } {
  const today = new Date();
  switch (id) {
    case 'last7': return { start: startOfDay(subDays(today, 6)), end: endOfDay(today) };
    case 'last30': return { start: startOfDay(subDays(today, 29)), end: endOfDay(today) };
    case 'last90': return { start: startOfDay(subDays(today, 89)), end: endOfDay(today) };
    case 'thisMonth': return { start: startOfMonth(today), end: endOfDay(today) };
    case 'lastMonth': {
      const s = startOfMonth(subMonths(today, 1));
      return { start: s, end: endOfDay(subDays(startOfMonth(today), 1)) };
    }
    case 'thisYear': return { start: startOfYear(today), end: endOfDay(today) };
  }
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(escape).join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="p-3 bg-gray-50 rounded-lg">
    <p className="text-sm text-gray-600">{label}</p>
    <p className={cn('text-2xl font-bold text-gray-900', tone)}>{value}</p>
    {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={cn('bg-white rounded-lg shadow-sm border border-gray-100 p-4', className)}>
    <h3 className="font-bold mb-4">{title}</h3>
    {children}
  </div>
);

const axisProps = { tick: { fill: AXIS_TEXT, fontSize: 12 }, axisLine: false, tickLine: false } as const;

const AdminReports: React.FC = () => {
  const [rangeId, setRangeId] = useState<RangeId>('last30');
  const [report, setReport] = useState<ReportId>('visits');
  const { start, end } = useMemo(() => rangeDates(rangeId), [rangeId]);
  const fromIso = start.toISOString();
  const toIso = end.toISOString();

  const visitsQ = useVisitRows(fromIso, toIso);
  const patientsQ = usePatientRows();
  const caregiversQ = useCaregiverRows();
  const invoicesQ = useInvoices();
  const paymentsQ = usePayments();
  const patients = patientsQ.data ?? EMPTY;
  const caregivers = caregiversQ.data ?? EMPTY;
  const unbilledQ = useQuery({
    queryKey: ['unbilled', 'report', fromIso, toIso, patients.length],
    enabled: report === 'revenue' && patients.length > 0,
    queryFn: () => fetchUnbilledVisits(patients.map((p) => p.id), fromIso, toIso),
  });

  // Only visits that have already happened count towards delivery figures.
  const now = new Date();
  const past = useMemo(() => (visitsQ.data ?? []).filter((v) => parseISO(v.start_time) <= now), [visitsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Visits ----------
  const visitStats = useMemo(() => {
    const completed = past.filter((v) => v.status === 'completed');
    const missed = past.filter((v) => v.status === 'missed');
    const cancelled = past.filter((v) => v.status === 'cancelled');
    const notRecorded = past.filter((v) => v.status === 'scheduled' || v.status === 'in_progress');
    const hours = round1(completed.reduce((t, v) => t + hoursBetween(v.start_time, v.end_time), 0));
    const due = completed.length + missed.length;
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map((w) => {
      const wEnd = addDays(w, 7);
      const inWeek = completed.filter((v) => {
        const d = parseISO(v.start_time);
        return d >= w && d < wEnd;
      });
      return {
        week: `w/c ${format(w, 'd MMM')}`,
        hours: round1(inWeek.reduce((t, v) => t + hoursBetween(v.start_time, v.end_time), 0)),
        visits: inWeek.length,
      };
    });
    return {
      total: past.length,
      completed: completed.length,
      missed: missed.length,
      cancelled: cancelled.length,
      notRecorded: notRecorded.length,
      hours,
      rate: due ? Math.round((completed.length / due) * 100) : null,
      weeks,
    };
  }, [past, start, end]);

  // ---------- Caregivers ----------
  const caregiverRows = useMemo(() => {
    const weeksInRange = Math.max(1, (end.getTime() - start.getTime()) / (7 * 86_400_000));
    return caregivers
      .map((c) => {
        const mine = past.filter((v) => v.caregiver_id === c.id);
        const completed = mine.filter((v) => v.status === 'completed');
        const hours = round1(completed.reduce((t, v) => t + hoursBetween(v.start_time, v.end_time), 0));
        const capacity = Number(c.max_hours_per_week) * weeksInRange;
        return {
          id: c.id,
          name: fullName(c),
          status: capitalize(c.status),
          completed: completed.length,
          missed: mine.filter((v) => v.status === 'missed').length,
          hours,
          utilisation: capacity > 0 ? Math.round((hours / capacity) * 100) : 0,
          patients: new Set(completed.map((v) => v.patient_id)).size,
        };
      })
      .filter((r) => r.status === 'Active' || r.completed > 0 || r.missed > 0)
      .sort((a, b) => b.hours - a.hours);
  }, [caregivers, past, start, end]);

  // ---------- Revenue ----------
  const revenue = useMemo(() => {
    const inRange = (d: string) => isWithinInterval(parseISO(d), { start, end });
    const invoices = (invoicesQ.data ?? []).filter((i) => i.status !== 'void' && i.status !== 'draft' && inRange(i.issue_date));
    const payments = (paymentsQ.data ?? []).filter((p) => inRange(p.paid_on));
    const allOpen = (invoicesQ.data ?? []).filter((i) => i.status === 'sent');
    const rateById = new Map(patients.map((p) => [p.id, Number(p.hourly_rate)]));
    const unbilled = unbilledQ.data ?? [];
    const months = eachMonthOfInterval({ start, end }).map((m) => {
      const key = format(m, 'yyyy-MM');
      return {
        month: format(m, 'MMM yyyy'),
        invoiced: roundMoney(invoices.filter((i) => i.issue_date.startsWith(key)).reduce((t, i) => t + Number(i.total), 0)),
        received: roundMoney(payments.filter((p) => p.paid_on.startsWith(key)).reduce((t, p) => t + Number(p.amount), 0)),
      };
    });
    return {
      invoiced: roundMoney(invoices.reduce((t, i) => t + Number(i.total), 0)),
      invoiceCount: invoices.length,
      received: roundMoney(payments.reduce((t, p) => t + Number(p.amount), 0)),
      outstanding: roundMoney(allOpen.reduce((t, i) => t + Number(i.balance), 0)),
      unbilledCount: unbilled.length,
      unbilledValue: roundMoney(
        unbilled.reduce((t, v) => t + roundMoney(visitHours(durationMinutes(v)) * (rateById.get(v.patient_id) ?? 0)), 0),
      ),
      months,
    };
  }, [invoicesQ.data, paymentsQ.data, unbilledQ.data, patients, start, end]);

  // ---------- Patients ----------
  const patientStats = useMemo(() => {
    const active = patients.filter((p) => p.status === 'active');
    const plans = (['basic', 'comprehensive', 'advanced'] as const).map((plan) => ({
      plan: capitalize(plan),
      count: active.filter((p) => p.care_plan === plan).length,
    }));
    const rows = patients
      .map((p) => {
        const completed = past.filter((v) => v.patient_id === p.id && v.status === 'completed');
        return {
          id: p.id,
          name: fullName(p),
          plan: capitalize(p.care_plan),
          status: capitalize(p.status),
          visits: completed.length,
          hours: round1(completed.reduce((t, v) => t + hoursBetween(v.start_time, v.end_time), 0)),
        };
      })
      .filter((r) => r.status === 'Active' || r.visits > 0)
      .sort((a, b) => b.hours - a.hours);
    return { active: active.length, inactive: patients.length - active.length, plans, rows };
  }, [patients, past]);

  const rangeLabel = `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`;

  const exportCsv = () => {
    const stamp = `${format(start, 'yyyy-MM-dd')}_${format(end, 'yyyy-MM-dd')}`;
    if (report === 'visits') {
      downloadCsv(`visits-report_${stamp}.csv`, [
        ['Week', 'Completed visits', 'Care hours'],
        ...visitStats.weeks.map((w) => [w.week, w.visits, w.hours]),
      ]);
    } else if (report === 'caregivers') {
      downloadCsv(`caregivers-report_${stamp}.csv`, [
        ['Caregiver', 'Status', 'Completed visits', 'Missed', 'Hours delivered', 'Utilisation %', 'Patients seen'],
        ...caregiverRows.map((r) => [r.name, r.status, r.completed, r.missed, r.hours, r.utilisation, r.patients]),
      ]);
    } else if (report === 'revenue') {
      downloadCsv(`revenue-report_${stamp}.csv`, [
        ['Month', 'Invoiced (GBP)', 'Received (GBP)'],
        ...revenue.months.map((m) => [m.month, m.invoiced, m.received]),
      ]);
    } else {
      downloadCsv(`patients-report_${stamp}.csv`, [
        ['Patient', 'Care plan', 'Status', 'Completed visits', 'Care hours'],
        ...patientStats.rows.map((r) => [r.name, r.plan, r.status, r.visits, r.hours]),
      ]);
    }
  };

  const loading = visitsQ.isLoading || patientsQ.isLoading || caregiversQ.isLoading;
  const error = visitsQ.error || patientsQ.error || caregiversQ.error || invoicesQ.error || paymentsQ.error;

  const renderReport = () => {
    if (loading) return <div className="bg-white rounded-lg border"><LoadingState /></div>;
    if (error) return <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={() => visitsQ.refetch()} /></div>;

    if (report === 'visits') {
      return (
        <div className="space-y-6">
          <Card title="Visit summary">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Completed" value={visitStats.completed} tone="text-green-700" hint={`${visitStats.hours} care hours`} />
              <Stat label="Completion rate" value={visitStats.rate === null ? '-' : `${visitStats.rate}%`} hint="Completed ÷ (completed + missed)" />
              <Stat label="Missed" value={visitStats.missed} tone="text-red-700" />
              <Stat label="Cancelled" value={visitStats.cancelled} />
            </div>
            {visitStats.notRecorded > 0 && (
              <p className="mt-3 text-sm text-yellow-900 bg-yellow-50 border border-yellow-200 rounded-md p-2">
                {visitStats.notRecorded} past visit{visitStats.notRecorded === 1 ? ' is' : 's are'} still marked Scheduled. Mark them Completed or Missed so reports and billing are accurate.
              </p>
            )}
          </Card>
          <Card title="Care hours delivered per week">
            {visitStats.hours === 0 ? (
              <p className="text-sm text-muted-foreground">No completed visits in this period.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={visitStats.weeks} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="week" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} unit="h" />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                      formatter={(v: number, _n, item) => [`${v} hours (${item.payload.visits} visits)`, 'Delivered']}
                    />
                    <Bar dataKey="hours" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      );
    }

    if (report === 'caregivers') {
      return (
        <Card title="Caregiver activity">
          {caregiverRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No caregivers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Caregiver</th>
                    <th className="px-3 py-2 text-right">Visits completed</th>
                    <th className="px-3 py-2 text-right">Missed</th>
                    <th className="px-3 py-2 text-right">Hours delivered</th>
                    <th className="px-3 py-2 text-left">Utilisation</th>
                    <th className="px-3 py-2 text-right">Patients seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {caregiverRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-medium">
                        {r.name}
                        {r.status !== 'Active' && <span className="ml-2 text-xs text-gray-500">(inactive)</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{r.completed}</td>
                      <td className={cn('px-3 py-2 text-right', r.missed > 0 && 'text-red-700 font-medium')}>{r.missed}</td>
                      <td className="px-3 py-2 text-right">{r.hours}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-200">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, r.utilisation)}%`, background: SERIES_1 }} />
                          </div>
                          <span className="w-10 text-right">{r.utilisation}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{r.patients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3">
                Utilisation = hours delivered ÷ (max hours per week × weeks in the period).
              </p>
            </div>
          )}
        </Card>
      );
    }

    if (report === 'revenue') {
      const hasMoney = revenue.months.some((m) => m.invoiced > 0 || m.received > 0);
      return (
        <div className="space-y-6">
          <Card title="Revenue summary">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Invoiced" value={formatGBP(revenue.invoiced)} hint={`${revenue.invoiceCount} invoices issued`} />
              <Stat label="Received" value={formatGBP(revenue.received)} tone="text-green-700" />
              <Stat label="Outstanding now" value={formatGBP(revenue.outstanding)} hint="All unpaid invoices" />
              <Stat
                label="Completed, not yet billed"
                value={unbilledQ.isLoading ? '...' : formatGBP(revenue.unbilledValue)}
                tone={revenue.unbilledValue > 0 ? 'text-orange-700' : undefined}
                hint={`${revenue.unbilledCount} visits in this period`}
              />
            </div>
          </Card>
          <Card title="Invoiced vs received per month">
            {!hasMoney ? (
              <p className="text-sm text-muted-foreground">No invoices or payments in this period.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue.months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="month" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={(v: number) => `£${v >= 1000 ? `${round1(v / 1000)}k` : v}`} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v: number, name: string) => [formatGBP(v), name]} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }} />
                    <Bar dataKey="invoiced" name="Invoiced" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="received" name="Received" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      );
    }

    const maxPlan = Math.max(1, ...patientStats.plans.map((p) => p.count));
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Active patients by care plan">
          <p className="text-sm text-muted-foreground mb-4">
            {patientStats.active} active · {patientStats.inactive} inactive
          </p>
          <div className="space-y-4">
            {patientStats.plans.map((p) => (
              <div key={p.plan}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{p.plan}</span>
                  <span className="text-gray-600">{p.count}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-200">
                  <div className="h-2 rounded-full" style={{ width: `${(p.count / maxPlan) * 100}%`, background: SERIES_1 }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Care delivered per patient" className="lg:col-span-2">
          {patientStats.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No patients yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Patient</th>
                    <th className="px-3 py-2 text-left">Care plan</th>
                    <th className="px-3 py-2 text-right">Visits completed</th>
                    <th className="px-3 py-2 text-right">Care hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {patientStats.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-medium">
                        {r.name}
                        {r.status !== 'Active' && <span className="ml-2 text-xs text-gray-500">(inactive)</span>}
                      </td>
                      <td className="px-3 py-2">{r.plan}</td>
                      <td className="px-3 py-2 text-right">{r.visits}</td>
                      <td className="px-3 py-2 text-right">{r.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  };

  return (
    <Layout title="Reports" role="admin">
      <div className="flex flex-wrap justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold">Reports</h2>
          <p className="text-gray-600 text-sm">{rangeLabel}</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={rangeId}
            onChange={(e) => setRangeId(e.target.value as RangeId)}
            className="bg-white border border-gray-300 rounded-md px-3 py-2 text-sm"
            aria-label="Date range"
          >
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <Button variant="outline" onClick={exportCsv} disabled={loading}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReport(r.id)}
            className={cn(
              'p-3 sm:p-4 rounded-lg border flex flex-col items-center text-center',
              report === r.id ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200 hover:bg-gray-50',
            )}
          >
            <r.icon className={cn('h-6 w-6', report === r.id ? 'text-white' : 'text-gray-600')} />
            <span className="mt-2 font-medium">{r.name}</span>
          </button>
        ))}
      </div>

      {renderReport()}
    </Layout>
  );
};

export default AdminReports;
