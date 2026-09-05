import { type Context, type Next } from "hono";
import { jwtVerify, importSPKI, type JWTPayload } from "jose";

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
  const secret = process.env.JWT_SECRET || "gic-default-secret-key-32-chars-min!!";
  return new TextEncoder().encode(secret);
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    c.set("user", payload as GicJwtPayload);
    await next();
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
