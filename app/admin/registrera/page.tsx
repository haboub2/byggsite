import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/admin/actions";
import { PRODUCT_NAME } from "@/lib/product";
import { REGISTRATION_PROBLEMS, type RegistrationProblem } from "@/lib/core/org/registration";

export const metadata: Metadata = { title: { absolute: `Registrering — ${PRODUCT_NAME}` }, robots: { index: false, follow: false } };

/** Why a registration link did not finish (/admin/registrera/klar sends here), and what to do instead. */
export default async function RegistrationProblemPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const { fel } = await searchParams;
  const problem: RegistrationProblem = fel && fel in REGISTRATION_PROBLEMS ? (fel as RegistrationProblem) : "fel";
  return (
    <main>
      <section className="sec" style={{ minHeight: "70vh" }}>
        <div className="container" style={{ maxWidth: 520 }}>
          <span className="eyebrow">{PRODUCT_NAME}</span>
          <h1 style={{ fontSize: 36, marginTop: 8 }}>Registreringen blev inte klar</h1>
          <p className="form-feedback error" role="alert" style={{ margin: "16px 0 24px" }}>
            {REGISTRATION_PROBLEMS[problem]}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {problem === "anvand" ? (
              <Link href="/admin/login" className="btn btn-primary">
                Logga in
              </Link>
            ) : (
              <Link href="/registrera" className="btn btn-primary">
                Registrera igen
              </Link>
            )}
            {problem === "adress" && (
              <form action={signOut}>
                <button type="submit" className="btn btn-ghost">
                  Logga ut
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
