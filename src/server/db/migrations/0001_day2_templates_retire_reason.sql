CREATE TYPE "public"."retire_reason" AS ENUM('safety', 'superseded', 'other');--> statement-breakpoint
CREATE TABLE "prescription_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "material_scope" NOT NULL,
	"owner_org_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"material_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_versions" ADD COLUMN "retire_reason" "retire_reason";--> statement-breakpoint
ALTER TABLE "prescription_templates" ADD CONSTRAINT "prescription_templates_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;