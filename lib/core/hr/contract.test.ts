import { test } from "node:test";
import assert from "node:assert/strict";
import { contractContent, CONTRACT_TEMPLATE_VERSION, type ContractInput } from "./contract";
import type { EmploymentVersion } from "./schema";

const base: EmploymentVersion = {
  id: "v1",
  employeeId: "e1",
  contractId: "v1",
  version: 1,
  form: "tillsvidare",
  payForm: "monthly",
  monthlySalaryOre: 3_500_000,
  hourlyRateOre: null,
  feeOre: null,
  feePeriod: null,
  decisionReference: "",
  title: "Snickare",
  workplace: "",
  workingTimePercent: 100,
  weeklyHours: 40,
  substituteFor: "",
  probationEndsOn: null,
  startsOn: "2026-11-01",
  endsOn: null,
  noticeDays: null,
  payDay: 25,
  vacationRule: "sammalon",
  vacationDays: 25,
  vacationPercent: null,
  atfHoursPerYear: 0,
  pensionScheme: "saf-lo",
  terms: "",
  changeReason: "",
  validFrom: "2026-11-01",
  validTo: null,
  documentId: null,
  createdAt: "",
};

const input = (e: Partial<EmploymentVersion>, agreement: ContractInput["employee"]["agreement"] = "byggavtalet"): ContractInput => ({
  employer: { name: "Binaafy AB", orgNr: "559123-4567", street: "Exempelgatan 1", postalCode: "411 01", city: "Göteborg", signer: "Ibrahim" },
  employee: { name: "Anna Andersson", street: "Storgatan 2", postalCode: "123 45", city: "Borås", agreement },
  pnr12: "198504121230",
  employment: { ...base, ...e },
  clocks: null,
  today: "2026-10-30",
});

const text = (c: ReturnType<typeof contractContent>) =>
  c.sections.map((s) => [s.heading, ...(s.rows ?? []).flat(), ...(s.paragraphs ?? [])].join("\n")).join("\n");
const headings = (c: ReturnType<typeof contractContent>) => c.sections.map((s) => s.heading);

// LAS 6 c §: what every employment contract must say.
const LAS_6C = ["Parter", "Anställningens form och tid", "Arbetsplats och arbetsuppgifter", "Arbetstid", "Lön", "Semester", "Uppsägning", "Kompetensutveckling", "Socialförsäkring, pension och försäkringar", "Kollektivavtal"];

test("every employment form carries the LAS 6 c § items", () => {
  for (const form of ["tillsvidare", "provanstallning", "vikariat", "sava", "sasong", "vd"] as const) {
    const c = contractContent(input({ form, probationEndsOn: "2027-04-30", substituteFor: "Gustav", endsOn: form === "tillsvidare" || form === "provanstallning" ? null : "2027-03-31" }));
    for (const h of LAS_6C) assert.ok(headings(c).includes(h), `${form}: ${h}`);
    assert.equal(c.templateVersion, CONTRACT_TEMPLATE_VERSION);
    assert.equal(c.template, `contract-${form}`);
    const t = text(c);
    assert.match(t, /19850412-1230/, `${form}: personnummer`);
    assert.match(t, /2026-11-01/, `${form}: start`);
    assert.match(t, /Lönedag/, `${form}: lönedag`);
    assert.match(t, /arbetsgivaravgifter/, `${form}: avgifter`);
    assert.match(t, /Byggavtalet/, `${form}: kollektivavtal`);
  }
});

test("tillsvidare: notice by LAS 11 § or the agreement", () => {
  assert.match(text(contractContent(input({}, "none"))), /LAS 11 §[\s\S]*en månad under två år/);
  assert.match(text(contractContent(input({ noticeDays: 90 }))), /Ömsesidig uppsägningstid 90 dagar/);
});

test("provanställning: the end date, two weeks' notice, becomes tillsvidare", () => {
  const t = text(contractContent(input({ form: "provanstallning", probationEndsOn: "2027-04-30" })));
  assert.match(t, /till och med 2027-04-30/);
  assert.match(t, /senast två veckor/);
  assert.match(t, /övergår anställningen i en tillsvidareanställning/);
});

