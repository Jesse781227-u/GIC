import { App, cert, getApp, getApps, initializeApp, ServiceAccount } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";

export function getFirebaseApp(): App {
  if (getApps().length) return getApp();

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON environment variable is required");
  }

  let serviceAccount: ServiceAccount;
  try {
    const parsed = JSON.parse(serviceAccountJson);
    const raw = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    serviceAccount = {
      projectId: raw.projectId || raw.project_id,
      clientEmail: raw.clientEmail || raw.client_email,
      privateKey: raw.privateKey || raw.private_key,
    };
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Stringify the service account file contents."
    );
  }

  if (!serviceAccount?.projectId || !serviceAccount?.clientEmail || !serviceAccount?.privateKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain project_id/projectId, client_email/clientEmail, and private_key/privateKey");
  }

  serviceAccount.privateKey = serviceAccount.privateKey.replace(/\\n/g, "\n");

  return initializeApp({ credential: cert(serviceAccount) });
}

export function getMessaging() {
  getFirebaseApp();
  return getAdminMessaging();
}

export function getFirebaseAuth() {
  getFirebaseApp();
  return getAdminAuth();
}
