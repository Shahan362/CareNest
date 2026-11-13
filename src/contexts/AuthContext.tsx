import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, agency:agencies(name, code)')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('Failed to load profile:', error.message);
    return null;
  }
  return data as Profile | null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const applySession = async (next: Session | null) => {
      const nextProfile = next ? await fetchProfile(next.user.id) : null;
      if (!active) return;
      setSession(next);
      setProfile(nextProfile);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      // Defer so we don't call Supabase inside its own auth callback.
      setTimeout(() => applySession(next), 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return null;
    const p = await fetchProfile(session.user.id);
    setProfile(p);
    return p;
  }, [session]);

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function displayName(profile: Profile | null): string {
  if (!profile) return '';
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  return full || profile.agency?.name || profile.email;
}
