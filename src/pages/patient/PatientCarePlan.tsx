import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { addDays, startOfDay } from 'date-fns';
import { Heart, PoundSterling, Repeat, Star, Users } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { usePatientVisits } from '@/hooks/data/usePatientData';
import { capitalize, formatGBP, formatTime } from '@/lib/format';
import { durationLabel, durationMinutes } from '@/lib/visits';
import { carerName } from '@/lib/requests';

const PLAN_TEXT: Record<string, string> = {
  basic: 'Help with everyday tasks such as meals, shopping, light housework and companionship.',
  comprehensive: 'Personal care (washing, dressing, continence) and medication support, as well as everyday help.',
  advanced: 'Higher-needs care, for example two-carer visits, complex medication, wound care or end-of-life support.',
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The patient's care: plan level, their regular weekly visits, carers, and what the office has on file. */
const PatientCarePlan: React.FC = () => {
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    return { from: today.toISOString(), to: addDays(today, 28).toISOString() };
  }, []);
  const { data: visits, patient, caregivers, isLoading, error, refetch, notLinked } = usePatientVisits(range.from, range.to);

  // Regular pattern: the same weekday, time and length at least twice in the next 4 weeks.
  const pattern = useMemo(() => {
    const map = new Map<string, { day: number; time: string; minutes: number; count: number; tasks: Set<string> }>();
    for (const v of visits) {
      if (v.row.status === 'cancelled') continue;
      const day = (v.start.getDay() + 6) % 7; // Monday = 0
      const time = formatTime(v.start);
      const minutes = durationMinutes(v.row);
      const key = `${day}-${time}-${minutes}`;
      const item = map.get(key) ?? { day, time, minutes, count: 0, tasks: new Set<string>() };
      item.count++;
      v.row.tasks.forEach((t) => item.tasks.add(t));
      map.set(key, item);
    }
    return [...map.values()].filter((p) => p.count >= 2).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  }, [visits]);

  const weeklyMinutes = pattern.reduce((sum, p) => sum + p.minutes, 0);

  const body = () => {
    if (notLinked) return <NotLinkedNotice who="patient" />;
    if (error) return <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>;
    if (isLoading || !patient) return <LoadingState />;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-lg border p-4">
            <h2 className="text-lg font-bold flex items-center gap-2"><Heart className="h-5 w-5 text-primary" />{capitalize(patient.care_plan)} care plan</h2>
            <p className="text-sm text-gray-700 mt-1">{PLAN_TEXT[patient.care_plan]}</p>
            <p className="text-sm text-gray-700 mt-3 flex items-center gap-2">
              <PoundSterling className="h-4 w-4 text-primary" />
              {formatGBP(patient.hourly_rate)} per hour of care, billed for completed visits.
            </p>
          </section>

          <section className="bg-white rounded-lg border p-4">
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Repeat className="h-5 w-5 text-primary" />Your regular visits</h2>
            <p className="text-xs text-muted-foreground mb-3">Worked out from the visits booked for the next 4 weeks.</p>
            {pattern.length === 0 ? (
              <p className="text-sm text-muted-foreground">No regular weekly visits are booked yet.</p>
            ) : (
              <>
                <div className="divide-y">
                  {pattern.map((p) => (
                    <div key={`${p.day}-${p.time}-${p.minutes}`} className="py-2.5 flex flex-wrap items-baseline gap-x-3">
                      <span className="w-28 font-medium">{WEEKDAYS[p.day]}</span>
                      <span className="w-32">{p.time} · {durationLabel(p.minutes)}</span>
                      <span className="text-sm text-gray-600">{[...p.tasks].join(', ')}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-700 mt-3">About <b>{Math.round((weeklyMinutes / 60) * 10) / 10} hours</b> of care a week.</p>
              </>
            )}
            <Link to="/patient/requests" className="inline-block mt-3 text-sm text-primary font-medium hover:underline">
              Need more or less help? Make a request
            </Link>
          </section>

          {patient.notes && (
            <section className="bg-white rounded-lg border p-4">
              <h2 className="text-lg font-bold mb-1">What the office has on file</h2>
              <p className="text-xs text-muted-foreground mb-2">Carers read this before each visit. Tell the office if anything is out of date.</p>
              <p className="whitespace-pre-wrap text-sm rounded-lg bg-amber-50 border border-amber-200 p-3">{patient.notes}</p>
            </section>
          )}
        </div>

        <aside className="bg-white rounded-lg border p-4 h-fit">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Your carers</h2>
          {caregivers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No carer assigned yet.</p>
          ) : (
            <ul className="space-y-2">
              {caregivers.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center">{c.first_name.charAt(0)}</span>
                  <span>{carerName(c)}</span>
                  {c.is_primary && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-amber-700"><Star className="h-3 w-3 fill-amber-500 text-amber-500" />Main carer</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    );
  };

  return <Layout title="Care Plan" role="patient">{body()}</Layout>;
};

export default PatientCarePlan;
