self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    payload = { title: 'Global Impact Church', body: 'You have a new update.' };
  }

  const title = payload.title || 'Global Impact Church';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: 'https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png',
    badge: 'https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png',
    data: {
      url: payload.url || '/home',
      route: payload.route || '/home',
    },
    tag: payload.tag || 'gic-push',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';
  const targetUrl = url.startsWith('/') ? url : '/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => 'focus' in client);
      if (matchingClient) {
        return matchingClient.navigate(targetUrl).then((client) => client?.focus());
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
