import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Check, MessageSquareText, Pencil, X } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import VisitFormDialog, { type VisitDefaults } from '@/components/admin/VisitFormDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useCaregiverRows, usePatientRows } from '@/hooks/data/useAgencyData';
import { useFeedback, useRequests, useResolveFeedback, useRespondToRequest } from '@/hooks/data/useRequests';
import { supabase } from '@/lib/supabase';
import type { CareRequestRow, FeedbackRow, VisitRow } from '@/lib/database.types';
import { formatDate, formatDateTime, formatTime, fullName } from '@/lib/format';
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KIND_STYLE,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_STYLE,
  REQUEST_TYPE_LABEL,
} from '@/lib/requests';
import { STATUS_LABEL } from '@/lib/visits';
import { cn } from '@/lib/utils';

type Filter = 'open' | 'all';

/** Visits that requests point at (they can be outside any loaded date range). */
function useVisitsById(ids: string[]) {
  return useQuery({
    queryKey: ['visits', 'byId', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('visits').select('*').in('id', ids);
      if (error) throw new Error(error.message);
      return data as VisitRow[];
    },
  });
}

// ---------- Request card ----------

const RequestCard: React.FC<{
  r: CareRequestRow;
  patientName: string;
  visit?: VisitRow;
  onEditVisit: (v: VisitRow) => void;
  onNewVisit: (d: VisitDefaults) => void;
}> = ({ r, patientName, visit, onEditVisit, onNewVisit }) => {
  const respond = useRespondToRequest();
  const [reply, setReply] = useState('');
  const pending = r.status === 'pending';

  const answer = async (status: 'approved' | 'declined') => {
    if (status === 'declined' && reply.trim().length < 5) return toast.error('Please tell the patient why you are declining.');
    try {
      await respond.mutateAsync({ id: r.id, status, response: reply });
      toast.success(status === 'approved' ? 'Request approved' : 'Request declined');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <li className={cn('bg-white rounded-lg border p-4', pending && 'border-blue-200')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{patientName}</p>
          <p className="text-sm">{REQUEST_TYPE_LABEL[r.type]}</p>
          <p className="text-xs text-gray-500">Sent {formatDateTime(r.created_at)}</p>
        </div>
        <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', REQUEST_STATUS_STYLE[r.status])}>
          {r.status === 'pending' ? 'Waiting for reply' : REQUEST_STATUS_LABEL[r.status]}
        </span>
      </div>

      {r.visit_id && (
        <p className="text-sm text-gray-700 mt-2">
          Visit:{' '}
          {visit ? (
            <>
              {format(parseISO(visit.start_time), 'EEE')} {formatDate(visit.start_time)}, {formatTime(visit.start_time)}-{formatTime(visit.end_time)}{' '}
              <span className="text-gray-500">({STATUS_LABEL[visit.status]})</span>
            </>
          ) : (
            <span className="text-gray-500">deleted</span>
          )}
        </p>
      )}
      {(r.preferred_date || r.preferred_time) && (
        <p className="text-sm text-gray-700">
          Preferred: {r.preferred_date && formatDate(r.preferred_date)} {r.preferred_time?.slice(0, 5)}
        </p>
      )}
      <p className="text-sm mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3">{r.details}</p>

      {r.admin_response && (
        <p className="text-sm mt-2"><span className="text-gray-500">Your reply:</span> {r.admin_response}</p>
      )}

      {pending && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {visit && (
              <Button size="sm" variant="outline" onClick={() => onEditVisit(visit)}>
                <Pencil className="h-4 w-4 mr-1" />Edit the visit
              </Button>
            )}
            {r.type === 'extra_visit' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNewVisit({ patientId: r.patient_id, date: r.preferred_date ?? undefined, time: r.preferred_time?.slice(0, 5) })}
              >
                <CalendarPlus className="h-4 w-4 mr-1" />Book the visit
              </Button>
            )}
          </div>
          <Textarea
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to the patient (required when declining), e.g. Done, Amira will come at 10:00 instead."
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={respond.isPending} onClick={() => answer('approved')}>
              <Check className="h-4 w-4 mr-1" />Approve
            </Button>
            <Button size="sm" variant="outline" className="text-red-700" disabled={respond.isPending} onClick={() => answer('declined')}>
              <X className="h-4 w-4 mr-1" />Decline
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Approving does not change the schedule by itself: edit or book the visit first.</p>
        </div>
      )}
    </li>
  );
};

// ---------- Feedback card ----------

