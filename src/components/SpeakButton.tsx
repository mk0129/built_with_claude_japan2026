"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/reset/Icons";

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** 読み上げ（Web Speech API）。ユーザー操作で開始し、自動再生はしない（LEARN-02） */
export function SpeakButton({ text, compact = false, variant = "default" }: { text: string; compact?: boolean; variant?: "default" | "reset" }) {
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
  if (variant === "reset")
    return (
      <button className="rs-listen" onClick={toggle} aria-pressed={speaking}>
        <span className="left">
          <span className="play" aria-hidden>
            <Icon name={speaking ? "stop" : "play"} size="sm" />
          </span>
          <span>{speaking ? "読み上げを止める" : "説明を聞く"}</span>
        </span>
        <span className="right rs-muted">
          {speaking ? "再生中" : `約${seconds}秒`}
          <Icon name="volume" size="sm" />
        </span>
      </button>
    );
  return (
    // compact: 見出し直下に置く版（高さ 60px。操作領域は 56px 以上を維持）。既定は従来の 72px
    <button
      className={`w-full flex items-center gap-3 rounded-[22px] bg-wakakusa text-left ${compact ? "px-2.5 py-2 min-h-[60px]" : "px-3.5 py-3 min-h-[72px] gap-3.5"}`}
      onClick={toggle}
      aria-pressed={speaking}
    >
      <span aria-hidden className={`rounded-full bg-accent text-white flex items-center justify-center text-lg ${compact ? "min-w-[44px] min-h-[44px] w-11 h-11" : "w-13 h-13 min-w-[52px] min-h-[52px]"}`}>
        {speaking ? "■" : "▶"}
      </span>
      <span className="flex-1">
        <span className="block font-bold">{speaking ? "読み上げを止める" : "この画面を読み上げる"}</span>
        <span className="block text-sm text-ink-soft">{speaking ? "再生中" : `約 ${seconds} 秒`}</span>
      </span>
    </button>
  );
}
