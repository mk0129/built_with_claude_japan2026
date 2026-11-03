# Figma Make Concept D 移植 — Phase 1 報告（2026-11-03）

計画（構造比較・再利用コンポーネント・画面対応・CSS/フォント/ルーティング方針・接続方針・DB にない機能・検証計画）は [PLAN.md](PLAN.md)。

## 実施内容

- **Figma のコードをそのまま移植**（`src/concept-d/`）
  - `PatientD.tsx`: `App.tsx` の Concept D 部分（`Icon` `Logo` `Pill` と `DLesson`〜`DShare`）を行単位で複製。
  - `ClinicianD.tsx` `healthData.ts`: 複製。`figma.css`: `index.css` の複製（無加工）。
  - 変更点は次のみ。
    1. `"use client"` と `export` の追加。
    2. 型の区切り記号の欠落 2 か所と、型の絞り込み 1 か所の修正（Figma の Vite は通るが `tsc` が通らないため）。
    3. `variant`（`app` / `prototype`）の追加。`app` では検証シナリオ・テスト状態・Before/After を出さず、端末枠に `d-device-app` / `cd-device-app` を付ける。
  - `ConceptDApp.tsx`: Figma の `App()` の Concept D 部分の状態（体調記録・トースト）を同じ形で持つラッパー。
  - `app.css`: 端末枠を画面いっぱいにし、角丸・影・幅の遷移を外す 2 規則だけ。
- **ルート**
  - `/d/patient`（患者のみ）
  - `/d/clinician`（医療者のみ）
  - `/d/dev`（医療者のみ）: Figma の検証シナリオ・テスト状態・表示幅の切り替えつき。案 A/B/C は含めない。
  - アクセス制御はいずれも既存の `requirePageUser`。
- **CSS の分離**
  - 既存画面を `src/app/(shiori)/` へ移動した（URL は不変。import パス 6 か所を更新）。
  - `/d/*` は別のルートレイアウト `src/app/(concept-d)/layout.tsx` にした。既存の `globals.css`（html 18px・BIZ UDPゴシック・行間 1.7）と Figma の CSS は互いに読み込まれない。
- **フォント**: Figma と同じ Google Fonts の `@import`（Noto Sans JP 400–700、Zen Old Mincho 600）。
- **医学図解**: Figma のプレースホルダー（「画像準備中」）をそのまま維持。

## 画面比較の結果

`scripts/concept-d/compare.mjs` で、Figma エクスポート（Vite・ロックファイルどおりの依存）と shiori を同じビューポート・同じ操作手順で撮影し、画素比較した。

- **対象**: 端末内の実アプリ（患者 `.d-device`、医療者 `.cd-device`）。
- **スクロール**: 端末内のスクロール領域は 1 画面ずつ撮った。
- **差分の基準**: RGB いずれかのチャネル差が 24 を超える画素を差分として数えた。

| | 画面 | 撮影枚数 | 差分 0 の枚数 | 最大差分 |
|---|---|---|---|---|
| 患者 390×844 | 18 | 36 | 34 | 32 画素（0.01%） |
| 患者 430×844 | 18 | 36 | 36 | 0 |
| 医療者 1180×800 | 21 | 30 | 25 | 79 画素（0.008%） |
| 医療者 820×800 | 21 | 38 | 7 | 133 画素（0.02%） |

- **患者側の画面**: ホーム、今回の教材、教材を探す、領域別、教材詳細、図解拡大、学習、要点だけ読む、クイズ、選択後、解説、振り返り、学習記録、体調記録（今日の記録・履歴グラフ・症状の追加）、診察ノート、一時共有。
- **医療者側の画面**: 共有開始（なし・QR・6 桁コード・承認待ち・期限切れ）、診察サマリー、質問・理解確認の詳細、情報処方（選択・確認・送信完了）、在宅経過（経過表・バイタル統合・症状グラフ）、教材ライブラリ、教材スタジオ 7 工程。
- **一覧画像**: `sheets/patient_390.jpg` `patient_430.jpg` `clinician_1180.jpg` `clinician_820.jpg`。左が Figma Make、右が shiori。
- **全画像**: `compare/`（`figma/` `shiori/` `diff/`、`results.json`）。56MB のため Git 管理外。

