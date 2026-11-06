/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_TAGLINE?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_PMTILES_URL?: string;
  readonly VITE_MAP_GLYPHS_URL?: string;
  readonly VITE_CENTER_LAT?: string;
  readonly VITE_CENTER_LNG?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
