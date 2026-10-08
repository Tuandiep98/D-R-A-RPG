ALTER TABLE "characters" ADD COLUMN "save_version" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "element_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "learned_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "characters" SET "element_revision" = 1 WHERE "element" IS NOT NULL;
--> statement-breakpoint
-- Preserve prototype grants only for characters already played, never new production characters.
UPDATE "characters" SET "learned_skills" = '["skill_thunder_step","skill_thunder_leap","skill_thunder_arc","skill_thunder_field","skill_thunder_pierce","skill_thunder_execution","skill_thunder_judgement"]'::jsonb WHERE "character_def_id" = 'player_default' AND "version" > 0;
--> statement-breakpoint
UPDATE "characters" SET "learned_skills" = '["skill_thunder_step","skill_thunder_pierce","skill_thunder_arc","skill_thunder_field"]'::jsonb WHERE "character_def_id" = 'player_gunner' AND "version" > 0;
--> statement-breakpoint
INSERT INTO "audit_log" ("id", "action", "target", "payload")
SELECT gen_random_uuid(), 'character.combat.migrate', "id"::text,
jsonb_build_object('saveVersion', "save_version", 'elementRevision', "element_revision", 'element', "element", 'expression', "expression", 'learnedSkills', "learned_skills") FROM "characters";
