import React from 'react';
import { HeartPulse, Stethoscope } from 'lucide-react';
import type { MyPatientRow } from '@/lib/database.types';

/** Emergency contact and GP for the caregiver's patient (shown on the visit and patient pages). */
const EmergencyInfo: React.FC<{ patient: MyPatientRow }> = ({ patient }) => {
  const icon = 'h-4 w-4 text-primary flex-shrink-0 mt-0.5';
  return (
    <>
      <div className="flex items-start gap-2">
        <HeartPulse className={icon} />
        <div>
          <p className="text-xs text-gray-500">Emergency contact</p>
          {patient.emergency_contact_name ? (
            <p>
              {patient.emergency_contact_name}
              {patient.emergency_contact_relation && <span className="text-gray-600"> ({patient.emergency_contact_relation})</span>}
              {patient.emergency_contact_phone && (
                <>
                  {' · '}
                  <a href={`tel:${patient.emergency_contact_phone.replace(/\s/g, '')}`} className="text-primary font-medium hover:underline">
                    {patient.emergency_contact_phone}
                  </a>
                </>
              )}
            </p>
          ) : (
            <p className="text-gray-400">Not given. In an emergency call 999, then the office.</p>
          )}
        </div>
      </div>
      {patient.gp_practice && (
        <div className="flex items-start gap-2">
          <Stethoscope className={icon} />
          <div>
            <p className="text-xs text-gray-500">GP practice</p>
            <p>{patient.gp_practice}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default EmergencyInfo;
