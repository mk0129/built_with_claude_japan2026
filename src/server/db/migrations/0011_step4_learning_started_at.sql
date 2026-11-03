-- 既存の行は開始日時が不明のため NULL のまま（列追加と既定値を分け、既存行に移行時刻が入らないようにする）
ALTER TABLE "learning_progress" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "learning_progress" ALTER COLUMN "started_at" SET DEFAULT now();
