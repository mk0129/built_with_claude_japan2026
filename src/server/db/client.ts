import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

/**
 * DB クライアント。
 * - DATABASE_URL があれば Postgres（Supabase）に postgres.js で接続
 * - なければ PGlite（ローカル / テストはインメモリ）
 * 両者とも drizzle の PgDatabase 互換なので、サービス層は差を意識しない。
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = {
  db?: Db;
  pglite?: PGlite;
  migrated?: Promise<void>;
};

const holder: Holder = ((globalThis as unknown as { __shioriDb?: Holder }).__shioriDb ??= {});

export function isPglite(): boolean {
  return !process.env.DATABASE_URL;
}

export function getDb(): Db {
  if (holder.db) return holder.db;
  if (process.env.DATABASE_URL) {
    // ローカル PGlite ソケットは並行クエリ不可のため 1 接続に直列化し、
    // 無名 prepared statement の混線を避けるため名前付き（prepare: true）にする。
    // Supabase のプーラー（transaction mode）では prepare: false が必要。
    const local = process.env.SHIORI_LOCAL_DB === "1";
    const client = postgres(process.env.DATABASE_URL, { prepare: local, max: local ? 1 : 5 });
    holder.db = drizzlePostgres(client, { schema }) as unknown as Db;
  } else {
    // `next build` のページデータ収集時は DB に触らないよう、インメモリにする（ローカルの PGlite とロック競合しない）
    const target = process.env.NEXT_PHASE === "phase-production-build" ? "memory://" : process.env.PGLITE_DATA || ".data/shiori";
    if (!target.startsWith("memory://")) {
      // PGlite は親ディレクトリを作らないので先に作る
      mkdirSync(dirname(target), { recursive: true });
    }
    holder.pglite = new PGlite(target);
    holder.db = drizzlePglite(holder.pglite, { schema }) as unknown as Db;
  }
  return holder.db;
}

export function getPglite(): PGlite | undefined {
  return holder.pglite;
}

/** 同一プロセスで一度だけマイグレーションを流す（PGlite 向け。Postgres は db:migrate を使う） */
export function ensureMigrated(): Promise<void> {
  if (!holder.migrated) {
    holder.migrated = (async () => {
      const db = getDb();
      if (isPglite()) {
        const { migrate } = await import("drizzle-orm/pglite/migrator");
        await migrate(db as unknown as ReturnType<typeof drizzlePglite>, {
          migrationsFolder: `${process.cwd()}/src/server/db/migrations`,
        });
      }
    })();
  }
  return holder.migrated;
}

/** テスト用: インメモリ DB を破棄して作り直す */
export async function resetDbForTests(): Promise<void> {
  if (holder.pglite) await holder.pglite.close();
  holder.db = undefined;
  holder.pglite = undefined;
  holder.migrated = undefined;
}
