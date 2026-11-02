# shiori — Claude Code 作業ルール

## 作業環境
- 作業ディレクトリは **`~/Developer/shiori`** のみ（iCloud 同期外）。`~/Desktop/built_with_claude_japan2026` は旧フォルダで、触らない。
- ローカル DB は `.data/shiori`（PGlite）。`npm run dev` が自動起動する。E2E は `npm run e2e`（一時 DB・ポート 3100・擬似生成）。

## 報告・言語
- Claude Code からの説明・進捗報告・コミットの本文説明は **日本語** で行う（コミットの件名は英語の prefix 可: `feat(day6): ...`）。
- 報告は要点のみ。長い確認より即実行。

## Git
- `git push` は **ユーザーが内容を確認してから**。force push 禁止。
- スクリーンショット等の未コミットファイルを勝手に削除・リセットしない。

## 安全・品質
- 架空データのみ。PHI・実患者データ・公開不可資料をコードやスクリーンショットに含めない。
- 認証・QR 連携・60 分のアクセス制御、未承認教材・非公開画像のアクセス制御、情報処方・学習・採点・スナップショットのロジックは変更しない（変更が必要なら理由を先に報告）。
- Claude API の実呼び出し（課金）が必要な作業は、事前に理由を報告する。
- 変更後は `npm run typecheck` / `npm run lint` / `npm test` / 必要に応じて `npm run e2e` を実行する。
- 内部コード（`drug_therapy`、`clinician` 等）を UI に出さない。表示は `src/lib/labels.ts` のラベルを使う。

## 参照
- 要件正本: `clinical_info_rx_ClaudeCode_spec_20261102/`
- 設計・決定: `docs/DESIGN_PROPOSAL_20261102.md`、`docs/BACKLOG.md`、`docs/ux/`
