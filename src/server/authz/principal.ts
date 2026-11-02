import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { organizationMembers, organizations } from "@/server/db/schema";
import { forbidden, unauthorized } from "./errors";

export type UserKind = "patient" | "staff";
export type MemberRole = "org_admin" | "material_editor" | "material_approver" | "clinician";

export type Principal = {
  userId: string;
  kind: UserKind;
  name: string;
  email: string;
};

export type OrgMembership = {
  orgId: string;
  orgName: string;
  orgKind: "hospital" | "operator";
  roles: MemberRole[];
  displayName: string;
};

/** Better Auth のセッションからログイン主体を得る。未ログインは 401 */
export async function requirePrincipal(headers: Headers): Promise<Principal> {
  const session = await auth.api.getSession({ headers });
  if (!session) throw unauthorized();
  const kind = (session.user as { kind?: string }).kind === "staff" ? "staff" : "patient";
  return { userId: session.user.id, kind, name: session.user.name, email: session.user.email };
}

export async function requirePatient(headers: Headers): Promise<Principal> {
  const p = await requirePrincipal(headers);
  if (p.kind !== "patient") throw forbidden("PATIENT_ONLY");
  return p;
}

export async function requireStaff(headers: Headers): Promise<Principal> {
  const p = await requirePrincipal(headers);
  if (p.kind !== "staff") throw forbidden("STAFF_ONLY");
  return p;
}

export async function listMemberships(userId: string): Promise<OrgMembership[]> {
  const db = getDb();
  const rows = await db
    .select({
      orgId: organizationMembers.orgId,
      orgName: organizations.name,
      orgKind: organizations.kind,
      roles: organizationMembers.roles,
      displayName: organizationMembers.displayName,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.active, true), eq(organizations.status, "active")));
  return rows.map((r) => ({ ...r, roles: r.roles as MemberRole[] }));
}

/** 組織所属と役割をサーバー側で検証する。組織に所属していなければ 403 */
export async function requireOrgRole(userId: string, orgId: string, role?: MemberRole): Promise<OrgMembership> {
  const memberships = await listMemberships(userId);
  const m = memberships.find((x) => x.orgId === orgId);
  if (!m) throw forbidden("NOT_ORG_MEMBER");
  if (role && !m.roles.includes(role)) throw forbidden("ROLE_REQUIRED");
  return m;
}
