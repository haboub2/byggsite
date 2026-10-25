/**
 * The invoicing product's working name, shown on /fakturering, in the
 * interest notification and in admin. Change it here when the product gets
 * its real name (docs/fakturering.md uses [PRODUKTNAMN]).
 */
export const PRODUCT_NAME = "Binaafy Fakturering";

/** Public page that presents the product and collects interest. */
export const PRODUCT_PATH = "/fakturering";

/**
 * The user manual (docs/manual) once it is published as a web page; null
 * until then, and the start guide says it is coming.
 */
export const PRODUCT_MANUAL_URL: string | null = null;

/**
 * How long a sign-in link by e-mail works, as the login page says it. Must
 * match Supabase → Authentication → Email OTP expiration (3600 s, see
 * docs/supabase-mail/README.md).
 */
export const LOGIN_LINK_VALIDITY = "en timme";
