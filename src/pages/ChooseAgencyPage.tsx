import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Check, ChevronRight, HeartPulse, LogOut, MapPin, Plus, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FullPageSpinner } from '@/components/auth/ProtectedRoute';
import { ErrorState } from '@/components/admin/DataState';
import { useAuth, displayName } from '@/contexts/AuthContext';
import AgencyPicker, { type AgencyOption } from '@/components/agency/AgencyPicker';
import { useJoinAgency, useMyAgencies, useSwitchAgency, type MyAgency } from '@/hooks/data/useAgencies';
import { ROLE_HOME } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const ROLE_BADGE = {
  caregiver: { label: 'Caregiver', icon: HeartPulse, className: 'bg-teal-50 text-teal-700' },
  patient: { label: 'Patient', icon: User, className: 'bg-rose-50 text-rose-700' },
  admin: { label: 'Office', icon: Building2, className: 'bg-blue-50 text-primary' },
} as const;

/** After sign-in (or from the menu): pick which agency to use, or join another with its code. */
const ChooseAgencyPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, profile, loading, signOut } = useAuth();
  const agencies = useMyAgencies();
  const switchAgency = useSwitchAgency();
  const joinAgency = useJoinAgency();

  const [query, setQuery] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<AgencyOption | null>(null);
  const [useCode, setUseCode] = useState(false);
  const [joinRole, setJoinRole] = useState<'caregiver' | 'patient'>('caregiver');
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useMemo(() => agencies.data ?? [], [agencies.data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return list;
    return list.filter((a) =>
      [a.name, a.postcode, a.address].some((v) => (v ?? '').toLowerCase().replace(/\s+/g, '').includes(q)),
    );
  }, [list, query]);

  if (loading) return <FullPageSpinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  if (profile.role === 'admin') return <Navigate to="/admin" replace />;

  const choose = async (a: MyAgency) => {
    if (a.is_current) return navigate(ROLE_HOME[a.role]);
    setBusyId(a.agency_id);
    try {
      const role = await switchAgency.mutateAsync(a.agency_id);
      toast.success(`You're now using ${a.name}`);
      navigate(ROLE_HOME[role]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useCode ? code.trim().length < 4 : !picked) return toast.error(useCode ? 'Please enter the agency code.' : 'Please choose the agency.');
    try {
      const role = await joinAgency.mutateAsync(useCode ? { code, role: joinRole } : { agencyId: picked!.id, role: joinRole });
      toast.success('Agency added. You can switch between your agencies at any time.');
      navigate(ROLE_HOME[role]);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const logout = async () => {
    await signOut();
    navigate('/');
  };

  const first = displayName(profile)?.split(' ')[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-secondary text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-bold">CareNest</Link>
          <Button variant="ghost" size="sm" onClick={logout} className="text-white hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4 mr-1.5" />Log out
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold">{first ? `Welcome, ${first}` : 'Welcome'}</h1>
        <p className="mt-1 text-gray-600">
          {list.length > 1 ? 'You belong to more than one agency. Choose the one you want to use.' : 'Choose your agency.'}
        </p>

        {list.length > 1 && (
          <div className="relative mt-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by agency name or postcode"
              className="pl-9 bg-white"
              aria-label="Search agencies"
            />
          </div>
        )}

        <div className="mt-4">
          {agencies.isLoading ? (
            <div className="py-10 text-center text-sm text-gray-500">Loading your agencies...</div>
          ) : agencies.error ? (
            <div className="rounded-xl border bg-white"><ErrorState error={agencies.error} onRetry={agencies.refetch} /></div>
          ) : shown.length === 0 ? (
            <div className="rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
              {list.length === 0 ? 'You are not linked to any agency yet. Join one below with its agency code.' : `No agency matches "${query}".`}
            </div>
          ) : (
            <ul className="space-y-3">
              {shown.map((a) => {
                const badge = ROLE_BADGE[a.role];
                return (
                  <li key={`${a.agency_id}-${a.role}`}>
                    <button
                      type="button"
                      onClick={() => choose(a)}
                      disabled={busyId !== null}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-primary hover:shadow disabled:opacity-60',
                        a.is_current && 'border-primary ring-1 ring-primary',
                      )}
                    >
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">{a.name}</span>
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}>
                            <badge.icon className="h-3 w-3" />{badge.label}
                          </span>
                          {a.is_current && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3 w-3" />Current</span>
                          )}
                        </span>
                        {(a.postcode || a.address) && (
                          <span className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{[a.address, a.postcode].filter(Boolean).join(', ')}</span>
                          </span>
                        )}
                        {a.status === 'inactive' && (
                          <span className="mt-0.5 block text-xs text-amber-700">Marked inactive by this agency</span>
                        )}
                      </span>
                      {a.unread > 0 && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white" title="Unread notifications">
                          {a.unread > 99 ? '99+' : a.unread}
                        </span>
                      )}
                      {busyId === a.agency_id ? (
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-8 rounded-xl border bg-white p-5">
          {!showJoin && list.length > 0 ? (
            <button type="button" onClick={() => setShowJoin(true)} className="flex w-full items-center gap-2 text-left font-medium text-primary">
              <Plus className="h-5 w-5" />Join another agency
            </button>
          ) : (
            <form onSubmit={join} className="space-y-4" noValidate>
              <div>
                <h2 className="font-semibold">Join another agency</h2>
                <p className="text-sm text-gray-600">Find the agency by name, branch or postcode. You keep the same email and password.</p>
              </div>
              {useCode ? (
                <div>
                  <Label htmlFor="join-code">Agency code</Label>
                  <Input
                    id="join-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 6LFEH4BP"
                    className="mt-1 font-mono tracking-wider"
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setUseCode(false)} className="mt-2 text-sm font-medium text-primary hover:underline">
                    Choose from the list instead
                  </button>
                </div>
              ) : (
                <div>
                  <Label htmlFor="join-agency">Agency</Label>
                  <div className="mt-1">
                    <AgencyPicker id="join-agency" value={picked} onChange={setPicked} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(null);
                      setUseCode(true);
                    }}
                    className="mt-2 text-sm font-medium text-primary hover:underline"
                  >
                    I have an agency code instead
                  </button>
                </div>
              )}
              <div>
                <Label>I am joining as</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['caregiver', 'patient'] as const).map((r) => {
                    const b = ROLE_BADGE[r];
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setJoinRole(r)}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium',
                          joinRole === r ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-700',
                        )}
                        aria-pressed={joinRole === r}
                      >
                        <b.icon className="h-4 w-4" />{r === 'caregiver' ? 'A caregiver' : 'A patient'}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={joinAgency.isPending}>
                {joinAgency.isPending ? 'Joining...' : 'Join agency'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChooseAgencyPage;
