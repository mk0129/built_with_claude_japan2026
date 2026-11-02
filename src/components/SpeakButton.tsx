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

  return (
    <button className={`btn ${speaking ? "btn-soft" : ""}`} onClick={toggle} aria-pressed={speaking}>
      <span aria-hidden>{speaking ? "■" : "▶"}</span> {speaking ? "読み上げを止める" : "読み上げる"}
    </button>
  );
}
