import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, errorMessage } from '../lib/api';
import { clearSession, loadSession, saveSession } from '../lib/session';
import type { Role, Session, UserProfile, Vehicle } from '../types';
import { useToast } from './ToastContext';

interface LoginResponse {
  token: string;
  role: Role;
  user: UserProfile;
}

interface RegisterRiderInput {
  name: string;
  mobile: string;
  password: string;
  vehicle: Vehicle;
}

interface AuthValue {
  session: Session | null;
  user: UserProfile | null;
  role: Role | null;
  isAuthenticated: boolean;
  login: (role: Role, mobile: string, password: string) => Promise<Session>;
  registerCustomer: (input: { name: string; mobile: string; password: string }) => Promise<Session>;
  registerRider: (input: RegisterRiderInput) => Promise<Session>;
  refresh: () => Promise<void>;
  mergeUser: (patch: Partial<UserProfile>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const toast = useToast();

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setSession(null);
      toast.warning('Your session expired. Please sign in again.', 'Signed out');
    };
    window.addEventListener('flash:session-expired', onExpired);
    return () => window.removeEventListener('flash:session-expired', onExpired);
  }, [toast]);

  const persist = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
    return next;
  }, []);

  const login = useCallback(
    async (role: Role, mobile: string, password: string) => {
      const result = await api.post<LoginResponse>(
        `/auth/${role}/login`,
        { mobile, password },
        { auth: false },
      );
      return persist({ token: result.token, role: result.role, user: { ...result.user, role: result.role } });
    },
    [persist],
  );

  const registerCustomer = useCallback(
    async (input: { name: string; mobile: string; password: string }) => {
      const result = await api.post<LoginResponse>('/auth/customer/register', input, {
        auth: false,
      });
      return persist({
        token: result.token,
        role: 'customer',
        user: { ...result.user, role: 'customer' },
      });
    },
    [persist],
  );

  const registerRider = useCallback(
    async (input: RegisterRiderInput) => {
      const result = await api.post<LoginResponse>('/auth/rider/register', input, {
        auth: false,
      });
      return persist({
        token: result.token,
        role: 'rider',
        user: { ...result.user, role: 'rider' },
      });
    },
    [persist],
  );

  const refresh = useCallback(async () => {
    if (!loadSession()) return;
    try {
      const me = await api.get<{ role: Role; user: UserProfile }>('/auth/me');
      setSession((current) => {
        if (!current) return current;
        const next: Session = {
          ...current,
          role: me.role,
          user: { ...current.user, ...me.user, role: me.role },
        };
        saveSession(next);
        return next;
      });
    } catch (error) {
      if ((error as { status?: number }).status === 401) {
        logout();
      } else {
        toast.error(errorMessage(error), 'Could not refresh your account');
      }
    }
  }, [logout, toast]);

  const mergeUser = useCallback((patch: Partial<UserProfile>) => {
    setSession((current) => {
      if (!current) return current;
      const next: Session = { ...current, user: { ...current.user, ...patch } };
      saveSession(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (loadSession()) void refresh();
    // Only run on mount; refresh is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      role: session?.role ?? null,
      isAuthenticated: Boolean(session),
      login,
      registerCustomer,
      registerRider,
      refresh,
      mergeUser,
      logout,
    }),
    [session, login, registerCustomer, registerRider, refresh, mergeUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
