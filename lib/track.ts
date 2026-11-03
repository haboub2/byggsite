import { sendGAEvent } from "@next/third-parties/google";

/**
 * GA4 key events. Fired from client components only; a no-op (with a console
 * note from @next/third-parties) when GA is not loaded, i.e. before cookie
 * consent or without NEXT_PUBLIC_GA_ID. Mark these as key events in GA4:
 * generate_lead (forms), contact_call (tel: taps), contact_whatsapp.
 */
export function track(event: string, params: Record<string, string | number | undefined> = {}) {
  try {
    sendGAEvent("event", event, params);
  } catch {
    // Analytics must never break the page.
  }
}
