"use client";

import { useActionState } from "react";
import {
  acceptInvitationAction,
  createOrganizationAction,
  inviteMemberAction,
  removeMemberAction,
  requestInvitationLogin,
  setMemberRoleAction,
  type OrgActionState,
} from "@/app/admin/org-actions";
import { ROLE_LABEL, type Role } from "@/lib/core/org/roles";

function Feedback({ state }: { state: OrgActionState }) {
  if (state.error)
    return (
      <p className="form-feedback error" role="alert">
        {state.error}
      </p>
    );
  if (!state.message) return null;
  return (
    <div className="form-feedback" role="status">
      {state.message}
      {state.link && <code className="org-link">{state.link}</code>}
    </div>
  );
}

export function InviteForm({ roles }: { roles: Role[] }) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(inviteMemberAction, {});
  return (
    <form action={action}>
      <div className="org-inline">
        <label className="sr-only" htmlFor="inv-email">
          E-post
        </label>
        <input id="inv-email" name="email" type="email" required placeholder="namn@foretag.se" autoComplete="off" />
        <label className="sr-only" htmlFor="inv-role">
          Roll
        </label>
        <select id="inv-role" name="role" defaultValue={roles.includes("staff") ? "staff" : roles[0]}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Bjuder in…" : "Bjud in"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function MemberRoleForm({ userId, role, roles, email }: { userId: string; role: Role; roles: Role[]; email: string }) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(setMemberRoleAction, {});
  return (
    <form action={action} className="org-inline">
      <input type="hidden" name="user" value={userId} />
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Roll för {email}
      </label>
      <select id={`role-${userId}`} name="role" defaultValue={role}>
        {(roles.includes(role) ? roles : [role, ...roles]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-ghost" disabled={pending}>
        Spara
      </button>
      {(state.error || state.message) && <span className={state.error ? "efield-error" : "efield-hint"}>{state.error ?? state.message}</span>}
    </form>
  );
}

export function RemoveMemberForm({ userId, email }: { userId: string; email: string }) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(removeMemberAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Ta bort ${email} ur organisationen?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="user" value={userId} />
      <button type="submit" className="btn btn-ghost" disabled={pending}>
        Ta bort
      </button>
      {state.error && <span className="efield-error">{state.error}</span>}
    </form>
  );
}

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(createOrganizationAction, {});
  return (
    <form action={action} className="form" style={{ maxWidth: 420 }}>
      <div className="field">
        <label htmlFor="org-name">Företagets namn</label>
        <input id="org-name" name="name" required minLength={2} maxLength={120} placeholder="Testbolag AB" />
      </div>
      <div className="field">
        <label htmlFor="org-nr">Organisationsnummer</label>
        <input id="org-nr" name="orgNr" inputMode="numeric" placeholder="559123-4567" />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Skapar…" : "Skapa organisationen"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(acceptInvitationAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Accepterar…" : "Acceptera inbjudan"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function InvitationLoginForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(requestInvitationLogin, {});
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      <button type="submit" className="btn btn-primary" disabled={pending || state.ok}>
        {pending ? "Skickar…" : `Skicka inloggningslänk till ${email}`}
      </button>
      <Feedback state={state} />
    </form>
  );
}
