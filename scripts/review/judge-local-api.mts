/**
 * 審査用デモをローカルで「サーバー関数つき」で動かす（検証用）。
 * dist を静的配信し、/api/studio を .judge-demo/api/studio.ts に渡す。
 * CLAUDE_FAKE=1 なら課金なしの擬似生成、ANTHROPIC_API_KEY があれば実際に Claude を呼ぶ。
 *
 *   JUDGE_STUDIO_PASSCODE=demo CLAUDE_FAKE=1 npx tsx scripts/review/judge-local-api.mts 8788
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import handlerModule from "../../.judge-demo/api/studio";
// CJS/ESM どちらで読み込まれても既定の関数を取り出す
const handler = ((handlerModule as unknown as { default?: unknown }).default ?? handlerModule) as (req: { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }, res: { status: (c: number) => unknown; setHeader: (k: string, v: string) => void; json: (b: unknown) => void }) => Promise<void>;

const port = Number(process.argv[2] || 8788);
const dist = path.resolve(".judge-demo/dist");
const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname === "/api/studio") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = undefined;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      const out = { status: 200 as number, headers: {} as Record<string, string> };
      const shim = {
        status(code: number) {
          out.status = code;
          return shim;
        },
        setHeader(k: string, v: string) {
          out.headers[k] = v;
        },
        json(b: unknown) {
          res.writeHead(out.status, { ...out.headers, "content-type": "application/json" });
          res.end(JSON.stringify(b));
        },
      };
      await handler({ method: req.method, body, headers: req.headers as Record<string, string | string[] | undefined> }, shim);
      return;
    }
    let file = path.join(dist, decodeURIComponent(url.pathname));
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch {
      file = path.join(dist, "index.html");
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  })
  .listen(port, () => console.log(`judge demo + /api/studio on http://localhost:${port} (fake=${process.env.CLAUDE_FAKE === "1"}, key=${!!process.env.ANTHROPIC_API_KEY})`));
