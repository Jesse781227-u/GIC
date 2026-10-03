import type { GicJwtPayload } from "../middleware/auth.js";

export const DEFAULT_CHURCH_ID = process.env.DEFAULT_CHURCH_ID || "11111111-1111-4111-8111-111111111111";

export function churchIdForUser(user: GicJwtPayload) {
  const churchId = user.churchId || DEFAULT_CHURCH_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(churchId)) {
    throw new Error("Authenticated church assignment is invalid.");
  }
  return churchId;
}