import type { Db } from "@/server/db/client";

export type ConsultationStartedEvent = {
  sessionId: string;
  patientId: string;
  orgId: string;
  startedAt: Date;
};

/**
 * 診察セッション開始時のフック。
 * Day2: 処方元病院（orgId）の直近未確定宿題セットのスナップショットをここで原子的に作成する（SNAP-01, 決定#5）。
 * 同一トランザクション内で呼ばれる。
 */
export async function onConsultationStarted(event: ConsultationStartedEvent, db: Db): Promise<void> {
  // Day2 で homework_snapshots を作成する
  void event;
  void db;
}