test("vikariat: who is replaced and the two-year rule", () => {
  const t = text(contractContent(input({ form: "vikariat", substituteFor: "Gustav Berg, föräldraledig", endsOn: null, payForm: "hourly", hourlyRateOre: 18_550, monthlySalaryOre: null, vacationRule: "procent", vacationPercent: 13 })));
  assert.match(t, /Gustav Berg, föräldraledig/);
  assert.match(t, /mer än två år under en femårsperiod/);
  assert.match(t, /185,50 kr per arbetad timme/);
  assert.match(t, /13 %/);
});

test("SÄVA: the written statement that it is a SÄVA, with the counted time", () => {
  const c = contractContent({
    ...input({ form: "sava", endsOn: "2026-11-30", payForm: "hourly", hourlyRateOre: 17_500, monthlySalaryOre: null, vacationRule: "procent", vacationPercent: 12 }),
    clocks: {
      sava_days: 79, sava_limit: 360, sava_days_left: 281, sava_converted: false, sava_converts_on: null,
      vikariat_days: 0, vikariat_limit: 730, vikariat_days_left: 730, vikariat_converted: false, vikariat_converts_on: null,
      probation_starts_on: null, probation_ends_on: null, probation_notice_by: null, probation_days_left: null, probation_converts_on: null,
    },
  });
  assert.ok(headings(c).includes("Information om särskild visstidsanställning"));
  const t = text(c);
  assert.match(t, /anställningen är en särskild visstidsanställning \(SÄVA\)/);
  assert.match(t, /mer än tolv månader under en femårsperiod/);
  assert.match(t, /tre eller fler särskilda visstidsanställningar under samma kalendermånad/);
  assert.match(t, /79 av 360 dagar/);
  assert.match(t, /Arbete vid behov/);
  assert.match(t, /Semesterersättning betalas ut/);
});

test("VD-avtal: LAS does not apply, no provanställning, agreed notice", () => {
  const c = contractContent(input({ form: "vd", noticeDays: 180, pensionScheme: "itp1" }, "none"));
  assert.equal(c.title, "Anställningsavtal för verkställande direktör");
  const t = text(c);
  assert.match(t, /Lagen om anställningsskydd gäller inte/);
  assert.match(t, /Ingen provanställning/);
  assert.match(t, /Ömsesidig uppsägningstid 180 dagar/);
  assert.match(t, /ITP 1/);
});

test("styrelseuppdrag: arvode decided by the stämma, no LAS, no semester, no sjuklön unless agreed", () => {
  const c = contractContent(input({ form: "uppdrag", payForm: "fee", feeOre: 2_000_000, feePeriod: "year", monthlySalaryOre: null, vacationRule: "none", pensionScheme: "none", decisionReference: "Årsstämma 2026-05-20 § 9", title: "" }, "none"));
  assert.equal(c.title, "Avtal om styrelseuppdrag");
  assert.equal(c.template, "contract-uppdrag");
  assert.ok(!headings(c).includes("Semester"));
  assert.ok(!headings(c).includes("Sjuklön"));
  const t = text(c);
  assert.match(t, /20 000 kr per år/);
  assert.match(t, /beslutat av bolagsstämman/);
  assert.match(t, /Årsstämma 2026-05-20 § 9/);
  assert.match(t, /Uppdraget är inte en anställning\. Lagen om anställningsskydd, semesterlagen och sjuklönelagen gäller inte/);
  assert.match(t, /30 procent/);
  assert.equal(c.signatures.employee, "Styrelseledamot");
});

test("other terms are printed; a new version says which", () => {
  const c = contractContent(input({ version: 2, validFrom: "2027-01-01", terms: "Tjänstebil enligt bilpolicy.\n\nMobiltelefon." }));
  assert.match(c.subtitle, /version 2 från 2027-01-01/);
  const other = c.sections.find((s) => s.heading === "Övriga villkor");
  assert.deepEqual(other?.paragraphs, ["Tjänstebil enligt bilpolicy.", "Mobiltelefon."]);
});
