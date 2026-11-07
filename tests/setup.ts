import { tmpdir } from "node:os";
// テストはインメモリ PGlite を使う。外部 DB・外部サービスには接続しない
process.env.DATABASE_URL = "";
process.env.PGLITE_DATA = "memory://";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.DEMO_AUTH = "true";
process.env.DEMO_PASSWORD = "test-demo-password";
process.env.SEED_MODE = "1"; // テストではシードが先に走るため
process.env.SEED_DEMO_HISTORY = "0"; // 統合テストは履歴なしの初期状態を前提とする
process.env.SEED_FIGURE_REVIEWS = "0"; // 図解の承認状態は各テストで制御する
process.env.PUBLIC_ASSETS_ROOT = `${tmpdir()}/shiori-test-public-${process.pid}`; // 承認時の公開コピーは一時ディレクトリへ
// 監修前の医学的図解（git 管理外の private_assets）の代わりに、公開可能な仮画像（無地）を使う。公開 clone でも同じ結果になる
process.env.PRIVATE_ASSETS_ROOT = `${process.cwd()}/tests/fixtures/private_assets`;
