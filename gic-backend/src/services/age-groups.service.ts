import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { ageGroupDefinitions } from "../db/schema.js";
import { DEFAULT_AGE_GROUPS } from "../lib/age-groups.js";

export async function ensureAgeGroupsForChurch(churchId: string) {
  for (const definition of DEFAULT_AGE_GROUPS) {
    await db.insert(ageGroupDefinitions)
      .values({ churchId, ...definition })
      .onConflictDoNothing({ target: [ageGroupDefinitions.churchId, ageGroupDefinitions.name] });
  }
}

export async function listActiveAgeGroups(churchId: string) {
  await ensureAgeGroupsForChurch(churchId);
  return db.query.ageGroupDefinitions.findMany({
    where: and(eq(ageGroupDefinitions.churchId, churchId), eq(ageGroupDefinitions.active, true)),
    orderBy: [asc(ageGroupDefinitions.minAge), asc(ageGroupDefinitions.name)],
  });
}
