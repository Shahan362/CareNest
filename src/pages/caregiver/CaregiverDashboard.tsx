import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { addDays, endOfWeek, format, isSameDay, isToday, startOfDay, startOfWeek } from 'date-fns';
import { Calendar, CheckCircle2, Clock, PlayCircle, Timer } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import CardStat from '@/components/ui/card-stat';
import { Button } from '@/components/ui/button';
import MyVisitCard from '@/components/caregiver/MyVisitCard';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useAuth } from '@/contexts/AuthContext';
import { useMyVisits } from '@/hooks/data/useCaregiverData';
import { formatDate, formatTime } from '@/lib/format';
import { durationMinutes, isActiveVisit } from '@/lib/visits';
import { hoursLabel, workedMinutes } from '@/lib/caregiver';

const WEEK = { weekStartsOn: 1 as const };

const CaregiverDashboard: React.FC = () => {
  const { profile } = useAuth();

  // This week (Mon-Sun) plus the next 7 days, so "coming up" works on a Sunday too.
  const range = useMemo(() => {
    const now = new Date();
    return {
      from: startOfWeek(now, WEEK).toISOString(),
      to: addDays(startOfDay(now), 8).toISOString(),
    };
  }, []);
  const { data: visits, isLoading, error, refetch, notLinked } = useMyVisits(range.from, range.to);

  const now = new Date();
  const weekEnd = endOfWeek(now, WEEK);
  const today = visits.filter((v) => isToday(v.start));
  const current = visits.find((v) => v.row.status === 'in_progress');
  const nextToday = today.find((v) => v.row.status === 'scheduled');
  const thisWeek = visits.filter((v) => v.start <= weekEnd && isActiveVisit(v.row));
  const doneThisWeek = thisWeek.filter((v) => v.row.status === 'completed');
  const workedThisWeek = doneThisWeek.reduce((sum, v) => sum + workedMinutes(v.row), 0);
  const plannedThisWeek = thisWeek
    .filter((v) => v.row.status !== 'missed')
    .reduce((sum, v) => sum + durationMinutes(v.row), 0);
  const comingUp = visits
    .filter((v) => v.start > now && !isToday(v.start) && v.row.status === 'scheduled')
    .slice(0, 5);

  const todayLeft = today.filter((v) => v.row.status === 'scheduled' || v.row.status === 'in_progress').length;
  const firstName = profile?.first_name || 'there';

  const body = () => {
    if (notLinked) return <NotLinkedNotice />;
    if (error) return <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>;
    if (isLoading) return <LoadingState />;

    return (
      <>
        {current ? (
          <div className="mb-6 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <PlayCircle className="h-8 w-8 text-yellow-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">You are checked in with {current.patientName}</p>
              <p className="text-sm text-gray-700">
                Since {current.row.checked_in_at ? formatTime(current.row.checked_in_at) : formatTime(current.start)} · planned until {formatTime(current.end)}
              </p>
            </div>
            <Button asChild>
              <Link to={`/caregiver/visits/${current.row.id}`}>Open visit and check out</Link>
            </Button>
          </div>
        ) : nextToday ? (
          <div className="mb-6 rounded-lg bg-primary p-5 text-white flex flex-col sm:flex-row sm:items-center gap-3">
            <Clock className="h-8 w-8 flex-shrink-0 opacity-90" />
            <div className="flex-1">
              <p className="text-sm opacity-90">Next visit</p>
              <p className="text-lg font-semibold">
                {formatTime(nextToday.start)} · {nextToday.patientName}
              </p>
              {nextToday.patient?.postcode && <p className="text-sm opacity-90">{nextToday.patient.postcode}</p>}
            </div>
            <Button className="bg-white text-primary hover:bg-white/90" asChild>
              <Link to={`/caregiver/visits/${nextToday.row.id}`}>Open visit</Link>
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardStat title="Visits left today" value={todayLeft} icon={<Calendar className="h-5 w-5" />} />
          <CardStat title="Completed this week" value={`${doneThisWeek.length}/${thisWeek.length}`} icon={<CheckCircle2 className="h-5 w-5" />} />
          <CardStat title="Hours worked this week" value={hoursLabel(workedThisWeek)} icon={<Timer className="h-5 w-5" />} />
          <CardStat title="Hours planned this week" value={hoursLabel(plannedThisWeek)} icon={<Clock className="h-5 w-5" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <h2 className="text-lg font-bold mb-3">Today · {format(now, 'EEEE d MMMM')}</h2>
            {today.length === 0 ? (
              <EmptyState title="No visits today" description="Enjoy your day off. Check your schedule for the rest of the week." />
            ) : (
              <div className="space-y-2">
                {today.map((v) => <MyVisitCard key={v.row.id} visit={v} />)}
              </div>
            )}
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Coming up</h2>
              <Link to="/caregiver/schedule" className="text-sm text-primary font-medium hover:underline">Full schedule</Link>
            </div>
            {comingUp.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other visits in the next 7 days.</p>
            ) : (
              <div className="space-y-2">
                {comingUp.map((v) => (
                  <MyVisitCard
                    key={v.row.id}
                    visit={v}
                    showDate={isSameDay(v.start, addDays(now, 1)) ? 'Tomorrow' : `${format(v.start, 'EEEE')} ${formatDate(v.start)}`}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </>
    );
  };

  return (
    <Layout title="Home" role="caregiver">
      <h2 className="text-xl font-bold mb-4">Hello, {firstName}</h2>
      {body()}
    </Layout>
  );
};

export default CaregiverDashboard;
