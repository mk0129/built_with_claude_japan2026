# 教材生成ジョブの実行方式（Vercel 想定）

## 前提
- 生成 1 回は 30 秒〜数分。Vercel Functions はリクエスト終了後の処理時間が保証されない。
- `after()` はレスポンス後に処理を続けられるが、関数の最大実行時間・インスタンス停止で中断されうる。**`after()` だけでは永続的な実行を保証しない。**

## 採用した方式（MVP）: DB を正とするジョブキュー + 3 つの起動経路
| 要素 | 内容 |
|---|---|
| 正本 | `ai_generation_jobs` が状態の正本（queued / running / succeeded / failed） |
| 確保 | `UPDATE … WHERE 実行可能 RETURNING` で 1 件を原子的に確保。実行中は `lease_expires_at` を設定し二重実行しない |
| 起動 1 | ジョブ登録時に `after()` で即時実行（最速経路。取りこぼしてよい） |
| 起動 2 | Vercel Cron が `/api/internal/jobs/drain` を毎分呼び、待機中・リース切れのジョブを回収（`CRON_SECRET` 必須） |
| 起動 3 | 画面のポーリング（ジョブ詳細 API・原資料画面）で、15 秒以上待機中またはリース切れのジョブを再予約 |
| 自動再試行 | タイムアウト・429・529・5xx・接続失敗は指数バックオフ（30 秒〜最大 10 分）で `max_attempts`（既定 3）まで。認証失敗・拒否・形式不正は再試行しない |
| 回収 | リース切れ（関数の打ち切り）は試行回数を進めて再実行。上限を超えたら `TIMEOUT` で失敗にする |
| 冪等性 | 下書きの保存は成功時に 1 回だけ。登録は冪等キーで重複を防ぐ |
| 実行時間 | 生成関連のルートは `maxDuration = 300`（Fluid Compute。プランの上限内で調整） |

## 制約と本番への移行
- Vercel Cron の毎分実行は Pro プラン以上。Hobby では 1 日 1 回のため、起動 1・3 に頼ることになる。
- 同時実行数・レート制御はまだ単純（cron 1 回あたり最大 3 件、200 秒の予算）。
- 本番では次のいずれかに置き換えるのが望ましい: Vercel Queues / Workflow（durable step）、Inngest、Supabase の pg_cron + Edge Function。現在の DB 状態遷移はそのまま使える。

## 必要な環境変数（値はリポジトリに置かない）
- `ANTHROPIC_API_KEY`（サーバー専用）、`CLAUDE_MODEL`、`CLAUDE_TIMEOUT_MS`（既定 300000）、`CLAUDE_MAX_RETRIES`（既定 2）、`AI_JOB_MAX_ATTEMPTS`（既定 3）
- `CRON_SECRET`（Vercel が Cron 呼び出しに `Authorization: Bearer` で付与）
