CREATE TYPE "public"."visit_note_source" AS ENUM('free', 'quiz');--> statement-breakpoint
CREATE TABLE "health_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"temperature" numeric(4, 1),
	"systolic" integer,
	"diastolic" integer,
	"pulse" integer,
	"spo2" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_symptom_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"symptom_key" text NOT NULL,
	"symptom_name" text,
	"severity" integer NOT NULL,
	"count" integer,
	"location" text,
	"interference" text
);
--> statement-breakpoint
CREATE TABLE "patient_symptom_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"symptom_key" text NOT NULL,
	"custom_name" text,
	"position" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"body" text NOT NULL,
	"source" "visit_note_source" DEFAULT 'free' NOT NULL,
	"material_id" uuid,
	"material_version_id" uuid,
	"quiz_question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_symptom_entries" ADD CONSTRAINT "health_symptom_entries_record_id_health_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."health_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_symptom_settings" ADD CONSTRAINT "patient_symptom_settings_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_quiz_question_id_quiz_questions_id_fk" FOREIGN KEY ("quiz_question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_records_patient_idx" ON "health_records" USING btree ("patient_id","measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "health_symptom_entries_uq" ON "health_symptom_entries" USING btree ("record_id","symptom_key");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_symptom_settings_uq" ON "patient_symptom_settings" USING btree ("patient_id","symptom_key");--> statement-breakpoint
CREATE INDEX "visit_notes_patient_idx" ON "visit_notes" USING btree ("patient_id","created_at");--> statement-breakpoint
ALTER TABLE "health_symptom_entries" ADD CONSTRAINT "health_symptom_entries_severity_chk" CHECK ("severity" BETWEEN 0 AND 4);
