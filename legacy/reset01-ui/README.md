# 退避した旧 UI（Experience Reset 01 / Phase A–E）

2026-11-03、Figma Make Concept D を shiori の正式 UI にしたため、旧 UI の画面と、旧 UI を前提とした E2E をここへ退避した。

- `app/`: 旧 `src/app/(shiori)/` の画面（`(patient)` `staff` `c` `design` `pb`）と `reset-staff.css`。ルート（`src/app`）の外にあるため配信されない。tsconfig・ESLint の対象外。
- `e2e/`: 旧 UI の DOM を前提とした Playwright。テスト対象外（`playwright.config.ts` の testDir は `tests/e2e`）。
- 旧 URL（`/library` `/learn/*` `/quiz/*` `/scores` `/share` `/staff/*` `/c` `/pb/*` `/design/*`）は `next.config.ts` で新 UI（`/home` または `/staff`）へ転送する。
- 認証・API（`src/app/api`）・DB・サービス層（`src/server`）は削除していない。Phase 2 で新 UI から同じ API を使う。
- 新旧 2 つの UI は並行して開発しない。ここは参照用で、更新しない。
