CREATE TABLE "patient_next_visits" (
	"patient_id" text PRIMARY KEY NOT NULL,
	"visit_date" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_next_visits" ADD CONSTRAINT "patient_next_visits_patient_id_user_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;