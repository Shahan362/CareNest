import React from 'react';
import { Phone } from 'lucide-react';
import { useAgency } from '@/hooks/data/useBilling';

/** Reminder above the caregiver / patient chat: messages are not for emergencies. */
const OfficeContactNote: React.FC = () => {
  const { data: agency } = useAgency();
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>
        Messages go to the {agency?.name ?? 'agency'} office and are answered in office hours. <b>In an emergency call 999.</b>
      </span>
      {agency?.phone && (
        <a href={`tel:${agency.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <Phone className="h-4 w-4" /> Urgent? Call {agency.phone}
        </a>
      )}
    </div>
  );
};

export default OfficeContactNote;
