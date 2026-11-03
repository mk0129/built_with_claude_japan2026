"use client";
import { useState } from "react";

/**
 * 原資料の登録フォームの折りたたみ。<details open> を使うと登録後の router.refresh() で
 * サーバー側の初期値（原資料 0 件のときだけ開く）に戻って閉じてしまうため、クライアント側の状態で開閉する。
 */
export function RegisterCollapsible({ initialOpen, children }: { initialOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <section id="register" className="rsd-card space-y-3 min-w-0 scroll-mt-4" aria-label="原資料を登録する">
      <button type="button" className="w-full text-left min-h-11 flex items-center justify-between font-bold text-lg" aria-expanded={open} aria-label={open ? "原資料の登録フォームを閉じる" : "原資料の登録フォームを開く"} onClick={() => setOpen((v) => !v)}>
        <span>原資料を登録する</span>
        <span aria-hidden className="text-ink-soft text-base">{open ? "－" : "＋"}</span>
      </button>
      {open && <div className="pt-1">{children}</div>}
    </section>
  );
}
