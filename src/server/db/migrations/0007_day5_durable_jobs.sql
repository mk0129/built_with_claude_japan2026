ALTER TABLE "ai_generation_jobs" ADD COLUMN "generator" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "cache_read_token_count" integer;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "fallback_used" boolean DEFAULT false NOT NULL;