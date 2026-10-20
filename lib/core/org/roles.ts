/**
 * Roles in an organisation (memberships.role, 0014) and what each may do in
 * admin. The database enforces the same split with is_org_member (read),
 * can_write_org (owner, admin, staff) and can_admin_org (owner, admin).
 *
 *   read   accountant and readonly: Ekonomi, Bokföringen, fakturor, kunder, ROT
 *   write  staff: everything that creates invoices, customers, payments
 *   admin  admin: settings, members, API keys
 *   owner  owner: owners and deleting the organisation
 *   site   admin in the organisation that owns the website (default_org(),
 *          lib/core/org/site.ts): the website's content. The database checks
 *          the same with is_site_admin() (0022).
 */

export const ROLES = ["owner", "admin", "staff", "accountant", "readonly"] as const;
export type Role = (typeof ROLES)[number];
export type Access = "read" | "write" | "admin" | "owner" | "site";

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
const NEEDED: Record<Access, number> = { read: 1, write: 2, admin: 3, owner: 4, site: 3 };

export function isRole(v: unknown): v is Role {
  return (ROLES as readonly unknown[]).includes(v);
}

/** `siteOrg`: the member works in the organisation that owns the website. Only "site" asks. */
export function hasAccess(role: Role | null | undefined, access: Access, siteOrg = false): boolean {
  if (access === "site" && !siteOrg) return false;
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
const READER_PATHS = ["/admin/idag", "/admin/sok", "/admin/ekonomi", "/admin/fakturor", "/admin/kunder", "/admin/rot", "/admin/organisation"];
/** The website's content: only for "site" (owner/admin in the organisation that owns the site). */
const SITE_PATHS = ["/admin/innehall"];
/** Paths any signed-in user may open, member or not: accepting an invitation, starting an organisation. */
export const OPEN_ADMIN_PATHS = ["/admin/login", "/admin/inbjudan", "/admin/ny-organisation"];

export function isOpenAdminPath(pathname: string): boolean {
  return OPEN_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isSiteAdminPath(pathname: string): boolean {
  return SITE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function canOpenAdminPath(role: Role | null | undefined, pathname: string, siteOrg = false): boolean {
  if (isOpenAdminPath(pathname)) return true;
  if (!role) return false;
  if (isSiteAdminPath(pathname)) return hasAccess(role, "site", siteOrg);
  if (hasAccess(role, "write")) return true;
  // Readers see lists and documents, never the pages that create things.
  if (/\/(ny|aterkommande|bank)(\/|$)/.test(pathname)) return false;
  return READER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
