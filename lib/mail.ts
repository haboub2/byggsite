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

/** Where internal mail goes: MAIL_TO (may list several, comma-separated), else the company address. */
function teamAddresses(fallback: string): string | string[] {
  const listed = (process.env.MAIL_TO ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  return listed.length ? listed : fallback;
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
  const to = teamAddresses(company.email);

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

/* ---------- Kundportalen ---------- */

const PORTAL_URL = `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://binaafy.se"}/mitt-projekt`;

/** A customer who already had an account was added to another project. Never throws. */
export async function portalAddedMail(input: { to: string; name: string; projectTitle: string }) {
  const resend = client();
  if (!resend || !process.env.MAIL_FROM) {
    console.warn(`[mail] Resend/MAIL_FROM not set — portal notice skipped for ${input.to}.`);
    return;
  }
  const { company } = await getContent();
  try {
    await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: input.to,
      replyTo: company.email,
      subject: `${esc(input.projectTitle)} finns nu under Mitt projekt`,
      html: `
        <div style="font-family:sans-serif;font-size:14px;color:#14161a">
          <p>Hej${input.name ? ` ${esc(input.name.split(" ")[0])}` : ""},</p>
          <p>Ditt projekt <strong>${esc(input.projectTitle)}</strong> finns nu i kundportalen. Där följer du tidplanen, ser foton från bygget och hittar dokumenten.</p>
          <p><a href="${PORTAL_URL}" style="display:inline-block;padding:10px 18px;background:#f7802e;color:#18232c;text-decoration:none;border-radius:4px;font-weight:600">Öppna Mitt projekt</a></p>
          <p style="color:#6b7280">Logga in med din e-postadress; du får en engångskod i mejlen.</p>
          <p>Vänliga hälsningar,<br>${site.brand} Bygg</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[mail] portalAddedMail failed", err);
  }
}

type PortalRecipient = { email: string; name: string };
type PortalNoticeKind = "update" | "document" | "change_order";

const PORTAL_NOTICE: Record<PortalNoticeKind, { subject: (title: string) => string; lead: string; tab: string; button: string }> = {
  update: { subject: (t) => `Nytt från bygget — ${t}`, lead: "Vi har lagt upp en ny uppdatering från bygget.", tab: "foton", button: "Se uppdateringen" },
  document: { subject: (t) => `Nytt dokument — ${t}`, lead: "Ett nytt dokument finns nu under Dokument i kundportalen.", tab: "dokument", button: "Öppna dokumenten" },
  change_order: { subject: (t) => `Ändring att godkänna — ${t}`, lead: "Vi har lagt upp ett tilläggs- eller ändringsarbete (ÄTA) som väntar på ditt svar.", tab: "andringar", button: "Svara på ändringen" },
};

/**
 * Tell the customers of a project that something new is in the portal: an
 * update with photos, a document, or a change order to answer. One mail per
 * member, with a link straight to the right tab. Never throws.
 */
export async function portalNoticeMail(input: { kind: PortalNoticeKind; to: PortalRecipient[]; projectId: string; projectTitle: string; summary?: string }) {
  const resend = client();
  if (!input.to.length) return;
  if (!resend || !process.env.MAIL_FROM) {
    console.warn(`[mail] Resend/MAIL_FROM not set — portal ${input.kind} notice skipped for ${input.to.map((r) => r.email).join(", ")}.`);
    return;
  }
  const { company } = await getContent();
  const text = PORTAL_NOTICE[input.kind];
  const link = `${PORTAL_URL}/${input.projectId}/${text.tab}`;
  await Promise.all(
    input.to.map(async (r) => {
      try {
        await resend.emails.send({
          from: process.env.MAIL_FROM!,
          to: r.email,
          replyTo: company.email,
          subject: text.subject(input.projectTitle.slice(0, 80)),
          html: `
            <div style="font-family:sans-serif;font-size:14px;color:#14161a">
              <p>Hej${r.name ? ` ${esc(r.name.split(" ")[0])}` : ""},</p>
              <p>${text.lead}</p>
              ${input.summary ? `<p style="padding:12px 14px;background:#f4f1ec;border-radius:4px;white-space:pre-wrap">${esc(input.summary.slice(0, 600))}</p>` : ""}
              <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#f7802e;color:#18232c;text-decoration:none;border-radius:4px;font-weight:600">${text.button}</a></p>
              <p style="color:#6b7280">Projekt: ${esc(input.projectTitle)}. Logga in med din e-postadress; du får en engångskod i mejlen.</p>
              <p>Vänliga hälsningar,<br>${site.brand} Bygg</p>
            </div>
          `,
        });
      } catch (err) {
        console.error(`[mail] portalNoticeMail (${input.kind}) failed for ${r.email}`, err);
      }
    })
  );
}

/** A customer approved or declined a change order: tell the team (MAIL_TO). Never throws. */
export async function changeOrderAnsweredMail(input: {
  projectId: string;
  projectTitle: string;
  number: number;
  title: string;
  amount: number;
  approved: boolean;
  answeredName: string;
  answeredEmail: string;
}) {
  const resend = client();
  if (!resend) {
    console.warn(`[mail] RESEND_API_KEY not set — ÄTA answer notice skipped (${input.projectTitle} #${input.number}).`);
    return;
  }
  const { company } = await getContent();
  const to = teamAddresses(company.email);
  const verdict = input.approved ? "godkände" : "avböjde";
  const kr = `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(input.amount)} kr`;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      replyTo: input.answeredEmail,
      subject: `ÄTA ${input.number} ${input.approved ? "godkänd" : "avböjd"} — ${input.projectTitle.slice(0, 80)}`,
      html: `
        <div style="font-family:sans-serif;font-size:14px;color:#14161a">
          <h2 style="margin:0 0 12px">Kunden ${verdict} ÄTA ${input.number}</h2>
          <table>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Projekt</td><td>${esc(input.projectTitle)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Ändring</td><td>${esc(input.title)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Pris</td><td>${esc(kr)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Svar</td><td><strong>${input.approved ? "Godkänd" : "Avböjd"}</strong> av ${esc(input.answeredName)} (${esc(input.answeredEmail)})</td></tr>
          </table>
          <p style="margin-top:16px"><a href="${(process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://binaafy.se")}/admin/projekt/${input.projectId}#ata">Öppna projektet i admin</a></p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[mail] changeOrderAnsweredMail failed", err);
  }
}
