// View models used by the admin screens. They are built from database rows
// in src/hooks/useAdminViews.ts.

/** A patient as shown inside a caregiver's row. */
export interface Patient {
  id: string;
  name: string;
  age: number | null;
  carePlan: string;
  status: string;
  nextVisit: string;
  contactInfo: string;
}

/** A patient as shown in the Patients table and details popup. */
export interface PatientForDialog {
  id: string;
  name: string;
  age: number | null;
  carePlan: string;
  status: string;
  caregiver: string;
  nextVisit: string;
  phone?: string;
  email?: string;
  address?: string;
  postcode?: string;
  hourlyRate?: string;
  hasAccount?: boolean;
  notes?: string;
  emergencyContact?: string;
  gpPractice?: string;
}

export interface Caregiver {
  id: string;
  name: string;
  specialty: string;
  status: string;
  patients: number;
  availability: string;
  region: string;
  /** Hours of visits scheduled this week. */
  assignedHours: number;
  maxHours: number;
  /** Number of visits this week. */
  visits: number;
  /** Initials, shown in the avatar circle. */
  photo: string;
  email: string;
  phone: string;
  hasAccount: boolean;
  patientsList: Patient[];
  weeklyUtilization: {
    [date: string]: {
      hours: number;
      visits: number;
      patients: number;
    };
  };
}
