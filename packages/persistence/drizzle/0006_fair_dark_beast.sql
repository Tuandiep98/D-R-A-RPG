ALTER TABLE "characters" ADD COLUMN "element" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "expression" text DEFAULT 'base' NOT NULL;
--> statement-breakpoint
UPDATE "characters" SET "element" = 'moc', "expression" = 'thunder' WHERE "character_def_id" = 'player_default' AND "version" > 0;
