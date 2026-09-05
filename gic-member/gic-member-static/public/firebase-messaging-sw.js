importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'gic-demo.firebaseapp.com',
  projectId: 'gic-demo',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:demo',
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'Global Impact Church';
  const body = payload?.notification?.body || 'You have a new update.';
  const url = payload?.data?.url || '/home';

  self.registration.showNotification(title, {
    body,
    icon: 'https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png',
    badge: 'https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png',
    data: { url },
    tag: 'gic-fcm-bg',
  });
});
