# shiori（コードネーム）｜乳がん情報処方・理解確認プラットフォーム MVP

Built with Claude: Japan 2026（2026-11-02〜11-08）で開発するハッカソン用リポジトリ。
**架空の患者・医療機関のみ**を扱い、実患者データ・実院内資料は使用しない。本番医療運用を主張しない。

- 要件の正本: `clinical_info_rx_ClaudeCode_spec_20261102/REQUIREMENTS.md`（+ `DECISIONS.md`, `ACCEPTANCE_TESTS.md`, `CLAUDE.md`）
- 正式 UI: Figma Make「Concept D」の移植（`src/concept-d/`）。移植の記録: `docs/design/concept_d/`
- Phase 2（実データ接続）の報告: `docs/design/phase2/step1` 〜 `step4`
- 旧 UI（Reset 01 まで）は `legacy/reset01-ui/` に退避（バックエンド移行が終わるまで削除しない。ビルド対象外）

## 画面
| URL | 対象 | 内容 |
|---|---|---|
| `/home` | 患者（スマートフォン・タブレット） | ホーム・今回の情報処方・教材を探す・学習・理解確認・学習記録・体調記録・診察ノート・医療者との一時共有 |
| `/staff` | 医療者（iPad / PC。Figma の設計幅 1180 / 820 を中央に配置） | 一時共有の開始（QR / 6 桁コード）・診察サマリー・在宅経過表・情報処方・教材ライブラリ・教材スタジオ |
| `/d/dev` | 開発用（医療者ログイン） | Figma の架空データと検証シナリオで描画（画素比較用。本番には出さない） |

## 実装ステータス（Phase 2）
| Step | 内容 | 状態 |
|---|---|---|
| 1 | QR 一時共有: 医療者が QR を表示 → 患者が申請者・有効期間を確認して明示承認 → 60 分。延長は再承認、どちらからも即時終了、終了後の API は 403。患者発行の 6 桁コード（5 分・1 回限り・失敗 5 回/10 分で拒否）。複数施設の医療者は申請先を選択。患者一覧なし | ✅ |
| 2 | 情報処方と学習記録: 承認済み教材の処方（同一診察で重複なし・再処方）、患者の学習（スライド・承認済み図解・位置の保存）、理解確認（1 問ずつ確定、「わからない」と誤答を区別）、医療者の診察サマリー（回答・正答・解説・日時・教材。点数で理解を断定しない） | ✅ |
| 3 | 体調記録（バイタル 5 項目は任意・同じ日に複数回・欠測と 0 の区別・編集・削除）、症状の追加・非表示・並び替え・独自の症状名、診察ノート（自由な質問・理解確認からの候補は保存したときだけ記録）。医療者は共有中だけ閲覧 | ✅ |
| 4 | 在宅経過表（7/14/28 日・指定期間、同じ日の複数回、5 系列のバイタル統合グラフ、欠測期間を線で結ばない）、外来間の構造化データ（安定 ID・元データ参照）、Claude による外来間要約（根拠 ID・数値・日付・引用・禁止語をサーバーで検証、通らなければルールベースへ切り替え） | ✅ |
| 5 | 教材スタジオ（原資料・作成方針・構成案・Must-cover・編集・患者プレビュー・承認・公開）の実データ接続 | ⬜ 未実装（画面は Figma の架空データ。上部に明示） |

既存のバックエンド（Reset 01 まで）: 原資料の許諾管理・非公開ストレージ、Claude による教材生成（ジョブ化）・編集・承認・公開、図解アセットの監修、採点・宿題スナップショット・版管理は API・サービスとして残っており、Step 5 で正式 UI に接続する。

## セットアップ

```bash
npm install
cp .env.example .env.local   # BETTER_AUTH_SECRET などを設定（.env* は Git に含めない）
npm run db:setup             # ローカル DB（PGlite）を作成し、架空データを投入
npm run dev                  # http://localhost:3000
```

- ローカル開発では Docker 不要。`scripts/with-local-db.mjs` が PGlite を Postgres 互換ソケットとして起動し、`DATABASE_URL` を注入する。
- デモログイン（`DEMO_AUTH=true` のときのみ）: ログイン画面に架空アカウント一覧が出る。本番環境では起動時に拒否される。
- 架空データ: 患者A（佐藤 花子）は診察・処方・学習・質問の履歴と直近 2 週間の体調記録あり。患者B（鈴木 美咲）・患者C（高橋 由美）は履歴なし。医療者は山田 太郎（さくら総合病院）、中村 健（2 施設所属）など。
- Claude を使わずに動かすときは `ANTHROPIC_API_KEY=` と `CLAUDE_FAKE=1`（開発用の擬似生成。画面に「Claudeではありません」と表示）。

### 検証

```bash
npm run typecheck              # tsc
npm run lint                   # eslint
npm test                       # vitest（インメモリ PGlite。認可・整合性・外来間要約の検証を含む。Claude はモック）
npm run e2e                    # Playwright（一時 DB の専用サーバー。Claude は擬似生成）
node scripts/concept-d/compare.mjs  # Figma Make エクスポートとの画素比較（Figma 側を Vite で起動して実行）
npm run intervisit:real -- --dry    # 外来間要約の実 API 検証の送信量の確認（--dry なしで実 API を 2 回呼ぶ。架空患者A・インメモリ DB のみ）
```

## 構成

```
src/app/(concept-d)/   正式 UI のページ（/home, /staff, /d/dev）
src/app/(shiori)/      ログイン・ログアウト・トップ
src/concept-d/         Figma Make Concept D の移植（PatientD / ClinicianD）と実 API 接続のフック
                       live.ts（一時共有）・learning.ts（教材・学習）・record.ts（医療者のサマリー・処方・経過）・health.ts（体調・ノート）
src/app/api/v1/        Route Handlers（全て認可層を通る）
src/server/authz/      requirePatient / requireStaff / requireOrgRole / requireActiveConsultation
src/server/services/   connect / qr / consultation / prescription / learning / learning-record / health / notes /
                       intervisit（構造化）/ intervisit-rules（ルールベース）/ intervisit-ai（Claude・検証）/ audit ほか
src/server/db/         Drizzle スキーマ・マイグレーション・架空シード
tests/                 vitest 統合テスト・Playwright E2E
legacy/reset01-ui/     旧 UI（退避）
```

## 安全上の取り決め

- `.env*`、ローカル DB（`.data*`）、`uploads/`、提供されたデザイン参照（権利未確認）は Git に含めない。
- 医療者が患者情報を見られるのは、患者が承認した有効な一時共有の間だけ。医療者の患者一覧・恒久的なアクセス権はない。
- Claude API はサーバー専用。教材生成には許諾（`allow_ai`）を確認した原資料の抽出テキストだけを送る。
- 外来間要約（Step 4）で外部 AI へ送るのは**架空のデモ患者（@example.com）の構造化データだけ**（氏名・メールは送らない）。実患者の利用には施設の承認・データ処理契約・セキュリティ評価が別途必要で、この実装は送信しない。
- AI 要約・ルールベースの要約は記録の整理であり、診断・CTCAE Grade・因果関係・治療の提案を行わない。欠測を「症状なし」「改善」と解釈しない。記録しても医療者へ通知しない（24 時間の遠隔モニタリングではない）。
- 共通教材の承認者アカウントはデモ用であり、本番の医学的承認を意味しない。
