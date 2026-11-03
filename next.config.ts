import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E 専用サーバーは別のビルドディレクトリを使い、開発サーバーと同時に動かせるようにする
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Cache Components は認証必須アプリでは全ページが動的になるため無効化（従来モデル）
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  devIndicators: false,
  // 実機確認用: DEV_ALLOWED_ORIGINS=192.168.x.x のように指定したときだけ、LAN 内の端末から開発サーバーへのアクセスを許可する
  ...(process.env.DEV_ALLOWED_ORIGINS ? { allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS.split(",").map((s) => s.trim()) } : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
