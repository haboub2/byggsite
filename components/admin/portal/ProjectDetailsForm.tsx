"use client";

import { useActionState } from "react";
import { saveProjectDetails } from "@/app/admin/portal-actions";
import type { ContentActionState } from "@/app/admin/content-actions";
import { formatWhen } from "@/lib/admin-format";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type PortalProject } from "@/lib/portal/schema";

/** The fields the customer sees on Översikt, saved as one form. */
export default function ProjectDetailsForm({ project }: { project: PortalProject }) {
  const [state, action, pending] = useActionState<ContentActionState, FormData>(saveProjectDetails, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const field = (k: keyof PortalProject, label: string, input: React.ReactNode, hint?: string) => (
    <div className={`efield${err(k) ? " has-error" : ""}`}>
      <label htmlFor={`p-${k}`}>{label}</label>
      {input}
      {(err(k) || hint) && <span className={err(k) ? "efield-error" : "efield-hint"}>{err(k) ?? hint}</span>}
    </div>
  );

  return (
    <form action={action} className="editor" noValidate>
      <input type="hidden" name="id" value={project.id} />
      <fieldset className="efieldset">
        <legend>Projektet</legend>
        <div className="egrid">
          {field("title", "Projektnamn", <input id="p-title" name="title" defaultValue={project.title} maxLength={120} />)}
          {field(
            "status",
            "Status",
            <select id="p-status" name="status" defaultValue={project.status}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          )}
          {field("customer_name", "Kund", <input id="p-customer_name" name="customer_name" defaultValue={project.customer_name} maxLength={120} />)}
          {field("address", "Adress", <input id="p-address" name="address" defaultValue={project.address} maxLength={160} />)}
          {field("starts_on", "Start", <input id="p-starts_on" name="starts_on" type="date" defaultValue={project.starts_on} />)}
          {field("ends_on", "Beräknat klart", <input id="p-ends_on" name="ends_on" type="date" defaultValue={project.ends_on} />)}
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Det kunden ser först</legend>
        <div className="egrid">
          {field(
            "current_phase",
            "Aktuell fas (rubrik)",
            <input id="p-current_phase" name="current_phase" defaultValue={project.current_phase} maxLength={80} placeholder="Tätskikt" />,
            "Lämna tom så visas den första fasen som inte är klar."
          )}
          {field("next_step", "Nästa steg", <input id="p-next_step" name="next_step" defaultValue={project.next_step} maxLength={500} placeholder="Kakel och klinker, start torsdag." />)}
          <div className={`efield efield--wide${err("this_week") ? " has-error" : ""}`}>
            <label htmlFor="p-this_week">Den här veckan</label>
            <textarea id="p-this_week" name="this_week" rows={3} defaultValue={project.this_week} maxLength={1000} placeholder="Vad som händer just nu och vad kunden kan förvänta sig." />
            {err("this_week") && <span className="efield-error">{err("this_week")}</span>}
          </div>
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Kontaktperson</legend>
        <div className="egrid">
          {field("contact_name", "Namn", <input id="p-contact_name" name="contact_name" defaultValue={project.contact_name} maxLength={80} />)}
          {field(
            "contact_phone",
            "Telefon",
            <input id="p-contact_phone" name="contact_phone" defaultValue={project.contact_phone} maxLength={20} placeholder="+46793049737" />,
            "Med landsnummer, så att ring- och sms-knapparna fungerar."
          )}
        </div>
      </fieldset>

      <div className="editor-bar">
        <span className={`editor-state${state.error ? " is-error" : ""}`}>
          {state.error ?? (state.ok && state.savedAt ? `Sparat ${formatWhen(state.savedAt)}.` : "Kunden ser ändringarna direkt.")}
        </span>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sparar…" : "Spara"}
        </button>
      </div>
    </form>
  );
}
