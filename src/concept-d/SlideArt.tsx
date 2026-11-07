"use client";

/**
 * 学習画面の挿絵（装飾用の線画）。医学図解（監修済みの画像）がないページに、本文の主題に合った簡単な線画を添える。
 * 医学的な内容を描かない（体の仕組み・手技は医学図解として別に監修する）。見出し・本文より目立たせず、aria-hidden にする。
 */
import type { ReactNode } from "react";

export type SlideArtKey =
  | "food" | "rest" | "hands" | "phone" | "stage" | "test" | "hospital" | "pills" | "rays" | "chairs"
  | "work" | "money" | "bandage" | "arm" | "shield" | "calendar" | "heart" | "note" | "family" | "book";

const RULES: [RegExp, SlideArtKey][] = [
  [/吐き気|食欲|食事|食べ|水分|味覚|口内炎/, "food"],
  [/だるさ|倦怠|疲れ|休憩|睡眠|眠/, "rest"],
  [/感染|手洗い|マスク|白血球|清潔/, "hands"],
  [/連絡|電話|サイン|受診|緊急/, "phone"],
  [/病期|ステージ|広がり/, "stage"],
  [/検査|結果|病理|サブタイプ|HER2|受容体/, "test"],
  [/手術|入院|温存|全切除|センチネル/, "hospital"],
  [/薬|ホルモン療法|分子標的|化学療法|抗がん/, "pills"],
  [/放射線|照射/, "rays"],
  [/こころ|不安|落ち込み|相談先|相談/, "chairs"],
  [/仕事|職場|勤務|両立|復職/, "work"],
  [/お金|費用|医療費|手当金|高額療養費|給付|保険/, "money"],
  [/傷|皮膚|保湿|ケア|日焼け/, "bandage"],
  [/腕|リハビリ|体操|むくみ|リンパ/, "arm"],
  [/予防|守る|注意/, "shield"],
  [/日|週|スケジュール|期間|続け/, "calendar"],
  [/家族|子ども|伝え/, "family"],
  [/記録|ノート|印|メモ/, "note"],
];

/** 見出しと本文から挿絵の種類を決める（該当がなければ book） */
export function slideArtKey(title: string, body = ""): SlideArtKey {
  const text = `${title} ${body}`;
  for (const [re, key] of RULES) if (re.test(text)) return key;
  return "book";
}

