import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, formatDistanceToNow, isToday, parseISO, startOfDay } from 'date-fns';
import { AlertTriangle, Calendar, CheckCircle2, ChevronRight, Clock, File, Send, User, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import CardStat from '@/components/ui/card-stat';
import { Button } from '@/components/ui/button';
import VisitFormDialog from '@/components/admin/VisitFormDialog';
import VisitDetailsDialog from '@/components/admin/VisitDetailsDialog';
import PatientFormDialog from '@/components/admin/PatientFormDialog';
import CaregiverSuggestionsModal from '@/components/admin/scheduler/CaregiverSuggestionsModal';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useAdminVisits, type VisitView } from '@/hooks/useAdminViews';
import { useUnassignedVisits } from '@/hooks/data/useAgencyData';
import { useOpenConcerns, useResolveConcern } from '@/hooks/data/useCaregiverData';
import { useFeedback, useRequests } from '@/hooks/data/useRequests';
import { isLate } from '@/lib/caregiver';
import { formatDateTime, formatTime, formatVisitWhen, fullName } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE, isActiveVisit } from '@/lib/visits';
import { cn } from '@/lib/utils';

interface Activity {
  id: string;
  at: Date;
  color: string;
  text: React.ReactNode;
}

const AdminDashboard: React.FC = () => {
  // Load the last 7 days (for recent activity) through the next 7 days (for upcoming visits).
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    return { from: addDays(today, -7).toISOString(), to: addDays(today, 8).toISOString() };
  }, []);
  const { visits, patients, caregivers, isLoading, error, refetch } = useAdminVisits(range.from, range.to);
  const unassigned = useUnassignedVisits();
  const concerns = useOpenConcerns();
  const resolve = useResolveConcern();
  const requests = useRequests();
  const feedback = useFeedback();
  const openRequests = (requests.data ?? []).filter((r) => r.status === 'pending').length;
  const openComplaints = (feedback.data ?? []).filter((f) => f.status === 'open' && f.kind === 'complaint').length;
  const openOtherFeedback = (feedback.data ?? []).filter((f) => f.status === 'open' && f.kind !== 'complaint').length;

  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisitView | null>(null);
  const [patientFormOpen, setPatientFormOpen] = useState(false);
  const [details, setDetails] = useState<VisitView | null>(null);
  const [suggestFor, setSuggestFor] = useState<VisitView | null>(null);

  const now = new Date();
  const todays = visits.filter((v) => isToday(v.start)).sort((a, b) => a.start.getTime() - b.start.getTime());
  const todaysActive = todays.filter((v) => isActiveVisit(v.row));
  const todaysDone = todays.filter((v) => v.row.status === 'completed').length;
  const upcoming = visits
    .filter((v) => v.start > now && !isToday(v.start) && v.row.status === 'scheduled')
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 5);

  const lateVisits = todays.filter((v) => v.row.caregiver_id && isLate(v.row, now));
  const patientName = (id: string) => {
    const p = patients.find((x) => x.id === id);
    return p ? fullName(p) : 'Patient';
  };

  const resolveConcern = async (id: string) => {
    try {
      await resolve.mutateAsync(id);
      toast.success('Concern marked as resolved');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const activePatients = patients.filter((p) => p.status === 'active').length;
  const activeCaregivers = caregivers.filter((c) => c.status === 'active').length;

  // Recent activity is built from what's in the database: completed/missed visits and new records.
  const activity = useMemo<Activity[]>(() => {
    const items: Activity[] = [];
    const weekAgo = addDays(new Date(), -7);
    for (const v of visits) {
      if (v.end > new Date()) continue;
      if (v.row.status === 'completed') {
        items.push({
          id: `v-${v.row.id}`,
          at: v.end,
          color: 'bg-green-500',
          text: <><span className="font-medium">{v.caregiverName ?? 'A caregiver'}</span> completed a visit with <span className="font-medium">{v.patientName}</span></>,
        });
      } else if (v.row.status === 'missed') {
        items.push({
          id: `v-${v.row.id}`,
          at: v.end,
          color: 'bg-red-500',
          text: <>Visit with <span className="font-medium">{v.patientName}</span> was missed</>,
        });
      }
    }
    for (const p of patients) {
      const at = parseISO(p.created_at);
      if (at < weekAgo) continue;
      items.push({
        id: `p-${p.id}`,
        at,
        color: 'bg-blue-500',
        text: <>New patient <span className="font-medium">{fullName(p)}</span> {p.user_id ? 'signed up' : 'added'}</>,
      });
    }
    for (const c of caregivers) {
      const at = parseISO(c.created_at);
      if (at < weekAgo) continue;
      items.push({
        id: `c-${c.id}`,
        at,
        color: 'bg-purple-500',
        text: <>New caregiver <span className="font-medium">{fullName(c)}</span> {c.user_id ? 'signed up' : 'added'}</>,
      });
    }
    return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 6);
  }, [visits, patients, caregivers]);

  const openEdit = (v: VisitView) => {
    setDetails(null);
    setEditing(v);
    setVisitFormOpen(true);
  };

  if (error) {
    return (
      <Layout title="Dashboard" role="admin">
        <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>
      </Layout>
    );
  }

  const unassignedCount = unassigned.data?.length ?? 0;

  return (
    <Layout title="Dashboard" role="admin">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <CardStat title="Active Patients" value={isLoading ? '-' : activePatients} icon={<User className="h-5 w-5" />} />
        <CardStat title="Active Caregivers" value={isLoading ? '-' : activeCaregivers} icon={<Users className="h-5 w-5" />} />
        <CardStat
          title="Today's Visits"
          value={isLoading ? '-' : `${todaysDone}/${todaysActive.length} done`}
          icon={<Calendar className="h-5 w-5" />}
        />
        <Link to="/admin/scheduler" className="block">
          <CardStat
            title="Unassigned Visits"
            value={unassigned.isLoading ? '-' : unassignedCount}
            icon={<AlertTriangle className="h-5 w-5" />}
            className={cn('h-full hover:border-primary/40', unassignedCount > 0 && 'border-orange-300 bg-orange-50')}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                Today's Schedule
                {lateVisits.length > 0 && (
                  <span className="ml-2 text-sm font-medium text-red-700">{lateVisits.length} late</span>
                )}
              </h2>
              <Link to="/admin/calendar" className="text-sm text-primary font-medium hover:underline">
                View Full Calendar
              </Link>
            </div>

            {isLoading ? (
              <LoadingState />
            ) : todays.length === 0 ? (
              <EmptyState
                title="No visits today"
                action={<Button size="sm" onClick={() => { setEditing(null); setVisitFormOpen(true); }}>Schedule a visit</Button>}
              />
            ) : (
              <div className="space-y-3">
                {todays.map((v) => (
                  <button
                    key={v.row.id}
                    type="button"
                    onClick={() => setDetails(v)}
                    className={cn(
                      'w-full text-left flex items-center p-3 border-l-4 rounded-r-lg hover:shadow-sm',
                      v.row.caregiver_id ? 'border-primary bg-blue-50' : 'border-orange-400 bg-orange-50',
                      v.row.status === 'cancelled' && 'opacity-60',
                    )}
                  >
                    <Clock className="h-7 w-7 text-primary flex-shrink-0 mr-3" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {formatTime(v.start)}-{formatTime(v.end)} · {v.patientName}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        Caregiver: {v.caregiverName ?? <span className="text-orange-700 font-medium">Unassigned</span>}
                      </p>
                    </div>
                    {v.row.caregiver_id && isLate(v.row, now) && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap bg-red-100 text-red-800 border-red-200">
                        Late
                      </span>
                    )}
                    <span className={cn('ml-2 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap', STATUS_STYLE[v.row.status])}>
                      {STATUS_LABEL[v.row.status]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <h2 className="text-lg font-bold mb-4">Recent Activity</h2>
            {isLoading ? (
              <LoadingState />
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in the last 7 days yet.</p>
            ) : (
              <div className="space-y-4">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start">
                    <div className={cn('flex-shrink-0 mr-3 mt-1.5 w-2 h-2 rounded-full', a.color)} />
                    <div>
                      <p className="text-sm">{a.text}</p>
                      <p className="text-xs text-gray-500">{formatDistanceToNow(a.at, { addSuffix: true })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Link
            to="/admin/requests"
            className={cn(
              'block bg-white rounded-lg shadow-sm border p-4 hover:shadow',
              openRequests + openComplaints > 0 ? 'border-blue-300' : 'border-gray-100',
            )}
          >
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Patient requests
              <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
            </h2>
            {requests.isLoading || feedback.isLoading ? (
              <p className="text-sm text-muted-foreground mt-1">Loading...</p>
            ) : openRequests + openComplaints + openOtherFeedback === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">Nothing waiting.</p>
            ) : (
              <ul className="text-sm mt-2 space-y-0.5">
                {openRequests > 0 && <li><b>{openRequests}</b> {openRequests === 1 ? 'request' : 'requests'} waiting for a reply</li>}
                {openComplaints > 0 && <li className="text-amber-800"><b>{openComplaints}</b> open {openComplaints === 1 ? 'complaint' : 'complaints'}</li>}
                {openOtherFeedback > 0 && <li><b>{openOtherFeedback}</b> new compliments / suggestions</li>}
              </ul>
            )}
          </Link>

          <div
            className={cn(
              'bg-white rounded-lg shadow-sm border p-4',
              (concerns.data?.length ?? 0) > 0 ? 'border-amber-300' : 'border-gray-100',
            )}
          >
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Concerns from caregivers
              {(concerns.data?.length ?? 0) > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-2 text-sm text-amber-900">{concerns.data!.length}</span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mb-3">Raised at check-out or when a visit couldn't go ahead.</p>
            {concerns.isLoading ? (
              <LoadingState />
            ) : concerns.error ? (
              <ErrorState error={concerns.error} onRetry={concerns.refetch} />
            ) : concerns.data!.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open concerns.</p>
            ) : (
              <ul className="space-y-3">
                {concerns.data!.map((n) => (
                  <li key={n.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="font-medium">{patientName(n.patient_id)}</p>
                    <p className="text-xs text-gray-600 mb-1">{n.author_name} · {formatDateTime(n.created_at)}</p>
                    <p className="whitespace-pre-wrap text-gray-800 line-clamp-4">{n.body}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 bg-white"
                      disabled={resolve.isPending}
                      onClick={() => resolveConcern(n.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Mark resolved
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Button className="w-full justify-start" onClick={() => { setEditing(null); setVisitFormOpen(true); }}>
                <Calendar className="h-5 w-5 mr-2" />
                Schedule New Visit
              </Button>
              <Button className="w-full justify-start bg-secondary text-white hover:bg-secondary/90" onClick={() => setPatientFormOpen(true)}>
                <UserPlus className="h-5 w-5 mr-2" />
                Add New Patient
              </Button>
              <Button className="w-full justify-start bg-accent text-secondary hover:bg-accent/90" asChild>
                <Link to="/admin/reports">
                  <File className="h-5 w-5 mr-2" />
                  Generate Report
                </Link>
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Upcoming Visits</h2>
              <Link to="/admin/calendar" className="text-sm text-primary font-medium hover:underline">View All</Link>
            </div>
            {isLoading ? (
              <LoadingState />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits in the next 7 days.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((v) => (
                  <button
                    key={v.row.id}
                    type="button"
                    onClick={() => setDetails(v)}
                    className="w-full text-left p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <p className="text-sm font-medium">{formatVisitWhen(v.start)}</p>
                    <p className="text-sm">{v.patientName}</p>
                    <p className="text-xs text-gray-500">
                      {v.caregiverName ?? <span className="text-orange-700">Unassigned</span>}
                      {v.row.tasks.length > 0 && ` · ${v.row.tasks.slice(0, 3).join(', ')}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <VisitFormDialog open={visitFormOpen} onOpenChange={setVisitFormOpen} visit={editing?.row} />
      <PatientFormDialog open={patientFormOpen} onOpenChange={setPatientFormOpen} />
      <VisitDetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        visit={details}
        onEdit={openEdit}
        onFindCaregiver={(v) => {
          setDetails(null);
          setSuggestFor(v);
        }}
      />
      <CaregiverSuggestionsModal isOpen={!!suggestFor} onClose={() => setSuggestFor(null)} visit={suggestFor} />
    </Layout>
  );
};

export default AdminDashboard;
