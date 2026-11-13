import React from 'react';
import { Briefcase, KeyRound } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import MyAccount from '@/components/account/MyAccount';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { useAuth } from '@/contexts/AuthContext';
import { useMyCaregiver } from '@/hooks/data/useCaregiverData';
import { capitalize, formatDate } from '@/lib/format';

const Item: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-xs text-gray-500">{label}</dt>
    <dd className="font-medium">{value || <span className="text-gray-400 font-normal">Not set</span>}</dd>
  </div>
);

/** Work details are managed by the agency (read-only here); personal login details are editable. */
const CaregiverProfile: React.FC = () => {
  const { profile } = useAuth();
  const { data: me, isLoading, error, refetch } = useMyCaregiver();

  return (
    <Layout title="My Profile" role="caregiver">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white rounded-lg border p-4 h-fit">
          <h3 className="font-semibold mb-1 flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />Work details</h3>
          <p className="text-xs text-muted-foreground mb-4">Set by {profile?.agency?.name ?? 'your agency'}. Ask the office if anything is wrong.</p>
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !me ? (
            <NotLinkedNotice />
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Item label="Agency" value={profile?.agency?.name} />
              <Item label="Status" value={capitalize(me.status)} />
              <Item label="Specialty" value={me.specialty} />
              <Item label="Area" value={me.region} />
              <Item label="Contract" value={capitalize(me.availability)} />
              <Item label="Max hours / week" value={me.max_hours_per_week} />
              <Item label="Start date" value={formatDate(me.start_date)} />
            </dl>
          )}
        </section>

        <section className="lg:col-span-2 bg-white rounded-lg border p-4 sm:p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <KeyRound className="h-4 w-4" />
            Your name and phone number are shared with the office.
          </div>
          <MyAccount returnPath="/caregiver/profile" />
        </section>
      </div>
    </Layout>
  );
};

export default CaregiverProfile;
