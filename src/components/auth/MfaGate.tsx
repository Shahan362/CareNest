import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="bg-white rounded-lg border p-8 max-w-sm w-full text-center">{children}</div>
  </div>
);

/**
 * Two-factor login: if the user has turned on an authenticator app, they must enter
 * the 6-digit code after their password before anything is shown. (For admins the
 * database also refuses data until this step is done.)
 */
const MfaGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, signOut } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [state, setState] = useState<'checking' | 'needed' | 'ok'>('checking');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error: err }) => {
      if (cancelled) return;
      // If the check itself fails, don't lock people out; the database still enforces it for admins.
      if (err || !data) return setState('ok');
      setState(data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'needed' : 'ok');
    });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === 'verified');
    if (listErr || !factor) {
      setBusy(false);
      return setError('Could not find your authenticator. Please sign in again.');
    }
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (verifyErr) return setError('That code is not right or has expired. Try the newest code.');
    setState('ok');
    // Anything loaded before the second step may have been refused: load it again.
    qc.invalidateQueries();
  };

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (state === 'ok') return <>{children}</>;

  return (
    <Card>
      <ShieldCheck className="h-10 w-10 text-primary mx-auto mb-3" />
      <h1 className="text-lg font-semibold mb-1">Two-step verification</h1>
      <p className="text-sm text-gray-600 mb-4">Open your authenticator app and enter the 6-digit code for CareNest.</p>
      <form onSubmit={verify} className="space-y-3" noValidate>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="text-center text-lg tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Checking...' : 'Verify'}</Button>
      </form>
      <button
        type="button"
        className="mt-4 text-sm text-gray-500 hover:underline"
        onClick={async () => {
          await signOut();
          navigate('/');
        }}
      >
        Sign out
      </button>
    </Card>
  );
};

export default MfaGate;
