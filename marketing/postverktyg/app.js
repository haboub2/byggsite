/* Postverktyget: lista med inlägg, formulär, förhandsvisning, rutnät och PNG-export.
   Inläggen sparas i webbläsarens localStorage. Mallarna finns i mallar.js. */

const STORE = "binaafy-poster-v1";
const PHOTO_DIRS = ["/marketing/postverktyg/bilder/", "/marketing/annonser/_kalla/bilder/"];
const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = (o) => JSON.parse(JSON.stringify(o));

let posts = [];
let selId = null;
let photos = [];

// ---------- lagring ----------

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(posts)); return true; }
  catch { toast("Kunde inte spara: för mycket data. Lägg stora bilder i mappen postverktyg/bilder i stället för att ladda upp dem."); return false; }
}

function load() {
  try { const d = JSON.parse(localStorage.getItem(STORE)); if (Array.isArray(d) && d.length) return d; } catch {}
  return seed();
}

function newPost(template, extra = {}) {
  return { id: uid(), template, name: TEMPLATES[template].label, pinned: false, captions: [], ...clone(TEMPLATES[template].defaults), ...extra };
}

const kalla = (f, x = 50, y = 50) => ({ src: "/marketing/annonser/_kalla/bilder/" + f, x, y, zoom: 100 });

function seed() {
  return [
    newPost("foto", { name: "Intro", photo: kalla("tak-montor-nock.webp", 50, 32), headline: "Hej Halland. *Vi bygger tak som håller.*",
      body: "Takbyten, plåt och renoveringar. Ett team och en kontaktperson från första besöket till sista skruven.", chip: "Följ oss för fler jobb",
      captions: ["Hej Halland 👋 Vi är Binaafy, och vi bygger tak som ska hålla i decennier.\n\nHär kommer vi visa våra jobb – före, under och efter. Följ med!\n\n👉 Kostnadsfri offert: länk i bio\n\n#takbyte #takläggare #halmstad #halland #rotavdrag"] }),
    newPost("lista", { name: "Fem tecken", items: "Mossa och lav på pannorna\nFuktfläckar på vinden\nSpruckna eller lösa pannor\nRost på plåten\nTaket är 30–40 år eller äldre",
      captions: ["Fem tecken på att ditt tak behöver ses över 👇 (spara till hösten)\n\n#taktips #takbyte #villaägare"] }),
    newPost("stor", { name: "Plåt", photo: kalla("tak-falsad-plat.webp", 55, 40), photoLabel: "Eget jobb · Falsad plåt", headline: "Plåt*.*", body: "Raka linjer. Tätt i decennier.",
      captions: ["Raka linjer. Tätt i decennier.\n\n#plåttak #falsadplåt #takbyte"] }),
    newPost("delad", { name: "Delad logga", pinned: true, captions: ["Hej! Vi är Binaafy 👋 (del 1 av 3 – kolla profilen 👀)", "Ett team. Två sätt att bygga. (del 2 av 3)", "Vi bygger också i kod 💻 (del 3 av 3)"] }),
    newPost("hl", { name: "Takbyten", icon: "hus" }),
    newPost("hl", { name: "Mjukvara", icon: "kod" }),
  ];
}

const sel = () => posts.find((p) => p.id === selId);
// Delad logga är flera inlägg (en caption per bild). Karuseller är ett inlägg med flera bilder.
const postCount = (p) => TEMPLATES[p.template].split ? TEMPLATES[p.template].render(p).length : 1;

// ---------- bilder ----------

