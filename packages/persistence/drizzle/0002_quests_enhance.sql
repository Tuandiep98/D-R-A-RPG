ALTER TABLE "characters" ADD COLUMN "quest_log" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "item_instances" ADD COLUMN "enhance" integer DEFAULT 0 NOT NULL;