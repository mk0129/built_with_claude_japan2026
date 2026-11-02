"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** 読み上げの小型版（比較案用）。見出し直下に 1 行で置ける高さ（52px）。本番の SpeakButton は変更しない */
export function CompactSpeakButton({ text }: { text: string }) {
  const ok = useSyncExternalStore(() => () => {}, supported, () => false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void (supported() && window.speechSynthesis.cancel()), [text]);
  if (!ok) return null;
  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }
  const seconds = Math.max(10, Math.round(text.length / 5));
  return (
    <button className="inline-flex items-center gap-2.5 rounded-full bg-wakakusa pl-1.5 pr-4 py-1.5 min-h-[52px] text-left" onClick={toggle} aria-pressed={speaking}>
      <span aria-hidden className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center">
        {speaking ? "■" : "▶"}
      </span>
      <span className="font-bold">{speaking ? "止める" : "読み上げる"}</span>
      <span className="text-sm text-ink-soft">{speaking ? "再生中" : `約 ${seconds} 秒`}</span>
    </button>
  );
}
