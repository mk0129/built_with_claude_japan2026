CREATE TYPE "public"."connect_decision" AS ENUM('pending', 'approved', 'denied', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "connect_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinician_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decision" "connect_decision" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"patient_id" text,
	"qr_grant_id" uuid,
	"consultation_session_id" uuid,
	CONSTRAINT "connect_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "connect_requests" ADD CONSTRAINT "connect_requests_clinician_id_user_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_requests" ADD CONSTRAINT "connect_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_requests" ADD CONSTRAINT "connect_requests_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_requests" ADD CONSTRAINT "connect_requests_qr_grant_id_qr_grants_id_fk" FOREIGN KEY ("qr_grant_id") REFERENCES "public"."qr_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connect_requests_clinician_idx" ON "connect_requests" USING btree ("clinician_id","created_at");