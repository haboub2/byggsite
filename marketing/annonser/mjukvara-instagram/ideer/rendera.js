/**
 * Gör PNG av alla inlägg i inlagg.js, i mappar under bilder/.
 *   node rendera.js [filter]     t.ex. node rendera.js hus
 * Overlays (transparent: true) får genomskinlig bakgrund.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const CHROME = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"]
  .find((p) => p && fs.existsSync(p));
const { DESIGNS } = new Function(fs.readFileSync(path.join(__dirname, "inlagg.js"), "utf8") + "; return { DESIGNS };")();
const page = "file:///" + path.join(__dirname, "inlagg.html").replace(/\\/g, "/");
const only = process.argv[2];

const shoot = (d, png) => new Promise((ok, fail) => execFile(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
  `--user-data-dir=${path.join(os.tmpdir(), "binaafy-ideer-chrome")}`, "--virtual-time-budget=6000", `--window-size=${d.size[0]},${d.size[1]}`,
  `--force-device-scale-factor=${d.scale || 1}`, ...(d.transparent ? ["--default-background-color=00000000"] : []), `--screenshot=${png}`, `${page}?id=${d.id}`],
  (err) => (err ? fail(err) : ok())));

(async () => {
  const list = DESIGNS.filter((d) => !only || d.id.includes(only) || d.dir.includes(only));
  for (const d of list) {
    const dir = path.join(__dirname, "bilder", d.dir);
    fs.mkdirSync(dir, { recursive: true });
    await shoot(d, path.join(dir, d.id + ".png"));
    process.stdout.write(".");
  }
  console.log(`\n${list.length} bilder i ${path.join(__dirname, "bilder")}`);
})();
