CREATE TYPE "public"."ai_job_mode" AS ENUM('outline', 'generate', 'freeform', 'search');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."feedback_selection" AS ENUM('mostly_understood', 'explain_again', 'have_question', 'stop_for_today');--> statement-breakpoint
CREATE TYPE "public"."grant_decision" AS ENUM('pending', 'approved', 'denied', 'expired');--> statement-breakpoint
CREATE TYPE "public"."learning_phase" AS ENUM('not_started', 'reading', 'quiz', 'completed');--> statement-breakpoint
CREATE TYPE "public"."material_scope" AS ENUM('common', 'org');--> statement-breakpoint
CREATE TYPE "public"."material_version_status" AS ENUM('draft', 'in_review', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('org_admin', 'material_editor', 'material_approver', 'clinician');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'line');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'read');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('hospital', 'operator');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('unread', 'reviewed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."revision_class" AS ENUM('initial', 'minor', 'substantive');--> statement-breakpoint
CREATE TYPE "public"."session_ended_by" AS ENUM('patient', 'clinician', 'system');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'archived', 'delete_requested');--> statement-breakpoint
CREATE TYPE "public"."source_text_source" AS ENUM('extracted', 'manual', 'none');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"kind" text DEFAULT 'patient',
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"mode" "ai_job_mode" NOT NULL,
	"source_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"model" text NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"input_token_count" integer,
	"output_token_count" integer,
	"error_message" text,
	"idempotency_key" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"output_version_id" uuid,
	"output_payload" jsonb,
	CONSTRAINT "ai_generation_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"org_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"consultation_session_id" uuid,
	"outcome" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultation_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"denied_at" timestamp with time zone,
	"new_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consultation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"clinician_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"qr_grant_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" "session_ended_by",
	"scope" jsonb DEFAULT '{"includesOtherOrgs":true}'::jsonb NOT NULL,
	CONSTRAINT "consultation_sessions_qr_grant_id_unique" UNIQUE("qr_grant_id")
);
--> statement-breakpoint
CREATE TABLE "homework_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_set_id" uuid NOT NULL,
	"consultation_session_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"homework_score" numeric(5, 2),
	"completed_count" integer NOT NULL,
	"assigned_count" integer NOT NULL,
	"item_details" jsonb NOT NULL,
	CONSTRAINT "homework_snapshots_prescription_set_id_unique" UNIQUE("prescription_set_id"),
	CONSTRAINT "homework_snapshots_consultation_session_id_unique" UNIQUE("consultation_session_id")
);
--> statement-breakpoint
CREATE TABLE "learning_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"material_version_id" uuid NOT NULL,
	"last_slide_seq" integer DEFAULT 0 NOT NULL,
	"phase" "learning_phase" DEFAULT 'not_started' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_version_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"image_ref" text,
	"voice_text" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" "material_version_status" DEFAULT 'draft' NOT NULL,
	"revision_class" "revision_class" DEFAULT 'initial' NOT NULL,
	"evaluation_group_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"summary" text,
	"learning_objectives" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"ai_generation_job_id" uuid,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"change_note" text
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "material_scope" NOT NULL,
	"owner_org_id" uuid,
	"primary_domain" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"title" text NOT NULL,
	"current_published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"patient_id" text PRIMARY KEY NOT NULL,
	"email_opt_in" boolean DEFAULT false NOT NULL,
	"line_opt_in" boolean DEFAULT false NOT NULL,
	"line_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"kind" text NOT NULL,
	"prescription_set_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"roles" "member_role"[] DEFAULT '{}'::member_role[] NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "org_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "patient_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"material_version_id" uuid NOT NULL,
	"prescription_set_id" uuid,
	"selection" "feedback_selection" NOT NULL,
	"free_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"material_version_id" uuid NOT NULL,
	"prescribed_by_user_id" text NOT NULL,
	"prescribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "prescription_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_session_id" uuid NOT NULL,
	"patient_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescription_sets_consultation_session_id_unique" UNIQUE("consultation_session_id")
);
--> statement-breakpoint
CREATE TABLE "qr_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_by_user_id" text,
	"claimed_org_id" uuid,
	"claimed_at" timestamp with time zone,
	"decision" "grant_decision" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"consultation_session_id" uuid,
	CONSTRAINT "qr_grants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "question_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"status" "question_status" NOT NULL,
	"response_type" text,
	"note" text,
	"clinician_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"consultation_session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_index" integer,
	"is_unknown" boolean DEFAULT false NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"material_version_id" uuid NOT NULL,
	"question_ids" uuid[] NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"n_questions" integer NOT NULL,
	"n_correct" integer DEFAULT 0 NOT NULL,
	"n_wrong" integer DEFAULT 0 NOT NULL,
	"n_unknown" integer DEFAULT 0 NOT NULL,
	"score_pct" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_version_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text NOT NULL,
	"related_slide_seq" integer,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_org_id" uuid,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"text_source" "source_text_source" DEFAULT 'none' NOT NULL,
	"extracted_text" text,
	"extraction_warning" text,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_permissions" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"allow_store" boolean DEFAULT false NOT NULL,
	"allow_ai" boolean DEFAULT false NOT NULL,
	"allow_derive" boolean DEFAULT false NOT NULL,
	"allow_publish" boolean DEFAULT false NOT NULL,
	"allow_share" boolean DEFAULT false NOT NULL,
	"rights_holder" text,
	"evidence_note" text,
	"restrictions" text,
	"checked_by_user_id" text,
	"checked_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_extensions" ADD CONSTRAINT "consultation_extensions_session_id_consultation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_extensions" ADD CONSTRAINT "consultation_extensions_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_clinician_id_user_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_qr_grant_id_qr_grants_id_fk" FOREIGN KEY ("qr_grant_id") REFERENCES "public"."qr_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_snapshots" ADD CONSTRAINT "homework_snapshots_prescription_set_id_prescription_sets_id_fk" FOREIGN KEY ("prescription_set_id") REFERENCES "public"."prescription_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_snapshots" ADD CONSTRAINT "homework_snapshots_consultation_session_id_consultation_sessions_id_fk" FOREIGN KEY ("consultation_session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slides" ADD CONSTRAINT "material_slides_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_prescription_set_id_prescription_sets_id_fk" FOREIGN KEY ("prescription_set_id") REFERENCES "public"."prescription_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_feedback" ADD CONSTRAINT "patient_feedback_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_feedback" ADD CONSTRAINT "patient_feedback_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_feedback" ADD CONSTRAINT "patient_feedback_prescription_set_id_prescription_sets_id_fk" FOREIGN KEY ("prescription_set_id") REFERENCES "public"."prescription_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_set_id_prescription_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."prescription_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescribed_by_user_id_user_id_fk" FOREIGN KEY ("prescribed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_sets" ADD CONSTRAINT "prescription_sets_consultation_session_id_consultation_sessions_id_fk" FOREIGN KEY ("consultation_session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_sets" ADD CONSTRAINT "prescription_sets_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_sets" ADD CONSTRAINT "prescription_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_grants" ADD CONSTRAINT "qr_grants_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_grants" ADD CONSTRAINT "qr_grants_claimed_by_user_id_user_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_grants" ADD CONSTRAINT "qr_grants_claimed_org_id_organizations_id_fk" FOREIGN KEY ("claimed_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_actions" ADD CONSTRAINT "question_actions_feedback_id_patient_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."patient_feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_actions" ADD CONSTRAINT "question_actions_clinician_id_user_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_actions" ADD CONSTRAINT "question_actions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_actions" ADD CONSTRAINT "question_actions_consultation_session_id_consultation_sessions_id_fk" FOREIGN KEY ("consultation_session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_permissions" ADD CONSTRAINT "source_permissions_source_id_source_documents_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_permissions" ADD CONSTRAINT "source_permissions_checked_by_user_id_user_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_events_at_idx" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "consult_ext_session_idx" ON "consultation_extensions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "consult_patient_idx" ON "consultation_sessions" USING btree ("patient_id","started_at");--> statement-breakpoint
CREATE INDEX "consult_clinician_idx" ON "consultation_sessions" USING btree ("clinician_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_progress_uq" ON "learning_progress" USING btree ("patient_id","material_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_slides_seq_uq" ON "material_slides" USING btree ("material_version_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "material_versions_no_uq" ON "material_versions" USING btree ("material_id","version_no");--> statement-breakpoint
CREATE INDEX "materials_scope_idx" ON "materials" USING btree ("scope","owner_org_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "patient_feedback_patient_idx" ON "patient_feedback" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prescription_items_set_material_uq" ON "prescription_items" USING btree ("set_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_grants_code_pending_uq" ON "qr_grants" USING btree ("code") WHERE decision = 'pending';--> statement-breakpoint
CREATE INDEX "qr_grants_patient_idx" ON "qr_grants" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "question_actions_feedback_idx" ON "question_actions" USING btree ("feedback_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_answers_uq" ON "quiz_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_patient_idx" ON "quiz_attempts" USING btree ("patient_id","material_version_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_questions_seq_uq" ON "quiz_questions" USING btree ("material_version_id","seq");