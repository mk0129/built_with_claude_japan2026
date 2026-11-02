import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 原資料の非公開ストレージ。
 * - SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY があれば Supabase Storage の非公開バケット（STORAGE_BUCKET）
 * - なければローカルの private_storage/（git 管理外）
 * いずれも public から直接取得できない。読み出しはサーバー経由のみ。
 */
function supabaseEnabled() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
function localRoot() {
  return process.env.PRIVATE_STORAGE_ROOT ?? path.join(process.cwd(), "private_storage");
}
const bucket = () => process.env.STORAGE_BUCKET ?? "source-documents";

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (supabaseEnabled()) {
    const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket()}/${encodeURI(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": contentType, "x-upsert": "false" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
    return;
  }
  const file = path.join(localRoot(), key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (supabaseEnabled()) {
    const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket()}/${encodeURI(key)}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new Error(`storage download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(path.join(localRoot(), key));
}
