/* Extra service-worker listeners imported by the generated Workbox worker.
   Handles Web Push payloads from FCM and notification taps. */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: 'Amit', body: event.data ? event.data.text() : '' } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || payload.title || 'Amit';
  const body = notification.body || payload.body || 'You have a new update.';
  const link = data.link || data.url || (data.bookingId ? `/app/ride/${data.bookingId}` : '/');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { link },
      tag: data.bookingId ? `booking-${data.bookingId}` : undefined,
      renotify: Boolean(data.bookingId),
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(link);
            } catch {
              /* cross-origin or detached */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(link);
    })(),
  );
});
