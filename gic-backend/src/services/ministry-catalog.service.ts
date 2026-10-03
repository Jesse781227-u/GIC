import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { cells, ministries } from "../db/schema.js";

export const memberAppMinistryCatalog = [
  { name: "Ushering Ministry", description: "Serving with excellence and a heart." },
  { name: "Media Ministry", description: "Telling the story of God's work." },
  { name: "IT Ministry", description: "Supporting the church through technology and digital systems." },
  { name: "Choir", description: "Leading the church in worship through music." },
  { name: "Children's Ministry", description: "Helping children discover faith and grow with joy." },
  { name: "Prayer Ministry", description: "Standing together in prayer for the church and community." },
  { name: "Acts Of Mercy", description: "Serving people in need through practical charity and compassion." },
  { name: "Evangelism", description: "Sharing the gospel and helping people encounter the love of Christ." },
  { name: "Protocol", description: "Supporting church services and events through protocol and coordination." },
  { name: "Security", description: "Supporting a safe and welcoming environment across church activities." },
  { name: "Pastors", description: "Pastoral leadership and spiritual care for the church." },
] as const;

export async function ensureMemberAppMinistries(churchId: string) {
  await db.insert(ministries).values(memberAppMinistryCatalog.map((ministry) => ({ churchId, ...ministry }))).onConflictDoNothing();
  return db.query.ministries.findMany({ where: eq(ministries.churchId, churchId) });
}

export async function ensureYouthFellowship(churchId: string) {
  await db.insert(cells).values({ churchId, name: "Youth Fellowship", description: "Youth fellowship group." }).onConflictDoNothing();
  return db.query.cells.findMany({ where: eq(cells.churchId, churchId) });
}