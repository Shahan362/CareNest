import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, startOfDay } from 'date-fns';
import { ChevronRight, MapPin, Search, Star } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useMyVisits } from '@/hooks/data/useCaregiverData';
import { ageFromDob, capitalize, formatVisitWhen, fullName, initials } from '@/lib/format';

/** Everyone this caregiver looks after: their primary patients and anyone they have visits with. */
const CaregiverPatients: React.FC = () => {
  const [search, setSearch] = useState('');
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    return { from: today.toISOString(), to: addDays(today, 29).toISOString() };
  }, []);
  const { data: visits, patients, isLoading, error, refetch, notLinked } = useMyVisits(range.from, range.to);

  const now = new Date();
  const nextVisit = (patientId: string) =>
    visits.find((v) => v.row.patient_id === patientId && v.end > now && (v.row.status === 'scheduled' || v.row.status === 'in_progress'));

  const q = search.trim().toLowerCase();
  const shown = patients
    .filter((p) => p.status === 'active')
    .filter((p) => !q || fullName(p).toLowerCase().includes(q) || (p.postcode ?? '').toLowerCase().includes(q));

  return (
    <Layout title="My Patients" role="caregiver">
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Search by name or postcode" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {notLinked ? (
        <NotLinkedNotice />
      ) : error ? (
        <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>
      ) : isLoading ? (
        <LoadingState />
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-lg border">
          <EmptyState
            title={q ? 'No patients match your search' : 'No patients yet'}
            description={q ? undefined : 'Patients appear here once the office assigns you to them or books you a visit.'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((p) => {
            const next = nextVisit(p.id);
            const age = ageFromDob(p.date_of_birth);
            return (
              <Link
                key={p.id}
                to={`/caregiver/patients/${p.id}`}
                className="flex items-center gap-3 rounded-lg border bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="w-11 h-11 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center flex-shrink-0">
                  {initials(p)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate flex items-center gap-1">
                    {fullName(p)}
                    {p.is_primary && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" aria-label="You are the primary caregiver" />}
                  </p>
                  <p className="text-xs text-gray-600">
                    {[age !== null && `${age} years`, `${capitalize(p.care_plan)} plan`].filter(Boolean).join(' · ')}
                  </p>
                  {p.postcode && (
                    <p className="text-xs text-gray-600 flex items-center gap-1"><MapPin className="h-3 w-3" />{p.postcode}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Next visit with you: {next ? formatVisitWhen(next.start) : 'none booked'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            );
          })}
        </div>
      )}
      {!isLoading && shown.some((p) => p.is_primary) && (
        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1">
          <Star className="h-3 w-3 text-amber-500 fill-amber-500" /> You are this patient's primary caregiver.
        </p>
      )}
    </Layout>
  );
};

export default CaregiverPatients;
