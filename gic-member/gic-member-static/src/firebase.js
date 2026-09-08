import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as analyticsIsSupported } from 'firebase/analytics';
import { getMessaging, getToken } from 'firebase/messaging';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCjxH5M9pHLmXHtBqyPIbOvsv_SGmroucM',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'global-impact-church-9b8fd.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'global-impact-church-9b8fd',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'global-impact-church-9b8fd.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '320455366678',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:320455366678:web:b5b41b1528e4df6cf87d37',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-2K8DHP787M',
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BHRou-Sz8Oqk58uawSudi2ltzCUO2xDycdxNsK6QgGxCWiG32CFLhUCJExI8Gmb4XyVaAeeqDOxACzWfwe4ufig',
};

const firebaseApp = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

if (typeof window !== 'undefined') {
  analyticsIsSupported().then((supported) => {
    if (supported) getAnalytics(firebaseApp);
  }).catch(() => {});
}

export function hasFirebaseConfig() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.vapidKey);
}

export async function getFcmToken() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return '';
  }

  if (!hasFirebaseConfig()) {
    return '';
  }

  try {
    const messaging = getMessaging(firebaseApp);
    return await getToken(messaging, { vapidKey: FIREBASE_CONFIG.vapidKey });
  } catch (error) {
    console.warn('FCM token unavailable:', error);
    return '';
  }
}

export function createPhoneAuth() {
  return getAuth(firebaseApp);
}

export function createPhoneRecaptcha(containerId) {
  return new RecaptchaVerifier(getAuth(firebaseApp), containerId, { size: 'invisible' });
}

export { signInWithPhoneNumber };
