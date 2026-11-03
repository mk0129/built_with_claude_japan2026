"use client";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/reset/Icons";

/** 上部バー: 現在地（パンくず）と架空データの表示。参照の .deskbar */
export function DeskBar() {
  const path = usePathname();
  const crumb = path.startsWith("/staff/consult")
    ? ["本日の診察", "患者との一時共有"]
    : path.startsWith("/staff/scan")
      ? ["本日の診察", "QR の読み取り"]
      : path.startsWith("/staff/studio/sources")
        ? ["教材スタジオ", "Claude による構成案"]
        : path.startsWith("/staff/studio/materials")
          ? ["教材スタジオ", "教材の編集・承認"]
          : path.startsWith("/staff/materials")
            ? ["教材スタジオ", "患者画面プレビュー"]
            : path.startsWith("/staff/studio")
              ? ["教材スタジオ", "原資料と教材"]
              : ["医療者ホーム", "所属と QR 読み取り"];
  return (
    <div className="rsd-bar">
      <div className="rsd-crumb">
        <b>{crumb[0]}</b>　/　{crumb[1]}
      </div>
      <div className="rsd-row" style={{ flexWrap: "nowrap" }}>
        <span id="rsd-bar-slot" className="contents" />
        <span className="rsd-tag">架空データ・デモ</span>
        <span className="rsd-avatar" aria-hidden>
          <Icon name="person" size="sm" />
        </span>
      </div>
    </div>
  );
}
