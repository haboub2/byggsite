/* Mallarna: vilka fält de har, standardvärden och hur de ritas. Lägg till en ny mall här. */

const BRAND = "/public/brand/";
const FORMATS = {
  "4:5": { h: 1350, label: "Flöde 4:5 (1080×1350)" },
  "3:4": { h: 1440, label: "Rutnät 3:4 (1080×1440)" },
  "1:1": { h: 1080, label: "Kvadrat 1:1 (1080×1080)" },
  "9:16": { h: 1920, label: "Story 9:16 (1080×1920)" },
};

const ICONS = {
  hus: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  platt: '<path d="M2 9l10-6 10 6"/><path d="M4 9v11M8.7 6.2V20M15.3 6.2V20M20 9v11"/>',
  foreefter: '<rect x="2.5" y="5" width="8.5" height="14" rx="1"/><rect x="13" y="5" width="8.5" height="14" rx="1"/><path d="M5 15l2-3 2 3M15.5 12.5l1.8 1.8 2.9-3.6"/>',
  pengar: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 6v2M12 16v2"/>',
  lista: '<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="18" r="1.4"/>',
  stjarna: '<path d="M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7z"/>',
  dokument: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  kod: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/>',
  skarm: '<rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
  kugghjul: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  telefon: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/>',
  hammare: '<path d="M14 6l4 4M3 21l9-9M12 3l6 6-3 3-6-6z"/>',
  gava: '<rect x="3.5" y="9" width="17" height="11.5" rx="1"/><path d="M2.5 9h19v-3.5h-19zM12 5.5v15M12 5.5C10.5 2.5 6.5 2.5 7 4.6 7.4 6 12 5.5 12 5.5zM12 5.5c1.5-3 5.5-3 5-.9-.4 1.4-5 .9-5 .9z"/>',
  fraga: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.9 2.9 0 015.6.9c0 1.9-2.8 2.4-2.8 4.1M12 17.4v.2"/>',
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// *ord* blir orange, ~ord~ blir överstruket, ny rad blir radbrytning.
const rich = (s) => esc(s).replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/~(.+?)~/g, "<s>$1</s>").replace(/\n/g, "<br>");
const logo = (theme) => BRAND + (theme === "light" ? "binaafy.svg" : "binaafy-light.svg");
const photo = (p) => p?.src
  ? `<img class="pimg" src="${esc(p.src)}" style="object-position:${p.x}% ${p.y}%;transform:scale(${p.zoom / 100});transform-origin:${p.x}% ${p.y}%" alt="">`
  : '<div class="pempty">Välj en bild</div>';
const foot = (p) => (p.logo || p.cta) ? `<div class="foot">${p.logo ? `<img src="${logo(p.theme)}" alt="Binaafy">` : "<span></span>"}${p.cta ? `<div class="btn">${esc(p.cta)}</div>` : ""}</div>` : "";

// Delad logga: skarvarna (x = 1080 och 2160) läggs i mellanrummen "Bi | naa | fy",
// mätt på loggan i 2628 px bredd. Samma värden som _kalla/logga-delad.js.
const GAP1 = (686 + 723) / 2, GAP2 = (1857 + 1888) / 2;
const SPLIT_SCALE = 1080 / (GAP2 - GAP1);

