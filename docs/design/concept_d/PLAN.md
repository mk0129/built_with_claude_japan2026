# Figma Make Concept D 移植計画（2026-11-03）

正本: Figma Make「shiori患者教育UI再設計」エクスポート `~/Developer/shiori-figma-reference/`（`src/App.tsx` 4,245 行、`src/ClinicianD.tsx` 3,548 行、`src/healthData.ts` 491 行、`src/index.css` 4,652 行。`public/` は favicon.svg のみで、画像アセットはない。医学図解・挿絵はすべて「画像準備中」のプレースホルダー）。

## 1. Figma コードと既存 shiori の構造比較

| 項目 | Figma Make | 既存 shiori |
|---|---|---|
| 基盤 | Vite 8 + React 19 + Tailwind v4（`@import 'tailwindcss'` のみ。ユーティリティクラスは未使用で、ほぼ全てが自前 CSS） | Next.js 16 App Router + React 19 + Tailwind v4 |
| 画面遷移 | `useState` の画面名（患者 `DPage` 14 種、医療者 `SessionState`×`Workspace`×`VisitPage`×スタジオ 7 工程）。URL は変わらない | URL ルーティング（`/home` `/library` `/learn/[id]` `/quiz/[id]` `/scores` `/share`、`/staff/*`） |
| データ | ファイル内の定数（`dLessons` `concerns` `libraryItems` `initialHealthRecords` など）。体調記録は App の state で患者・医療者が共有 | PGlite/Postgres + Drizzle。サーバーコンポーネントでサービス層を呼ぶ |
| 認証・権限 | なし（「プロトタイプ：患者が承認」などの擬似ボタン） | Better Auth、QR 一時共有（60 分・延長は患者承認）、サーバー側の権限チェック |
| CSS | `index.css` に全画面分（`:root` 変数、`.d-*` 患者、`.cd-*` 医療者、案 A/B/C 用、プロトタイプ枠） | `globals.css`（html 18px、BIZ UDPゴシック、行間 1.7）＋ `reset.css`（`.rs-*`）＋ `reset-staff.css`（`.rsd-*`） |
| フォント | Google Fonts: Noto Sans JP 400/500/600/700、Zen Old Mincho 600 | next/font: Noto Sans JP、BIZ UDPゴシック |
| 枠 | 患者は 390/430/タブレット（768）の端末枠、医療者は 1180/820 の端末枠。700px 以下では患者の端末枠が外れる | 実画面 |

## 2. 再利用するコンポーネント（Figma のコードをそのまま使う）

- 共通: `Icon`、`Logo`、`Pill`、`DImageSlot`（医学図解・挿絵のプレースホルダー。差し替えない）
- 患者: `DPrototype`（画面 state の本体）、`DHeader`、`DNav`、`DPageHeader`、`DStatus`、`DLessonCard`、`DHome`、`DPrescriptions`、`DLibrary`、`DCategory`、`DSearch`、`DDetail`、`DLearning`、`DQuiz`、`DExplanation`、`DResult`、`DHistory`、`DHealthTracker`、`DVitalField`、`DSymptomManager`、`DHealthHistory`、`DNotes`、`DShare`
- 医療者: `ClinicianD`、`SessionGate`、`VisitWorkspace`、`Summary`、`IntervisitSummary`、`ConcernDetail`、`HomeCourse`、`VitalCombinedGraph`、`PrescriptionLibrary`、`PrescriptionReview`、`PrescriptionSent`、`Studio`（`SourceStep` `ApproachStep` `ProposalStep` `MustCoverStep` `EditStep` `PreviewStep` `ApprovalStep`）
- データ: `healthData.ts`（そのまま）
- 移植しないもの: 案 A/B/C（`PatientA/B/C` `ClinicianA/B/C` `ReviewPage` など）、プロトタイプのヘッダー（案の切り替え・設計意図パネル）。検証シナリオ・テスト状態・Before/After は開発用画面 `/d/dev` にだけ残す

## 3. 画面の対応表

| Figma（Concept D） | 移植先（Phase 1） | Phase 2 で置き換える既存画面 |
|---|---|---|
| 患者 ホーム `home` | `/d/patient`（画面 state） | `/home` |
| 今回の教材 `prescriptions` | 同上 | `/home` の今回の処方 |
| 教材を探す `library` / `category` / `search` | 同上 | `/library` |
| 教材詳細 `detail`・図解拡大 | 同上 | （新規）教材詳細 |
| 学習 `learn` | 同上 | `/learn/[versionId]` |
| クイズ `quiz` / 解説 `explanation` / 振り返り `result` | 同上 | `/quiz/[versionId]` |
| 学習記録 `history` | 同上 | `/scores` |
| 体調記録 `health`（今日の記録・履歴グラフ・症状の管理） | 同上 | （新規） |
| 診察ノート `notes` | 同上 | 質問（`patient_feedback`）の拡張 |
| 一時共有 `share` | 同上 | `/share` |
| 医療者 共有開始（なし・申請 QR/コード・承認待ち・期限切れ） | `/d/clinician` | `/staff`、`/staff/scan` |
| 診察サマリー・質問／理解確認の詳細 | 同上 | `/staff/consult/[id]` |
| 在宅経過（経過表・バイタル統合・症状グラフ） | 同上 | （新規） |
| 情報処方（選択・確認・送信完了）・教材ライブラリ | 同上 | `PrescriptionPanel` |
| 教材スタジオ 7 工程 | 同上 | `/staff/studio/*`、`/staff/materials/[id]/preview` |

