import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { listMyMemberships } from "@/lib/core/org/current";
import { listInvitations, listMembers, type Invitation } from "@/lib/core/org/members";
import { ROLE_HINT, ROLE_LABEL, ROLES, assignableRoles, hasAccess } from "@/lib/core/org/roles";
import { formatDateTime } from "@/lib/admin-format";
import { revokeInvitationAction } from "@/app/admin/org-actions";
import { InviteForm, MemberRoleForm, RemoveMemberForm } from "@/components/admin/org/OrgForms";

export const metadata = { title: "Organisation" };

/** The organisation: who is in it, with which role; invitations; other organisations and a new one. */
export default async function OrganisationPage() {
  const check = await requireRole("read");
  if (!check.ok) redirect("/admin/login");
  const canAdmin = hasAccess(check.role, "admin");
  const [members, invitations, mine] = await Promise.all([listMembers(), canAdmin ? listInvitations() : Promise.resolve([] as Invitation[]), listMyMemberships()]);
  const current = mine.find((m) => m.orgId === check.orgId);
  const roles = assignableRoles(check.role);
  const open = invitations.filter((i) => !i.acceptedAt);

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 960 }}>
        <span className="eyebrow">Organisation</span>
        <h1 className="admin-h1">{check.orgName}</h1>
        <p className="admin-intro">
          {current?.orgNr ? `Org.nr ${current.orgNr}. ` : ""}Du är {ROLE_LABEL[check.role].toLowerCase()}. {ROLE_HINT[check.role]}
          {canAdmin && (
            <>
              {" "}
              <Link href="/admin/installningar" className="link-quiet">
                Inställningar
              </Link>
            </>
          )}
        </p>

        <h2 style={{ marginTop: 32, fontSize: 22 }}>Medlemmar</h2>
        <table className="org-table">
          <thead>
            <tr>
              <th>E-post</th>
              <th>Roll</th>
              <th>Sedan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const self = m.userId === check.userId;
              const editable = canAdmin && !self && (m.role !== "owner" || check.role === "owner");
              return (
                <tr key={m.userId}>
                  <td>
                    {m.email}
                    {self && <span className="efield-hint"> (du)</span>}
                  </td>
                  <td>{editable ? <MemberRoleForm userId={m.userId} role={m.role} roles={roles} email={m.email} /> : ROLE_LABEL[m.role]}</td>
                  <td>{formatDateTime(m.joinedAt)}</td>
                  <td>{editable && <RemoveMemberForm userId={m.userId} email={m.email} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {canAdmin && (
          <>
            <h2 style={{ marginTop: 40, fontSize: 22 }}>Bjud in</h2>
            <p className="admin-intro">
              Den inbjudna får en länk som gäller i 14 dagar och loggar in med samma e-postadress. Med MAIL_FROM och Resend mejlas länken, annars visas den här.
            </p>
            <InviteForm roles={roles.filter((r) => r !== "owner")} />
            {open.length > 0 && (
              <table className="org-table" style={{ marginTop: 24 }}>
                <thead>
                  <tr>
                    <th>Inbjuden</th>
                    <th>Roll</th>
                    <th>Gäller till</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {open.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>{ROLE_LABEL[i.role]}</td>
                      <td>{i.expired ? "Har gått ut" : formatDateTime(i.expiresAt)}</td>
                      <td>
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="id" value={i.id} />
                          <button type="submit" className="btn btn-ghost">
                            Dra tillbaka
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        <h2 style={{ marginTop: 40, fontSize: 22 }}>Roller</h2>
        <ul className="admin-intro">
          {ROLES.map((r) => (
            <li key={r}>
              <strong>{ROLE_LABEL[r]}</strong>: {ROLE_HINT[r]}
            </li>
          ))}
        </ul>

        <h2 style={{ marginTop: 40, fontSize: 22 }}>Dina organisationer</h2>
        <ul className="admin-intro">
          {mine.map((m) => (
            <li key={m.orgId}>
              {m.name} ({ROLE_LABEL[m.role].toLowerCase()}){m.orgId === check.orgId ? ", den du arbetar i nu" : ""}
            </li>
          ))}
        </ul>
        <p>
          <Link href="/admin/ny-organisation" className="btn btn-ghost">
            Skapa en ny organisation
          </Link>
        </p>
      </div>
    </section>
  );
}
