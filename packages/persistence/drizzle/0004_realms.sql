ALTER TABLE "characters" ADD COLUMN "realm" text DEFAULT 'luyen_khi' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "realm_rank" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "nodes" jsonb DEFAULT '[]'::jsonb NOT NULL;