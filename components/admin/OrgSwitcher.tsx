"use client";

import { switchOrganization } from "@/app/admin/org-actions";

/** The organisation picker in the admin bar, shown when the user belongs to more than one. */
export default function OrgSwitcher({ current, orgs }: { current: string; orgs: { id: string; name: string }[] }) {
  return (
    <form action={switchOrganization} className="org-switch">
      <label htmlFor="org-switch" className="sr-only">
        Organisation
      </label>
      <select id="org-switch" name="org" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn btn-ghost">
          Byt
        </button>
      </noscript>
    </form>
  );
}
