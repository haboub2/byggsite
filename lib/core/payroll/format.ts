/** Swedish month names for payroll pages, the Idag rows and the payslip PDF. */
export const MONTH_NAMES = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"] as const;

/** "2026-11-01" or "2026-11" → "november 2026". */
export const monthLabel = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
