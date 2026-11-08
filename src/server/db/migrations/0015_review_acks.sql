CREATE TABLE "patient_review_acks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"material_id" uuid NOT NULL,
	"attempt_completed_at" timestamp with time zone,
	"acked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_review_acks" ADD CONSTRAINT "patient_review_acks_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_review_acks_patient_idx" ON "patient_review_acks" USING btree ("patient_id","material_id");