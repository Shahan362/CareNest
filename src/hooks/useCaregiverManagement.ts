import { useState } from 'react';
import { Caregiver, Patient, PatientForDialog } from '@/types/admin';
import type { CaregiverRow, PatientRow } from '@/lib/database.types';
import { toPatientView } from '@/hooks/useAdminViews';

/** Open/close state for the dialogs on the Caregivers page. */
export const useCaregiverManagement = (
  caregivers: { row: CaregiverRow; view: Caregiver }[],
  patients: PatientRow[],
) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCaregiver, setEditingCaregiver] = useState<CaregiverRow | null>(null);
  const [isDetailsCaregiverOpen, setIsDetailsCaregiverOpen] = useState(false);
  const [isPatientDetailsOpen, setIsPatientDetailsOpen] = useState(false);
  const [selectedCaregiver, setSelectedCaregiver] = useState<Caregiver | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientForDialog | null>(null);

  const handleAddCaregiver = () => {
    setEditingCaregiver(null);
    setIsFormOpen(true);
  };

  const handleCaregiverClick = (caregiver: Caregiver) => {
    setSelectedCaregiver(caregiver);
    setIsDetailsCaregiverOpen(true);
  };

  const handleEditCaregiver = (caregiver: Caregiver, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingCaregiver(caregivers.find((c) => c.row.id === caregiver.id)?.row ?? null);
    setIsFormOpen(true);
  };

  const handlePatientClick = (patient: Patient) => {
    const row = patients.find((p) => p.id === patient.id);
    if (!row) return;
    const cgById = new Map(caregivers.map((c) => [c.row.id, c.row]));
    const view = toPatientView(row, cgById, new Map());
    setSelectedPatient({ ...view, nextVisit: patient.nextVisit });
    setIsPatientDetailsOpen(true);
  };

  return {
    isFormOpen,
    editingCaregiver,
    isDetailsCaregiverOpen,
    isPatientDetailsOpen,
    selectedCaregiver,
    selectedPatient,
    setIsFormOpen,
    setIsDetailsCaregiverOpen,
    setIsPatientDetailsOpen,
    handleAddCaregiver,
    handleCaregiverClick,
    handleEditCaregiver,
    handlePatientClick,
  };
};
