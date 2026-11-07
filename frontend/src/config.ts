import brand from '../../brand.json';

const rawApi = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api').replace(/\/+$/, '');
const rawSocket = (import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:5000').replace(
  /\/+$/,
  '',
);

function absoluteOrigin(base: string) {
  try {
    return new URL(base, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

export const APP_NAME = import.meta.env.VITE_APP_NAME?.trim() || brand.name;
export const APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE || 'Bike taxi for the islands';
export const API_BASE = rawApi;
export const API_ORIGIN = absoluteOrigin(rawApi);
export const SOCKET_URL = absoluteOrigin(rawSocket);

export const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_PMTILES_URL = import.meta.env.VITE_MAP_PMTILES_URL || '';
export const MAP_GLYPHS_URL =
  import.meta.env.VITE_MAP_GLYPHS_URL ||
  'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const DEFAULT_CENTER = {
  lat: Number(import.meta.env.VITE_CENTER_LAT || 22.2167),
  lng: Number(import.meta.env.VITE_CENTER_LNG || 88.9),
};

export const SERVICE_LOCATION = 'Chhoto Mollakhali, Gosaba';

export const BRAND = {
  ink: '#08211f',
  mango: '#ffb020',
  teal: '#1f7f71',
  cream: '#f7f3e8',
};

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',
};

export const FIREBASE_ENABLED = Boolean(
  FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.vapidKey,
);

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
