import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ---------- 共通 ----------
const ts = (name: string) => timestamp(name, { withTimezone: true });
const id = () => uuid("id").primaryKey().defaultRandom();
const userRef = (name: string) => text(name).references(() => user.id, { onDelete: "restrict" });

// ---------- 組織 ----------
export const orgKind = pgEnum("org_kind", ["hospital", "operator"]);
export const orgStatus = pgEnum("org_status", ["active", "suspended"]);
export const memberRole = pgEnum("member_role", [
  "org_admin",
  "material_editor",
  "material_approver",
  "clinician",
]);

export const organizations = pgTable("organizations", {
  id: id(),
  kind: orgKind("kind").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: orgStatus("status").notNull().default("active"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: userRef("user_id").notNull(),
    roles: memberRole("roles").array().notNull().default(sql`'{}'::member_role[]`),
    displayName: text("display_name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("org_members_user_idx").on(t.userId)],
);

// ---------- QR と診察セッション ----------
export const grantDecision = pgEnum("grant_decision", ["pending", "approved", "denied", "expired"]);

export const qrGrants = pgTable(
  "qr_grants",
  {
    id: id(),
    patientId: userRef("patient_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    code: text("code").notNull(), // 6桁の代替コード（P08）
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    claimedByUserId: userRef("claimed_by_user_id"),
    claimedOrgId: uuid("claimed_org_id").references(() => organizations.id),
    claimedAt: ts("claimed_at"),
    decision: grantDecision("decision").notNull().default("pending"),
    decidedAt: ts("decided_at"),
    consultationSessionId: uuid("consultation_session_id"),
  },
  (t) => [
    uniqueIndex("qr_grants_code_pending_uq").on(t.code).where(sql`decision = 'pending'`),
    index("qr_grants_patient_idx").on(t.patientId, t.createdAt),
  ],
);

export const sessionEndedBy = pgEnum("session_ended_by", ["patient", "clinician", "system"]);

export const consultationSessions = pgTable(
  "consultation_sessions",
  {
    id: id(),
    patientId: userRef("patient_id").notNull(),
    clinicianId: userRef("clinician_id").notNull(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    qrGrantId: uuid("qr_grant_id").notNull().references(() => qrGrants.id).unique(),
    startedAt: ts("started_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    endedAt: ts("ended_at"),
    endedBy: sessionEndedBy("ended_by"),
    scope: jsonb("scope").$type<{ includesOtherOrgs: boolean }>().notNull().default({ includesOtherOrgs: true }),
  },
  (t) => [
    index("consult_patient_idx").on(t.patientId, t.startedAt),
    index("consult_clinician_idx").on(t.clinicianId, t.startedAt),
  ],
);

export const consultationExtensions = pgTable(
  "consultation_extensions",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().references(() => consultationSessions.id, { onDelete: "cascade" }),
    requestedByUserId: userRef("requested_by_user_id").notNull(),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    approvedAt: ts("approved_at"),
    deniedAt: ts("denied_at"),
    newExpiresAt: ts("new_expires_at"),
  },
  (t) => [index("consult_ext_session_idx").on(t.sessionId)],
);

// ---------- 原資料 ----------
export const sourceStatus = pgEnum("source_status", ["active", "archived", "delete_requested"]);
export const sourceTextSource = pgEnum("source_text_source", ["extracted", "manual", "none"]);

export const sourceDocuments = pgTable("source_documents", {
  id: id(),
  ownerOrgId: uuid("owner_org_id").references(() => organizations.id), // null = 共通（運営）
  title: text("title").notNull(),
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  status: sourceStatus("status").notNull().default("active"),
  textSource: sourceTextSource("text_source").notNull().default("none"),
  extractedText: text("extracted_text"),
  extractionWarning: text("extraction_warning"), // 図表欠落など手動確認が必要な旨
  uploadedByUserId: userRef("uploaded_by_user_id").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastUsedAt: ts("last_used_at"),
});

export const sourcePermissions = pgTable("source_permissions", {
  sourceId: uuid("source_id").primaryKey().references(() => sourceDocuments.id, { onDelete: "cascade" }),
  allowStore: boolean("allow_store").notNull().default(false),
  allowAi: boolean("allow_ai").notNull().default(false),
  allowDerive: boolean("allow_derive").notNull().default(false),
  allowPublish: boolean("allow_publish").notNull().default(false),
  allowShare: boolean("allow_share").notNull().default(false),
  rightsHolder: text("rights_holder"),
  evidenceNote: text("evidence_note"),
  restrictions: text("restrictions"),
  checkedByUserId: userRef("checked_by_user_id"),
  checkedAt: ts("checked_at"),
  expiresAt: ts("expires_at"),
});

// ---------- 教材 ----------
export const materialScope = pgEnum("material_scope", ["common", "org"]);
export const materialVersionStatus = pgEnum("material_version_status", ["draft", "in_review", "published", "retired"]);
export const revisionClass = pgEnum("revision_class", ["initial", "minor", "substantive"]);
export const retireReason = pgEnum("retire_reason", ["safety", "superseded", "other"]);

/** 領域タグ（初期6領域。将来追加可能なので DB 制約にはしない） */
export const DOMAIN_TAGS = [
  "diagnosis_staging",
  "surgery",
  "drug_therapy",
  "radiation",
  "side_effects_daily_life",
  "mental_care_support",
] as const;
export type DomainTag = (typeof DOMAIN_TAGS)[number];

export const materials = pgTable(
  "materials",
  {
    id: id(),
    scope: materialScope("scope").notNull(),
    ownerOrgId: uuid("owner_org_id").references(() => organizations.id),
    primaryDomain: text("primary_domain").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    title: text("title").notNull(),
    currentPublishedVersionId: uuid("current_published_version_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("materials_scope_idx").on(t.scope, t.ownerOrgId)],
);

export const materialVersions = pgTable(
  "material_versions",
  {
    id: id(),
    materialId: uuid("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    status: materialVersionStatus("status").notNull().default("draft"),
    revisionClass: revisionClass("revision_class").notNull().default("initial"),
    evaluationGroupId: uuid("evaluation_group_id").notNull().defaultRandom(),
    summary: text("summary"),
    learningObjectives: text("learning_objectives").array().notNull().default(sql`'{}'::text[]`),
    sourceDocumentIds: uuid("source_document_ids").array().notNull().default(sql`'{}'::uuid[]`),
    aiGenerationJobId: uuid("ai_generation_job_id"),
    createdByUserId: userRef("created_by_user_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    approvedByUserId: userRef("approved_by_user_id"),
    approvedAt: ts("approved_at"),
    publishedAt: ts("published_at"),
    retiredAt: ts("retired_at"),
    retireReason: retireReason("retire_reason"), // safety の旧版スコアは集計から除外（D27）
    changeNote: text("change_note"),
  },
  (t) => [uniqueIndex("material_versions_no_uq").on(t.materialId, t.versionNo)],
);

/** 情報処方テンプレート（例: 初回診断時セット）。共通 or 病院独自 */
export const prescriptionTemplates = pgTable("prescription_templates", {
  id: id(),
  scope: materialScope("scope").notNull(),
  ownerOrgId: uuid("owner_org_id").references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  materialIds: uuid("material_ids").array().notNull().default(sql`'{}'::uuid[]`),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const materialSlides = pgTable(
  "material_slides",
  {
    id: id(),
    materialVersionId: uuid("material_version_id").notNull().references(() => materialVersions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    imageRef: text("image_ref"),
    voiceText: text("voice_text"),
    sourceRefs: jsonb("source_refs").$type<SourceRef[]>().notNull().default([]),
    proposition: text("proposition"), // 命題（ひとこと要約）。null 可
    detailMd: text("detail_md"), // 「くわしく」に入れる補足。null 可
  },
  (t) => [uniqueIndex("material_slides_seq_uq").on(t.materialVersionId, t.seq)],
);

// ---------- 図解アセット（医学的図解・情緒的イラスト） ----------
export const figureType = pgEnum("figure_type", ["medical", "editorial"]);
export const figureReviewStatus = pgEnum("figure_review_status", ["draft", "pending_review", "approved", "rejected"]);
export const copyrightStatus = pgEnum("copyright_status", ["internal_ai_generated", "licensed", "unknown"]);

/** 画像アセット本体のメタデータ。ラベル・注釈は画像に埋め込まず placements 側で持つ */
export const figureAssets = pgTable("figure_assets", {
  assetId: text("asset_id").primaryKey(), // 例: MED-001
  version: integer("version").notNull().default(1),
  type: figureType("type").notNull(),
  filename: text("filename"), // public/assets/{medical|editorial}/ 配下。null = 未納品
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text").notNull(),
  longDescription: text("long_description"),
  learningObjective: text("learning_objective"),
  sourceRefs: jsonb("source_refs").$type<SourceRef[]>().notNull().default([]),
  reviewStatus: figureReviewStatus("review_status").notNull().default("draft"),
  reviewerUserId: userRef("reviewer_user_id"),
  reviewedAt: ts("reviewed_at"),
  reviewNote: text("review_note"),
  copyrightStatus: copyrightStatus("copyright_status").notNull().default("unknown"),
  generatorNote: text("generator_note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type FigureLabel = { id: string; text: string; anchor: { x: number; y: number }; offset?: { x: number; y: number } };

/** 教材の版・画面へのアセット配置。ラベル（％座標）と監修済みの短い補足を持つ */
export const figurePlacements = pgTable(
  "figure_placements",
  {
    id: id(),
    assetId: text("asset_id").notNull().references(() => figureAssets.assetId, { onDelete: "cascade" }),
    materialVersionId: uuid("material_version_id").notNull().references(() => materialVersions.id, { onDelete: "cascade" }),
    slideSeq: integer("slide_seq").notNull(),
    labels: jsonb("labels").$type<FigureLabel[]>().notNull().default([]),
    caption: text("caption"),
    sourceNote: text("source_note"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("figure_placements_version_idx").on(t.materialVersionId, t.slideSeq)],
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: id(),
    materialVersionId: uuid("material_version_id").notNull().references(() => materialVersions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    stem: text("stem").notNull(),
    options: jsonb("options").$type<[string, string, string]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation").notNull(),
    relatedSlideSeq: integer("related_slide_seq"),
    sourceRefs: jsonb("source_refs").$type<SourceRef[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("quiz_questions_seq_uq").on(t.materialVersionId, t.seq)],
);

export type SourceRef = { sourceId: string; section?: string; quote?: string };

export const aiJobMode = pgEnum("ai_job_mode", ["outline", "generate", "freeform", "search"]);
export const aiJobStatus = pgEnum("ai_job_status", ["queued", "running", "succeeded", "failed"]);

export const aiGenerationJobs = pgTable("ai_generation_jobs", {
  id: id(),
  orgId: uuid("org_id").references(() => organizations.id),
  mode: aiJobMode("mode").notNull(),
  sourceDocumentIds: uuid("source_document_ids").array().notNull().default(sql`'{}'::uuid[]`),
  model: text("model").notNull(),
  status: aiJobStatus("status").notNull().default("queued"),
  inputTokenCount: integer("input_token_count"),
  outputTokenCount: integer("output_token_count"),
  errorMessage: text("error_message"),
  idempotencyKey: text("idempotency_key").unique(),
  createdByUserId: userRef("created_by_user_id").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  outputVersionId: uuid("output_version_id"),
  outputPayload: jsonb("output_payload"),
});

// ---------- 処方・学習・採点 ----------
export const prescriptionSets = pgTable("prescription_sets", {
  id: id(),
  consultationSessionId: uuid("consultation_session_id").notNull().references(() => consultationSessions.id).unique(),
  patientId: userRef("patient_id").notNull(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const prescriptionItems = pgTable(
  "prescription_items",
  {
    id: id(),
    setId: uuid("set_id").notNull().references(() => prescriptionSets.id, { onDelete: "cascade" }),
    materialId: uuid("material_id").notNull().references(() => materials.id),
    materialVersionId: uuid("material_version_id").notNull().references(() => materialVersions.id),
    prescribedByUserId: userRef("prescribed_by_user_id").notNull(),
    prescribedAt: ts("prescribed_at").notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [uniqueIndex("prescription_items_set_material_uq").on(t.setId, t.materialId)],
);

export const learningPhase = pgEnum("learning_phase", ["not_started", "reading", "quiz", "completed"]);

export const learningProgress = pgTable(
  "learning_progress",
  {
    id: id(),
    patientId: userRef("patient_id").notNull(),
    materialVersionId: uuid("material_version_id").notNull().references(() => materialVersions.id),
    lastSlideSeq: integer("last_slide_seq").notNull().default(0),
    phase: learningPhase("phase").notNull().default("not_started"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learning_progress_uq").on(t.patientId, t.materialVersionId)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: id(),
    patientId: userRef("patient_id").notNull(),
    materialVersionId: uuid("material_version_id").notNull().references(() => materialVersions.id),
    questionIds: uuid("question_ids").array().notNull(), // 開始時に固定
    startedAt: ts("started_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
    nQuestions: integer("n_questions").notNull(),
    nCorrect: integer("n_correct").notNull().default(0),
    nWrong: integer("n_wrong").notNull().default(0),
    nUnknown: integer("n_unknown").notNull().default(0),
    scorePct: numeric("score_pct"), // 丸めない（D26）。採点は n_correct / n_questions から再計算可能
  },
  (t) => [
    index("quiz_attempts_patient_idx").on(t.patientId, t.materialVersionId, t.completedAt),
    // 進行中の挑戦は患者×版につき 1 件（同時リクエストや二重タップで重複させない）
    uniqueIndex("quiz_attempts_in_progress_uq").on(t.patientId, t.materialVersionId).where(sql`completed_at IS NULL`),
  ],
);

export const quizAnswers = pgTable(
  "quiz_answers",
  {
    id: id(),
    attemptId: uuid("attempt_id").notNull().references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => quizQuestions.id),
    selectedIndex: integer("selected_index"), // null = わからない
    isUnknown: boolean("is_unknown").notNull().default(false),
    isCorrect: boolean("is_correct").notNull().default(false),
    answeredAt: ts("answered_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("quiz_answers_uq").on(t.attemptId, t.questionId)],
);

export const homeworkSnapshots = pgTable("homework_snapshots", {
  id: id(),
  prescriptionSetId: uuid("prescription_set_id").notNull().references(() => prescriptionSets.id).unique(),
  consultationSessionId: uuid("consultation_session_id").notNull().references(() => consultationSessions.id).unique(),
  capturedAt: ts("captured_at").notNull().defaultNow(),
  homeworkScore: numeric("homework_score"), // 丸めない（D26）
  completedCount: integer("completed_count").notNull(),
  assignedCount: integer("assigned_count").notNull(),
  itemDetails: jsonb("item_details").$type<SnapshotItem[]>().notNull(),
});

export type SnapshotItem = {
  materialId: string;
  materialVersionId: string;
  title: string;
  phase: string;
  scorePct: number | null;
  latestCompletedAttemptId: string | null;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
};

// ---------- 質問・対応 ----------
export const feedbackSelection = pgEnum("feedback_selection", [
  "mostly_understood",
  "explain_again",
  "have_question",
  "stop_for_today",
]);
export const questionStatus = pgEnum("question_status", ["unread", "reviewed", "resolved"]);

export const patientFeedback = pgTable(
  "patient_feedback",
  {
    id: id(),
    patientId: userRef("patient_id").notNull(),
    materialVersionId: uuid("material_version_id").notNull().references(() => materialVersions.id),
    prescriptionSetId: uuid("prescription_set_id").references(() => prescriptionSets.id),
    selection: feedbackSelection("selection").notNull(),
    freeText: text("free_text"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("patient_feedback_patient_idx").on(t.patientId, t.createdAt)],
);

export const questionActions = pgTable(
  "question_actions",
  {
    id: id(),
    feedbackId: uuid("feedback_id").notNull().references(() => patientFeedback.id, { onDelete: "cascade" }),
    status: questionStatus("status").notNull(),
    responseType: text("response_type"), // verbal_explanation | additional_prescription | referral | other
    note: text("note"),
    clinicianId: userRef("clinician_id").notNull(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    consultationSessionId: uuid("consultation_session_id").notNull().references(() => consultationSessions.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("question_actions_feedback_idx").on(t.feedbackId, t.createdAt)],
);

// ---------- 通知 ----------
export const notificationChannel = pgEnum("notification_channel", ["in_app", "email", "line"]);
export const notificationStatus = pgEnum("notification_status", ["pending", "sent", "failed", "read"]);

export const notifications = pgTable("notifications", {
  id: id(),
  patientId: userRef("patient_id").notNull(),
  kind: text("kind").notNull(),
  prescriptionSetId: uuid("prescription_set_id").references(() => prescriptionSets.id),
  channel: notificationChannel("channel").notNull(),
  status: notificationStatus("status").notNull().default("pending"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  sentAt: ts("sent_at"),
  readAt: ts("read_at"),
});

export const notificationPreferences = pgTable("notification_preferences", {
  patientId: userRef("patient_id").primaryKey(),
  emailOptIn: boolean("email_opt_in").notNull().default(false),
  lineOptIn: boolean("line_opt_in").notNull().default(false),
  lineUserId: text("line_user_id"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------- 監査・設定 ----------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actorUserId: text("actor_user_id"),
    orgId: uuid("org_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    consultationSessionId: uuid("consultation_session_id"),
    outcome: text("outcome").notNull(), // ok | denied | error
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_events_at_idx").on(t.at), index("audit_events_resource_idx").on(t.resourceType, t.resourceId)],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedByUserId: text("updated_by_user_id"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
