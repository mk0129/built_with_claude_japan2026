"use client";
import { useSyncExternalStore } from "react";

const KEY = "shiori.textsize";
const EVENT = "shiori:textsize";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
function read(): boolean {
  return document.documentElement.dataset.textsize === "large";
}

/** 「文字を大きく」切替。html[data-textsize] を切り替え、localStorage に保存（端末ごとの好み） */
export function FontSizeToggle() {
  const large = useSyncExternalStore(subscribe, read, () => false);
  function toggle() {
    const next = !large;
    document.documentElement.dataset.textsize = next ? "large" : "";
    try {
      localStorage.setItem(KEY, next ? "large" : "normal");
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }
  return (
    <button className="tap-link" onClick={toggle} aria-pressed={large}>
      <span aria-hidden className="mr-1 text-lg font-bold">
        あ
      </span>
      {large ? "文字を元に戻す" : "文字を大きく"}
    </button>
  );
}

/** 初期描画前に保存済みの文字サイズを適用する（ちらつき防止） */
export const FONT_SIZE_INIT_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="large"){document.documentElement.dataset.textsize="large"}}catch(e){}`;
