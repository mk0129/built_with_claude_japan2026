CREATE TYPE "public"."copyright_status" AS ENUM('internal_ai_generated', 'licensed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."figure_review_status" AS ENUM('draft', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."figure_type" AS ENUM('medical', 'editorial');--> statement-breakpoint
CREATE TABLE "figure_assets" (
	"asset_id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"type" "figure_type" NOT NULL,
	"filename" text,
	"width" integer,
	"height" integer,
	"alt_text" text NOT NULL,
	"long_description" text,
	"learning_objective" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_status" "figure_review_status" DEFAULT 'draft' NOT NULL,
	"reviewer_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"copyright_status" "copyright_status" DEFAULT 'unknown' NOT NULL,
	"generator_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figure_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" text NOT NULL,
	"material_version_id" uuid NOT NULL,
	"slide_seq" integer NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caption" text,
	"source_note" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_slides" ADD COLUMN "proposition" text;--> statement-breakpoint
ALTER TABLE "material_slides" ADD COLUMN "detail_md" text;--> statement-breakpoint
ALTER TABLE "figure_assets" ADD CONSTRAINT "figure_assets_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_placements" ADD CONSTRAINT "figure_placements_asset_id_figure_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."figure_assets"("asset_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_placements" ADD CONSTRAINT "figure_placements_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "figure_placements_version_idx" ON "figure_placements" USING btree ("material_version_id","slide_seq");