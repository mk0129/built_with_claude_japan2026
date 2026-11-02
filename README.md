# shiori（コードネーム）｜乳がん情報処方・理解確認プラットフォーム MVP

Built with Claude: Japan 2026（2026-11-02〜11-08）で開発するハッカソン用リポジトリ。
**架空の患者・医療機関のみ**を扱い、実患者データ・実院内資料は使用しない。本番医療運用を主張しない。

- 要件の正本: `clinical_info_rx_ClaudeCode_spec_20261102/REQUIREMENTS.md`（+ `DECISIONS.md`, `ACCEPTANCE_TESTS.md`, `CLAUDE.md`）
- 設計・実装計画（承認済み）: `docs/DESIGN_PROPOSAL_20261102.md`
- Day 3 UI/UX 検証: `docs/UX_REVIEW_DAY3_20261102.md`（スクリーンショット: `docs/screenshots/day3/`）
- UI P0 改善レポート: `docs/UI_P0_REPORT_20261102.md`（修正前後: `docs/screenshots/ui_p0/`）
- デザイン再設計（C2 適用）: `docs/design/`（スクリーンショット: `docs/screenshots/c2/`）

## 実装ステータス

| 機能 | 状態 | 備考 |
|---|---|---|
| 認証（デモアカウント / メールOTP / Google） | ✅ 基盤 / ⚠️ 外部設定待ち | Better Auth。OTP は未設定時サーバーログに出力。Google は環境変数設定で有効。LINE は P1 |
| 組織・役割（org_admin / material_editor / material_approver / clinician） | ✅ | サーバー側で毎回検証 |
| 患者 QR（5分・1回限り）+ 6桁コード代替（D28） | ✅ | 生トークン非保存、原子的消費、試行制限 |
| 患者の明示承認 → 60分診察セッション / 即時終了 / 延長の再承認 | ✅ | 医療者の患者データ閲覧は有効セッション必須 |
| 医療者ダッシュボード（未確認質問 → 誤答・わからない → 未完了 → スコア） | ✅ | 関連教材のワンクリック処方 |
| 情報処方サイドパネル（テンプレート / キーワード・領域検索 / 候補バスケット / 確定） | ✅ | AI 検索は後続 |
| 診察セッション単位の宿題セット・同教材の統合・再処方の進捗引き継ぎ | ✅ | T13 / T14 |
| 教材学習（C2: 命題・短い本文・くわしく・読み上げ・固定ナビ） | ✅ | 医学的図解は承認済みのものだけ表示。未承認は非表示（D33） |
| 図解アセット（figure_assets / placements）と監修プレビュー | ✅ 基盤 | 画像は未納品。`/staff/materials/[versionId]/preview`（編集者・承認者のみ） |
| クイズ（3択+わからない、1問ずつ確定、再開、再挑戦、採点） | ✅ | T10 / T11 / T12 |
| 全体・宿題・領域別スコア（丸めは表示時のみ、旧版バッジ、安全無効化の除外） | ✅ | D26 / D27 |
| 次回診察時の宿題スナップショット（処方元病院のみ・一度だけ） | ✅ | T15 / D29 |
| 患者のふりかえり・質問と3段階の対応管理 | ✅ | T16 / T17 |
| 架空教材 10 本（本文・クイズ・テンプレート 4 件） | ✅ | オリジナル原稿。本番監修ではない |
| 原資料アップロード・許諾管理・非公開ストレージ | ⬜ | Day 4 |
| Claude による教材生成（B/C）・編集・承認・公開 | ⬜ | Day 4-5（ジョブ化） |
| 通知（メール / LINE）、AI 教材検索、改訂・版比較 UI | ⬜ | P1 |

## セットアップ

```bash
npm install
cp .env.example .env.local   # BETTER_AUTH_SECRET などを設定
npm run db:setup             # ローカル DB（PGlite）を作成し、架空データを投入
npm run dev                  # http://localhost:3000
```

- ローカル開発では Docker 不要。`scripts/with-local-db.mjs` が PGlite を Postgres 互換ソケット（127.0.0.1:5433）として起動し、`DATABASE_URL` を注入する。
- 本番 / 共有環境は Supabase Postgres。`.env.local` に `DATABASE_URL` を設定し `npm run db:setup:remote`。
- デモログイン（`DEMO_AUTH=true` のときのみ）: ログイン画面に架空アカウント一覧が出る。本番環境では起動時に拒否される。
- 架空データ: 患者A（佐藤 花子）には 14 日前の初回診察・処方・学習・質問の履歴が入っている。患者B（鈴木 美咲）は履歴なし。

### 検証

```bash
npm run typecheck   # tsc
npm run lint        # eslint（React Compiler ルール含む）
npm test            # vitest（インメモリ PGlite。T01-T05, T10-T17, T22 相当を含む 33 テスト）
npm run e2e:fresh   # Playwright: DB を初期化して通し操作 + 幅別レイアウト + 主要ボタン到達性（E2E_SHOT_DIR で保存先指定）
```

UI/UX 検証の記録: `docs/UX_REVIEW_DAY3_20261102.md`

## 構成

```
src/app/(patient)/   患者向け画面（スマホ）: login, home, share, learn/[v], quiz/[v], scores
src/app/staff/       医療者向け画面（iPad/PC）: login, scan, consult/[id]（ダッシュボード + 処方パネル）
src/app/c            QR 着地点（/c?t=token）
src/app/api/v1/      Route Handlers（全て認可層を通る）
src/server/authz/    requirePatient / requireStaff / requireOrgRole / requireActiveConsultation
src/server/services/ qr, consultation, consultation-hooks(snapshot), materials, prescription, learning, scoring, questions, audit
src/server/db/       Drizzle スキーマ・マイグレーション・架空シード
tests/               vitest 統合テスト
```

## 安全上の取り決め

- `.env*`、`.data/`、`uploads/`、`DESIGN_REFERENCE.png` は Git に含めない。
- Claude API はサーバー専用。原資料は `allow_ai` 許諾を確認してから、抽出テキストのみ送信する。患者の自由記述・回答は送信しない。
- 共通教材の承認者アカウントはデモ用であり、本番の医学的承認を意味しない。
