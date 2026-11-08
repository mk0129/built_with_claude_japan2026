"use client";

/**
 * 端末の読み上げ（Web Speech API）。患者の学習画面で本文を読み上げる。
 * - ブラウザによっては、cancel() の直後に speak() すると発話が捨てられる（Chrome）。cancel → 少し待ってから speak する。
 * - 日本語の音声が選べるときは選ぶ。音声の一覧は非同期に届く（voiceschanged）ため、届いていなければ既定の音声で読む。
 * - 自動再生はしない（必ず患者の操作で開始する）。
 */
export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

let current: SpeechSynthesisUtterance | null = null;

function japaneseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => /^ja/i.test(v.lang) && /Kyoko|O-ren|Google|Microsoft/i.test(v.name)) ?? voices.find((v) => /^ja/i.test(v.lang)) ?? null;
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  current = null;
  window.speechSynthesis.cancel();
}

/** 読み上げを始める。onEnd は終了・中断・エラーで 1 回だけ呼ぶ。開始できなければ false */
export function speakText(text: string, onEnd: () => void): boolean {
  if (!speechSupported() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.95;
  u.pitch = 1;
  const voice = japaneseVoice();
  if (voice) u.voice = voice;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (current === u) current = null;
    onEnd();
  };
  u.onend = finish;
  u.onerror = finish;
  synth.cancel();
  current = u;
  // 一部のブラウザは cancel 直後の speak を無視するため、次のフレームで開始する
  window.setTimeout(() => {
    if (current !== u) return;
    synth.speak(u);
    // iOS / Safari で一時停止状態のまま始まらないときの保険
    if (synth.paused) synth.resume();
  }, 60);
  return true;
}
