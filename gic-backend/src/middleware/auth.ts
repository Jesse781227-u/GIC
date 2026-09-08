import { type Context, type Next } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getFirebaseAuth } from "../lib/firebase.js";

export interface GicJwtPayload extends JWTPayload {
  sub: string;       // member / admin user ID
  role: "MEMBER" | "ADMIN";
  email?: string;
  name?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: GicJwtPayload;
  }
}

export function getJwtSecret(): Uint8Array {
  const configuredSecret = process.env.JWT_SECRET;
  if (!configuredSecret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  const secret = configuredSecret || "gic-local-development-secret-change-me";
  return new TextEncoder().encode(secret);
}

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "global-impact-church-9b8fd";
const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com")
);

async function verifyFirebaseToken(token: string) {
  try {
    return await getFirebaseAuth().verifyIdToken(token);
  } catch (firebaseAdminError) {
    const { payload } = await jwtVerify(token, firebaseKeys, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
    });
    console.warn("Firebase Admin verification failed; validated token with Firebase public keys", firebaseAdminError);
    return payload as JWTPayload & { uid?: string; role?: string; admin?: boolean; isAdmin?: boolean; email?: string; name?: string };
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    try {
      const firebaseUser = await verifyFirebaseToken(token);
      const firebaseRole = String(firebaseUser.role || "").toUpperCase();
      const isAdmin = firebaseUser.admin === true || firebaseUser.isAdmin === true || firebaseRole === "ADMIN";
      c.set("user", {
        sub: firebaseUser.uid || String(firebaseUser.sub),
        role: isAdmin ? "ADMIN" : "MEMBER",
        email: firebaseUser.email,
        name: firebaseUser.name,
      });
      return await next();
    } catch {
      const { payload } = await jwtVerify(token, getJwtSecret());
      c.set("user", payload as GicJwtPayload);
      return await next();
    }
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "ADMIN") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }
  await next();
}
