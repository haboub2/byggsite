import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { invitationInfo } from "@/lib/core/org/members";
import { ROLE_LABEL } from "@/lib/core/org/roles";
import { AcceptInvitationForm, InvitationLoginForm } from "@/components/admin/org/OrgForms";

export const metadata: Metadata = { title: "Inbjudan", robots: { index: false, follow: false } };

/**
 * An invitation link. Reachable signed out (the proxy lets it through): the
 * visitor is asked to sign in with the invited address, by password at
 * /admin/login or with a one-time link, and comes back here to accept.
 */
export default async function InvitationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lank?: string }> }) {
  const [{ token }, { lank }] = await Promise.all([params, searchParams]);
  const info = await invitationInfo(token);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  let body: React.ReactNode;
  if (!info) body = <p>Inbjudan finns inte. Kontrollera länken eller be om en ny.</p>;
  else if (info.accepted) body = <p>Inbjudan är redan använd. <Link href="/admin">Till admin</Link></p>;
  else if (info.expired) body = <p>Inbjudan har gått ut. Be den som bjöd in dig om en ny.</p>;
  else if (!user)
    body = (
      <>
        <p>
          Du är inbjuden till <strong>{info.orgName}</strong> som {ROLE_LABEL[info.role].toLowerCase()}. Logga in med <strong>{info.email}</strong> för att acceptera.
        </p>
        {lank && <p className="form-feedback error">Länken var redan använd eller för gammal. Begär en ny.</p>}
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <InvitationLoginForm token={token} email={info.email} />
          <Link href={`/admin/login?next=/admin/inbjudan/${token}`} className="link-quiet">
            Jag har redan ett lösenord
          </Link>
        </div>
      </>
    );
  else if ((user.email ?? "").toLowerCase() !== info.email.toLowerCase())
    body = (
      <p>
        Inbjudan gäller {info.email}, men du är inloggad som {user.email}. Logga ut och in med rätt adress.
      </p>
    );
  else
    body = (
      <>
        <p>
          Du är inbjuden till <strong>{info.orgName}</strong> som {ROLE_LABEL[info.role].toLowerCase()}.
        </p>
        <div style={{ marginTop: 20 }}>
          <AcceptInvitationForm token={token} />
        </div>
      </>
    );

  return (
    <main>
      <section className="sec" style={{ minHeight: "70vh" }}>
        <div className="container" style={{ maxWidth: 560 }}>
          <span className="eyebrow">Inbjudan</span>
          <h1 style={{ fontSize: 36, margin: "8px 0 16px" }}>{info?.orgName ?? "Inbjudan"}</h1>
          {body}
        </div>
      </section>
    </main>
  );
}
