import { APP_NAME, FIREBASE_CONFIG, FIREBASE_ENABLED } from '../config';
import { api } from './api';

const FCM_VERSION = '10.14.1';

function swRegistration(timeout = 3000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
  ]);
}

export function pushSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function showLocalNotification(
  title: string,
  body: string,
  link = '/',
  tag?: string,
): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const registration = await swRegistration();
  if (registration) {
    try {
      await registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { link },
        tag,
        vibrate: [80, 40, 80],
      } as NotificationOptions);
      return;
    } catch {
      // fall through to page-level notification
    }
  }
  try {
    const note = new Notification(title, { body, icon: '/icons/icon-192.png', tag });
    note.onclick = () => {
      window.focus();
      window.location.assign(link);
    };
  } catch {
    // notifications are a progressive enhancement
  }
}

async function registerFcm(registration: ServiceWorkerRegistration): Promise<void> {
  const dynamicImport = new Function('url', 'return import(url);') as (
    url: string,
  ) => Promise<any>;

  const [appMod, msgMod] = await Promise.all([
    dynamicImport(`https://www.gstatic.com/firebasejs/${FCM_VERSION}/firebase-app.js`),
    dynamicImport(`https://www.gstatic.com/firebasejs/${FCM_VERSION}/firebase-messaging.js`),
  ]);

  const app = appMod.getApps().length
    ? appMod.getApp()
    : appMod.initializeApp({
        apiKey: FIREBASE_CONFIG.apiKey,
        authDomain: FIREBASE_CONFIG.authDomain,
        projectId: FIREBASE_CONFIG.projectId,
        messagingSenderId: FIREBASE_CONFIG.messagingSenderId,
        appId: FIREBASE_CONFIG.appId,
      });

  const messaging = msgMod.getMessaging(app);
  const token = await msgMod.getToken(messaging, {
    vapidKey: FIREBASE_CONFIG.vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (token) {
    await api.post('/notifications/device-token', { token });
  }

  msgMod.onMessage(messaging, (payload: any) => {
    const title = payload?.notification?.title || APP_NAME;
    const body = payload?.notification?.body || 'You have a new update.';
    if (document.visibilityState !== 'visible') {
      void showLocalNotification(title, body, payload?.data?.link || '/');
    }
  });
}

export interface PushResult {
  ok: boolean;
  message: string;
  mode: 'fcm' | 'local' | 'none';
}

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) {
    return { ok: false, message: 'This browser does not support notifications.', mode: 'none' };
  }
  if (Notification.permission === 'denied') {
    return {
      ok: false,
      message: 'Notifications are blocked. Allow them from your browser site settings.',
      mode: 'none',
    };
  }
  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, message: 'Notification permission was not granted.', mode: 'none' };
  }

  const registration = await swRegistration();
  if (FIREBASE_ENABLED && registration) {
    try {
      await registerFcm(registration);
      return { ok: true, message: 'Background alerts are on for this device.', mode: 'fcm' };
    } catch {
      return {
        ok: true,
        message:
          'Alerts are on while the app is open. Background push needs a valid Firebase web configuration.',
        mode: 'local',
      };
    }
  }

  return {
    ok: true,
    message: FIREBASE_ENABLED
      ? 'Alerts are on. The service worker is still starting, so background push will register next launch.'
      : 'Alerts are on while the app is open. Add Firebase web keys to enable background push.',
    mode: 'local',
  };
}
