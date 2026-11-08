import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e*/**",
    ".next-try/**",
    // 撮影用サーバーのビルド（NEXT_DIST_DIR=.next-demo）・クリーン確認用のビルド。生成物なので検査しない
    ".next-demo/**",
    // 検証用の開発サーバー（NEXT_DIST_DIR=.next-ux）のビルド出力
    ".next-ux/**",
    // 公開デモのサーバー関数の束ね（生成物・git 管理外）
    ".judge-demo/api/_bundle/**",
    // 公開デモの配信物（esbuild の出力。生成物）
    ".judge-demo/dist/**",
    ".next-clean*/**",
    // 退避した旧 UI（参照用。配信・テストの対象外）
    "legacy/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
