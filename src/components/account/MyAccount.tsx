import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { DownloadDataSection, TwoFactorSection } from './SecuritySections';

const optional = (schema: z.ZodString) => z.union([z.literal(''), schema]);

const profileSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.'),
  last_name: z.string().trim().min(1, 'Last name is required.'),
  phone: optional(z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, 'Please enter a valid phone number.')),
});
type ProfileValues = z.infer<typeof profileSchema>;

/** Name, phone, login email and password for the signed-in user (any role). */
const MyAccount: React.FC<{ returnPath: string }> = ({ returnPath }) => {
  const { profile, user, refreshProfile } = useAuth();
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    form.reset({ first_name: profile?.first_name ?? '', last_name: profile?.last_name ?? '', phone: profile?.phone ?? '' });
  }, [profile, form]);

  const onSubmit = async (v: ProfileValues) => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ ...v, phone: v.phone || null }).eq('id', profile!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    form.reset(v);
    toast.success('Your details are saved');
  };

  // Email change
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const pendingEmail = user?.new_email;

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error('Please enter a valid email address.');
    if (email === user?.email) return toast.error('That is already your login email.');
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}${returnPath}` });
    setEmailBusy(false);
    if (error) {
      return toast.error(/rate limit/i.test(error.message) ? 'Too many emails sent recently. Please try again later.' : error.message);
    }
    setNewEmail('');
    toast.success('Check your inbox to confirm the new email address.');
  };

  // Password change
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!pw.current) return setPwError('Enter your current password.');
    if (pw.next.length < 8 || !/[A-Za-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) {
      return setPwError('New password must be at least 8 characters and contain a letter and a number.');
    }
    if (pw.next !== pw.confirm) return setPwError('New passwords do not match.');
    if (pw.next === pw.current) return setPwError('The new password must be different from the current one.');

    setPwBusy(true);
    // Check the current password first, so someone at an unlocked computer can't change it.
    const check = await supabase.auth.signInWithPassword({ email: user!.email!, password: pw.current });
    if (check.error) {
      setPwBusy(false);
      return setPwError('Your current password is not correct.');
    }
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setPwBusy(false);
    if (error) return setPwError(error.message);
    setPw({ current: '', next: '', confirm: '' });
    toast.success('Password changed');
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <section>
        <h3 className="font-medium mb-3">Your details</h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid sm:grid-cols-2 gap-4">
              {(['first_name', 'last_name'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{name === 'first_name' ? 'First name' : 'Last name'}</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <div className="sm:w-1/2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={saving || !form.formState.isDirty}>{saving ? 'Saving...' : 'Save'}</Button>
          </form>
        </Form>
      </section>

      <section className="border-t pt-6">
        <h3 className="font-medium mb-1">Login email</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Currently <b>{user?.email}</b>.
          {pendingEmail && <> Waiting for you to confirm <b>{pendingEmail}</b>. Check that inbox.</>}
        </p>
        <form onSubmit={changeEmail} className="flex flex-col sm:flex-row gap-2" noValidate>
          <Input type="email" placeholder="New email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="sm:max-w-xs" />
          <Button type="submit" variant="outline" disabled={emailBusy || !newEmail}>{emailBusy ? 'Sending...' : 'Change email'}</Button>
        </form>
      </section>

      <section className="border-t pt-6">
        <h3 className="font-medium mb-3">Change password</h3>
        <form onSubmit={changePassword} className="space-y-3 sm:max-w-sm" noValidate>
          <div>
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="pw-new">New password</Label>
            <Input id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="pw-confirm">Confirm new password</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </div>
          {pwError && <p className="text-sm font-medium text-destructive">{pwError}</p>}
          <Button type="submit" disabled={pwBusy}>{pwBusy ? 'Changing...' : 'Change password'}</Button>
        </form>
      </section>

      <TwoFactorSection />
      <DownloadDataSection />
    </div>
  );
};

export default MyAccount;