## 4. CSS・フォント・ルーティングの移植方針

- **スコープ分離はルートレイアウトで行う。** 既存画面を `src/app/(shiori)/` グループへ移し（URL は不変）、移植画面は別ルートレイアウト `src/app/(concept-d)/` に置く。既存の `globals.css`（html 18px・BIZ UDPゴシック・行間 1.7・`.pill` など）は移植画面に一切読み込まれない。逆に Figma の CSS も既存画面には読み込まれない。
- **Figma の CSS は無加工で使う**（`src/concept-d/figma.css` = `index.css` の複製。Google Fonts の `@import` もそのまま）。セレクタの書き換えやスコープ用のクラス付与はしない（詳細度が変わり、表示が変わるため）。
- 追加は `src/concept-d/app.css` の 2 規則だけ: 実アプリ表示では端末枠（`.d-device` `.cd-device`）を画面いっぱいにし、角丸・影を外す。これは Figma 自身が 700px 以下で行っている扱いと同じで、中身には触れない。
- 表示幅: 患者は 700px 以下で Figma の 390/430 表示（この 2 つは幅以外同一）、701px 以上でタブレット表示。医療者は 1000px 以上で 1180 表示、未満で 820 表示（820 未満は横スクロール）。
- ルーティング: Phase 1 は Figma と同じく画面 state で遷移する（`/d/patient` `/d/clinician`）。Phase 2 で既存 URL（`/home` など）に接続するときに、画面 state と URL の対応（`?page=` もしくは個別ルート）を決める。
- コードの変更は Next.js に必要な最小限: `"use client"`、型の区切り記号の欠落 2 か所と型の絞り込み 1 か所の修正、`variant`（app / prototype）の追加、`export`。

## 5. 既存バックエンドとの接続方針（Phase 2）

- UI の構造（DOM・クラス）は変えず、Figma の定数を「同じ形のデータ」を返すアダプターに差し替える（例: `dLessons` → `getPatientLibrary` から `DLesson[]` を作る）。
- サーバーの権限チェックは既存のまま: 患者画面は `requirePageUser("patient")`、医療者の患者データは有効な一時共有（`consultation_sessions`）がある間だけ取得する。
- 擬似ボタンを実処理へ: 「プロトタイプ：患者が承認」→ 既存の QR claim／approve のポーリング、「共有を延長」→ `consultation_extensions` の申請と患者の再承認、「共有終了」→ 既存の end API。
- クイズ: 選択だけでは記録しない／確定で記録する、は既存の挙動と同じ。採点・スナップショットは既存のサービスを使う。
- 教材スタジオ: AI 処理・医学的承認・公開制御は既存のものを使う。教材生成用の Claude API へ患者情報を送らない（原資料とテーマのみ）。
- 欠測値・教材 0 件・質問 0 件・長い質問文で崩れないことを、実データで撮影して確認する。

## 6. Figma にあって既存 DB にない機能

| 機能 | 必要なもの |
|---|---|
| 体調記録（バイタル: 体温・血圧・脈拍・SpO₂・体重、症状の程度 0–4、欠測） | 新テーブル（患者本人のみ書き込み、医療者は一時共有中のみ閲覧） |
| 症状の管理（表示する症状の選択・並べ替え・その他の症状） | 患者ごとの設定テーブル |
| 在宅経過表・バイタル統合グラフ・症状グラフ・外来間サマリー | 上記の集計（自動判定はしない） |
| 診察ノート（教材に紐づかない自由な質問、追加・編集・削除） | `patient_feedback` は教材版が必須のため、別テーブルか列の任意化が必要 |
| 質問の「確認済み／対応済み」を任意にする（文章入力なしで診察を終えられる） | `question_actions` は既存。記録フォーム必須の UI をやめる |
| 医療者が先に接続を申請し、患者アプリで QR を読み取る流れ | 既存は「患者が QR を表示 → 医療者が読み取る」。**向きが逆**（§7 の差分） |
| 学習の「要点だけ読む」・音声の再生位置表示 | 教材データに要点が必要（既存のスライド本文から作るか、教材の項目追加） |
| 動きの効果オン／オフ | 患者の設定（端末保存で足りる） |

## 7. 視覚的一致の検証計画（Playwright）

- Figma エクスポートを別プロジェクトとして Vite で起動（スクラッチ領域に複製。`src/` は無変更。Figma Make 専用プラグインと `.figma/make/site.json` を除いた最小の `vite.config.ts`。依存はロックファイルどおり）。
- `scripts/concept-d/compare.mjs`: Figma と shiori を同じビューポート・同じ操作手順で撮影し、画素差分（各チャネル差 > 24 を差分画素）を出す。
  - 患者: 390×844・430×844。Figma は 700px 以下で端末枠が外れるため、そのまま `.d-device` を撮る。
  - 医療者: 1180×800・820×800。Figma は端末枠 `.cd-device` を、shiori は全画面を撮る。
  - 端末内のスクロール領域を 1 画面ずつ（最大 6 枚）撮り、下の方の内容も比較する。
- 出力: `compare/figma/` `compare/shiori/` `compare/diff/`（差分画像と、左 Figma・中 shiori・右 差分の並び画像）、`results.json`。
