/**
 * ローカル確認用: Anthropic Messages API の代替サーバーを起動する（実 API は呼ばない・課金なし）。
 *   node scripts/fake-anthropic-server.mjs 4600
 * サーバーを ANTHROPIC_BASE_URL=http://127.0.0.1:4600 と任意の ANTHROPIC_API_KEY で起動すると、外来間要約の呼び出しがここに来て、
 * 要求の構造化データから作った応答（値はデータのまま）を、実 API と同じストリーミング形式で返す。モデル名は "local-fake"。
 */
import { createServer } from "node:http";
import { intervisitFromRequest, startFakeAnthropic } from "../tests/fixtures/fake-anthropic.mjs";
void createServer;
const port = Number(process.argv[2] ?? 4600);
const f = await startFakeAnthropic((b) => ({ json: intervisitFromRequest(b) ?? { items: [] }, model: "local-fake" }));
// 起動したポートへ転送（startFakeAnthropic は空きポートで起動するため、固定ポートで受けて転送する）
const { request } = await import("node:http");
createServer((req, res) => {
  const p = request(`${f.url}${req.url}`, { method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 500, r.headers);
    r.pipe(res);
  });
  req.pipe(p);
}).listen(port, "127.0.0.1", () => console.log(`[fake-anthropic] listening on ${port}`));
