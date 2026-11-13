import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDays, format, startOfDay } from 'date-fns';
import { ArrowLeft, Heart, MapPin, Phone } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import MyVisitCard from '@/components/caregiver/MyVisitCard';
import CareNotesList from '@/components/care/CareNotesList';
import EmergencyInfo from '@/components/caregiver/EmergencyInfo';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { useCareNotes, useMyVisits } from '@/hooks/data/useCaregiverData';
import { ageFromDob, capitalize, formatDate, fullName } from '@/lib/format';
import { mapsUrl } from '@/lib/caregiver';

/** One patient: contact details, care instructions, upcoming visits with me, and the care record. */
const CaregiverPatientDetails: React.FC = () => {
  const { patientId } = useParams();
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    return { from: today.toISOString(), to: addDays(today, 15).toISOString() };
  }, []);
  const { data: visits, patients, isLoading, error, refetch } = useMyVisits(range.from, range.to);
  const notes = useCareNotes({ patientId }, 100);

  const back = (
    <Link to="/caregiver/patients" className="inline-flex items-center text-sm text-primary font-medium mb-4 hover:underline">
      <ArrowLeft className="h-4 w-4 mr-1" /> My patients
    </Link>
  );

  if (isLoading) return <Layout title="Patient" role="caregiver">{back}<LoadingState /></Layout>;
  if (error) return <Layout title="Patient" role="caregiver">{back}<div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div></Layout>;

  const patient = patients.find((p) => p.id === patientId);
  if (!patient) {
    return (
      <Layout title="Patient" role="caregiver">
        {back}
        <div className="bg-white rounded-lg border p-8 text-center">
          <p className="font-medium">Patient not found</p>
          <p className="text-sm text-muted-foreground mt-1">You can only see patients you are assigned to.</p>
        </div>
      </Layout>
    );
  }

  const upcoming = visits.filter((v) => v.row.patient_id === patient.id && v.row.status !== 'cancelled' && v.end > new Date());
  const age = ageFromDob(patient.date_of_birth);
  const map = mapsUrl(patient.address, patient.postcode);
  const icon = 'h-4 w-4 text-primary flex-shrink-0 mt-0.5';

  return (
    <Layout title={fullName(patient)} role="caregiver">
      {back}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="bg-white rounded-lg border p-4 h-fit space-y-3 text-sm">
          <div>
            <h2 className="text-lg font-bold">{fullName(patient)}</h2>
            <p className="text-gray-600">
              {age !== null && <>{age} years · born {formatDate(patient.date_of_birth)}</>}
            </p>
          </div>
          {(patient.address || patient.postcode) && (
            <div className="flex items-start gap-2">
              <MapPin className={icon} />
              <div>
                <p>{[patient.address, patient.postcode].filter(Boolean).join(', ')}</p>
                {map && <a href={map} target="_blank" rel="noreferrer" className="text-primary font-medium hover:underline">Open in maps</a>}
              </div>
            </div>
          )}
          {patient.phone && (
            <div className="flex items-start gap-2">
              <Phone className={icon} />
              <a href={`tel:${patient.phone.replace(/\s/g, '')}`} className="text-primary font-medium hover:underline">{patient.phone}</a>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Heart className={icon} />
            <span>{capitalize(patient.care_plan)} care plan{patient.is_primary && ' · you are the primary caregiver'}</span>
          </div>
          <EmergencyInfo patient={patient} />
          {patient.notes && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-1">Care instructions from the office</p>
              <p className="whitespace-pre-wrap text-gray-800">{patient.notes}</p>
            </div>
          )}
        </aside>

        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3">Your visits in the next 2 weeks</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits booked with you.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((v) => <MyVisitCard key={v.row.id} visit={v} showDate={format(v.start, 'EEEE d MMMM')} />)}
              </div>
            )}
          </section>

          <section className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-1">Care record</h3>
            <p className="text-xs text-muted-foreground mb-3">Notes from everyone who visits this patient, newest first.</p>
            {notes.isLoading ? (
              <LoadingState />
            ) : notes.error ? (
              <ErrorState error={notes.error} onRetry={notes.refetch} />
            ) : (
              <CareNotesList notes={notes.data ?? []} />
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default CaregiverPatientDetails;
