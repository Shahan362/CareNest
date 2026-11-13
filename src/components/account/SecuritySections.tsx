import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };

/**
 * Two-step verification with an authenticator app (Google Authenticator, Microsoft
 * Authenticator, 1Password...). Uses Supabase Auth's built-in TOTP support.
 */
export const TwoFactorSection: React.FC = () => {
  const { profile } = useAuth();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) return setError(err.message);
    setFactors((data?.totp ?? []).filter((f) => f.status === 'verified') as Factor[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const start = async () => {
    setError(null);
    setBusy(true);
    // Remove any half-finished setup first, so a new QR code can be made.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `CareNest ${new Date().toLocaleDateString('en-GB')}` });
    setBusy(false);
    if (err || !data) {
      return setError(
        /disabled|not enabled/i.test(err?.message ?? '')
          ? 'Two-step verification is switched off for this project. Turn on TOTP in Supabase → Authentication → Multi-Factor.'
          : err?.message ?? 'Could not start setup.',
      );
    }
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode('');
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolling) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code shown in your app.');
    setBusy(true);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code });
    setBusy(false);
    if (err) return setError('That code is not right. Check the time on your phone and try the newest code.');
    setEnrolling(null);
    toast.success('Two-step verification is on. You will be asked for a code each time you sign in.');
    load();
  };

  const remove = async (f: Factor) => {
    if (!window.confirm('Turn off two-step verification? Your account will be less secure.')) return;
    setBusy(true);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    setBusy(false);
    if (err) return toast.error(err.message);
    toast.success('Two-step verification is off');
    load();
  };

  const isOn = (factors?.length ?? 0) > 0;

  return (
    <section className="border-t pt-6">
      <h3 className="font-medium mb-1 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Two-step verification
        {isOn && <span className="rounded-full bg-green-100 text-green-800 text-xs px-2">On</span>}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        After your password, you also enter a code from an authenticator app on your phone.
        {profile?.role === 'admin' && ' Strongly recommended for office staff, who can see everyone\'s health information.'}
      </p>

      {factors === null ? null : isOn ? (
        <div className="space-y-2">
          {factors.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span>{f.friendly_name || 'Authenticator app'}</span>
              <Button size="sm" variant="ghost" className="text-red-700" disabled={busy} onClick={() => remove(f)}>Turn off</Button>
            </div>
          ))}
        </div>
      ) : enrolling ? (
        <form onSubmit={confirm} className="space-y-3 sm:max-w-sm" noValidate>
          <ol className="text-sm list-decimal pl-5 space-y-1">
            <li>Open an authenticator app (e.g. Google or Microsoft Authenticator).</li>
            <li>Scan this QR code, or type the key below.</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <img src={enrolling.qr} alt="QR code for your authenticator app" className="w-44 h-44 border rounded bg-white" />
          <p className="text-xs text-gray-600 break-all">Key: <span className="font-mono">{enrolling.secret}</span></p>
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="tracking-[0.3em]"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? 'Checking...' : 'Turn on'}</Button>
            <Button type="button" variant="ghost" onClick={() => setEnrolling(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" disabled={busy} onClick={start}>Set up two-step verification</Button>
      )}
      {error && <p className="text-sm font-medium text-destructive mt-2">{error}</p>}
    </section>
  );
};

/** UK GDPR right of access: everything we hold that the user can see, as a JSON file. */
export const DownloadDataSection: React.FC = () => {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('export_my_data');
    setBusy(false);
    if (error) return toast.error(error.message);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carenest-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="border-t pt-6">
      <h3 className="font-medium mb-1">Your data</h3>
      <p className="text-sm text-muted-foreground mb-3">
        Download a copy of the information CareNest holds about you. To correct something or close your account, contact the
        office. Care records are kept for as long as the law requires, even after care ends. See the{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">privacy policy</a>.
      </p>
      <Button variant="outline" disabled={busy} onClick={download}>
        <Download className="h-4 w-4 mr-2" />
        {busy ? 'Preparing...' : 'Download my data'}
      </Button>
    </section>
  );
};
