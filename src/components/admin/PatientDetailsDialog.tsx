import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User, Heart, UserCheck, Clock, Phone, Mail, MapPin, PoundSterling, KeyRound, HeartPulse, Stethoscope } from 'lucide-react';
import type { PatientForDialog } from '@/types/admin';
import CareNotesList from '@/components/care/CareNotesList';
import { useCareNotes } from '@/hooks/data/useCaregiverData';

interface PatientDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: PatientForDialog | null;
}

const Row: React.FC<{ icon: React.ReactNode; label: string; value?: React.ReactNode }> = ({ icon, label, value }) =>
  value ? (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      {icon}
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-gray-900">{value}</p>
      </div>
    </div>
  ) : null;

const PatientDetailsDialog: React.FC<PatientDetailsDialogProps> = ({ open, onOpenChange, patient }) => {
  const notes = useCareNotes({ patientId: open ? patient?.id : undefined }, 20);
  if (!patient) return null;
  const icon = 'h-5 w-5 text-primary';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Patient Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-accent mx-auto mb-3">
              <User className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-semibold">{patient.name}</h3>
            {patient.age !== null && <p className="text-gray-600">{patient.age} years old</p>}
          </div>

          <div className="grid gap-3">
            <Row icon={<Heart className={icon} />} label="Care Plan" value={patient.carePlan} />
            <Row
              icon={<div className={`w-3 h-3 rounded-full ${patient.status === 'Active' ? 'bg-green-500' : 'bg-gray-400'}`} />}
              label="Status"
              value={patient.status}
            />
            <Row icon={<UserCheck className={icon} />} label="Primary Caregiver" value={patient.caregiver} />
            <Row icon={<Clock className={icon} />} label="Next Visit" value={patient.nextVisit} />
            <Row icon={<Phone className={icon} />} label="Phone" value={patient.phone} />
            <Row icon={<Mail className={icon} />} label="Email" value={patient.email} />
            <Row
              icon={<MapPin className={icon} />}
              label="Address"
              value={[patient.address, patient.postcode].filter(Boolean).join(', ')}
            />
            <Row icon={<HeartPulse className={icon} />} label="Emergency Contact" value={patient.emergencyContact} />
            <Row icon={<Stethoscope className={icon} />} label="GP Practice" value={patient.gpPractice} />
            <Row icon={<PoundSterling className={icon} />} label="Hourly Rate" value={patient.hourlyRate} />
            <Row
              icon={<KeyRound className={icon} />}
              label="App Account"
              value={patient.hasAccount === undefined ? undefined : patient.hasAccount ? 'Signed up' : 'No account yet'}
            />
            {patient.notes && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700">Notes</p>
                <p className="text-gray-900 whitespace-pre-wrap">{patient.notes}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Care record (latest 20 notes)</p>
            {notes.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : notes.error ? (
              <p className="text-sm text-destructive">Could not load care notes.</p>
            ) : (
              <CareNotesList notes={notes.data ?? []} emptyText="No care notes yet. Caregivers write them when they check out." />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PatientDetailsDialog;
