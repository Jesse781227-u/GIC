ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "ministries" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "center" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "service_time" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "birthday" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "membership_status" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "avatar" text;