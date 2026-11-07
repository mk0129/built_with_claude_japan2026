ALTER TABLE "health_records" ADD COLUMN "oxygen_flow" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "visit_notes" ADD COLUMN "resolved_at" timestamp with time zone;