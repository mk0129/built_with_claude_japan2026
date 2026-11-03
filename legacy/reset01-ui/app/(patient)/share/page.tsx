import { requirePageUser } from "@/server/auth/session";
import { ShareClient } from "./ShareClient";

export default async function SharePage() {
  await requirePageUser("patient");
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">医療者に共有する</h1>
      <p className="text-ink-soft">
        診察のとき、この画面の QR コードか 6 桁の番号を医療者に見せてください。あなたが「許可する」を押すまで、記録は開示されません。
      </p>
      <ShareClient />
    </main>
  );
}
