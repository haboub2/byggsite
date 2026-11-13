/** Skriver ../oversikt.html: alla annonser per kampanj, för granskning.
 *  node sheet.js [filter] [ut.html] */
const fs = require("fs");
const path = require("path");
const { CAMPAIGNS, FORMATS } = JSON.parse(fs.readFileSync(path.join(__dirname, "campaigns.json"), "utf8"));
const only = process.argv[2];
const out = process.argv[3] || path.join(__dirname, "..", "oversikt.html");
const rel = (p) => path.relative(path.dirname(out), p).replace(/\\/g, "/");

const rows = CAMPAIGNS.filter((c) => !only || c.id.includes(only)).map((c) => {
  const cells = FORMATS.filter((f) => !c.formats || c.formats.includes(f.id)).map((f) => {
    const png = path.join(__dirname, "..", c.side, c.id, `${c.id}_${f.id}.png`);
    const link = f.print ? png.replace(/\.png$/, ".pdf") : png;
    return `<figure class="f-${f.id}"><a href="${rel(link)}"><img src="${rel(png)}" alt=""></a><figcaption>${f.label}</figcaption></figure>`;
  }).join("");
  return `<section><h2>${c.id.replace(/-/g, " ")} <small>${{ bygg: "Privatpersoner", software: "Byggföretag", erbjudande: "Alla företag", tjanster: "Tjänsteföretag 2–20 anst., Halland", paket: "Småföretag, allt-i-ett", "bygg-instagram": "Organiskt Instagram/Facebook", fordelar: "Fördelar, bygg + software", rabatt: "Rabatt 10 %, egen sektion" }[c.side]}${c.hook ? ` · krok: ${c.hook}` : ""} · länk: ${c.link}</small></h2><div class="row">${cells}</div></section>`;
}).join("");

fs.writeFileSync(out, `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Binaafy annonser</title>
<style>
body{margin:0;padding:32px;background:#e3ddd3;font-family:system-ui,sans-serif;color:#1e2c37}
h1{font-size:28px;margin:0 0 6px} p.lead{margin:0 0 28px;color:#4b5763}
section{margin-bottom:40px} h2{font-size:18px;text-transform:capitalize;margin:0 0 12px} h2 small{font-weight:400;color:#5e6a76;text-transform:none;margin-left:8px}
.row{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
figure{margin:0} img{display:block;height:300px;width:auto;box-shadow:0 2px 10px rgba(0,0,0,.15);background:#fff}
.f-liggande-1200x628 img{height:180px}
figcaption{font-size:12px;color:#4b5763;margin-top:6px}
</style></head><body><h1>Binaafy annonser</h1><p class="lead">Klicka på en bild för full storlek. Affischen öppnas som PDF.</p>${rows}</body></html>`);
console.log("skrev", out);
