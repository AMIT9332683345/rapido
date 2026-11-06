import type { Role, Session } from '../types';

const KEY = 'amit.session.v1';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed?.user?.id) return null;
    if (!['customer', 'rider', 'admin'].includes(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function getToken(): string | null {
  return loadSession()?.token ?? null;
}

export function homeForRole(role: Role): string {
  if (role === 'rider') return '/rider';
  if (role === 'admin') return '/admin';
  return '/app';
}