const ART: Record<SlideArtKey, ReactNode> = {
  food: (
    <>
      <path d="M14 34h36a18 18 0 0 1-36 0Z" />
      <path d="M12 34h40" />
      <path d="M26 22c0-5 4-6 4-10M36 22c0-5 4-6 4-10" />
    </>
  ),
  rest: (
    <>
      <path d="M8 42V26h48v16" />
      <path d="M8 42h48M12 26v-8h14v8" />
      <circle cx="19" cy="22" r="3" />
      <path d="M44 14c2 2 2 5 0 7M48 11c3 3 3 9 0 12" />
    </>
  ),
  hands: (
    <>
      <path d="M20 44c-6-4-8-10-6-16l6 6 2-12 6 4 1-8 6 10 2-6 5 9c3 6 0 12-5 15" />
      <path d="M44 20c4-2 8 0 8 4s-3 6-6 6" />
      <circle cx="46" cy="36" r="2" /><circle cx="52" cy="42" r="1.5" /><circle cx="42" cy="46" r="1.5" />
    </>
  ),
  phone: (
    <>
      <rect x="22" y="8" width="20" height="48" rx="5" />
      <path d="M28 12h8M32 50h.1" />
      <path d="M46 22c3 3 3 9 0 12M50 18c5 5 5 15 0 20" />
    </>
  ),
  stage: (
    <>
      <path d="M8 52h12V40h12V28h12V16h12" />
      <path d="M8 52h48" />
      <circle cx="14" cy="46" r="2.5" />
    </>
  ),
  test: (
    <>
      <rect x="16" y="10" width="32" height="44" rx="4" />
      <path d="M26 8h12v6H26z" />
      <path d="M24 24h16M24 32h16M24 40h10" />
      <circle cx="44" cy="42" r="5" /><path d="m48 46 4 4" />
    </>
  ),
  hospital: (
    <>
      <rect x="12" y="20" width="40" height="34" rx="2" />
      <path d="M22 20v-8h20v8" />
      <path d="M32 30v10M27 35h10" />
      <path d="M12 54h40M20 54v-8h8v8M36 54v-8h8v8" />
    </>
  ),
  pills: (
    <>
      <rect x="10" y="26" width="30" height="14" rx="7" transform="rotate(-30 25 33)" />
      <path d="m19 28 10 18" />
      <circle cx="46" cy="40" r="9" />
      <path d="M37 40h18" />
    </>
  ),
  rays: (
    <>
      <circle cx="32" cy="34" r="9" />
      <path d="M32 12v8M32 48v8M10 34h8M46 34h8M16 18l6 6M42 44l6 6M16 50l6-6M42 24l6-6" />
    </>
  ),
  chairs: (
    <>
      <path d="M10 46V30h14v16M10 38h14M12 46v6M22 46v6" />
      <path d="M40 46V30h14v16M40 38h14M42 46v6M52 46v6" />
      <path d="M28 24c2-4 6-4 8 0" />
    </>
  ),
  work: (
    <>
      <rect x="10" y="22" width="44" height="30" rx="4" />
      <path d="M24 22v-6h16v6M10 34h44M32 32v6" />
    </>
  ),
  money: (
    <>
      <circle cx="24" cy="36" r="12" />
      <path d="M24 28v16M20 32h8M20 38h8" />
      <rect x="36" y="18" width="20" height="26" rx="3" />
      <path d="M40 26h12M40 32h12M40 38h8" />
    </>
  ),
  bandage: (
    <>
      <rect x="8" y="26" width="48" height="16" rx="8" transform="rotate(-25 32 34)" />
      <path d="M26 30l2 2M30 34l2 2M34 30l2 2M30 26l2 2" />
    </>
  ),
  arm: (
    <>
      <path d="M14 50c0-12 6-20 14-24l8-4 6 4-6 8c-4 4-6 8-8 16" />
      <path d="M36 22c6-6 12-6 16-2" />
      <circle cx="54" cy="18" r="3" />
    </>
  ),
  shield: (
    <>
      <path d="M32 8 12 16v12c0 12 8 20 20 26 12-6 20-14 20-26V16Z" />
      <path d="m24 32 6 6 10-12" />
    </>
  ),
  calendar: (
    <>
      <rect x="10" y="14" width="44" height="40" rx="4" />
      <path d="M20 10v8M44 10v8M10 26h44" />
      <circle cx="24" cy="38" r="2.5" /><circle cx="34" cy="38" r="2.5" /><circle cx="44" cy="38" r="2.5" />
    </>
  ),
  heart: (
    <>
      <path d="M32 52S10 38 10 24a10 10 0 0 1 22-6 10 10 0 0 1 22 6c0 14-22 28-22 28Z" />
    </>
  ),
  note: (
    <>
      <rect x="16" y="8" width="32" height="48" rx="4" />
      <path d="M24 20h16M24 28h16M24 36h10" />
      <path d="m40 44 8-8 4 4-8 8h-4Z" />
    </>
  ),
  family: (
    <>
      <circle cx="22" cy="20" r="6" /><path d="M10 48c0-10 6-16 12-16s12 6 12 16" />
      <circle cx="44" cy="26" r="4.5" /><path d="M36 48c0-7 4-12 8-12s8 5 8 12" />
    </>
  ),
  book: (
    <>
      <path d="M12 14h16a6 6 0 0 1 4 2v34a6 6 0 0 0-4-2H12Z" />
      <path d="M52 14H36a6 6 0 0 0-4 2v34a6 6 0 0 1 4-2h16Z" />
    </>
  ),
};

export function SlideArt({ art, tone = 0, size = "default" }: { art: SlideArtKey; tone?: number; size?: "default" | "compact" }) {
  return (
    <span className={`d-slide-art tone-${tone % 6} ${size}`} aria-hidden="true" data-slide-art={art}>
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ART[art]}
      </svg>
    </span>
  );
}
