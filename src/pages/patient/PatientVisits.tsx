import React, { useMemo, useState } from 'react';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import RequestFormDialog from '@/components/patient/RequestFormDialog';
import PatientVisitDialog from '@/components/patient/PatientVisitDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { usePatientVisits, type PatientVisit } from '@/hooks/data/usePatientData';
import { formatTime } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE } from '@/lib/visits';
import { cn } from '@/lib/utils';

type Tab = 'upcoming' | 'past';

/** Upcoming visits (next 4 weeks) and past visits (last 8 weeks, more on request). */
const PatientVisits: React.FC = () => {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [pastWeeks, setPastWeeks] = useState(8);
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    return { from: subDays(today, pastWeeks * 7).toISOString(), to: addDays(today, 29).toISOString() };
  }, [pastWeeks]);
  const { data: visits, patient, isLoading, error, refetch, notLinked } = usePatientVisits(range.from, range.to);
  const [details, setDetails] = useState<PatientVisit | null>(null);
  const [requestVisit, setRequestVisit] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const now = new Date();
  const upcoming = visits.filter((v) => v.end > now && v.row.status !== 'completed' && v.row.status !== 'missed');
  const past = visits.filter((v) => !upcoming.includes(v)).reverse();
  const shown = tab === 'upcoming' ? upcoming : past;

  // Group by day for easy reading.
  const groups = useMemo(() => {
    const map = new Map<string, PatientVisit[]>();
    for (const v of shown) {
      const key = format(v.start, 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <Layout title="My Visits" role="patient">
      <div className="flex gap-2 mb-4">
        <Button variant={tab === 'upcoming' ? 'default' : 'outline'} onClick={() => setTab('upcoming')}>Upcoming</Button>
        <Button variant={tab === 'past' ? 'default' : 'outline'} onClick={() => setTab('past')}>Past</Button>
      </div>

      {notLinked ? (
        <NotLinkedNotice who="patient" />
      ) : error ? (
        <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>
      ) : isLoading ? (
        <LoadingState />
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-lg border">
          <EmptyState title={tab === 'upcoming' ? 'No visits booked in the next 4 weeks' : `No visits in the last ${pastWeeks} weeks`} />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([key, dayVisits]) => (
            <section key={key} className="bg-white rounded-lg border p-3 sm:p-4">
              <h3 className="font-semibold mb-2">{format(dayVisits[0].start, 'EEEE d MMMM yyyy')}</h3>
              <div className="space-y-2">
                {dayVisits.map((v) => (
                  <button
                    key={v.row.id}
                    type="button"
                    onClick={() => setDetails(v)}
                    className={cn(
                      'w-full text-left flex items-center gap-3 rounded-lg border p-3 hover:bg-gray-50',
                      v.row.status === 'cancelled' && 'opacity-60',
                    )}
                  >
                    <div className="w-24 flex-shrink-0 font-medium">{formatTime(v.start)}-{formatTime(v.end)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{v.carer}</p>
                      <p className="text-xs text-gray-500 truncate">{v.row.tasks.join(', ')}</p>
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap', STATUS_STYLE[v.row.status])}>
                      {STATUS_LABEL[v.row.status]}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'past' && !isLoading && !error && !notLinked && (
        <div className="text-center mt-4">
          <Button variant="outline" onClick={() => setPastWeeks((w) => w + 8)}>Show older visits</Button>
        </div>
      )}

      <PatientVisitDialog
        visit={details}
        onOpenChange={(o) => !o && setDetails(null)}
        onRequestChange={(v) => {
          setDetails(null);
          setRequestVisit(v.row.id);
          setRequestOpen(true);
        }}
      />
      {patient && (
        <RequestFormDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          patientId={patient.id}
          upcoming={upcoming.filter((v) => v.row.status === 'scheduled')}
          initialVisitId={requestVisit}
        />
      )}
    </Layout>
  );
};

export default PatientVisits;
