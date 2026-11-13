import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HeartPulse, Home, KeyRound } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import MyAccount from '@/components/account/MyAccount';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { useAuth } from '@/contexts/AuthContext';
import { useMyPatient, useUpdateMyContacts } from '@/hooks/data/usePatientData';
import type { PatientRow } from '@/lib/database.types';
import { ageFromDob, formatDate } from '@/lib/format';

const PHONE = /^\+?[0-9\s()-]{7,20}$/;

/** Emergency contact and GP: carers see these, so the patient or family can keep them up to date. */
const ContactsForm: React.FC<{ patient: PatientRow }> = ({ patient }) => {
  const save = useUpdateMyContacts();
  const initial = {
    emergency_contact_name: patient.emergency_contact_name ?? '',
    emergency_contact_relation: patient.emergency_contact_relation ?? '',
    emergency_contact_phone: patient.emergency_contact_phone ?? '',
    gp_practice: patient.gp_practice ?? '',
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setV(initial), [patient]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (v.emergency_contact_phone && !PHONE.test(v.emergency_contact_phone.trim())) return setError('Please enter a valid phone number.');
    if (v.emergency_contact_name.trim() && !v.emergency_contact_phone.trim()) return setError('Please add a phone number for the emergency contact.');
    try {
      await save.mutateAsync(v);
      toast.success('Saved. Your carers will see the new details.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const field = (key: keyof typeof v, label: string, placeholder: string, type = 'text') => (
    <div>
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type={type} placeholder={placeholder} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid sm:grid-cols-2 gap-3">
        {field('emergency_contact_name', 'Emergency contact / next of kin', 'e.g. Sarah Ellis')}
        {field('emergency_contact_relation', 'Relationship', 'e.g. Daughter')}
        {field('emergency_contact_phone', 'Their phone number', 'e.g. 07700 900123', 'tel')}
        {field('gp_practice', 'GP practice', 'e.g. Highgate Group Practice')}
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving...' : 'Save'}</Button>
    </form>
  );
};

const PatientProfile: React.FC = () => {
  const { profile } = useAuth();
  const { data: patient, isLoading, error, refetch } = useMyPatient();
  const age = ageFromDob(patient?.date_of_birth);

  return (
    <Layout title="My Profile" role="patient">
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>
      ) : !patient ? (
        <NotLinkedNotice who="patient" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <section className="bg-white rounded-lg border p-4 text-sm">
              <h3 className="font-semibold mb-1 flex items-center gap-2"><Home className="h-4 w-4 text-primary" />Home address</h3>
              <p className="text-xs text-muted-foreground mb-3">Moving or going into hospital? Tell {profile?.agency?.name ?? 'the office'} so they can update your visits.</p>
              <p>{patient.address || <span className="text-gray-400">No address on file</span>}</p>
              <p>{patient.postcode}</p>
              {patient.date_of_birth && <p className="mt-3 text-gray-600">Born {formatDate(patient.date_of_birth)}{age !== null && ` (${age})`}</p>}
            </section>

            <section className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-1 flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" />Emergency contact and GP</h3>
              <p className="text-xs text-muted-foreground mb-3">Your carers can see these in case of an emergency.</p>
              <ContactsForm patient={patient} />
            </section>
          </div>

          <section className="lg:col-span-2 bg-white rounded-lg border p-4 sm:p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <KeyRound className="h-4 w-4" />
              Your login details. A family member who manages care for you can use this account.
            </div>
            <MyAccount returnPath="/patient/profile" />
          </section>
        </div>
      )}
    </Layout>
  );
};

export default PatientProfile;