const TEMPLATES = {
  foto: {
    label: "Foto + text",
    fields: ["format", "theme", "photo", "photoLabel", "eyebrow", "headline", "hSize", "body", "chip", "logo", "cta"],
    defaults: { format: "4:5", theme: "dark", photo: null, photoLabel: "Eget jobb", eyebrow: "Binaafy Bygg · Halland", headline: "Rubrik med *orange* ord.", hSize: 86, body: "En eller två meningar som förklarar.", chip: "", logo: true, cta: "Offert: binaafy.se →" },
    render: (p) => [{ h: FORMATS[p.format].h, html: `
      <div class="ph">${photo(p.photo)}<div class="cm cm-tl"></div><div class="cm cm-br"></div>${p.photoLabel ? `<div class="cap">${esc(p.photoLabel)}</div>` : ""}</div>
      <div class="panel">${p.eyebrow ? `<div class="eyebrow">${esc(p.eyebrow)}</div>` : ""}
        <div class="h" style="font-size:${p.hSize}px">${rich(p.headline)}</div>
        ${p.body ? `<div class="body">${rich(p.body)}</div>` : ""}${p.chip ? `<div class="chip">${esc(p.chip)}</div>` : ""}${foot(p)}</div>` }],
  },
  stor: {
    label: "Stort foto",
    fields: ["format", "photo", "photoLabel", "headline", "hSize", "body", "cta"],
    defaults: { format: "3:4", theme: "dark", photo: null, photoLabel: "Eget jobb", headline: "Tak*.*", hSize: 250, body: "Nya tak, lager för lager.", cta: "" },
    render: (p) => [{ h: FORMATS[p.format].h, html: `
      ${photo(p.photo)}<div class="grad"></div>${p.photoLabel ? `<div class="lbl">${esc(p.photoLabel)}</div>` : ""}
      <div class="bottom"><div class="big" style="font-size:${p.hSize}px">${rich(p.headline)}</div><div class="line"></div>
        ${p.body ? `<div class="sub">${rich(p.body)}</div>` : ""}${p.cta ? `<div class="btn" style="margin-top:${p.body ? 30 : 0}px">${esc(p.cta)}</div>` : ""}</div>` }],
  },
  lista: {
    label: "Lista",
    fields: ["format", "theme", "eyebrow", "headline", "hSize", "items", "logo", "cta"],
    defaults: { format: "4:5", theme: "dark", eyebrow: "Spara till senare", headline: "Fem tecken på att taket *behöver ses över*", hSize: 78, items: "Mossa och lav på pannorna\nFuktfläckar på vinden\nSpruckna eller lösa pannor", logo: true, cta: "Offert: binaafy.se →" },
    render: (p) => [{ h: FORMATS[p.format].h, html: `<div class="tex"></div><div class="inner">
      ${p.eyebrow ? `<div class="eyebrow">${esc(p.eyebrow)}</div>` : ""}<div class="h" style="font-size:${p.hSize}px">${rich(p.headline)}</div>
      <ol class="list">${String(p.items || "").split("\n").filter((s) => s.trim()).map((s, i) => `<li><b>${String(i + 1).padStart(2, "0")}</b><span>${rich(s)}</span></li>`).join("")}</ol>
      ${foot(p)}</div>` }],
  },
  foreefter: {
    label: "Före/efter",
    fields: ["layout", "format", "photo", "photoMid", "photo2", "beforeLabel", "afterLabel", "blind", "headline", "hSize", "body", "eyebrow", "items", "cta"],
    defaults: { layout: "karusell", format: "4:5", theme: "dark", photo: null, photoMid: null, photo2: null, beforeLabel: "Före", afterLabel: "Efter", blind: false,
      headline: "Så här såg det ut *innan vi kom.*", hSize: 96, body: "…och så här ser det ut nu.", eyebrow: "Så gjorde vi",
      items: "Rev det gamla\nByggde upp nytt från grunden\nStädade och lämnade över", cta: "Kostnadsfri offert: binaafy.se →" },
    render: (p) => {
      const h = FORMATS[p.format].h;
      // Gissa-läge: båda etiketterna ser likadana ut så att färgen inte avslöjar vilken som är efter.
      const tag = (t, after) => t ? `<div class="fe-tag${after && !p.blind ? " after" : ""}">${esc(t)}</div>` : "";
      const panelFoot = foot({ ...p, logo: true });
      if (p.layout === "stapel") return [{ h, html: `
        <div class="fe-ph">${photo(p.photo)}${tag(p.beforeLabel)}</div><div class="fe-div"></div>
        <div class="fe-ph">${photo(p.photo2)}${tag(p.afterLabel, true)}</div>
        <div class="fe-panel"><div class="h" style="font-size:${Math.round(p.hSize * 0.75)}px">${rich(p.headline)}</div>${panelFoot}</div>` }];
      // Karusell: före (kroken), ev. under arbetet, efter, och sist en sida som säljer.
      const pages = [{ h, html: `${photo(p.photo)}<div class="fe-grad"></div>${tag(p.beforeLabel)}
        <div class="fe-bottom"><div class="h" style="font-size:${p.hSize}px">${rich(p.headline)}</div><div class="fe-swipe">Svep →</div></div>` }];
      if (p.photoMid) pages.push({ h, html: `${photo(p.photoMid)}<div class="fe-grad"></div>${tag("Under arbetet")}<div class="fe-bottom"><div class="fe-swipe">Svep →</div></div>` });
      pages.push({ h, html: `${photo(p.photo2)}<div class="fe-grad"></div>${tag(p.afterLabel, true)}
        <div class="fe-bottom">${p.body ? `<div class="h" style="font-size:${Math.round(p.hSize * 0.8)}px">${rich(p.body)}</div>` : ""}<img class="fe-logo" src="${logo("dark")}" alt="Binaafy"></div>` });
      pages.push({ h, html: `<div class="tex"></div><div class="fe-end">
        <div class="fe-thumbs"><div>${photo(p.photo)}${tag(p.beforeLabel)}</div><div>${photo(p.photo2)}${tag(p.afterLabel, true)}</div></div>
        ${p.eyebrow ? `<div class="eyebrow">${esc(p.eyebrow)}</div>` : ""}
        <ol class="list">${String(p.items || "").split("\n").filter((s) => s.trim()).map((s, i) => `<li><b>${String(i + 1).padStart(2, "0")}</b><span>${rich(s)}</span></li>`).join("")}</ol>
        ${panelFoot}</div>` });
      return pages;
    },
  },
  skarm: {
    label: "Skärm (hemsida i dator/mobil)",
    fields: ["format", "theme", "device", "photo", "photo2", "url", "eyebrow", "headline", "hSize", "body", "logo", "cta"],
    defaults: { format: "4:5", theme: "dark", device: "bada", photo: null, photo2: null, url: "binaafy.se", eyebrow: "Binaafy Software",
      headline: "Vi bygger också *i kod.*", hSize: 92, body: "Hemsidor, automation och system för företag.", logo: true, cta: "binaafy.se/mjukvara →" },
    // Skärmbilden visas från toppen, så y = 0 är standard.
    render: (p) => {
      const scr = (ph) => ph?.src ? photo(ph) : '<div class="pempty">Välj en skärmbild</div>';
      const browser = `<div class="sk-browser"><div class="sk-bar"><i></i><i></i><i></i><span>${esc(p.url)}</span></div><div class="sk-scr">${scr(p.photo)}</div></div>`;
      const phone = `<div class="sk-phone"><div class="sk-scr">${scr(p.photo2)}</div><div class="sk-notch"></div></div>`;
      return [{ h: FORMATS[p.format].h, html: `<div class="tex"></div><div class="sk-text">
        ${p.eyebrow ? `<div class="eyebrow">${esc(p.eyebrow)}</div>` : ""}<div class="h" style="font-size:${p.hSize}px">${rich(p.headline)}</div>
        ${p.body ? `<div class="body">${rich(p.body)}</div>` : ""}${foot(p)}</div>
        <div class="sk-dev sk-${p.device}">${p.device !== "mobil" ? browser : ""}${p.device !== "dator" ? phone : ""}</div>` }];
    },
  },
  pris: {
    label: "Priser (paketkort)",
    fields: ["format", "theme", "eyebrow", "headline", "hSize", "cards", "note", "logo", "cta"],
    defaults: { format: "4:5", theme: "light", eyebrow: "Hemsida till fast pris", headline: "Vad kostar en hemsida? *Här är svaret.*", hSize: 76,
      cards: "Start | 9 900 kr | Upp till 5 sidor · klar på ca 2 veckor\n!Företag | 17 900 kr | En sida per tjänst · klar på 2–3 veckor\nTillväxt | från 29 900 kr | 15+ sidor, unik design · 3–5 veckor",
      note: "Exkl. moms · fast pris innan vi börjar · koden är er", logo: true, cta: "binaafy.se →" },
    // En rad per kort: "Namn | Pris | Text". "!" först = markerat som populärast, "![Ingår]" = markerat med egen text.
    render: (p) => [{ h: FORMATS[p.format].h, html: `<div class="tex"></div><div class="inner">
      ${p.eyebrow ? `<div class="eyebrow">${esc(p.eyebrow)}</div>` : ""}<div class="h" style="font-size:${p.hSize}px">${rich(p.headline)}</div>
      <div class="pr-cards">${String(p.cards || "").split("\n").filter((s) => s.trim()).map((line) => {
        const m = line.trim().match(/^!(?:\[(.+?)\])?/);
        const [n, pr, d] = line.trim().slice(m ? m[0].length : 0).split("|").map((x) => x.trim());
        return `<div class="pr-card${m ? " hot" : ""}">${m ? `<span class="pr-tag">${esc(m[1] || "Populärast")}</span>` : ""}<div class="pr-n">${esc(n)}</div><div class="pr-p">${rich(pr)}</div>${d ? `<div class="pr-d">${rich(d)}</div>` : ""}</div>`;
      }).join("")}</div>
      ${p.note ? `<div class="pr-note">${rich(p.note)}</div>` : ""}${foot(p)}</div>` }],
  },
  delad: {
    label: "Delad logga (3 inlägg)",
    split: true,
    fields: ["tag", "split"],
    defaults: { format: "3:4", theme: "dark", tag: "Bygg · Mjukvara", split: [["Bygg", "Renovering · Tak · Kök · Badrum"], ["binaafy.se", "Ett team, en kontaktperson"], ["Mjukvara", "Hemsidor · Automation · System"]] },
    render: (p) => [0, 1, 2].map((i) => ({ h: 1440, html: `<div class="row" style="left:${-1080 * i}px"><div class="tex"></div>
      <img class="logo" src="${BRAND}binaafy-light.svg" style="left:${1080 - GAP1 * SPLIT_SCALE}px;top:380px;width:${2628 * SPLIT_SCALE}px" alt="Binaafy">
      <div class="tag" style="top:1020px">${esc(p.tag)}</div><div class="rule" style="top:1196px"></div>
      ${p.split.map(([w, s], j) => `<div class="word${j === 1 ? " mid" : ""}" style="left:${j * 1080}px;top:1236px">${esc(w)}<small>${esc(s)}</small></div>`).join("")}</div>` })),
  },
  hl: {
    label: "Highlight-omslag",
    fields: ["icon"],
    defaults: { format: "9:16", theme: "dark", icon: "hus" },
    render: (p) => [{ h: 1920, html: `<div class="tex" style="background-position:center"></div><svg viewBox="0 0 24 24">${ICONS[p.icon] || ""}</svg>` }],
  },
};

/** Alla sidor (bilder) ett inlägg består av, som färdig HTML. */
function renderPost(p) {
  const t = TEMPLATES[p.template];
  const story = p.format === "9:16" ? " story" : "";
  return t.render(p).map((pg) => ({ h: pg.h, html: `<div class="cv t-${p.template}${p.theme === "light" ? " light" : ""}${story}" style="height:${pg.h}px">${pg.html}</div>` }));
}
