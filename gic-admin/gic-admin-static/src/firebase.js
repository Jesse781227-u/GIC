import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCjxH5M9pHLmXHtBqyPIbOvsv_SGmroucM',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'global-impact-church-9b8fd.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'global-impact-church-9b8fd',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'global-impact-church-9b8fd.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '320455366678',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:320455366678:web:b5b41b1528e4df6cf87d37',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-2K8DHP787M',
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const adminAuth = getAuth(app)
