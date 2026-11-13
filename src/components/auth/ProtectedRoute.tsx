import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_HOME, type Role } from '@/lib/supabase';
import MfaGate from './MfaGate';

export const FullPageSpinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
  </div>
);

/** Renders child routes only for signed-in users with the given role. */
const ProtectedRoute: React.FC<{ role: Role }> = ({ role }) => {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session || !profile) return <Navigate to="/" replace />;
  if (profile.role !== role) return <Navigate to={ROLE_HOME[profile.role]} replace />;

  return (
    <MfaGate>
      <Outlet />
    </MfaGate>
  );
};

export default ProtectedRoute;
