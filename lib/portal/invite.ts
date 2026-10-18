import "server-only";
import { createAdminClient } from "../supabase/admin";
import { isDemo } from "../leads";
import { SITE_URL } from "../env";
import { portalAddedMail } from "../mail";
import { addMember } from "./store";
import type { PortalProject } from "./schema";

/**
 * "Bjud in kund": give an e-mail address access to a project. A new address
 * gets a Supabase account and Supabase's own invite e-mail (template "Invite
 * user", with a link to /mitt-projekt/callback). An address that already has
 * an account is just added to the project and told so by Resend. Accounts
 * are only ever created here — the login page never creates one.
 */
export async function inviteMember(project: PortalProject, email: string, name: string): Promise<{ existing: boolean }> {
  const normalized = email.trim().toLowerCase();

  if (isDemo()) {
    await addMember({ project_id: project.id, user_id: normalized, email: normalized, name });
    return { existing: false };
  }

  const admin = createAdminClient();
  const redirectTo = `${SITE_URL}/mitt-projekt/callback`;

  const invited = await admin.auth.admin.inviteUserByEmail(normalized, { redirectTo, data: { name } });
  if (!invited.error && invited.data.user) {
    await addMember({ project_id: project.id, user_id: invited.data.user.id, email: normalized, name });
    return { existing: false };
  }

  // Already registered (an earlier project, or an admin): find the account
  // without sending anything. generateLink returns the user and no e-mail.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: normalized });
  if (link.error || !link.data.user) {
    throw new Error(`Kunde inte bjuda in ${normalized}: ${invited.error?.message ?? link.error?.message ?? "okänt fel"}`);
  }
  await addMember({ project_id: project.id, user_id: link.data.user.id, email: normalized, name });
  await portalAddedMail({ to: normalized, name, projectTitle: project.title });
  return { existing: true };
}
