import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { addDays, format, startOfDay } from 'date-fns';
import { Plus } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import RequestFormDialog from '@/components/patient/RequestFormDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { usePatientVisits } from '@/hooks/data/usePatientData';
import { useRequests, useWithdrawRequest } from '@/hooks/data/useRequests';
import type { CareRequestRow } from '@/lib/database.types';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_STYLE, REQUEST_TYPE_LABEL } from '@/lib/requests';
import { cn } from '@/lib/utils';

/** Requests to the office: change or cancel a visit, extra visit, change carer or care. */
const PatientRequests: React.FC = () => {
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    return { from: addDays(today, -60).toISOString(), to: addDays(today, 43).toISOString() };
  }, []);
  const { data: visits, patient, isLoading, error, refetch, notLinked } = usePatientVisits(range.from, range.to);
  const requests = useRequests();
  const withdraw = useWithdrawRequest();
  const [open, setOpen] = useState(false);

  const now = new Date();
  const upcoming = visits.filter((v) => v.start > now && v.row.status === 'scheduled');
  const visitById = new Map(visits.map((v) => [v.row.id, v]));
  const all = requests.data ?? [];
  const openOnes = all.filter((r) => r.status === 'pending');
  const closed = all.filter((r) => r.status !== 'pending');

  const doWithdraw = async (r: CareRequestRow) => {
    if (!window.confirm('Withdraw this request?')) return;
    try {
      await withdraw.mutateAsync(r.id);
      toast.success('Request withdrawn');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const card = (r: CareRequestRow) => {
    const v = r.visit_id ? visitById.get(r.visit_id) : undefined;
    return (
      <li key={r.id} className="bg-white rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{REQUEST_TYPE_LABEL[r.type]}</p>
            <p className="text-xs text-gray-500">Sent {formatDateTime(r.created_at)}</p>
          </div>
          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', REQUEST_STATUS_STYLE[r.status])}>
            {REQUEST_STATUS_LABEL[r.status]}
          </span>
        </div>
        {v && (
          <p className="text-sm text-gray-700 mt-2">
            Visit: {format(v.start, 'EEEE')} {formatDate(v.start)}, {formatTime(v.start)}-{formatTime(v.end)}
          </p>
        )}
        {(r.preferred_date || r.preferred_time) && (
          <p className="text-sm text-gray-700">
            Preferred: {r.preferred_date && formatDate(r.preferred_date)} {r.preferred_time?.slice(0, 5)}
          </p>
        )}
        <p className="text-sm mt-2 whitespace-pre-wrap">{r.details}</p>
        {r.admin_response && (
          <div className="mt-3 rounded-lg bg-gray-50 border p-3 text-sm">
            <p className="text-xs font-semibold text-gray-600 mb-1">
              Reply from the office{r.responded_at && ` · ${formatDateTime(r.responded_at)}`}
            </p>
            <p className="whitespace-pre-wrap">{r.admin_response}</p>
          </div>
        )}
        {r.status === 'pending' && (
          <Button variant="ghost" size="sm" className="mt-2 text-red-700" disabled={withdraw.isPending} onClick={() => doWithdraw(r)}>
            Withdraw
          </Button>
        )}
      </li>
    );
  };

  const loading = isLoading || requests.isLoading;
  const err = error ?? requests.error;

  return (
    <Layout title="Requests" role="patient">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">Ask the office to change your visits or care. You'll see their reply here.</p>
        <Button onClick={() => setOpen(true)} disabled={!patient}>
          <Plus className="h-4 w-4 mr-2" />New request
        </Button>
      </div>

      {notLinked ? (
        <NotLinkedNotice who="patient" />
      ) : err ? (
        <div className="bg-white rounded-lg border"><ErrorState error={err} onRetry={() => { refetch(); requests.refetch(); }} /></div>
      ) : loading ? (
        <LoadingState />
      ) : all.length === 0 ? (
        <div className="bg-white rounded-lg border">
          <EmptyState title="No requests yet" description="Need to move a visit, book an extra one or change your carer? Send a request." />
        </div>
      ) : (
        <div className="space-y-6">
          {openOnes.length > 0 && (
            <section>
              <h2 className="font-semibold mb-2">Waiting for a reply</h2>
              <ul className="space-y-3">{openOnes.map(card)}</ul>
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="font-semibold mb-2">Answered</h2>
              <ul className="space-y-3">{closed.map(card)}</ul>
            </section>
          )}
        </div>
      )}

      {patient && (
        <RequestFormDialog open={open} onOpenChange={setOpen} patientId={patient.id} upcoming={upcoming} />
      )}
    </Layout>
  );
};

export default PatientRequests;
