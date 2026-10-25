/**
 * Adds our own Bygg jobs (photos from the reference folder) to Supabase as
 * draft projects. Each photo is resized to WebP and uploaded to the `gallery`
 * bucket under projects/, then the project row is inserted unpublished, so
 * nothing shows on the site until it's reviewed and published in /admin/projekt.
 * Projects whose address already exists are left alone (edits in /admin are
 * never overwritten), so the script is safe to re-run.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only,
 * bypasses RLS). Without them it checks the photos and prints what it would add.
 *
 * Usage: npx tsx --env-file=.env.local supabase/import-projects.ts "<photo folder>"
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { projectSchema, type Project } from "../lib/project-schema";

type Photo = [file: string, stage: "Före" | "Under arbetet" | "Efter", text: string];
type Draft = {
  slug: string;
  title: string;
  service: string | null;
  summary: string;
  scope: string[];
  featured: boolean;
  sort: number;
  cover: string;
  before?: Photo;
  after?: Photo;
  photos: Photo[];
};

const WA = "WhatsApp Image 2026-10-21 at 8.12.13 PM";

const drafts: Draft[] = [
  {
    slug: "uteplats-skiffer-och-tradack",
    title: "Uteplats i skiffer och nytt trädäck",
    service: null,
    summary:
      "Gamla betongplattor och sand blev en uteplats i skiffer, lagd i fritt mönster, med ett nytt trädäck längs husväggen.",
    scope: ["Rivning av gamla betongplattor", "Nytt underlag för plattorna", "Skifferplattor i fritt mönster", "Nytt trädäck i trä"],
    featured: true,
    sort: 1,
    cover: "rr",
    before: ["ff", "Före", "Gången längs staketet med gamla, mossiga betongplattor."],
    after: ["nn", "Efter", "Samma gång med nya skifferplattor."],
    photos: [
      ["ff", "Före", "Gången längs staketet med gamla, mossiga betongplattor."],
      ["gg", "Före", "Gamla plattor och sand innan arbetet började."],
      ["hh", "Efter", "Skifferplattor lagda i fritt mönster."],
      ["jj", "Efter", "Plattorna passade in mot varandra med jämna fogar."],
      ["mm", "Efter", "Uteplatsen i skiffer, klar."],
      ["nn", "Efter", "Gången längs staketet med nya skifferplattor."],
      ["oo", "Efter", "Hela gången, nyspolad, fram till planteringarna."],
      ["pp", "Efter", "Nytt trädäck längs husväggen."],
      ["qq1", "Efter", "Trädäcket i hörnet mellan husvägg och plank."],
      ["rr", "Efter", "Trädäck och skiffer möts vid planteringen."],
    ],
  },
  {
    slug: "takbyte-villa-med-gul-gavel",
    title: "Takbyte med nytt underlagstak",
    service: "tak",
    summary:
      "Under de gamla pannorna fanns rötskadat virke, löv och mossa. Vi rev ner till råsponten, bytte det skadade och lade nytt underlagstak, ny läkt och nya pannor.",
    scope: [
      "Rivning av gamla pannor och läkt",
      "Byte av rötskadat virke",
      "Underlagsduk Mataki Halotan PRO",
      "Ströläkt och bärläkt",
      "Nya takpannor och nockpannor",
    ],
    featured: true,
    sort: 2,
    cover: "00000",
    photos: [
      ["112", "Före", "Rötskadad takfot bakom den gamla hängrännan."],
      ["21", "Före", "Brädor som släppt och spruckit vid takfoten."],
      ["12121", "Före", "Löv, mossa och skräp under de gamla pannorna."],
      ["1212", "Under arbetet", "Gamla läkten bort, underlaget rensas."],
      ["2212", "Under arbetet", "Hela takytan friläggs innan något nytt läggs."],
      ["2121", "Under arbetet", "Ny underlagsduk rullas ut över taket."],
      ["221", "Under arbetet", "Mataki Halotan PRO, överlappad våd för våd."],
      ["666", "Under arbetet", "Ströläkt på plats medan nästa våd rullas ut."],
      ["4444", "Under arbetet", "Ströläkten följer takfallet hela vägen upp."],
      ["3333", "Under arbetet", "Bärläkten börjar läggas från takfoten."],
      ["000", "Under arbetet", "Bärläkt över ströläkt ger luftning under pannorna."],
      ["777", "Under arbetet", "Hela takytan läktad och klar för pannor."],
      ["222222", "Under arbetet", "Pannorna fördelas ut över läkten innan läggningen."],
      ["00000", "Efter", "Nocken möter vinkeln mot tillbyggnaden."],
      ["44", "Efter", "Nockpannor längs hela taket."],
      ["55", "Efter", "Nya pannor runt skorstenen."],
      ["77", "Efter", "Rak takfot och nya vindskivor."],
      ["33", "Efter", "Det färdiga taket."],
      ["333", "Efter", "Gaveln i kvällsljus med det nya taket på plats."],
    ],
  },
  {
    slug: "plattak-fran-korrugerat-till-falsat",
    title: "Från korrugerad plåt till falsat plåttak",
    service: "tak",
    summary:
      "Det gamla korrugerade plåttaket var mossigt och slitet runt skorsten och ventilation. Vi ersatte det med ett nytt, falsat plåttak i svart.",
    scope: ["Rivning av gammal korrugerad plåt", "Nytt falsat plåttak", "Nya anslutningar runt skorsten och ventilation"],
    featured: true,
    sort: 3,
    cover: WA,
    photos: [
      ["ew", "Före", "Huset innan, med det gamla korrugerade plåttaket."],
      ["ww", "Före", "Mossa och slitna anslutningar runt skorstenen."],
      ["eww", "Före", "Ventilationshuvar och vinklar som behövde göras om."],
      ["qq", "Före", "Den gamla plåten hade gjort sitt."],
      [WA, "Under arbetet", "De nya plåtvåderna läggs från ställningen."],
      ["11111", "Efter", "Raka falsar i hela takets längd."],
    ],
  },
  {
    slug: "takbyte-runt-takfonster-och-skorsten",
    title: "Takbyte runt takfönster och skorsten",
    service: "tak",
    summary:
      "Gammal plåt och rötskadad råspont byttes ut. Nytt underlagstak, ny läkt och nya pannor, med nya anslutningar runt takfönster och skorsten.",
    scope: [
      "Rivning och kontroll av råsponten",
      "Byte av skadat virke",
      "Underlagsduk RAW YEP530",
      "Ny läkt",
      "Nya pannor och plåtdetaljer runt skorsten och takfönster",
    ],
    featured: true,
    sort: 4,
    cover: "0000",
    photos: [
      ["0", "Före", "Rötskadad läkt och råspont under de gamla pannorna."],
      ["22", "Före", "Gammal plåt med rost och bucklor vid takfoten."],
      ["9", "Före", "Råspont med fukt- och rötskador."],
      ["11", "Under arbetet", "Råsponten friläggs och kontrolleras bräda för bräda."],
      ["2221", "Under arbetet", "Bärläkten spikas fast genom duken, rad för rad."],
      ["1", "Under arbetet", "Hela taket läktat, runt takfönstret också."],
      ["0000", "Efter", "Nya pannor runt takfönstret."],
      ["7777", "Efter", "Skorstenen inklädd i plåt."],
      ["9999", "Efter", "Vindskivor och takfot i samma kulör."],
      ["8888", "Efter", "Raka pannrader hela vägen till gaveln."],
      ["111", "Efter", "Nockpannor på plats längs hela nocken."],
    ],
  },
  {
    slug: "falsat-plattak-tradvilla",
    title: "Nytt falsat plåttak",
    service: "tak",
    summary: "Ett nytt plåttak med falsade skarvar, där varje beslag mäts, bockas och anpassas på plats.",
    scope: ["Nytt falsat plåttak", "Kantbeslag bockade på plats", "Anslutning mot fasad"],
    featured: false,
    sort: 5,
    cover: "555555",
    photos: [
      ["22222", "Under arbetet", "Plåtvåderna läggs från takfot mot nock."],
      ["33333", "Under arbetet", "Kantbeslag bockas och anpassas för hand."],
      ["2222222", "Efter", "Anslutningen mot fasaden, tät och rak."],
      ["555555", "Efter", "Raka linjer från nock till takfot."],
      ["666666", "Efter", "Det färdiga plåttaket."],
    ],
  },
  {
    slug: "fasad-och-takfot",
    title: "Ljus fasad och ny takfot",
    service: "maleri",
    summary: "Fasaden och takfoten gjordes om från ställning, med ny plåt runt fönstren och ny inklädnad av takfoten.",
    scope: ["Fasad", "Ny inklädnad av takfoten", "Fönsterplåt"],
    featured: false,
    sort: 6,
    cover: "c",
    photos: [
      ["b", "Under arbetet", "Takfoten kläs in från ställningen."],
      ["c", "Efter", "Ljus fasad, ny takfot och fönsterplåt."],
      ["a", "Efter", "Fönsterbleck och hörn."],
      ["d", "Efter", "Hörnet där fasaden möter takfoten."],
    ],
  },
  {
    slug: "malning-av-lagenhet",
    title: "Målning av lägenhet",
    service: "maleri",
    summary: "Väggar och snickerier målade i hela lägenheten, som lämnades städad och klar att flytta in i.",
    scope: ["Spackling och målning av väggar", "Målning av dörrar och snickerier", "Slutstädning"],
    featured: false,
    sort: 7,
    cover: "2323",
    photos: [
      ["2323", "Efter", "Hall med nymålade väggar och vita innerdörrar."],
      ["3232", "Efter", "Rena linjer runt dörrkarmar och lister."],
      ["32", "Efter", "Ljust rum med parkett och utsikt mot balkongen."],
      ["223", "Efter", "Släta, jämnt målade väggar."],
    ],
  },
  {
    slug: "nya-pannor-och-nock",
    title: "Nya pannor och nock",
    service: "tak",
    summary: "Ett pannat tak med nya nockpannor och vindskivor, fotograferat när jobbet var klart.",
    scope: ["Takpannor", "Nockpannor", "Vindskivor"],
    featured: false,
    sort: 8,
    cover: "1111111",
    photos: [
      ["1111111", "Efter", "Nocken med nya nockpannor."],
      ["000000", "Efter", "Pannorna möter vindskivan tätt och rakt."],
      ["777777", "Efter", "Hela takfallet sett från nocken."],
      ["44444", "Efter", "Vindskiveplåt i samma kulör som pannorna."],
      ["888888", "Efter", "Taket sett längs gaveln."],
      ["55555", "Efter", "Raderna följer läkten exakt."],
    ],
  },
  {
    slug: "solceller-pa-tak",
    title: "Solceller på tak",
    service: "tak",
    summary: "Solpaneler på ett pannat tak och ett plåttak.",
    scope: ["Solpaneler", "Infästning i tak"],
    featured: false,
    sort: 9,
    cover: "333333",
    photos: [
      ["6666", "Under arbetet", "Paneler på plåttak, med ställningen kvar."],
      ["333333", "Efter", "Paneler längs nocken på ett pannat tak."],
      ["444444", "Efter", "Paneler på pannat tak bredvid takfönstret."],
    ],
  },
  {
    slug: "ny-takstomme",
    title: "Ny takstomme",
    service: "tak",
    summary: "Ett platt tak får en ny takstomme. Nya takbjälkar reses och förankras innan taket kläs in.",
    scope: ["Nya takbjälkar", "Förankring mot befintlig stomme", "Ställning under bygget"],
    featured: false,
    sort: 10,
    cover: "cc",
    photos: [
      ["aa", "Under arbetet", "De första takbjälkarna på plats vid skorstenen."],
      ["bb", "Under arbetet", "Bjälkarna reses över det gamla platta taket."],
      ["cc", "Under arbetet", "Stommen från nocken, med ställning längs huset."],
      ["dd", "Under arbetet", "Takbjälkar och ställning längs långsidan."],
      ["ee", "Under arbetet", "Hela stommen rest, redo att kläs in."],
    ],
  },
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "gallery";

const alt = ([, stage, text]: Photo) => `${stage}: ${text}`;

async function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) throw new Error("Give the photo folder as the first argument.");
  const source = (file: string) => path.join(dir, `${file}.jpeg`);
  for (const d of drafts) {
    for (const f of new Set([d.cover, ...d.photos.map((p) => p[0])])) {
      if (!fs.existsSync(source(f))) throw new Error(`${d.slug}: missing photo ${f}.jpeg`);
    }
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.log("No Supabase project configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset).");
    console.log(`Dry run: would add ${drafts.length} draft projects: ${drafts.map((d) => d.slug).join(", ")}`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: existing, error: readError } = await supabase.from("projects").select("slug");
  if (readError) throw readError;
  const taken = new Set((existing ?? []).map((r: { slug: string }) => r.slug));

  for (const d of drafts) {
    if (taken.has(d.slug)) {
      console.log(`  skip ${d.slug}: already in the table`);
      continue;
    }
    // Upload each photo once, even when it is both cover and gallery photo.
    const uploaded = new Map<string, string>();
    const upload = async (file: string) => {
      if (uploaded.has(file)) return uploaded.get(file)!;
      const bytes = await sharp(source(file)).rotate().resize(1800, 1800, { fit: "inside" }).webp({ quality: 80 }).toBuffer();
      const key = `projects/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from(BUCKET).upload(key, bytes, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw new Error(`${d.slug}: upload of ${file} failed: ${error.message}`);
      uploaded.set(file, key);
      return key;
    };

    const gallery = [];
    for (const p of d.photos) gallery.push({ path: await upload(p[0]), alt: alt(p) });
    const coverPhoto = d.photos.find((p) => p[0] === d.cover);
    const project: Project = {
      slug: d.slug,
      title: d.title,
      service: d.service,
      location: "",
      year: null,
      duration: "",
      summary: d.summary,
      scope: d.scope,
      testimonial: null,
      cover: { path: await upload(d.cover), alt: coverPhoto ? coverPhoto[2] : d.title },
      before: d.before ? { path: await upload(d.before[0]), alt: d.before[2] } : null,
      after: d.after ? { path: await upload(d.after[0]), alt: d.after[2] } : null,
      gallery,
      featured: d.featured,
      published: false,
      sort: d.sort,
    };
    const parsed = projectSchema.safeParse(project);
    if (!parsed.success) throw new Error(`${d.slug}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);

    const { error } = await supabase.from("projects").insert({
      slug: project.slug,
      title: project.title,
      service_slug: project.service,
      location: null,
      year: null,
      duration: null,
      summary: project.summary,
      scope: project.scope,
      testimonial: null,
      cover_path: project.cover!.path,
      cover_alt: project.cover!.alt,
      before_path: project.before?.path ?? null,
      before_alt: project.before?.alt ?? null,
      after_path: project.after?.path ?? null,
      after_alt: project.after?.alt ?? null,
      gallery: project.gallery,
      featured: project.featured,
      published: false,
      sort: project.sort,
    });
    if (error) throw new Error(`${d.slug}: ${error.message}`);
    console.log(`  added ${d.slug} (${uploaded.size} photos)`);
  }
  console.log("Done. Review, add place and year, and publish in /admin/projekt.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
