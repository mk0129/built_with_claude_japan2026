# 実装計画（採用案の承認後に着手。本計画自体はコード変更を含まない）

前提: 認証・QR・承認・処方・採点・スナップショット・質問管理のサービス層と API は変更しない。変更は `src/app/(patient)/**`、`src/app/staff/consult/**`、`src/components/**`、`src/app/globals.css`、`src/lib/labels.ts`、教材データ（図解の参照）に限定する。

## フェーズと順序

| 順 | 対象 | 変更内容 | 影響範囲 | 目安 |
|---|---|---|---|---|
| 1 | トークン・基盤 | `globals.css` に患者／医療者トークンを分離、`Figure` `Proposition` `AudioBar` `NavBar` `ReviewTile` `MaterialRow` `NextCard` を `src/components/patient/` に追加 | CSS、新規コンポーネント | 0.5 日 |
| 2 | 患者ホーム | NextCard ＋ MaterialRow で再構成。共有案内を折りたたみに。既存の `listHomeworkForPatient` をそのまま使用 | `(patient)/home/page.tsx` | 0.5 日 |
| 3 | 教材 | 命題フィールドの表示、Figure、Disclosure、AudioBar、固定 NavBar。`material_slides` に `proposition`（命題）と `figure_ref`（図の ID）を追加する**マイグレーション**（列追加のみ、既存データは null 可） | `(patient)/learn/**`、`domain-schema.ts`、seed-content | 1 日 |
| 4 | クイズ・結果 | 回答前の案内文、回答後の「ポイント」一文（`quiz_questions.point` 列追加、null 可）、結果の ReviewTile 化と「点数をみる」 | `(patient)/quiz/**`、schema、seed-content | 0.5 日 |
| 5 | スコア詳細 | 上部に「確認できたこと／もう一度見られること／次の診察で聞きたいこと」の要約、点数は下部 | `(patient)/scores/page.tsx` | 0.5 日 |
| 6 | 医療者 | 番号付き 1 列の「今日の確認事項」、候補タグ（どの確認事項から追加したか）、スコアの圧縮 | `staff/consult/**` | 0.5 日 |
| 7 | 図解 | 代表 2 本（病期／こころのケア）を SVG で制作し「監修待ち」表示で組み込む。残り 8 本は仕様のみ | `public/figures/*.svg`、seed | 1 日 |
| 8 | 検証 | Playwright: 375/390/430/820/1180/1440 のスクリーンショット、通し操作、CTA 到達性。Vitest 全件。before/after の並列記録 | tests | 0.5 日 |

合計の目安: 5 日（ハッカソン残期間に対し、1〜4 と 8 を優先。5〜7 は時間次第）。

## 既存テストへの影響

- Vitest（34 件）: サービス層を触らないため影響なし。列追加のマイグレーションは `null` 許容で既存データを壊さない。
- Playwright: 文言変更に伴いセレクタを更新（「読む・聞く」「もう一度見ておきたいところ」など）。構造は維持。

## データ変更（列追加のみ）

| テーブル | 列 | 型 | 用途 |
|---|---|---|---|
| `material_slides` | `proposition` | text null | 画面の命題（ひとこと要約） |
| `material_slides` | `figure_ref` | text null | 図解 SVG の ID |
| `material_slides` | `detail_md` | text null | 「くわしく」に入れる補足 |
| `quiz_questions` | `point` | text null | 回答後に最初に示す 1 文 |
| `figures`（新規） | id, title, kind, status(`draft`/`pending_review`/`approved`), reviewer, reviewed_at, source_note | — | 図解の監修状態管理（D20/D25 の原資料管理と整合） |

教材の AI 生成（Day 4）では、`proposition` / `point` / `figure_ref` の候補も構造化出力に含める。

## ロールバック

各フェーズは独立したコミットにし、問題があればフェーズ単位で戻す。トークンの分離（フェーズ 1）だけでも現行 UI は崩れないよう、既存クラス名を維持する。
