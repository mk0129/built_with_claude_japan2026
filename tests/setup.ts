// テストはインメモリ PGlite を使う。外部 DB・外部サービスには接続しない
process.env.DATABASE_URL = "";
process.env.PGLITE_DATA = "memory://";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.DEMO_AUTH = "true";
process.env.DEMO_PASSWORD = "test-demo-password";
process.env.SEED_MODE = "1"; // テストではシードが先に走るため
