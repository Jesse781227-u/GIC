self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || event.notification.data?.route || '/home';
  let targetUrl;
  try {
    const parsed = new URL(url, self.location.origin);
    targetUrl = ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : new URL('/home', self.location.origin).href;
  } catch {
    targetUrl = new URL('/home', self.location.origin).href;
  }

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
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCjxH5M9pHLXMtBqyPIbOvsv_SGmroucM',
  authDomain: 'global-impact-church-9b8fd.firebaseapp.com',
  projectId: 'global-impact-church-9b8fd',
  storageBucket: 'global-impact-church-9b8fd.firebasestorage.app',
  messagingSenderId: '320455366678',
  appId: '1:320455366678:web:b5b41b1528e4df6cf87d37',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'Global Impact Church';
  const body = payload?.notification?.body || 'You have a new update.';
  const url = payload?.data?.url || payload?.data?.route || '/home';
  self.registration.showNotification(title, {
    body,
    icon: 'https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png',
    badge: 'https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png',
    data: { url },
    tag: payload?.data?.tag || 'gic-fcm-bg',
  });
});
