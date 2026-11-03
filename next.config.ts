import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E 専用サーバーは別のビルドディレクトリを使い、開発サーバーと同時に動かせるようにする
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Cache Components は認証必須アプリでは全ページが動的になるため無効化（従来モデル）
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  devIndicators: false,
  // 正式 UI を Figma Make Concept D（患者 /home、医療者 /staff）へ切り替えた。旧 UI の URL は新 UI へ転送する（旧 UI は legacy/ に退避）
  async redirects() {
    const to = (dest: string, sources: string[]) => sources.map((source) => ({ source, destination: dest, permanent: false }));
    return [
      ...to("/home", ["/d/patient", "/library", "/scores", "/share", "/learn/:path*", "/quiz/:path*"]),
      ...to("/staff", ["/d/clinician", "/staff/consult/:path*", "/staff/studio/:path*", "/staff/scan", "/staff/materials/:path*", "/c"]),
      ...to("/", ["/pb", "/pb/:path*", "/design", "/design/:path*"]),
    ];
  },
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