### 残った差分の分類（すべて環境差。デザイン差は 0 件）

| 差分 | 内容 | 判断 |
|---|---|---|
| 医療者 820 の 6 画素（ほぼ全画面） | 回転したロゴマーク（`rotate(-3deg)`）の輪郭の 1 画素 | 描画の丸め。位置・色・大きさは同じ |
| 医療者 820 在宅経過の症状グラフ 133 画素、スタジオ 1・2 工程 65〜79 画素、患者 390 診察ノート 32 画素 | 英字の小見出し（AT-HOME COURSE、NEXT VISIT など）の字形の 1 画素の濃淡 | 字形のアンチエイリアス。同じ画面でも実行ごとに出たり消えたりする（ホームは 1 回目 31 画素、2 回目 0） |
| 医療者の撮影条件 | Figma の医療者端末は y = 260.5 の半端な位置にあり、文字が 0.5px ずれて約 1 万画素の差になった。角丸（18px）も外枠の装飾 | Figma 側だけプロトタイプの外枠（上部バー・テストバー）を非表示にし、角丸を外して撮影した（端末内は無変更）。shiori 側は変更していない |

## 過去の仕様・既存実装との差分（Phase 2 の前に決めたいこと）

1. **QR の向き**
   - Figma: 医療者の画面に QR を出し、患者アプリで読み取る。6 桁コードは「患者アプリに表示されたコードを医療者が入力」。
   - 既存: 患者が QR とコードを出し、医療者が読み取る。
   - 6 桁コードの向きは既存と同じだが、QR は逆。
2. **動きの効果**
   - Figma には回答後のフィードバックの穏やかな表示（`d-gentle-in`）と「動きの効果：オン／オフ」がある。`prefers-reduced-motion` では止まる。
   - 以前の方針「モーションアニメーションは実装しない」と衝突する。今回は Figma を正本として、そのまま残した。
3. **診察ノート**
   - Figma の質問は教材に紐づかない自由記述（追加・編集・削除）。
   - 既存の `patient_feedback` は教材版が必須のため、テーブルの変更が必要。
4. **医療者の記録**
   - Figma は「確認済み／対応済み」「補助メモ」をすべて任意にし、文章入力なしで共有を終了できる（二重記録をしない原則）。
   - 既存の診察画面の記録フォームは、この原則に合わせて任意に寄せる。
5. **Figma の擬似操作**
   - 「プロトタイプ：患者が承認」「プロトタイプ：再承認」は Phase 2 で実際の承認待ち（ポーリング）に置き換える。
   - Phase 1 では Figma どおり表示している。
6. **体調記録・在宅経過・外来間サマリー**: DB がない（PLAN §6）。
7. **患者名や日付**: 「佐藤さん」「6月14日」などは Figma の架空データのまま（Phase 2 で実データに置き換え）。

## テスト

- TypeScript エラー 0（`.next` の古い生成型を除く）、ESLint エラー 0（警告 5。うち 4 件は移植コードの未使用変数で、Figma のまま残した）、Vitest 63 件合格。
- Playwright: 既存の回帰一式 25 件合格（撮影専用 8 件はスキップ）＋ `concept_d.spec.ts` 3 件合格。
  - 未ログイン・別ロールのアクセス拒否。
  - 検証用 UI が出ないこと。
  - html 16px・Noto Sans JP（既存 CSS が混ざらない）。
  - 患者の学習 → クイズ → 振り返り → 各タブ。
  - 医療者の共有開始 → サマリー → 在宅経過 → スタジオ → 共有終了、820 で横スクロールなし。

## 再現手順

```sh
# Figma エクスポートを別に起動（src は無変更。Figma Make 専用プラグインを除いた vite.config.ts を使う）
cp -R ~/Developer/shiori-figma-reference /tmp/figma-run && cd /tmp/figma-run
#   vite.config.ts を react() + tailwindcss() だけにする（compare.mjs 冒頭参照）
npx pnpm@9 install --frozen-lockfile && npx vite --port 5181
# shiori（一時 DB）
E2E_PORT=3400 E2E_DB_PORT=5460 NEXT_DIST_DIR=.next-e2e-cd node scripts/e2e-server.mjs
# 比較と一覧画像
node scripts/concept-d/compare.mjs && node scripts/concept-d/sheet.mjs
```
