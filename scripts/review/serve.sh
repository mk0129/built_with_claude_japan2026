#!/bin/sh
# UI レビュー用サーバー: 新しい一時 DB（架空データのみ）・Claude を呼ばない・撮影環境と同じ基準日と再生設定。
# 撮影用 DB や開発 DB には触れない。ビルドキャッシュも専用（.next-e2e-review）。
#   sh scripts/review/serve.sh [port=3800] [dbPort=5800]
cd "$(dirname "$0")/../.." || exit 1
rm -rf .next-e2e-review
PATH="$PWD/node_modules/.bin:$PATH" E2E_CLAUDE=fake DEMO_ANCHOR=2026-11-04T09:00:00+09:00 \
  INTERVISIT_REPLAY_FILE=docs/design/phase2/step4/replay/intervisit_replay.json \
  STUDIO_REPLAY_FILE=docs/design/phase2/step5/replay/studio_replay.json \
  E2E_PORT="${1:-3800}" E2E_DB_PORT="${2:-5800}" NEXT_DIST_DIR=.next-e2e-review exec node scripts/e2e-server.mjs
