import { requirePageUser } from "@/server/auth/session";
import { ConsultClient } from "./ConsultClient";

export default async function ConsultPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser("staff");
  const { id } = await params;
  return <ConsultClient sessionId={id} />;
}
