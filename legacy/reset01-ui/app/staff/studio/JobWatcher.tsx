"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 実行中のジョブがある間だけ、3 秒ごとに画面を更新して進捗を表示する */
export function JobWatcher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
