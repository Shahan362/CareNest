import React from 'react';
import { UserX } from 'lucide-react';

/** Shown when the login has no caregiver / patient record any more (the agency removed it). */
const NotLinkedNotice: React.FC<{ who?: 'caregiver' | 'patient' }> = ({ who = 'caregiver' }) => (
  <div className="bg-white rounded-lg border p-8 text-center">
    <UserX className="h-10 w-10 text-gray-400 mx-auto mb-3" />
    <p className="font-medium">Your account is not linked to an active {who} record</p>
    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
      Your agency may have removed your record or marked it inactive. Please contact the office so they can add you again with
      the same email address.
    </p>
  </div>
);

export default NotLinkedNotice;
