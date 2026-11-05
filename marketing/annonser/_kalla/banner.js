/**
 * Skriver tre Instagram-inlägg (1080×1440, 3:4) som tillsammans blir en banderoll
 * i profilens rutnät, till ../bygg-instagram/ig-banner, och renderar dem till PNG.
 * Varje bild fungerar också ensam i flödet.  node banner.js
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = path.join(__dirname, "..", "bygg-instagram", "ig-banner");
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), "binaafy-annons-chrome");
const BILDER = "../../_kalla/bilder/";
const LOGO = "../../../../public/brand/binaafy-light.svg";

// Den orange linjen ligger på samma höjd i alla tre, så den löper genom hela raden i rutnätet.
const css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1440px;overflow:hidden}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#f5f2ed;background:#18232c;position:relative;-webkit-font-smoothing:antialiased}
.ph{position:absolute;inset:0;background-size:cover}
.ph::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(24,35,44,.15) 0%,rgba(24,35,44,.25) 45%,rgba(24,35,44,.92) 78%,#18232c 100%)}
.tex{position:absolute;inset:0;background-image:linear-gradient(rgba(245,242,237,.045) 2px,transparent 2px),linear-gradient(90deg,rgba(245,242,237,.045) 2px,transparent 2px);background-size:72px 72px;background-position:0 0}
.line{position:absolute;left:0;right:0;top:1196px;height:6px;background:#f7802e}
.lbl{position:absolute;left:84px;top:96px;font-size:26px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;background:rgba(24,35,44,.78);padding:14px 24px}
.big{position:absolute;left:84px;bottom:290px;font-size:250px;font-weight:700;letter-spacing:-.045em;line-height:.9}
.big i{font-style:normal;color:#f7802e}
.sub{position:absolute;left:84px;right:84px;top:1240px;font-size:34px;font-weight:500;color:#cfd5da}
.mid{position:absolute;left:0;right:0;top:470px;display:flex;flex-direction:column;align-items:center;gap:44px}
.mid img{width:800px;display:block}
.mid .tag{font-size:32px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:#a9b3bd;padding-left:.32em}
.mid .sub{position:static;text-align:center}
.cta{position:absolute;left:84px;top:1240px;font-size:36px;font-weight:600;background:#f7802e;color:#18232c;padding:22px 34px}
`;

const tiles = [
  { n: 1, body: `<div class="ph" style="background-image:url(${BILDER}tak-efter-tegel.webp);background-position:38% 40%"></div>
    <div class="lbl">Eget jobb · Tegeltak</div><div class="big">Tak<i>.</i></div><div class="line"></div>
    <div class="sub">Nya tak, lager för lager, i hela Halland.</div>` },
  { n: 2, body: `<div class="tex"></div>
    <div class="mid"><img src="${LOGO}" alt="Binaafy"><div class="tag">Bygg · Halland</div></div>
    <div class="line"></div><div class="sub" style="text-align:center">Tak · Plåt · Renovering</div>` },
  { n: 3, body: `<div class="ph" style="background-image:url(${BILDER}tak-falsad-plat.webp);background-position:55% 40%"></div>
    <div class="lbl">Eget jobb · Falsad plåt</div><div class="big">Plåt<i>.</i></div><div class="line"></div>
    <div class="cta">Kostnadsfri offert: binaafy.se →</div>` },
];

fs.mkdirSync(OUT, { recursive: true });
for (const t of tiles) {
  const file = path.join(OUT, `ig-banner-${t.n}.html`);
  fs.writeFileSync(file, `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>ig-banner ${t.n}</title><style>${css}</style></head><body>${t.body}</body></html>`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${PROFILE}`, "--hide-scrollbars", "--virtual-time-budget=6000",
    "--allow-file-access-from-files", "--window-size=1080,1440", "--force-device-scale-factor=1", `--screenshot=${file.replace(/\.html$/, ".png")}`, "file:///" + file.replace(/\\/g, "/")], { stdio: "ignore" });
  process.stdout.write(".");
}
console.log(`\n${tiles.length} bilder i ${OUT}`);
