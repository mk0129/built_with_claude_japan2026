# 外来間要約の実 API 最終確認（評価語の禁止を加えたプロンプト・1 回）— 2026-11-04

- 環境: 新しい一時 DB（架空アカウント 11 件すべて @example.com を確認）、`E2E_CLAUDE=real CLAUDE_MAX_RETRIES=0 CLAUDE_MAX_CALLS=1 INTERVISIT_AI_MAX_CALLS=1`、`ANTHROPIC_BASE_URL` なし、再生・基準日の設定なし。
- 呼び出し: **1 回**（サーバーログ `[claude] call 1/1 schema=intervisit_summary`）。自動再試行なし。
  - 撮影スクリプトの 1 回目は患者ログイン画面の初回表示待ちでタイムアウト（要約の要求前。Claude 呼び出し 0 回をログで確認）し、同じ手順を再実行した。
- モデル: claude-sonnet-5-5、入力 8,524 / 出力 2,919 トークン。
- 結果: Claude が 16 項目を生成 → **15 項目を表示**、1 項目（生成順 index 5。本文は応答に含めない仕様のため未保存）は「引用が原文と一致しない」ため非表示。安全上の違反（禁止語）0。要約全体は Claude の要約として表示（`data-summary-kind="claude"`）。
- 評価語（高め・正常・安定・改善・悪化・良好）を含む文: 0。禁止語の検証条件は変更していない。
- 根拠: 3 文（手足のしびれ／「わからない」／質問）を開いて根拠の記録を確認（`sources_clicked.json`、`03〜05_sources_*.png`）。
- 画面の再表示で Claude を再度呼ばない（2 回目の要求はキャッシュ）。
- 共有終了前に画面・要約（`summary_response_1.json`、`narrative.txt`）・根拠を保存。終了後は画面から消え、API は 403（`after_end.json`）。
