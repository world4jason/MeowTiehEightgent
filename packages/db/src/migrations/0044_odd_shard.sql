ALTER TABLE "agents" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "file_managed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instance_settings' AND column_name = 'general') THEN ALTER TABLE "instance_settings" ADD COLUMN "general" jsonb DEFAULT '{}'::jsonb NOT NULL; END IF; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_company_file_key_idx" ON "agents" USING btree ("company_id","file_key") WHERE "agents"."file_key" IS NOT NULL;