import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../lib/session';
import type { Role } from '../types';
import { FullPageLoader } from './ui';

export function RequireRole({ role }: { role: Role }) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    const target = `/login?role=${role}&next=${encodeURIComponent(
      `${location.pathname}${location.search}`,
    )}`;
    return <Navigate to={target} replace />;
  }

  if (session.role !== role) {
    return <Navigate to={homeForRole(session.role)} replace />;
  }

  return <Outlet />;
}

export function SessionGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  if (!session) return <FullPageLoader label="Opening Flash…" />;
  return <>{children}</>;
}