const FeedbackCard: React.FC<{ f: FeedbackRow; patientName: string; carer?: string }> = ({ f, patientName, carer }) => {
  const resolve = useResolveFeedback();
  const [reply, setReply] = useState('');
  const open = f.status === 'open';

  const done = async () => {
    if (f.kind === 'complaint' && reply.trim().length < 10) {
      return toast.error('Complaints need a written reply explaining what you did.');
    }
    try {
      await resolve.mutateAsync({ id: f.id, response: reply });
      toast.success('Marked as dealt with');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <li className={cn('bg-white rounded-lg border p-4', open && f.kind === 'complaint' && 'border-amber-300')}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div>
          <p className="font-semibold">{patientName}</p>
          <p className="text-xs text-gray-500">{formatDateTime(f.created_at)}{carer && ` · about ${carer}`}</p>
        </div>
        <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', FEEDBACK_KIND_STYLE[f.kind])}>
          {FEEDBACK_KIND_LABEL[f.kind]}{!open && ' · dealt with'}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap rounded-lg bg-gray-50 p-3">{f.message}</p>
      {f.admin_response && <p className="text-sm mt-2"><span className="text-gray-500">Your reply:</span> {f.admin_response}</p>}
      {open && (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={f.kind === 'complaint' ? 'What did you find and what will you do? (required)' : 'Optional reply, e.g. Thank you, we have passed this on to Amira.'}
          />
          <Button size="sm" disabled={resolve.isPending} onClick={done}>
            <Check className="h-4 w-4 mr-1" />{f.kind === 'complaint' ? 'Reply and close' : 'Mark as dealt with'}
          </Button>
        </div>
      )}
    </li>
  );
};

// ---------- Page ----------

const AdminRequests: React.FC = () => {
  const requests = useRequests();
  const feedback = useFeedback();
  const { data: patients = [] } = usePatientRows();
  const { data: caregivers = [] } = useCaregiverRows();
  const [filter, setFilter] = useState<Filter>('open');
  const [editVisit, setEditVisit] = useState<VisitRow | null>(null);
  const [newVisit, setNewVisit] = useState<VisitDefaults | null>(null);

  const visitIds = useMemo(
    () => [...new Set((requests.data ?? []).map((r) => r.visit_id).filter(Boolean) as string[])].sort(),
    [requests.data],
  );
  const visits = useVisitsById(visitIds);
  const visitById = new Map((visits.data ?? []).map((v) => [v.id, v]));
  const patientName = (id: string) => fullName(patients.find((p) => p.id === id)) || 'Patient';
  const carerName = (id: string | null) => (id ? fullName(caregivers.find((c) => c.id === id)) : undefined);

  const reqs = (requests.data ?? []).filter((r) => filter === 'all' || r.status === 'pending');
  const fbs = (feedback.data ?? []).filter((f) => filter === 'all' || f.status === 'open');
  const openReqCount = (requests.data ?? []).filter((r) => r.status === 'pending').length;
  const openFbCount = (feedback.data ?? []).filter((f) => f.status === 'open').length;

  return (
    <Layout title="Requests & Feedback" role="admin">
      <Tabs defaultValue="requests">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="requests">Requests{openReqCount > 0 && ` (${openReqCount})`}</TabsTrigger>
            <TabsTrigger value="feedback">Feedback{openFbCount > 0 && ` (${openFbCount})`}</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button size="sm" variant={filter === 'open' ? 'default' : 'outline'} onClick={() => setFilter('open')}>Open</Button>
            <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>All</Button>
          </div>
        </div>

        <TabsContent value="requests">
          {requests.isLoading ? (
            <LoadingState />
          ) : requests.error ? (
            <div className="bg-white rounded-lg border"><ErrorState error={requests.error} onRetry={requests.refetch} /></div>
          ) : reqs.length === 0 ? (
            <div className="bg-white rounded-lg border">
              <EmptyState title={filter === 'open' ? 'No requests waiting' : 'No requests yet'} description="Patients send requests from their app: visit changes, cancellations, extra visits and more." />
            </div>
          ) : (
            <ul className="space-y-3">
              {reqs.map((r) => (
                <RequestCard
                  key={r.id}
                  r={r}
                  patientName={patientName(r.patient_id)}
                  visit={r.visit_id ? visitById.get(r.visit_id) : undefined}
                  onEditVisit={setEditVisit}
                  onNewVisit={setNewVisit}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="feedback">
          {feedback.isLoading ? (
            <LoadingState />
          ) : feedback.error ? (
            <div className="bg-white rounded-lg border"><ErrorState error={feedback.error} onRetry={feedback.refetch} /></div>
          ) : fbs.length === 0 ? (
            <div className="bg-white rounded-lg border">
              <EmptyState title={filter === 'open' ? 'Nothing to deal with' : 'No feedback yet'} description="Compliments, suggestions and complaints from patients appear here." />
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <MessageSquareText className="h-3.5 w-3.5" />
                Keep a record of every complaint and your response: CQC inspectors ask to see it.
              </p>
              <ul className="space-y-3">
                {fbs.map((f) => (
                  <FeedbackCard key={f.id} f={f} patientName={patientName(f.patient_id)} carer={carerName(f.caregiver_id)} />
                ))}
              </ul>
            </>
          )}
        </TabsContent>
      </Tabs>

      <VisitFormDialog open={!!editVisit} onOpenChange={(o) => !o && setEditVisit(null)} visit={editVisit} />
      <VisitFormDialog open={!!newVisit} onOpenChange={(o) => !o && setNewVisit(null)} defaults={newVisit ?? undefined} />
    </Layout>
  );
};

export default AdminRequests;
