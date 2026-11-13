import React, { useMemo, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, isToday, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import MyVisitCard from '@/components/caregiver/MyVisitCard';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { useMyVisits } from '@/hooks/data/useCaregiverData';
import { formatDate } from '@/lib/format';
import { durationMinutes, isActiveVisit } from '@/lib/visits';
import { hoursLabel } from '@/lib/caregiver';
import { cn } from '@/lib/utils';

/** The caregiver's week (Monday first). Each day lists its visits; tap one to open it. */
const CaregiverSchedule: React.FC = () => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const { data: visits, isLoading, error, refetch, notLinked } = useMyVisits(
    weekStart.toISOString(),
    addDays(weekStart, 7).toISOString(),
  );

  const planned = visits
    .filter((v) => isActiveVisit(v.row) && v.row.status !== 'missed')
    .reduce((sum, v) => sum + durationMinutes(v.row), 0);
  const count = visits.filter((v) => isActiveVisit(v.row)).length;
  const isThisWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <Layout title="Schedule" role="caregiver">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold">
            {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
          </h2>
          {!isLoading && !error && !notLinked && (
            <p className="text-sm text-muted-foreground">
              {count} {count === 1 ? 'visit' : 'visits'} · {hoursLabel(planned)} planned
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            disabled={isThisWeek}
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            This week
          </Button>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {notLinked ? (
        <NotLinkedNotice />
      ) : error ? (
        <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const dayVisits = visits.filter((v) => isSameDay(v.start, day));
            return (
              <section
                key={day.toISOString()}
                className={cn('bg-white rounded-lg border p-3 sm:p-4', isToday(day) && 'ring-2 ring-primary/40')}
              >
                <h3 className={cn('font-semibold mb-2', isToday(day) && 'text-primary')}>
                  {format(day, 'EEEE d MMMM')}
                  {isToday(day) && <span className="ml-2 text-xs font-medium">Today</span>}
                </h3>
                {dayVisits.length === 0 ? (
                  <p className="text-sm text-gray-400">No visits</p>
                ) : (
                  <div className="space-y-2">
                    {dayVisits.map((v) => <MyVisitCard key={v.row.id} visit={v} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Layout>
  );
};

export default CaregiverSchedule;
