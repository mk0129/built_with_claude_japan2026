CREATE TABLE "patient_treatment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"event_date" text NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"course_no" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_treatment_profiles" (
	"patient_id" text PRIMARY KEY NOT NULL,
	"cancer_type" text,
	"modality" text DEFAULT 'none' NOT NULL,
	"treatment_name" text,
	"start_date" text,
	"cycle_days" integer,
	"planned_sessions" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_treatment_events" ADD CONSTRAINT "patient_treatment_events_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_treatment_profiles" ADD CONSTRAINT "patient_treatment_profiles_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_treatment_events_patient_idx" ON "patient_treatment_events" USING btree ("patient_id","event_date");