ALTER TABLE "ai_generation_jobs" ADD COLUMN "progress" text;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "input_payload" jsonb;--> statement-breakpoint
ALTER TABLE "material_versions" ADD COLUMN "submitted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "material_versions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_versions" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "extraction_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "pii_attested_none" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "pii_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;