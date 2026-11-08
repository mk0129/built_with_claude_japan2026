/**
 * 架空のデモデータ。実在の人物・施設とは無関係。
 * 氏名は一般的な架空名、メールは example.com のみ。
 */
export type DemoAccount = {
  email: string;
  name: string;
  kind: "patient" | "staff";
  label: string;
  memberships?: { orgSlug: string; roles: ("org_admin" | "material_editor" | "material_approver" | "clinician")[]; displayName: string }[];
};

export const DEMO_ORGS = [
  { slug: "sakura-general", name: "さくら総合病院（架空）", kind: "hospital" as const },
  { slug: "hidamari-medical", name: "ひだまり医療センター（架空）", kind: "hospital" as const },
  { slug: "shiori-operator", name: "しおり運営（架空）", kind: "operator" as const },
];

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "patient1@example.com", name: "佐藤 花子", kind: "patient", label: "患者A（架空）" },
  { email: "patient2@example.com", name: "鈴木 美咲", kind: "patient", label: "患者B（架空）" },
  { email: "patient3@example.com", name: "高橋 由美", kind: "patient", label: "患者C（架空・外来間サマリーの通し確認用）" },
  { email: "patient4@example.com", name: "伊藤 涼子", kind: "patient", label: "患者D（架空・デモ全体の通し確認用）" },
  {
    email: "dr.yamada@example.com",
    name: "山田 太郎",
    kind: "staff",
    label: "さくら総合病院 医師",
    memberships: [{ orgSlug: "sakura-general", roles: ["clinician"], displayName: "山田 医師" }],
  },
  {
    email: "nurse.tanaka@example.com",
    name: "田中 恵",
    kind: "staff",
    label: "さくら総合病院 看護師・教材編集",
    memberships: [{ orgSlug: "sakura-general", roles: ["clinician", "material_editor"], displayName: "田中 看護師" }],
  },
  {
    email: "approver.sato@example.com",
    name: "佐藤 一郎",
    kind: "staff",
    label: "さくら総合病院 教材承認者・管理者",
    memberships: [{ orgSlug: "sakura-general", roles: ["clinician", "material_editor", "material_approver", "org_admin"], displayName: "佐藤 医師" }],
  },
  {
    email: "dr.kobayashi@example.com",
    name: "小林 直子",
    kind: "staff",
    label: "ひだまり医療センター 医師",
    memberships: [{ orgSlug: "hidamari-medical", roles: ["clinician"], displayName: "小林 医師" }],
  },
  {
    // 複数の医療機関に所属する医療者（接続申請を出す医療機関を選ぶ操作の確認用）
    email: "dr.nakamura@example.com",
    name: "中村 健",
    kind: "staff",
    label: "2施設に所属する医師（さくら総合病院・ひだまり医療センター）",
    memberships: [
      { orgSlug: "sakura-general", roles: ["clinician"], displayName: "中村 医師" },
      { orgSlug: "hidamari-medical", roles: ["clinician"], displayName: "中村 医師" },
    ],
  },
  {
    email: "op.editor@example.com",
    name: "運営 編集担当",
    kind: "staff",
    label: "運営 教材編集者（デモ）",
    memberships: [{ orgSlug: "shiori-operator", roles: ["material_editor"], displayName: "運営 編集担当" }],
  },
  {
    email: "op.approver@example.com",
    name: "運営 承認担当",
    kind: "staff",
    label: "運営 共通教材承認者（デモ・本番の医学的承認ではない）",
    memberships: [{ orgSlug: "shiori-operator", roles: ["material_approver", "org_admin"], displayName: "運営 承認担当" }],
  },
];

/** 教材10本の骨子（本文・クイズは Day2 以降に投入） */
import { SOCIAL_MATERIALS } from "./seed-content-social";
import { MORE_MATERIALS } from "./seed-content-more";

export const DEMO_MATERIALS: { title: string; primaryDomain: string; scope: "common" | "org"; ownerOrgSlug?: string; summary: string }[] = [
  ...SOCIAL_MATERIALS,
  // 2026-11-08 追加: 他のがん種・免疫療法・飲み薬・放射線・副作用のセルフケア・家族と緩和ケア（16 本。架空の承認者による承認）
  ...MORE_MATERIALS,
  { title: "乳がんの診断と病期の考え方", primaryDomain: "diagnosis_staging", scope: "common", summary: "病期（ステージ）が何を表すか、検査結果の見方を短く整理します。" },
  { title: "サブタイプと治療方針のつながり", primaryDomain: "diagnosis_staging", scope: "common", summary: "ホルモン受容体やHER2が治療の選び方にどう関わるかを説明します。" },
  { title: "乳房の手術の種類と選び方", primaryDomain: "surgery", scope: "common", summary: "乳房温存手術と乳房全切除の違い、センチネルリンパ節生検について。" },
  { title: "手術後の生活と気をつけること", primaryDomain: "surgery", scope: "common", summary: "退院後の創部ケア、リンパ浮腫の予防、日常動作の目安。" },
  { title: "薬物療法の種類（化学療法・ホルモン療法・分子標的）", primaryDomain: "drug_therapy", scope: "common", summary: "それぞれの薬の目的と、治療の流れ。" },
  { title: "化学療法中の副作用とセルフケア", primaryDomain: "side_effects_daily_life", scope: "common", summary: "よくある副作用の観察点と自宅での対処、すぐに病院へ連絡するサイン、仕事や生活の工夫。" },
  { title: "放射線治療の進め方と皮膚のケア", primaryDomain: "radiation", scope: "common", summary: "治療のスケジュール、皮膚炎を和らげる工夫。" },
  { title: "こころのケアと相談先", primaryDomain: "mental_care_support", scope: "common", summary: "不安や落ち込みのサイン、治療・気持ち・仕事・お金のことを相談できる窓口。" },
  { title: "さくら総合病院 外来化学療法室のご案内", primaryDomain: "drug_therapy", scope: "org", ownerOrgSlug: "sakura-general", summary: "当院の外来化学療法室の流れと持ち物（架空）。" },
  { title: "さくら総合病院 術後リンパ浮腫外来", primaryDomain: "side_effects_daily_life", scope: "org", ownerOrgSlug: "sakura-general", summary: "当院のリンパ浮腫外来の受診方法（架空）。" },
];
