import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type Role } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// One login can belong to several agencies (as a caregiver or a patient).
// See 009_multi_agency.sql: the profile holds the agency currently in use.

export interface MyAgency {
  agency_id: string;
  name: string;
  postcode: string | null;
  address: string | null;
  role: Role;
  status: 'active' | 'inactive';
  is_current: boolean;
  unread: number;
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** Fetch the signed-in user's agencies (used right after login, before React Query is involved). */
export async function fetchMyAgencies(): Promise<MyAgency[]> {
  return unwrap(await supabase.rpc('my_agencies')) as MyAgency[];
}

export function useMyAgencies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-agencies', user?.id],
    enabled: !!user,
    queryFn: fetchMyAgencies,
  });
}

/**
 * Switch to another agency, or join a new one with its code. Either way the whole app
 * now shows that agency, so every cached screen is thrown away and the profile reloaded.
 */
function useAgencyChange<A>(call: (a: A) => Promise<Role>) {
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (a: A) => {
      const role = await call(a);
      await refreshProfile();
      qc.clear();
      return role;
    },
  });
}

export function useSwitchAgency() {
  return useAgencyChange(async (agencyId: string) => unwrap(await supabase.rpc('switch_agency', { p_agency_id: agencyId })) as Role);
}

/** Join by picking the agency from the list (agencyId) or by its code. */
export function useJoinAgency() {
  return useAgencyChange(async (a: { agencyId?: string; code?: string; role: 'caregiver' | 'patient' }) =>
    a.agencyId
      ? (unwrap(await supabase.rpc('join_agency_by_id', { p_agency_id: a.agencyId, p_role: a.role })) as Role)
      : (unwrap(await supabase.rpc('join_agency', { p_code: a.code, p_role: a.role })) as Role),
  );
}
