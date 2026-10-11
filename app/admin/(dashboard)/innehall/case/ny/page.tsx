import Link from "next/link";
import CaseEditor from "@/components/admin/content/CaseEditor";
import { emptyCase } from "@/lib/case-schema";
import { listAllCases } from "@/lib/cases";

export default async function NewCase() {
  const count = (await listAllCases()).length;
  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/innehall/case" className="link-quiet">
          ← Alla case
        </Link>
        <h1 className="admin-h1" style={{ marginTop: 16 }}>
          Nytt case
        </h1>
        <p className="admin-intro">
          Sparas som utkast tills du bockar i Publicerad. Du kan spara halvfärdigt och fortsätta senare.
        </p>
        <CaseEditor initial={emptyCase(count * 10)} original={null} />
      </div>
    </section>
  );
}
