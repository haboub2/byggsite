import "server-only";
import { Resend } from "resend";
import { site } from "./placeholder";
import { getContent } from "./content/store";

type LeadKind = "offert" | "kontakt" | "brief";
type Division = "bygg" | "01";

/** Sender. Until binaafy.se is verified in Resend, only Resend's test sender
 *  works, and it can only deliver to the Resend account's own address. */
const FROM = process.env.MAIL_FROM || `${site.brand} <onboarding@resend.dev>`;

/** Everything from the form is user input: never put it in HTML unescaped. */
function esc(value: string | undefined): string {
  return (value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function client() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

const KIND_LABEL: Record<LeadKind, string> = {
  offert: "Offertförfrågan",
  kontakt: "Kontaktmeddelande",
  brief: "Software — brief",
};

/** Internal notification to the team. Never throws — logs and returns on failure. */
export async function notify(input: {
  kind: LeadKind;
  name: string;
  email: string;
  phone?: string;
  message: string;
  extra?: Record<string, string | undefined>;
}) {
  const resend = client();
  const { company } = await getContent();
  const to = process.env.MAIL_TO || company.email;

  if (!resend) {
    console.warn(`[mail] RESEND_API_KEY not set — internal notify skipped for ${input.kind} lead (${input.email}).`);
    return;
  }

  const extraRows = Object.entries(input.extra ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join("");

  try {
    await resend.emails.send({
      from: FROM,
      to,
      replyTo: input.email,
      subject: `${KIND_LABEL[input.kind]} — ${input.name.slice(0, 80)}`,
      html: `
        <div style="font-family:sans-serif;font-size:14px;color:#14161a">
          <h2 style="margin:0 0 12px">${KIND_LABEL[input.kind]}</h2>
          <table>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Namn</td><td>${esc(input.name)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">E-post</td><td>${esc(input.email)}</td></tr>
            ${input.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Telefon</td><td>${esc(input.phone)}</td></tr>` : ""}
            ${extraRows}
          </table>
          <p style="margin-top:16px;white-space:pre-wrap">${esc(input.message)}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[mail] notify failed", err);
  }
}

/** Auto-reply to the submitter. Never throws — a failed auto-reply must not fail the request. */
export async function autoreply(input: { kind: LeadKind; division: Division; name: string; email: string }) {
  const resend = client();
  if (!resend) {
    console.warn(`[mail] RESEND_API_KEY not set — auto-reply skipped for ${input.email}.`);
    return;
  }
  // Replying to customers needs a verified sending domain (MAIL_FROM); the
  // Resend test sender can't deliver to outside addresses.
  if (!process.env.MAIL_FROM) {
    console.warn(`[mail] MAIL_FROM not set — auto-reply skipped for ${input.email}.`);
    return;
  }

  const { company } = await getContent();
  const isSoftware = input.division === "01";
  const subject = isSoftware ? "Tack för din brief — vi hör av oss inom två arbetsdagar" : "Tack — vi hör av oss inom 24 timmar";
  const signOff = isSoftware ? `${site.brand} Software` : `${site.brand} Bygg`;

  try {
    await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: input.email,
      replyTo: company.email,
      subject,
      html: `
        <div style="font-family:sans-serif;font-size:14px;color:#14161a">
          <p>Hej ${esc(input.name.split(" ")[0])},</p>
          <p>Tack för din förfrågan. Vi har tagit emot den och återkommer ${isSoftware ? "inom två arbetsdagar" : "inom 24 timmar"}.</p>
          <p>Har du en brådskande fråga under tiden? Ring ${company.phoneDisplay} eller svara direkt på det här mejlet.</p>
          <p>Vänliga hälsningar,<br>${signOff}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[mail] autoreply failed", err);
  }
}
