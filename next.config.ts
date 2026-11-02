import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components は認証必須アプリでは全ページが動的になるため無効化（従来モデル）
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
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
