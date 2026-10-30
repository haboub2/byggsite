/**
 * Roles in an organisation (memberships.role, 0014) and what each may do in
 * admin. The database enforces the same split with is_org_member (read),
 * can_write_org (owner, admin, staff) and can_admin_org (owner, admin).
 *
 *   read   accountant and readonly: Ekonomi, Bokföringen, fakturor, kunder, ROT
 *   payroll  owner, admin, accountant: Personal (people, contracts, tax data);
 *          not staff or readonly. The database checks the same with
 *          can_payroll_read() (0035); writing people and contracts is
 *          can_payroll_approve(), owner and admin (access "admin" here).
 *   write  staff: everything that creates invoices, customers, payments
 *   admin  admin: settings, members, API keys
 *   owner  owner: owners and deleting the organisation
 *   site   admin in the organisation that owns the website (default_org(),
 *          lib/core/org/site.ts): the website's content. The database checks
 *          the same with is_site_admin() (0022).
 *
 * employee (0035) is a person on the payroll who signs in: no admin page
 * (phase 2 adds their own), and in the database only their own rows
 * (is_self; is_org_member() leaves them out).
 */

export const ROLES = ["owner", "admin", "staff", "accountant", "readonly", "employee"] as const;
export type Role = (typeof ROLES)[number];
export type Access = "read" | "payroll" | "write" | "admin" | "owner" | "site";

/** Every access level, in the order the layout lists them. */
export const ACCESS_LEVELS: readonly Access[] = ["read", "payroll", "write", "admin", "owner", "site"];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Ägare",
  admin: "Administratör",
  staff: "Personal",
  accountant: "Redovisningskonsult",
  readonly: "Läsbehörighet",
  employee: "Anställd",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "Allt, även ägare och organisationen.",
  admin: "Allt utom ägare: inställningar, medlemmar, API-nycklar.",
  staff: "Fakturor, kunder, betalningar, projekt.",
  accountant: "Läser ekonomi, fakturor, bokföring och personal, laddar ner SIE. Skriver inget.",
  readonly: "Läser ekonomi och fakturor.",
  employee: "Ser bara sina egna uppgifter (avtal; tid och lönebesked kommer). Inga sidor i admin.",
};

const LEVEL: Record<Role, number> = { owner: 4, admin: 3, staff: 2, accountant: 1, readonly: 1, employee: 0 };
const NEEDED: Record<Exclude<Access, "payroll">, number> = { read: 1, write: 2, admin: 3, owner: 4, site: 3 };
/** Payroll is not a level: the accountant reads it, staff (higher for invoices) does not. */
const PAYROLL_ROLES: readonly Role[] = ["owner", "admin", "accountant"];

export function isRole(v: unknown): v is Role {
  return (ROLES as readonly unknown[]).includes(v);
}

/** `siteOrg`: the member works in the organisation that owns the website. Only "site" asks. */
export function hasAccess(role: Role | null | undefined, access: Access, siteOrg = false): boolean {
  if (access === "site" && !siteOrg) return false;
  if (access === "payroll") return !!role && PAYROLL_ROLES.includes(role);
  return !!role && LEVEL[role] >= NEEDED[access];
}

/** Roles a member with `role` may give others. Only owners make owners. */
export function assignableRoles(role: Role): Role[] {
  if (role === "owner") return [...ROLES];
  if (role === "admin") return ["admin", "staff", "accountant", "readonly", "employee"];
  return [];
}

/**
 * Admin paths a reader (accountant, readonly) may open. Everything else in
 * admin is for staff and up; the proxy sends readers to Ekonomi.
 */
const READER_PATHS = ["/admin/idag", "/admin/sok", "/admin/ekonomi", "/admin/fakturor", "/admin/kunder", "/admin/rot", "/admin/organisation"];
/** Personal: owner, admin and accountant ("payroll"); its pages that create (…/ny) only for owner and admin. */
const PAYROLL_PATHS = ["/admin/personal"];
/** The website's content and its interest registrations: only for "site" (owner/admin in the organisation that owns the site). */
const SITE_PATHS = ["/admin/innehall", "/admin/intresse"];
/**
 * Paths any signed-in user may open, member or not: accepting an invitation,
 * starting an organisation, finishing a self-registration (0033). The
 * registration landing also handles a visitor who is not signed in yet.
 */
export const OPEN_ADMIN_PATHS = ["/admin/login", "/admin/inbjudan", "/admin/ny-organisation", "/admin/registrera"];

export function isOpenAdminPath(pathname: string): boolean {
  return OPEN_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isSiteAdminPath(pathname: string): boolean {
  return SITE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isPayrollAdminPath(pathname: string): boolean {
  return PAYROLL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function canOpenAdminPath(role: Role | null | undefined, pathname: string, siteOrg = false): boolean {
  if (isOpenAdminPath(pathname)) return true;
  if (!role) return false;
  if (isSiteAdminPath(pathname)) return hasAccess(role, "site", siteOrg);
  if (isPayrollAdminPath(pathname)) {
    if (!hasAccess(role, "payroll")) return false;
    return hasAccess(role, "admin") || !/\/ny(\/|$)/.test(pathname);
  }
  if (!hasAccess(role, "read")) return false;
  if (hasAccess(role, "write")) return true;
  // Readers see lists and documents, never the pages that create things.
  if (/\/(ny|aterkommande|bank)(\/|$)/.test(pathname)) return false;
  return READER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where the proxy sends a member who opened a page their role does not reach. */
export function adminLandingPath(role: Role): string {
  // An employee has no admin page yet (phase 2 adds /min-tid); the portal
  // says they are signed in without leaking anything.
  return role === "employee" ? "/mitt-projekt" : "/admin/ekonomi";
}

/**
 * Where a login may send the user afterwards: an admin page, or the
 * registration landing with its token (the only target that keeps a query).
 * Anything else, another site included, gives null.
 */
export function safeAdminNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (/^\/admin(\/[\w\-/]*)?$/.test(next)) return next;
  if (/^\/admin\/registrera\/klar\?r=[a-f0-9]{64}$/.test(next)) return next;
  return null;
}
