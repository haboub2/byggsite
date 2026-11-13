/**
 * Renderar HTML från build.js till PNG (annonser) och PDF (affischer) med
 * Chrome headless.  node render.js [filter]
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), "binaafy-annons-chrome");
const only = process.argv[2];
const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, "jobs.json"), "utf8")).filter((j) => !only || j.file.includes(only));

const run = (args) => execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${PROFILE}`, "--hide-scrollbars", "--virtual-time-budget=6000", ...args], { stdio: "ignore" });

for (const j of jobs) {
  const href = "file:///" + j.file.replace(/\\/g, "/");
  const base = j.file.replace(/\.html$/, "");
  if (j.print) {
    run(["--no-pdf-header-footer", `--print-to-pdf=${base}.pdf`, href]);
    run(["--window-size=1123,1587", `--screenshot=${base}.png`, href]);
  } else {
    run([`--window-size=${j.w},${j.h}`, "--force-device-scale-factor=1", `--screenshot=${base}.png`, href]);
  }
  process.stdout.write(".");
}
console.log(`\n${jobs.length} renderade`);
