/**
 * Skriver highlight-omslag för Instagram (1080×1920) till ../bygg-instagram/highlights
 * och renderar dem till PNG med Chrome headless.  node highlights.js
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = path.join(__dirname, "..", "bygg-instagram", "highlights");
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), "binaafy-annons-chrome");

// Ikonerna ritas i en 24×24-ruta, samma stil som linjeikonerna i mockupen.
const covers = [
  { slug: "takbyten", name: "Takbyten", icon: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>' },
  { slug: "platttak", name: "Plåttak", icon: '<path d="M2 9l10-6 10 6"/><path d="M4 9v11M8.7 6.2V20M15.3 6.2V20M20 9v11"/>' },
  { slug: "fore-efter", name: "Före/efter", icon: '<rect x="2.5" y="5" width="8.5" height="14" rx="1"/><rect x="13" y="5" width="8.5" height="14" rx="1"/><path d="M5 15l2-3 2 3M15.5 12.5l1.8 1.8 2.9-3.6"/>' },
  { slug: "rot", name: "ROT", icon: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 6v2M12 16v2"/>' },
  { slug: "sa-funkar-det", name: "Så funkar det", icon: '<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="18" r="1.4"/>' },
  { slug: "omdomen", name: "Omdömen", icon: '<path d="M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7z"/>' },
  { slug: "offert", name: "Offert", icon: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>' },
];

// Instagram beskär omslaget till en cirkel mitt i bilden, så allt viktigt ligger i mitten.
const html = (c) => `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Highlight ${c.name}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden}
body{background:#18232c;display:grid;place-items:center;
  background-image:linear-gradient(rgba(245,242,237,.045) 2px,transparent 2px),linear-gradient(90deg,rgba(245,242,237,.045) 2px,transparent 2px);
  background-size:72px 72px;background-position:center}
svg{width:540px;height:540px;fill:none;stroke:#f7802e;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
</style></head><body><svg viewBox="0 0 24 24">${c.icon}</svg></body></html>`;

fs.mkdirSync(OUT, { recursive: true });
for (const c of covers) {
  const file = path.join(OUT, `hl-${c.slug}.html`);
  fs.writeFileSync(file, html(c));
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${PROFILE}`, "--hide-scrollbars", "--virtual-time-budget=3000",
    "--window-size=1080,1920", "--force-device-scale-factor=1", `--screenshot=${file.replace(/\.html$/, ".png")}`, "file:///" + file.replace(/\\/g, "/")], { stdio: "ignore" });
  process.stdout.write(".");
}
console.log(`\n${covers.length} omslag i ${OUT}`);
