import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase, ROLE_HOME } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageSpinner } from '@/components/auth/ProtectedRoute';

/** Opened from the password reset email. Supabase signs the user in from the link. */
const ResetPasswordPage: React.FC = () => {
  const { session, profile, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullPageSpinner />;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Link expired</h2>
          <p className="text-gray-600 mb-6">This reset link is invalid or has expired. Please request a new one.</p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request new link</Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and contain a letter and a number.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast({ title: 'Password updated', description: 'Your new password is saved.' });
    navigate(profile ? ROLE_HOME[profile.role] : '/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSubmit} className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 space-y-4" noValidate>
        <div className="text-center mb-2">
          <h2 className="text-2xl font-bold mb-2">Set a new password</h2>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save new password'}
        </Button>
      </form>
    </div>
  );
};

export default ResetPasswordPage;
