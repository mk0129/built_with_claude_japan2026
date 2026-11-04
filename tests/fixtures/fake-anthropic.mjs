/**
 * Anthropic Messages API の代わりに応答するローカルのサーバー（テスト・ローカル確認用。実 API は呼ばない）。
 * SDK（@anthropic-ai/sdk）の実際の受信・ストリーミング・構造化出力の解析の経路を、そのまま通すために使う。
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:<port> と任意の ANTHROPIC_API_KEY で、サーバー側の Claude 呼び出しがここに来る。
 * respond(body) が { json?, text?, status?, stopReason?, model? } を返す。既定は外来間要約を要求の構造化データから作る。
 */
import { createServer } from "node:http";

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** 外来間要約の応答を、要求に含まれる構造化データ（<intervisit_data>）から作る。値はすべてデータのまま */
export function intervisitFromRequest(body) {
  const user = body.messages?.[0]?.content ?? "";
  const text = typeof user === "string" ? user : user.map((c) => c.text ?? "").join("");
  const m = text.match(/<intervisit_data>\n([\s\S]*)\n<\/intervisit_data>/);
  if (!m) return null;
  const data = JSON.parse(m[1]);
  const day = (at) => at.replace(/ \d{2}:\d{2}$/, "");
  const items = [];
  for (const s of data.symptoms) {
    const f = s.entries[0];
    const l = s.entries[s.entries.length - 1];
    items.push({ section: "体調の変化", text: `${s.name}は${day(f.at)}に${f.severity}、${day(l.at)}に${l.severity}と記録されました。`, sourceIds: [f.id, l.id] });
  }
  for (const l of data.learning)
    for (const a of l.answers.filter((x) => x.result === "わからない"))
      items.push({ section: "学習の状況", text: `「${l.title}」の理解確認で「${a.stem}」に「わからない」と回答しました。`, sourceIds: [a.id] });
  for (const q of data.questions) items.push({ section: "患者からの質問", text: `${day(q.at)}に「${q.text}」と質問を保存しました。`, sourceIds: [q.id] });
  if (data.questions[0]) items.push({ section: "時系列の経過", text: `${day(data.questions[0].at)}：質問を保存しました。`, sourceIds: [data.questions[0].id] });
  return { items };
}

export function startFakeAnthropic(respond = (body) => ({ json: intervisitFromRequest(body) })) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ url: req.url, body });
      const r = respond(body) ?? {};
      if (r.status && r.status !== 200) {
        res.writeHead(r.status, { "content-type": "application/json", "request-id": "req_fake_error" });
        res.end(JSON.stringify({ type: "error", error: { type: r.status === 429 ? "rate_limit_error" : "api_error", message: "fake error" } }));
        return;
      }
      const out = r.text ?? JSON.stringify(r.json ?? {});
      const model = r.model ?? body.model ?? "fake-model";
      res.writeHead(200, { "content-type": "text/event-stream", "request-id": "req_fake_ok" });
      res.write(sse("message_start", { type: "message_start", message: { id: "msg_fake", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } } }));
      res.write(sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
      for (let i = 0; i < out.length; i += 500) res.write(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: out.slice(i, i + 500) } }));
      res.write(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
      res.write(sse("message_delta", { type: "message_delta", delta: { stop_reason: r.stopReason ?? "end_turn", stop_sequence: null }, usage: { output_tokens: Math.ceil(out.length / 2) } }));
      res.write(sse("message_stop", { type: "message_stop" }));
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) })));
}
