"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStoredOrgId, useStoredOrgId } from "@/lib/use-stored-org";
import { ROLE_LABEL } from "@/lib/labels";

type M = { orgId: string; orgName: string; roles: string[]; displayName: string };

export function OrgPicker({ memberships }: { memberships: M[] }) {
  const router = useRouter();
  const stored = useStoredOrgId();
  const [override, setOverride] = useState<string | null>(null);
  const selected = override ?? memberships.find((m) => m.orgId === stored)?.orgId ?? memberships[0]?.orgId ?? null;

  function choose(orgId: string) {
    setOverride(orgId);
    setStoredOrgId(orgId);
  }

  return (
    <section className="rsd-card space-y-4">
      <h2 className="font-bold">所属医療機関</h2>
      <div className="grid gap-2">
        {memberships.map((m) => (
          <button
            key={m.orgId}
            className={`btn justify-between ${selected === m.orgId ? "btn-soft" : ""}`}
            aria-pressed={selected === m.orgId}
            onClick={() => choose(m.orgId)}
          >
            <span>{m.orgName}</span>
            <span className="text-sm font-normal text-ink-soft">{m.displayName} ・ {m.roles.map((r) => ROLE_LABEL[r] ?? r).join("・")}</span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={!selected}
        onClick={() => {
          if (selected) setStoredOrgId(selected);
          router.push("/staff/scan");
        }}
      >
        患者さんの QR を読み取る
      </button>
    </section>
  );
}
