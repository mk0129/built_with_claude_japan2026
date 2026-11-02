export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV !== "production") {
      process.on("unhandledRejection", (reason) => {
        console.error("[unhandledRejection]", reason instanceof Error ? reason.stack : reason);
      });
    }
    const { ensureMigrated, isPglite } = await import("@/server/db/client");
    if (isPglite()) await ensureMigrated();
  }
}
