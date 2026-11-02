ALTER TABLE "figure_assets" ADD COLUMN "review_scope_note" text;--> statement-breakpoint
ALTER TABLE "figure_assets" ADD COLUMN "revision_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL;