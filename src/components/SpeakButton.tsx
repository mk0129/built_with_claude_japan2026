"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** 読み上げ（Web Speech API）。ユーザー操作で開始し、自動再生はしない（LEARN-02） */
export function SpeakButton({ text }: { text: string }) {
  const ok = useSyncExternalStore(() => () => {}, supported, () => false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (supported()) window.speechSynthesis.cancel();
    };
  }, [text]);

  if (!ok) return <p className="text-sm text-ink-muted">この端末では読み上げを使えません。文章をそのままお読みください。</p>;

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
    const voice = synth.getVoices().find((v) => v.lang.startsWith("ja"));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  const seconds = Math.max(10, Math.round(text.length / 5));
  return (
    <button className="w-full flex items-center gap-3.5 rounded-[22px] bg-wakakusa px-3.5 py-3 text-left min-h-[72px]" onClick={toggle} aria-pressed={speaking}>
      <span aria-hidden className="w-13 h-13 min-w-[52px] min-h-[52px] rounded-full bg-accent text-white flex items-center justify-center text-lg">
        {speaking ? "■" : "▶"}
      </span>
      <span className="flex-1">
        <span className="block font-bold">{speaking ? "読み上げを止める" : "この画面を読み上げる"}</span>
        <span className="block text-sm text-ink-soft">{speaking ? "再生中" : `約 ${seconds} 秒`}</span>
      </span>
    </button>
  );
}
