/**
 * Gör PNG av alla inlägg i en JSON-fil (samma format som "Säkerhetskopiera" i verktyget).
 *   node rendera.js <inlagg.json> [utmapp]
 * Utmappen blir som standard en mapp bredvid JSON-filen med samma namn.
 * Startar en egen liten server från projektets rot och tar skärmbilder med Chrome headless.
 */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), "binaafy-poster-chrome");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const [file, outArg] = process.argv.slice(2);
if (!file) { console.log("Användning: node rendera.js <inlagg.json> [utmapp]"); process.exit(1); }
const posts = JSON.parse(fs.readFileSync(file, "utf8"));
// Absolut sökväg: Chrome tolkar annars relativa sökvägar från sin egen mapp.
const OUT = path.resolve(outArg || path.join(path.dirname(file), path.basename(file, ".json")));

// mallar.js är skriven för webbläsaren men använder bara strängar, så den går att köra här för att räkna sidor.
const { renderPost } = new Function(fs.readFileSync(path.join(__dirname, "mallar.js"), "utf8") + "; return { renderPost };")();
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "inlagg";

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const m = url.match(/^\/__post\/(\d+)$/);
  if (m) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(posts[m[1]])); }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

const shoot = (url, h, png) => new Promise((ok, fail) => execFile(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${PROFILE}`, "--hide-scrollbars",
  "--virtual-time-budget=8000", `--window-size=1080,${h}`, "--force-device-scale-factor=1", `--screenshot=${png}`, url], (err) => (err ? fail(err) : ok())));

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const [i, p] of posts.entries()) {
    const pages = renderPost(p);
    const base = (p.template === "hl" ? "hl-" : "") + slug(p.name);
    for (const [j, pg] of pages.entries()) {
      const png = path.join(OUT, `${base}${pages.length > 1 ? "-" + (j + 1) : ""}.png`);
      await shoot(`http://127.0.0.1:${port}/marketing/postverktyg/sida.html?i=${i}&p=${j}`, pg.h, png);
      process.stdout.write("."); n++;
    }
  }
  console.log(`\n${n} bilder i ${OUT}`);
  server.close();
});
