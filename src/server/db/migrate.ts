import { ensureMigrated, getDb, isPglite } from "./client";

async function main() {
  if (isPglite()) {
    await ensureMigrated();
    console.log(`migrated PGlite at ${process.env.PGLITE_DATA || ".data/shiori"}`);
  } else {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const db = getDb();
    await migrate(db as never, { migrationsFolder: `${process.cwd()}/src/server/db/migrations` });
    console.log("migrated Postgres");
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
