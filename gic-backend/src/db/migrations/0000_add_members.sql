CREATE TABLE IF NOT EXISTS "members" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text DEFAULT 'Member' NOT NULL,
  "phone" text,
  "auth_method" text DEFAULT 'device_auth' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
