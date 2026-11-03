"use client";

/**
 * Figma Concept D の「体調記録」「診察ノート」を実 API に接続するフック（Phase 2 Step 3）。
 * 画面（DOM・CSS）は Figma のまま。Figma の架空の記録（initialHealthRecords）・質問メモの代わりに、DB の値を同じ形で渡す。
 * 記録しても医療者へ通知しない。医療者は患者が承認した一時共有の間だけ読む。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";
import type { HealthRecord, SymptomEntry } from "./healthData";

export type ApiRecord = {
  id: string;
  measuredAt: string;
  createdAt: string;
  updatedAt: string;
  vitals: Record<"temperature" | "systolic" | "diastolic" | "pulse" | "spo2", number | null>;
  symptoms: { key: string; name: string; severity: number; count: number | null; location: string | null; interference: string | null }[];
};

/** datetime-local の値（端末の現地時刻） */
export const toLocalInput = (d: Date | string) => {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};

const und = <T,>(v: T | null) => (v == null ? undefined : v);

/** API の記録 → Figma の HealthRecord（未測定は undefined、未回答の症状はキーなし = 欠測） */
export function toFigma(r: ApiRecord): HealthRecord & { updatedAt: string; createdAt: string } {
  return {
    id: r.id,
    measuredAt: toLocalInput(r.measuredAt),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    vitals: { temperature: und(r.vitals.temperature), systolic: und(r.vitals.systolic), diastolic: und(r.vitals.diastolic), pulse: und(r.vitals.pulse), spo2: und(r.vitals.spo2) },
    symptoms: Object.fromEntries(
      r.symptoms.map((s) => [
        s.key,
        {
          severity: s.severity as SymptomEntry["severity"],
          count: und(s.count),
          location: und(s.location),
          interference: und(s.interference),
          customName: s.key.startsWith("custom-") ? s.name : undefined,
        },
      ]),
    ),
  };
}

export type HealthInput = {
  measuredAt: string;
  vitals: Partial<Record<"temperature" | "systolic" | "diastolic" | "pulse" | "spo2", number | null>>;
  symptoms: { key: string; severity: number; count?: number | null; location?: string | null; interference?: string | null }[];
};

export type PatientHealth = ReturnType<typeof usePatientHealth>;

export function usePatientHealth(notify: (message: string) => void) {
  const [records, setRecords] = useState<ReturnType<typeof toFigma>[] | null>(null);
  const [settings, setSettings] = useState<{ active: string[]; hidden: string[]; customNames: Record<string, string> } | null>(null);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const reload = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        api<{ records: ApiRecord[] }>("/api/v1/health/records"),
        api<{ settings: { active: string[]; hidden: string[]; customNames: Record<string, string> } }>("/api/v1/health/symptoms"),
      ]);
      setRecords(r.records.map(toFigma));
      setSettings(s.settings);
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, []);
  useEffect(() => {
    // 初回の読み込み（外部 API との同期）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  /** 保存（新規 = 別の記録として追加、id があれば編集）。測定日時は端末の現地時刻 → ISO */
  const save = useCallback(
    async (input: HealthInput, id?: string | null) => {
      try {
        const json = { ...input, measuredAt: new Date(input.measuredAt).toISOString() };
        if (id) await api(`/api/v1/health/records/${id}`, { method: "PATCH", json });
        else await api("/api/v1/health/records", { json });
        await reload();
        return true;
      } catch (e) {
        notifyRef.current(errorText(e));
        return false;
      }
    },
    [reload],
  );
  const remove = useCallback(
    async (id: string) => {
      try {
        await api(`/api/v1/health/records/${id}`, { method: "DELETE" });
        await reload();
        return true;
      } catch (e) {
        notifyRef.current(errorText(e));
        return false;
      }
    },
    [reload],
  );
  /** 表示する症状の並び（並びにない症状は非表示として残る）と独自の症状名 */
  const saveSettings = useCallback(async (active: string[], customNames: Record<string, string>) => {
    try {
      const r = await api<{ settings: { active: string[]; hidden: string[]; customNames: Record<string, string> } }>("/api/v1/health/symptoms", {
        method: "PUT",
        json: { active, customNames },
      });
      setSettings(r.settings);
      return true;
    } catch (e) {
      notifyRef.current(errorText(e));
      return false;
    }
  }, []);

  return {
    loaded: records !== null && settings !== null,
    records: records ?? [],
    activeIds: settings?.active ?? [],
    customNames: settings?.customNames ?? {},
    save,
    remove,
    saveSettings,
    reload,
  };
}

export type VisitNote = {
  id: string;
  body: string;
  source: "free" | "quiz";
  materialId: string | null;
  materialTitle: string | null;
  createdAt: string;
  updatedAt: string;
};
export type PatientNotes = ReturnType<typeof usePatientNotes>;

export function usePatientNotes(notify: (message: string) => void) {
  const [notes, setNotes] = useState<VisitNote[] | null>(null);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const reload = useCallback(async () => {
    try {
      setNotes((await api<{ notes: VisitNote[] }>("/api/v1/notes")).notes);
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, []);
  useEffect(() => {
    // 初回の読み込み（外部 API との同期）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  const run = useCallback(
    async (f: () => Promise<unknown>) => {
      try {
        await f();
        await reload();
        return true;
      } catch (e) {
        notifyRef.current(errorText(e));
        return false;
      }
    },
    [reload],
  );
  return {
    loaded: notes !== null,
    notes: notes ?? [],
    /** 質問の保存。理解確認から作った候補は教材の版と設問を付ける（自由な質問には付けない） */
    create: (body: string, link?: { versionId: string; questionId: string } | null) =>
      run(() => api("/api/v1/notes", { json: { body, ...(link ? link : {}) } })),
    update: (id: string, body: string) => run(() => api(`/api/v1/notes/${id}`, { method: "PATCH", json: { body } })),
    remove: (id: string) => run(() => api(`/api/v1/notes/${id}`, { method: "DELETE" })),
    reload,
  };
}
