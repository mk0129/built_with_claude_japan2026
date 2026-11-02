# shiori（コードネーム）｜乳がん情報処方・理解確認プラットフォーム MVP

Built with Claude: Japan 2026（2026-11-02〜11-08）で開発するハッカソン用リポジトリ。
**架空の患者・医療機関のみ**を扱い、実患者データ・実院内資料は使用しない。本番医療運用を主張しない。

- 要件の正本: `clinical_info_rx_ClaudeCode_spec_20261102/REQUIREMENTS.md`（+ `DECISIONS.md`, `ACCEPTANCE_TESTS.md`, `CLAUDE.md`）
- 設計・実装計画（承認済み）: `docs/DESIGN_PROPOSAL_20261102.md`

## 実装ステータス

| 機能 | 状態 | 備考 |
|---|---|---|
| 認証（デモアカウント / メールOTP / Google） | ✅ 基盤 / ⚠️ 外部設定待ち | Better Auth。OTP は未設定時サーバーログに出力。Google は環境変数設定で有効。LINE は P1 |
| 組織・役割（org_admin / material_editor / material_approver / clinician） | ✅ | サーバー側で毎回検証 |
| 患者 QR（5分・1回限り）+ 6桁コード代替 | ✅ | 生トークン非保存（SHA-256） |
| 患者の明示承認 → 60分診察セッション / 即時終了 / 延長の再承認 | ✅ | 医療者の患者データ閲覧は有効セッション必須 |
| 医療者ダッシュボード（質問・誤答・未完了の優先表示） | 🚧 枠のみ | Day 2 |
| 情報処方サイドパネル・宿題セット | ⬜ | Day 2 |
| 教材学習（3〜5画面・読み上げ）・クイズ（3択+わからない）・採点 | ⬜ | Day 2 |
| 再診時スナップショット | 🚧 フックのみ | Day 2（処方元病院の次回診察で確定） |
| 質問の3状態管理 | ⬜ | Day 2 |
| 原資料アップロード・許諾管理・非公開ストレージ | ⬜ | Day 4 |
| Claude による教材生成（B/C）・編集・承認・公開 | ⬜ | Day 4-5（ジョブ化） |
| 通知（アプリ内 / メール / LINE） | ⬜ | P1 |
| AI 教材検索 | ⬜ | P1 |

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

### 検証

```bash
npm run typecheck   # tsc
npm run lint        # eslint（React Compiler ルール含む）
npm test            # vitest（インメモリ PGlite。T01-T04, T22 相当の認可テストを含む）
```

## 構成

```
src/app/(patient)/   患者向け画面（スマホ）: login, home, share, scores
src/app/staff/       医療者向け画面（iPad/PC）: login, scan, consult/[id]
src/app/c            QR 着地点（/c?t=token）
src/app/api/v1/      Route Handlers（全て認可層を通る）
src/server/authz/    requirePatient / requireStaff / requireOrgRole / requireActiveConsultation
src/server/services/ qr, consultation, audit（Day2: prescription, learning, scoring, snapshot）
src/server/db/       Drizzle スキーマ・マイグレーション・架空シード
tests/               vitest 統合テスト
```

## 安全上の取り決め

- `.env*`、`.data/`、`uploads/`、`DESIGN_REFERENCE.png` は Git に含めない。
- Claude API はサーバー専用。原資料は `allow_ai` 許諾を確認してから、抽出テキストのみ送信する。患者の自由記述・回答は送信しない。
- 共通教材の承認者アカウントはデモ用であり、本番の医学的承認を意味しない。
