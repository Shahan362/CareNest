import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, isToday, isTomorrow, startOfDay } from 'date-fns';
import { Calendar, Clock, MessageSquarePlus, PoundSterling, Send, UserCheck } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import CardStat from '@/components/ui/card-stat';
import { Button } from '@/components/ui/button';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import RequestFormDialog from '@/components/patient/RequestFormDialog';
import PatientVisitDialog from '@/components/patient/PatientVisitDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useAuth } from '@/contexts/AuthContext';
import { usePatientVisits, type PatientVisit } from '@/hooks/data/usePatientData';
import { useRequests } from '@/hooks/data/useRequests';
import { useInvoices } from '@/hooks/data/useBilling';
import { displayStatus } from '@/lib/billing';
import { formatDate, formatGBP, formatTime } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE } from '@/lib/visits';
import { cn } from '@/lib/utils';

const dayLabel = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : `${format(d, 'EEEE')} ${formatDate(d)}`);

const PatientDashboard: React.FC = () => {
  const { profile } = useAuth();
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    return { from: addDays(today, -7).toISOString(), to: addDays(today, 8).toISOString() };
  }, []);
  const { data: visits, patient, isLoading, error, refetch, notLinked } = usePatientVisits(range.from, range.to);
  const requests = useRequests();
  const invoices = useInvoices();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestVisit, setRequestVisit] = useState<string | null>(null);
  const [details, setDetails] = useState<PatientVisit | null>(null);

  const now = new Date();
  const upcoming = visits.filter((v) => v.end > now && (v.row.status === 'scheduled' || v.row.status === 'in_progress'));
  const current = upcoming.find((v) => v.row.status === 'in_progress');
  const next = current ?? upcoming[0];
  const recent = visits.filter((v) => v.end <= now || v.row.status === 'completed').reverse().slice(0, 4);
  const openRequests = (requests.data ?? []).filter((r) => r.status === 'pending').length;
  const balance = (invoices.data ?? [])
    .filter((i) => i.status === 'sent' || i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.balance), 0);
  const overdue = (invoices.data ?? []).some((i) => displayStatus(i) === 'overdue');

  const openRequest = (visitId: string | null) => {
    setDetails(null);
    setRequestVisit(visitId);
    setRequestOpen(true);
  };

  const body = () => {
    if (notLinked) return <NotLinkedNotice who="patient" />;
    if (error) return <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>;
    if (isLoading || !patient) return <LoadingState />;

    return (
      <>
        {next ? (
          <div
            className={cn(
              'mb-6 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center gap-3',
              current ? 'border-2 border-yellow-300 bg-yellow-50' : 'bg-primary text-white',
            )}
          >
            <Clock className="h-8 w-8 flex-shrink-0 opacity-90" />
            <div className="flex-1">
              <p className={cn('text-sm', !current && 'opacity-90')}>{current ? 'Your carer is with you now' : 'Next visit'}</p>
              <p className="text-lg font-semibold">
                {dayLabel(next.start)}, {formatTime(next.start)}-{formatTime(next.end)}
              </p>
              <p className={cn('text-sm', !current && 'opacity-90')}>
                <UserCheck className="inline h-4 w-4 mr-1" />
                {next.carer}
                {next.row.tasks.length > 0 && ` · ${next.row.tasks.join(', ')}`}
              </p>
            </div>
            <Button
              variant={current ? 'default' : 'secondary'}
              className={cn(!current && 'bg-white text-primary hover:bg-white/90')}
              onClick={() => setDetails(next)}
            >
              Details
            </Button>
          </div>
        ) : (
          <div className="mb-6 bg-white rounded-lg border">
            <EmptyState title="No visits booked in the next week" description="If you expected a visit, please contact the office." />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <CardStat title="Visits in the next 7 days" value={upcoming.length} icon={<Calendar className="h-5 w-5" />} />
          <Link to="/patient/requests" className="block">
            <CardStat title="Requests waiting for a reply" value={requests.isLoading ? '-' : openRequests} icon={<Send className="h-5 w-5" />} className="h-full hover:border-primary/40" />
          </Link>
          <Link to="/patient/invoices" className="block">
            <CardStat
              title={overdue ? 'To pay (overdue)' : 'To pay'}
              value={invoices.isLoading ? '-' : formatGBP(balance)}
              icon={<PoundSterling className="h-5 w-5" />}
              className={cn('h-full hover:border-primary/40', overdue && 'border-red-300 bg-red-50')}
            />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Coming up</h2>
              <Link to="/patient/visits" className="text-sm text-primary font-medium hover:underline">All visits</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing booked in the next 7 days.</p>
            ) : (
              <div className="divide-y">
                {upcoming.slice(0, 7).map((v) => (
                  <button key={v.row.id} type="button" onClick={() => setDetails(v)} className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-gray-50 px-1 rounded">
                    <div className="w-28 flex-shrink-0">
                      <p className="text-sm font-medium">{dayLabel(v.start)}</p>
                      <p className="text-xs text-gray-500">{formatTime(v.start)}-{formatTime(v.end)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{v.carer}</p>
                      <p className="text-xs text-gray-500 truncate">{v.row.tasks.join(', ')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="bg-white rounded-lg border p-4">
              <h2 className="text-lg font-bold mb-3">Need something?</h2>
              <div className="space-y-2">
                <Button className="w-full justify-start" onClick={() => openRequest(null)}>
                  <Send className="h-4 w-4 mr-2" />Make a request
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/patient/feedback"><MessageSquarePlus className="h-4 w-4 mr-2" />Give feedback</Link>
                </Button>
              </div>
            </section>

            <section className="bg-white rounded-lg border p-4">
              <h2 className="text-lg font-bold mb-3">Recent visits</h2>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visits in the last week.</p>
              ) : (
                <div className="space-y-2">
                  {recent.map((v) => (
                    <button key={v.row.id} type="button" onClick={() => setDetails(v)} className="w-full text-left flex items-center justify-between gap-2 rounded-lg border p-2.5 hover:bg-gray-50">
                      <span className="text-sm">
                        {dayLabel(v.start)}, {formatTime(v.start)}
                        <span className="block text-xs text-gray-500">{v.carer}</span>
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_STYLE[v.row.status])}>
                        {STATUS_LABEL[v.row.status]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <RequestFormDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          patientId={patient.id}
          upcoming={upcoming.filter((v) => v.row.status === 'scheduled')}
          initialVisitId={requestVisit}
        />
      </>
    );
  };

  return (
    <Layout title="Home" role="patient">
      <h2 className="text-xl font-bold mb-4">Hello, {profile?.first_name || 'there'}</h2>
      {body()}
      <PatientVisitDialog visit={details} onOpenChange={(o) => !o && setDetails(null)} onRequestChange={(v) => openRequest(v.row.id)} />
    </Layout>
  );
};

export default PatientDashboard;
