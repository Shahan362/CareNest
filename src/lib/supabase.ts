import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Role = 'admin' | 'caregiver' | 'patient';

export interface Profile {
  id: string;
  role: Role;
  agency_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  postcode: string | null;
  agency: { name: string; code: string } | null;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  caregiver: 'Caregiver',
  patient: 'Patient',
};

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  caregiver: '/caregiver',
  patient: '/patient',
};
