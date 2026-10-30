import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { NewEmployeeForm } from "@/components/admin/hr/EmployeeForm";

export const metadata: Metadata = { title: "Lägg till person" };

/** A new person in the register; the contract is added on the person's page. */
export default async function NewEmployeePage() {
  const check = await requireRole("admin");
  if (!check.ok) redirect("/admin/personal");
  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/personal" className="link-quiet">
          ← Personal
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Personal</span>
            <h1 className="admin-h1">Lägg till person</h1>
            <p className="admin-intro">Först personen, sedan avtalet på personens sida: anställningsform, lön och villkor, och avtalet som PDF.</p>
          </div>
        </div>
        <NewEmployeeForm agreement="none" />
      </div>
    </section>
  );
}
