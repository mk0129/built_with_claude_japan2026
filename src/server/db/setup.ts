import { ensureMigrated, getDb, isPglite } from "./client";
import { seed } from "./seed";

/** マイグレーション + 架空データ投入（ローカル開発用） */
async function main() {
  if (isPglite()) {
    await ensureMigrated();
  } else {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(getDb() as never, { migrationsFolder: `${process.cwd()}/src/server/db/migrations` });
  }
  const r = await seed(getDb());
  console.log(`migrated + seeded: ${r.orgs.size} orgs, ${r.users.size} users (${isPglite() ? "pglite in-process" : "postgres"})`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
