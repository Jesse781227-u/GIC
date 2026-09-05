const FIREBASE_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: 'gic-demo.firebaseapp.com',
  projectId: 'gic-demo',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:demo',
  vapidKey: 'demo-vapid-key',
};

export function hasFirebaseConfig() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'demo-api-key');
}

export async function getFcmToken() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return '';
  }

  if (!hasFirebaseConfig()) {
    return '';
  }

  try {
    const [{ initializeApp }, { getMessaging, getToken }] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);

    const app = initializeApp(FIREBASE_CONFIG);
    const messaging = getMessaging(app);
    return await getToken(messaging, { vapidKey: FIREBASE_CONFIG.vapidKey });
  } catch (error) {
    console.warn('FCM token unavailable:', error);
    return '';
  }
}