async function loadPhotos() {
  const found = [];
  for (const dir of PHOTO_DIRS) {
    try {
      const html = await (await fetch(dir)).text();
      for (const m of html.matchAll(/href="([^"?#]+\.(?:webp|jpe?g|png))"/gi)) found.push(dir + decodeURIComponent(m[1]).replace(/^.*\//, ""));
    } catch {}
  }
  photos = [...new Set(found)];
}

function downscale(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- lista ----------

function renderList() {
  $("#postList").innerHTML = posts.map((p, i) => `
    <li data-id="${p.id}" class="${p.id === selId ? "on" : ""}">
      <span class="nr">${i + 1}</span>
      <span class="nm"><b>${esc(p.name)}</b><small>${esc(TEMPLATES[p.template].label)}${p.pinned ? ' · <span class="pin">fäst</span>' : ""}</small></span>
      <span class="mv"><button data-mv="-1" title="Flytta upp">↑</button><button data-mv="1" title="Flytta ner">↓</button></span>
    </li>`).join("");
}

$("#postList").addEventListener("click", (e) => {
  const li = e.target.closest("li"); if (!li) return;
  const i = posts.findIndex((p) => p.id === li.dataset.id);
  const mv = e.target.closest("[data-mv]");
  if (mv) {
    const j = i + Number(mv.dataset.mv);
    if (j < 0 || j >= posts.length) return;
    [posts[i], posts[j]] = [posts[j], posts[i]];
    save(); renderList(); return;
  }
  select(li.dataset.id);
});

$("#newTemplate").innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("");
$("#newPost").addEventListener("click", () => {
  const t = $("#newTemplate").value;
  const p = newPost(t);
  if ((t === "foto" || t === "stor") && photos[0]) p.photo = { src: photos[0], x: 50, y: 50, zoom: 100 };
  posts.push(p); save(); select(p.id);
});

function select(id) {
  selId = id;
  renderList(); renderForm(); renderPreview();
}

// ---------- formulär ----------

const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;
const text = (k, label, v, hint = "") => `<label class="fld"><span>${label} ${hint ? `<small>${hint}</small>` : ""}</span><input type="text" data-k="${k}" value="${esc(v)}"></label>`;
const area = (k, label, v, hint = "", rows = 3) => `<label class="fld"><span>${label} ${hint ? `<small>${hint}</small>` : ""}</span><textarea data-k="${k}" rows="${rows}">${esc(v)}</textarea></label>`;
const range = (k, label, v, min, max) => `<label class="fld"><span>${label} <small data-out="${k}">${v}</small></span><input type="range" data-k="${k}" min="${min}" max="${max}" value="${v}"></label>`;

const FIELD = {
  format: (p) => `<label class="fld"><span>Format</span><select data-k="format">${Object.entries(FORMATS).map(([k, f]) => opt(k, f.label, p.format)).join("")}</select></label>`,
  theme: (p) => `<label class="fld"><span>Färg</span><select data-k="theme">${opt("dark", "Mörk", p.theme)}${opt("light", "Ljus", p.theme)}</select></label>`,
  photo: (p) => photoField(p, "photo", ({ foreefter: "Bild före", skarm: "Skärmbild dator" })[p.template] || "Bild"),
  photoMid: (p) => photoField(p, "photoMid", "Bild under arbetet", "valfri, bara karusell"),
  photo2: (p) => photoField(p, "photo2", p.template === "skarm" ? "Skärmbild mobil" : "Bild efter"),
  device: (p) => `<label class="fld"><span>Enhet</span><select data-k="device">${opt("bada", "Dator och mobil", p.device)}${opt("dator", "Bara dator", p.device)}${opt("mobil", "Bara mobil", p.device)}</select></label>`,
  url: (p) => text("url", "Adress i webbläsaren", p.url),
  cards: (p) => area("cards", "Paket", p.cards, "Namn | Pris | Text, en per rad. ! först = populärast, ![Ingår] = egen etikett, ~490 kr~ = överstruket", 4),
  note: (p) => text("note", "Liten text under", p.note, "tomt = ingen"),
  layout: (p) => `<label class="fld"><span>Upplägg</span><select data-k="layout">${opt("karusell", "Karusell: före, efter, så gjorde vi", p.layout)}${opt("stapel", "En bild: före ovanför efter", p.layout)}</select></label>`,
  beforeLabel: (p) => text("beforeLabel", "Etikett före", p.beforeLabel),
  afterLabel: (p) => text("afterLabel", "Etikett efter", p.afterLabel),
  photoLabel: (p) => text("photoLabel", "Etikett på bilden", p.photoLabel, "tomt = ingen"),
  eyebrow: (p) => text("eyebrow", "Överrubrik", p.eyebrow),
  headline: (p) => area("headline", "Rubrik", p.headline, "*ord* blir orange, ~ord~ överstruket", 2),
  hSize: (p) => range("hSize", "Rubrikstorlek", p.hSize, 40, 320),
  body: (p) => area("body", "Text", p.body),
  chip: (p) => text("chip", "Ruta under texten", p.chip, "tomt = ingen"),
  logo: (p) => `<label class="fld chk"><input type="checkbox" data-k="logo"${p.logo ? " checked" : ""}><span>Visa logga</span></label>`,
  blind: (p) => `<label class="fld chk"><input type="checkbox" data-k="blind"${p.blind ? " checked" : ""}><span>Gissa-läge (samma färg på båda etiketterna)</span></label>`,
  cta: (p) => text("cta", "Knapp", p.cta, "tomt = ingen"),
  items: (p) => area("items", "Punkter", p.items, "en per rad", 6),
  tag: (p) => text("tag", "Text under loggan", p.tag),
  split: (p) => `<div class="fld"><span>Under linjen <small>vänster, mitten, höger</small></span><div class="split3">${p.split.map(([w, s], i) =>
      `<div class="row2"><input type="text" data-k="split.${i}.0" value="${esc(w)}"><input type="text" data-k="split.${i}.1" value="${esc(s)}"></div>`).join("")}</div></div>`,
  icon: (p) => `<div class="fld"><span>Ikon</span><div class="icon-pick">${Object.entries(ICONS).map(([k, svg]) =>
      `<button data-icon="${k}" class="${p.icon === k ? "on" : ""}" title="${k}"><svg viewBox="0 0 24 24">${svg}</svg></button>`).join("")}</div></div>`,
};

function photoField(p, key, label, hint = "klicka för att välja") {
  const ph = p[key];
  return `<div class="fld"><span>${label} <small>${hint}</small></span>
      <div class="photo-pick">${photos.map((src) => `<button data-photo="${esc(src)}" data-pkey="${key}" class="${ph?.src === src ? "on" : ""}" title="${esc(src.split("/").pop())}"><img src="${esc(src)}" alt=""></button>`).join("")}</div>
      <div class="row2"><label class="filebtn">Ladda upp egen…<input type="file" class="upload" data-pkey="${key}" accept="image/*"></label><button data-act="nophoto" data-pkey="${key}">Ingen bild</button></div></div>
    ${ph ? `<div class="row2">${range(key + ".x", "Vänster–höger", ph.x, 0, 100)}${range(key + ".y", "Upp–ner", ph.y, 0, 100)}</div>${range(key + ".zoom", "Zoom", ph.zoom, 100, 250)}` : ""}`;
}

function renderForm() {
  const p = sel();
  if (!p) { $("#fields").innerHTML = '<p class="hint">Välj eller skapa ett inlägg.</p>'; $("#captions").innerHTML = ""; return; }
  const isHl = p.template === "hl";
  $("#fields").innerHTML = `<h3>${esc(TEMPLATES[p.template].label)}</h3>
    ${text("name", isHl ? "Namn på highlighten" : "Namn", p.name, isHl ? "syns under cirkeln" : "bara för dig")}
    ${TEMPLATES[p.template].fields.map((f) => FIELD[f](p)).join("")}
    ${isHl ? "" : `<label class="fld chk"><input type="checkbox" data-k="pinned"${p.pinned ? " checked" : ""}><span>Fäst överst i profilen</span></label>`}
    <div class="danger-zone"><button data-act="dup">Duplicera</button><button data-act="del" class="danger">Ta bort</button></div>`;
  renderCaptions();
}

function renderCaptions() {
  const p = sel();
  if (p.template === "hl") { $("#captions").innerHTML = ""; return; }
  const n = postCount(p);
  // Delade inlägg postas från höger till vänster: bild 3 först.
  const order = n > 1 ? [...Array(n).keys()].reverse() : [0];
  $("#captions").innerHTML = `<h3>Caption</h3>` + order.map((i, k) => `
    <div class="fld"><span>${n > 1 ? `Bild ${i + 1} <small>postas som nummer ${k + 1}</small>` : "Text till inlägget"}</span>
      <textarea data-cap="${i}" rows="7">${esc(p.captions[i] || "")}</textarea>
      <div class="cap-meta" data-meta="${i}"></div>
      <div class="cap-first" data-first="${i}"></div>
      <button data-copy="${i}">Kopiera caption</button></div>`).join("");
  order.forEach(capMeta);
}

function capMeta(i) {
  const c = sel().captions[i] || "";
  const tags = (c.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  $(`[data-meta="${i}"]`).innerHTML = `<span class="${c.length > 2200 ? "warn" : ""}">${c.length}/2200 tecken</span><span class="${tags > 30 ? "warn" : ""}">${tags} hashtaggar${tags > 30 ? " (max 30)" : ""}</span>`;
  const first = c.split("\n")[0].slice(0, 125);
  $(`[data-first="${i}"]`).innerHTML = `<b>Syns innan "mer":</b> ${esc(first) || "–"}${c.length > 125 || c.includes("\n") ? "…" : ""}`;
}

function setPath(o, path, v) {
  const ks = path.split(".");
  let t = o;
  for (const k of ks.slice(0, -1)) t = t[k];
  t[ks.at(-1)] = v;
}

$("#fields").addEventListener("input", (e) => {
  const k = e.target.dataset.k; if (!k) return;
  const p = sel();
  const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? Number(e.target.value) : e.target.value;
  setPath(p, k, v);
  const out = document.querySelector(`[data-out="${k}"]`); if (out) out.textContent = v;
  save(); renderPreview();
  if (k === "name" || k === "pinned") renderList();
  if (k === "format" || k === "layout") renderForm();
});

$("#fields").addEventListener("click", async (e) => {
  const p = sel();
  const b = e.target.closest("button"); if (!b) return;
  // Skärmbilder visas från toppen av sidan.
  if (b.dataset.photo) { p[b.dataset.pkey] = { src: b.dataset.photo, x: 50, y: p.template === "skarm" ? 0 : 50, zoom: 100 }; }
  else if (b.dataset.icon) { p.icon = b.dataset.icon; }
  else if (b.dataset.act === "nophoto") { p[b.dataset.pkey] = null; }
  else if (b.dataset.act === "dup") {
    const c = { ...clone(p), id: uid(), name: p.name + " (kopia)" };
    posts.splice(posts.indexOf(p) + 1, 0, c); save(); select(c.id); return;
  } else if (b.dataset.act === "del") {
    if (!confirm(`Ta bort "${p.name}"?`)) return;
    posts = posts.filter((x) => x !== p); save(); select(posts[0]?.id ?? null); return;
  } else return;
  save(); renderForm(); renderPreview();
});

$("#fields").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("upload") || !e.target.files[0]) return;
  try {
    sel()[e.target.dataset.pkey] = { src: await downscale(e.target.files[0]), x: 50, y: sel().template === "skarm" ? 0 : 50, zoom: 100 };
    save(); renderForm(); renderPreview();
  } catch { toast("Kunde inte läsa bilden."); }
});

$("#captions").addEventListener("input", (e) => {
  const i = e.target.dataset.cap; if (i === undefined) return;
  sel().captions[i] = e.target.value;
  save(); capMeta(i);
});

$("#captions").addEventListener("click", async (e) => {
  const i = e.target.dataset.copy; if (i === undefined) return;
  try { await navigator.clipboard.writeText(sel().captions[i] || ""); toast("Caption kopierad"); }
  catch { toast("Kunde inte kopiera – markera texten och kopiera själv."); }
});

// ---------- förhandsvisning ----------

function renderPreview() {
  const p = sel(), box = $("#preview");
  if (!p) { box.innerHTML = ""; $("#sizeInfo").textContent = ""; return; }
  const pages = renderPost(p);
  const gap = 6, W = box.clientWidth - 48, H = box.clientHeight - 48 - (pages.length > 1 ? 22 : 0);
  const maxH = Math.max(...pages.map((pg) => pg.h));
  const s = Math.min((W - gap * (pages.length - 1)) / (1080 * pages.length), H / maxH);
  box.innerHTML = pages.map((pg, i) => `<div class="pv" style="width:${1080 * s}px;height:${pg.h * s}px">${pages.length > 1 ? `<span class="pvn">Bild ${i + 1}</span>` : ""}${pg.html}</div>`).join("");
  box.querySelectorAll(".pv>.cv").forEach((c) => (c.style.transform = `scale(${s})`));
  $("#sizeInfo").textContent = `${pages.length > 1 ? pages.length + " bilder à " : ""}1080×${pages[0].h} px`;
  $("#downloadPng").textContent = pages.length > 1 ? `Ladda ner ${pages.length} PNG` : "Ladda ner PNG";
}
new ResizeObserver(() => renderPreview()).observe($("#preview"));

// ---------- export ----------

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "inlagg";

function downloadUrl(url, name) {
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
}

async function exportPost(p) {
  const pages = renderPost(p), host = $("#render");
  const base = (p.template === "hl" ? "hl-" : "") + slug(p.name);
  await document.fonts.ready;
  for (let i = 0; i < pages.length; i++) {
    host.innerHTML = pages[i].html;
    const node = host.firstElementChild;
    await Promise.all([...node.querySelectorAll("img")].map((im) => im.complete ? im.decode().catch(() => {}) : new Promise((r) => (im.onload = im.onerror = r))));
    const url = await htmlToImage.toPng(node, { width: 1080, height: pages[i].h, pixelRatio: 1, cacheBust: true });
    downloadUrl(url, `${base}${pages.length > 1 ? "-" + (i + 1) : ""}.png`);
  }
  host.innerHTML = "";
}

$("#downloadPng").addEventListener("click", async (e) => {
  const p = sel(); if (!p) return;
  const b = e.currentTarget, label = b.textContent;
  b.disabled = true; b.textContent = "Skapar bild…";
  try { await exportPost(p); toast("Klart – kolla mappen Hämtade filer"); }
  catch (err) { console.error(err); toast("Exporten misslyckades. Se konsolen."); }
  b.disabled = false; b.textContent = label;
});

$("#exportJson").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(posts, null, 2)], { type: "application/json" }));
  downloadUrl(url, `binaafy-inlagg-${new Date().toISOString().slice(0, 10)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("#importJson").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d) || !d.every((p) => TEMPLATES[p.template])) throw 0;
    if (!confirm(`Ersätta dina ${posts.length} inlägg med ${d.length} från filen?`)) return;
    posts = d; save(); select(posts[0]?.id);
  } catch { toast("Filen gick inte att läsa."); }
  e.target.value = "";
});

// ---------- rutnät ----------

function renderGrid() {
  const feed = posts.filter((p) => p.template !== "hl");
  // Fästa först, sedan nyast först. Delade inlägg visar sina bilder i ordning 1–3 från vänster.
  const ordered = [...feed.filter((p) => p.pinned).reverse(), ...feed.filter((p) => !p.pinned).reverse()];
  const grid = $("#grid");
  const cw = Math.max(0, grid.clientWidth - 4) / 3, ch = cw * 4 / 3;
  let cells = 0;
  grid.innerHTML = ordered.flatMap((p) => renderPost(p).slice(0, postCount(p)).map((pg, _, all) => {
    cells++;
    const multi = renderPost(p).length > all.length ? '<span class="gmulti">❐</span>' : "";
    return `<div class="cell" data-id="${p.id}">${fitInto(pg, cw, ch)}${p.pinned ? '<span class="gpin">📌</span>' : multi}</div>`;
  })).join("") || '<div class="empty">Inga inlägg ännu</div>';
  $("#pfCount").textContent = ` · ${cells} inlägg`;
  $("#hlRow").innerHTML = posts.filter((p) => p.template === "hl").map((p) =>
    `<figure data-id="${p.id}"><div class="circ">${fitInto(renderPost(p)[0], 62, 62)}</div><figcaption>${esc(p.name)}</figcaption></figure>`).join("");
}

/** Skalar en sida så att den fyller rutan w×h och beskär mitten, som Instagram gör. */
function fitInto(pg, w, h) {
  const s = Math.max(w / 1080, h / pg.h);
  return pg.html.replace('style="height:', `style="transform:scale(${s});left:${(w - 1080 * s) / 2}px;top:${(h - pg.h * s) / 2}px;height:`);
}

// Rutorna räknas från rutnätets bredd, så rita om när bredden ändras (och när fliken först visas).
let gridW = 0;
new ResizeObserver(() => {
  const w = $("#grid").clientWidth;
  if (w && w !== gridW && !$("#viewGrid").hidden) { gridW = w; renderGrid(); }
}).observe($("#grid"));

$("#viewGrid").addEventListener("click", (e) => {
  const c = e.target.closest("[data-id]"); if (!c) return;
  showView("edit"); select(c.dataset.id);
});

function showView(v) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $("#viewEdit").hidden = v !== "edit";
  $("#viewGrid").hidden = v !== "grid";
  if (v === "grid") renderGrid(); else renderPreview();
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

// ---------- övrigt ----------

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

(async function start() {
  posts = load();
  await loadPhotos();
  select(posts[0]?.id ?? null);
})();
