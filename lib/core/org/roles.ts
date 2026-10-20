/**
 * Roles in an organisation (memberships.role, 0014) and what each may do in
 * admin. The database enforces the same split with is_org_member (read),
 * can_write_org (owner, admin, staff) and can_admin_org (owner, admin).
 *
 *   read   accountant and readonly: Ekonomi, Bokföringen, fakturor, kunder, ROT
 *   write  staff: everything that creates invoices, customers, payments
 *   admin  admin: settings, members, API keys
 *   owner  owner: owners and deleting the organisation
 */

export const ROLES = ["owner", "admin", "staff", "accountant", "readonly"] as const;
export type Role = (typeof ROLES)[number];
export type Access = "read" | "write" | "admin" | "owner";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Ägare",
  admin: "Administratör",
  staff: "Personal",
  accountant: "Redovisningskonsult",
  readonly: "Läsbehörighet",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "Allt, även ägare och organisationen.",
  admin: "Allt utom ägare: inställningar, medlemmar, API-nycklar.",
  staff: "Fakturor, kunder, betalningar, projekt.",
  accountant: "Läser ekonomi, fakturor och bokföring, laddar ner SIE. Skriver inget.",
  readonly: "Läser ekonomi och fakturor.",
};

const LEVEL: Record<Role, number> = { owner: 4, admin: 3, staff: 2, accountant: 1, readonly: 1 };
const NEEDED: Record<Access, number> = { read: 1, write: 2, admin: 3, owner: 4 };

export function isRole(v: unknown): v is Role {
  return (ROLES as readonly unknown[]).includes(v);
}

export function hasAccess(role: Role | null | undefined, access: Access): boolean {
  return !!role && LEVEL[role] >= NEEDED[access];
}

/** Roles a member with `role` may give others. Only owners make owners. */
export function assignableRoles(role: Role): Role[] {
  if (role === "owner") return [...ROLES];
  if (role === "admin") return ["admin", "staff", "accountant", "readonly"];
  return [];
}

/**
 * Admin paths a reader (accountant, readonly) may open. Everything else in
 * admin is for staff and up; the proxy sends readers to Ekonomi.
 */
const READER_PATHS = ["/admin/ekonomi", "/admin/fakturor", "/admin/kunder", "/admin/rot", "/admin/organisation"];
/** Paths any signed-in user may open, member or not: accepting an invitation, starting an organisation. */
export const OPEN_ADMIN_PATHS = ["/admin/login", "/admin/inbjudan", "/admin/ny-organisation"];

export function isOpenAdminPath(pathname: string): boolean {
  return OPEN_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function canOpenAdminPath(role: Role | null | undefined, pathname: string): boolean {
  if (isOpenAdminPath(pathname)) return true;
  if (!role) return false;
  if (hasAccess(role, "write")) return true;
  // Readers see lists and documents, never the pages that create things.
  if (/\/(ny|aterkommande|bank)(\/|$)/.test(pathname)) return false;
  return READER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
