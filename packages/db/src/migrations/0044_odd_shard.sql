ALTER TABLE "agents" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "file_managed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "general" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_company_file_key_idx" ON "agents" USING btree ("company_id","file_key") WHERE "agents"."file_key" IS NOT NULL;