export const DOMAIN_LABEL: Record<string, string> = {
  diagnosis_staging: "診断と病期",
  surgery: "手術",
  drug_therapy: "薬物療法",
  radiation: "放射線",
  side_effects_daily_life: "副作用と生活",
  mental_care_support: "心のケア・制度",
};

export const DOMAIN_ORDER = Object.keys(DOMAIN_LABEL);

/** 組織内の役割（内部コードを UI に出さない） */
export const ROLE_LABEL: Record<string, string> = {
  clinician: "診療担当",
  material_editor: "教材編集",
  material_approver: "教材承認",
  org_admin: "組織管理",
};

export const PHASE_LABEL: Record<string, string> = {
  not_started: "未着手",
  reading: "読んでいる途中",
  quiz: "確認問題の途中",
  completed: "読み終えた",
};

export const SELECTION_LABEL: Record<string, string> = {
  mostly_understood: "だいたい理解できた",
  explain_again: "もう一度説明してほしい",
  have_question: "質問がある",
  stop_for_today: "今日はここまで",
};

export const STATUS_LABEL: Record<string, string> = {
  unread: "未確認",
  reviewed: "確認済み",
  resolved: "対応済み",
};

export const RESPONSE_LABEL: Record<string, string> = {
  verbal_explanation: "口頭で説明",
  additional_prescription: "追加の情報処方",
  referral: "他職種・窓口を案内",
  other: "その他",
};

/** GEN-05 必須事項の種別・分類 */
export const MUST_COVER_KIND_LABEL: Record<string, string> = {
  emergency: "すぐに連絡・受診",
  visit: "受診・連絡の目安",
  prohibition: "してはいけないこと",
  caution: "注意",
  fact: "前提となる事実",
};
export const MUST_COVER_STATUS_LABEL: Record<string, string> = {
  required: "この教材で必須",
  other_material: "別教材で扱う",
  needs_review: "医療者の確認が必要",
};

/** 表示時のみ四捨五入（D26） */
export function fmtScore(v: number | null | undefined): string {
  return v === null || v === undefined ? "未評価" : `${Math.round(v)} 点`;
}

/** 教材の所要時間の目安（閲覧実績ではない） */
export function estimateMinutes(slideCount: number, questionCount: number): number {
  return Math.max(2, Math.round(slideCount * 1.2 + questionCount * 0.7));
}

export function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

/** 年を省いた日付（例: 10月24日）。今年の日付を短く見せる場面で使う */
export function fmtDateShort(d: string | Date): string {
  const x = new Date(d);
  return x.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" });
}
