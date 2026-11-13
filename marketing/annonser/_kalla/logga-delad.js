/**
 * Delar loggan över tre Instagram-inlägg (1080×1440, 3:4) så att profilens översta rad
 * visar hela loggan. Skriver till ../bygg-instagram/ig-logga och renderar PNG.  node logga-delad.js
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = path.join(__dirname, "..", "bygg-instagram", "ig-logga");
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), "binaafy-annons-chrome");
const LOGO = "../../../../public/brand/binaafy-light.svg";

// Hela raden är 3240 px bred. Loggan skalas och flyttas så att skarvarna (x = 1080 och 2160)
// hamnar i mellanrummen mellan bokstäverna: "Bi | naa | fy". Mätt på loggan i 2628 px bredd:
// mellanrum i–n på 686–723 och a–f på 1857–1888.
const GAP1 = (686 + 723) / 2, GAP2 = (1857 + 1888) / 2;
const SCALE = 1080 / (GAP2 - GAP1);
const LOGO_W = 2628 * SCALE, LOGO_X = 1080 - GAP1 * SCALE, LOGO_Y = 380;

// Under linjen: bygg till vänster, webbplatsen i mitten, mjukvara till höger.
const words = [
  ["Bygg", "Renovering · Tak · Kök · Badrum"],
  ["binaafy.se", "Ett team, en kontaktperson"],
  ["Mjukvara", "Hemsidor · Automation · System"],
];

const html = (n) => `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>ig-logga ${n}</title><style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1440px;overflow:hidden}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#18232c;position:relative;-webkit-font-smoothing:antialiased}
.row{position:absolute;top:0;left:${-1080 * (n - 1)}px;width:3240px;height:1440px;
  background-image:linear-gradient(rgba(245,242,237,.045) 2px,transparent 2px),linear-gradient(90deg,rgba(245,242,237,.045) 2px,transparent 2px);background-size:72px 72px}
.logo{position:absolute;left:${LOGO_X}px;top:${LOGO_Y}px;width:${LOGO_W}px}
.tag{position:absolute;left:1080px;width:1080px;top:${LOGO_Y + 640}px;text-align:center;font-size:36px;font-weight:600;letter-spacing:.32em;padding-left:.32em;text-transform:uppercase;color:#a9b3bd}
.line{position:absolute;left:0;right:0;top:1196px;height:6px;background:#f7802e}
.word{position:absolute;top:1236px;width:1080px;text-align:center;font-size:56px;font-weight:700;letter-spacing:-.02em;color:#f5f2ed}
.word small{display:block;margin-top:14px;font-size:30px;font-weight:500;letter-spacing:0;color:#a9b3bd}
.word.mid{color:#f7802e}
</style></head><body><div class="row">
<img class="logo" src="${LOGO}" alt="Binaafy">
<div class="tag">Bygg · Mjukvara</div>
<div class="line"></div>
${words.map(([w, s], i) => `<div class="word${i === 1 ? " mid" : ""}" style="left:${i * 1080}px">${w}<small>${s}</small></div>`).join("")}
</div></body></html>`;

fs.mkdirSync(OUT, { recursive: true });
for (const n of [1, 2, 3]) {
  const file = path.join(OUT, `ig-logga-${n}.html`);
  fs.writeFileSync(file, html(n));
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${PROFILE}`, "--hide-scrollbars", "--virtual-time-budget=6000",
    "--window-size=1080,1440", "--force-device-scale-factor=1", `--screenshot=${file.replace(/\.html$/, ".png")}`, "file:///" + file.replace(/\\/g, "/")], { stdio: "ignore" });
  process.stdout.write(".");
}
console.log(`\n3 bilder i ${OUT}`);
