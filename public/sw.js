// Royal PMS — Service Worker para Web Push Notifications

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Royal PMS', message: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Royal PMS';
  const options = {
    body: data.message || '',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || 'royal-pms',
    renotify: true,
    data: { link: data.link || '/' },
    actions: data.link ? [{ action: 'open', title: 'Abrir' }] : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(link);
          return;
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
