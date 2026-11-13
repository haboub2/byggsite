/* Alla inlägg från idéerna i ../ideer.md. Varje inlägg: id, mapp, storlek och HTML.
   inlagg.html?id=<id> visar ett inlägg, rendera.js gör PNG av alla. Ändra texterna här. */

const K = "../../_kalla/bilder/", P = "../../../postverktyg/bilder/", BR = "../../../../public/brand/";
const LOGO = BR + "binaafy-light.svg", LOGO_DARK = BR + "binaafy.svg";
const F45 = [1080, 1350], STORY = [1080, 1920], GRID = [1080, 1440];

const img = (src, pos = "50% 50%", extra = "") => `<img class="cover" src="${src}" style="object-position:${pos};${extra}" alt="">`;
const topbar = (left, n) => `<div class="top"><span>${left}</span>${n ? `<span class="n">${n}</span>` : `<img src="${LOGO}" alt="Binaafy">`}</div>`;
const foot = (cta) => `<div class="foot"><img src="${LOGO}" alt="Binaafy">${cta ? `<div class="btn">${cta}</div>` : ""}</div>`;
const browser = (url, inner) => `<div class="browser"><div class="bar"><i></i><i></i><i></i><span>${url}</span></div><div class="scr">${inner}</div></div>`;
const phone = (inner, style = "") => `<div class="phone" style="${style}"><div class="scr">${inner}</div><div class="notch"></div></div>`;
// Kodbilden från binaafy.se/mjukvara, utskuren ur skärmbilden (marginal i % räknas på bredden, så utsnittet håller för alla rutor).
const code = () => `<img src="${P}sajt-mjukvara-dator.png" style="position:absolute;left:-158%;top:0;margin-top:-26%;width:290%;max-width:none;height:auto" alt="">`;

/* ---------- 1. Hus ---------- */
const HUS = [
  { hus: "Grunden", husSub: "Det allt står på", photo: [K + "ute-fore-sand.webp", "50% 60%"], web: "Hosting och domän",
    body: "Er adress, i ert namn. Snabb och säker hosting som bär allt annat.",
    visual: () => `<div class="dom"><div class="lock">🔒</div><div><b>https://ertforetag.se</b><span>Domän i ert namn · SSL · snabb hosting</span></div></div>` },
  { hus: "Stommen", husSub: "Det som bär", photo: [K + "tak-under-laktning.webp", "50% 50%"], web: "Koden",
    body: "Egen kod i stället för en mall med tillägg. Byggd för att hålla, och den är er.", visual: () => browser("ertforetag.se", code()) },
  { hus: "Fasaden", husSub: "Det man ser först", photo: [K + "fasad-ljus.webp", "50% 40%"], web: "Designen",
    body: "Er logga, era färger, era bilder. Ni godkänner designen innan vi bygger.", visual: () => browser("binaafy.se", img(P + "sajt-start-dator.png", "50% 0", "height:auto")) },
  { hus: "Elen", husSub: "Det som gör saker", photo: [K + "tak-solceller.webp", "50% 50%"], web: "Formulär och fakturering",
    body: "Förfrågningar rakt in i mejlen och offerter som blir faktura med en knapp.", visual: () => browser("binaafy.se/fakturering", img(P + "sajt-fakturering-dator.png", "50% 0", "height:auto")) },
  { hus: "Besiktningen", husSub: "Kvittot på kvaliteten", photo: [K + "tak-efter-tegel.webp", "50% 50%"], web: "Google och hastighet",
    body: "Vi anmäler sidan till Google och bygger den för att ladda snabbt i mobilen.",
    visual: () => `<div class="serp"><span>ertforetag.se › tjanster</span><b>Takläggare i Halmstad – Ert Företag</b><p>Fast pris och ROT-avdrag direkt på fakturan. Begär offert i dag…</p><div class="chk"><em>✓</em> Laddar snabbt i mobilen &nbsp; <em>✓</em> Sitemap anmäld</div></div>` },
];

const DESIGNS = [
  { id: "hus-1", dir: "01-hus", size: F45, html: () => `<div class="split2">${img(K + "tak-under-laktning.webp")}${browser("ertforetag.se", code())}</div><div class="grad"></div>
      <div class="pad" style="position:absolute;inset:0;height:auto;padding-bottom:0">${topbar("Binaafy · Bygg och mjukvara")}</div>
      <div class="bottom"><div class="h" style="font-size:112px">Vi bygger hemsidor <em>som hus.</em></div>
      <div class="sub">Grund, stomme, fasad, el och besiktning. Svep, så förklarar vi.</div><div class="swipe">Svep →</div></div>` },
  ...HUS.map((s, i) => ({ id: `hus-${i + 2}`, dir: "01-hus", size: F45, html: () => `
      <div class="hus-ph">${img(s.photo[0], s.photo[1])}<span class="lbl">Huset · ${s.hus}</span></div><div class="div"></div>
      <div class="hus-web"><span class="lbl lbl--o">Hemsidan · ${s.web}</span>${s.visual()}</div>
      <div class="hus-txt"><div class="hus-n">${String(i + 1).padStart(2, "0")} / 05</div><div class="h" style="font-size:60px">${s.hus} = <em>${s.web.toLowerCase()}.</em></div><div class="sub" style="font-size:28px;margin-top:14px">${s.body}</div></div>` })),
  { id: "hus-7", dir: "01-hus", size: F45, html: () => `<div class="tex"></div><div class="pad">${topbar("Binaafy")}
      <div class="h" style="font-size:96px;margin-top:60px">Vi bygger både huset <em>och hemsidan.</em></div>
      <div class="sub" style="margin-top:30px">Samma noggrannhet, samma kontaktperson, fast pris innan vi börjar.</div>
      <div class="cards"><div class="card"><span>Hemsida</span><b>från 9 900 kr</b><small>Fast pris · klar på ca 2 veckor</small></div>
      <div class="card hot"><i>Ingår gratis</i><span>Fakturering</span><b><s>490 kr/mån</s> 0 kr</b><small>Första året, när ni köper en hemsida</small></div></div>
      <div class="note">Priser exkl. moms</div>${foot("Beställ: binaafy.se →")}</div>` },

  /* ---------- 2. Granskning ---------- */
  { id: "granskning-inlagg", dir: "02-granskning", size: F45, html: () => `<div class="tex"></div><div class="pad">${topbar("Gratis · 60 sekunder")}
      <div class="h" style="font-size:96px;margin-top:50px">Vi granskar din hemsida. <em>Gratis.</em></div>
      <div class="sub" style="margin-top:28px">Kommentera din adress. De tio första får en granskning på 60 sekunder, som Reel.</div>
      <div class="check">${["Laddar den snabbt i mobilen?", "Syns den när kunderna googlar?", "Finns en tydlig knapp: ring eller offert?"].map((t) => `<div><i></i>${t}</div>`).join("")}</div>
      ${foot("Kommentera 👇")}</div>` },
  ...[1, 2, 3].map((n) => ({ id: `granskning-omslag-${n}`, dir: "02-granskning", size: STORY, html: () => `<div class="tex"></div>
      <div class="pad" style="padding-top:260px;padding-bottom:300px">${topbar("Hemsidegranskning")}
      <div class="h" style="font-size:200px;margin-top:120px">#${String(n).padStart(2, "0")}</div>
      <div class="h" style="font-size:84px;margin-top:20px">60 sekunder. <em>Ärligt svar.</em></div>
      <div class="sub" style="margin-top:40px">Mobil · Google · knappen som ger förfrågningar</div>${foot("")}</div>` })),
  { id: "granskning-overlay", dir: "02-granskning", size: STORY, transparent: true, html: () => `
      <div class="ov-top"><span>Hemsidegranskning</span><b>60 s</b></div>
      <div class="ov-bot">${["Mobil", "Google", "Knapp"].map((t) => `<div><i></i>${t}</div>`).join("")}<img src="${LOGO}" alt=""></div>` },

  /* ---------- 3. Rutnätspussel: 1 = övre vänstra rutan, postas sist ---------- */
  ...Array.from({ length: 9 }, (_, i) => ({ id: `rutnat-${i + 1}`, dir: "03-rutnat", size: GRID, html: () =>
      `<div style="position:absolute;inset:0;background:#18232c url(${P}sajt-kop-hemsida-rutnat.png) no-repeat;background-size:300% 300%;background-position:${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%"></div>` })),

  /* ---------- 4. Delad skärm ---------- */
  { id: "delad-skarm-inlagg", dir: "04-delad-skarm", size: F45, html: () => `<div class="duo"><div>${img(K + "tak-montor-nock.webp", "40% 40%")}<span class="lbl">07:00 · taket</span></div>
      <div>${code()}<span class="lbl lbl--o">07:00 · koden</span></div></div><div class="grad"></div>
      <div class="bottom"><div class="h" style="font-size:100px">Samma team. <em>Två sorters bygge.</em></div><div class="sub">Tak och plåt. Hemsidor och system.</div>${foot("binaafy.se →")}</div>` },
  { id: "delad-skarm-reel-omslag", dir: "04-delad-skarm", size: STORY, html: () => `<div class="duo duo--v"><div>${img(K + "tak-montor-nock.webp", "40% 40%")}<span class="lbl">Taket</span></div>
      <div>${code()}<span class="lbl lbl--o" style="top:auto;bottom:30px">Koden</span></div></div>
      <div class="mid"><div class="h" style="font-size:96px">Måndag <em>på Binaafy.</em></div></div>` },

  /* ---------- 5. Kundportalen (exempelprojekt) ---------- */
  ...[["kundportal-inlagg", F45], ["kundportal-story", STORY]].map(([id, size]) => ({ id, dir: "05-kundportal", size, html: () => `
      ${img(K + "tak-under-laktning.webp", "50% 50%", "opacity:.18")}<div class="tex"></div>
      <div class="pad"${size === STORY ? ' style="padding-top:230px;padding-bottom:250px"' : ""}>${topbar("Ingår i alla våra byggprojekt")}
      <div class="h" style="font-size:${size === STORY ? 110 : 92}px;margin-top:34px">Följ ditt bygge <em>i realtid.</em></div>
      <div class="sub" style="margin-top:20px">Tidplan, foton varje dag och ändringar att godkänna. Systemet har vi byggt själva.</div>
      <div class="portal-wrap">${phone(`<div class="portal"><span class="k">Mitt projekt</span><b>Takbyte</b><div class="pbar"><i></i></div><span class="d">Dag 6 av 11 · enligt tidplan</span>
        <span class="k">Nya foton i dag</span><div class="pics">${["tak-fore-rotskadad", "tak-montor-nock", "tak-falsad-plat"].map((f) => `<img src="${K}${f}.webp" alt="">`).join("")}</div>
        <div class="ata"><b>Ändring väntar på ditt svar</b><span>Byte av två bräder · 1 800 kr</span><em>Godkänn</em></div></div>`)}<span class="ex">Exempel</span></div></div>` })),

  /* ---------- 6. Interaktiv story i tre steg (lägg till stickern i Instagram) ---------- */
  { id: "story-1-fraga", dir: "06-interaktiv-story", size: STORY, html: () => `<div class="tex"></div><div class="pad" style="padding-top:260px">${topbar("1 / 3")}
      <div class="h" style="font-size:110px;margin-top:80px">Betalar ni för ett <em>fakturaprogram?</em></div><div class="hint">Omröstning här: Ja / Nej 👇</div></div>` },
  { id: "story-2-hur-mycket", dir: "06-interaktiv-story", size: STORY, html: () => `<div class="tex"></div><div class="pad" style="padding-top:260px">${topbar("2 / 3")}
      <div class="h" style="font-size:110px;margin-top:80px">Hur mycket <em>i månaden?</em></div><div class="hint">Skjutreglage här 💸👇</div></div>` },
  { id: "story-3-svar", dir: "06-interaktiv-story", size: STORY, html: () => `<div class="tex"></div><div class="pad" style="padding-top:260px;padding-bottom:300px">${topbar("3 / 3")}
      <div class="h" style="font-size:110px;margin-top:80px">Med en hemsida från oss: <em>0 kr</em> första året.</div>
      <div class="sub" style="margin-top:40px;font-size:40px"><s>490 kr/mån</s> · fakturering ingår när ni köper en hemsida</div>
      <div class="hint">Länksticker här: "Se erbjudandet" 👇</div>${foot("")}</div>` },

  /* ---------- 7. Byggskylt och bildekal (tryck) ---------- */
  { id: "byggskylt", dir: "07-skylt", size: [1754, 1240], scale: 2, html: () => `<div class="sign">
      <div class="sign-l"><div class="k">Här bygger Binaafy</div><div class="t">Snyggt tak? <em>Vi bygger hemsidor också.</em></div>
      <p>Hemsida från 9 900 kr – och fakturering <b>gratis</b> första året.</p><img class="lg" src="${LOGO_DARK}" alt="Binaafy"></div>
      <div class="sign-r"><img src="qr.svg" alt=""><span>Skanna och se paketen</span><b>binaafy.se</b></div></div>` },
  { id: "bildekal", dir: "07-skylt", size: [2400, 700], html: () => `<div class="decal"><img src="${LOGO}" alt="Binaafy"><div class="t">Vi bygger tak. <em>Och hemsidor.</em></div>
      <div class="r"><img src="qr.svg" alt=""><b>binaafy.se</b></div></div>` },

  /* ---------- 8. En hemsida på 48 timmar ---------- */
  ...[["48h-ansokan-inlagg", F45], ["48h-ansokan-story", STORY]].map(([id, size]) => ({ id, dir: "08-48-timmar", size, html: () => `<div class="tex"></div>
      <div class="pad"${size === STORY ? ' style="padding-top:240px;padding-bottom:260px"' : ""}>${topbar("Tävling · Halmstad")}
      <div class="h" style="font-size:${size === STORY ? 116 : 100}px;margin-top:40px">En ny hemsida <em>på 48 timmar.</em> Gratis.</div>
      <div class="sub" style="margin-top:28px">Vi bygger en hemsida åt ett lokalt företag – och visar varje steg här. Tagga företaget som förtjänar den.</div>
      <div class="count"><small>Vi startar klockan när vinnaren är vald</small><b>48:00:00</b></div>${foot("Tagga i kommentarerna 👇")}</div>` })),
  ...[["0 h", "Startmöte"], ["12 h", "Skissen"], ["30 h", "Designen"], ["48 h", "Lansering 🎉"]].map(([h, t], i) => ({
    id: `48h-overlay-${i + 1}`, dir: "08-48-timmar", size: STORY, transparent: true, html: () => `
      <div class="ov-top"><span>En hemsida på 48 timmar</span><b>${h}</b></div><div class="ov-step"><em>${h}</em>${t}</div>
      <div class="ov-bot ov-bot--prog"><div class="pbar"><i style="width:${[4, 25, 62, 100][i]}%"></i></div><img src="${LOGO}" alt=""></div>` })),

  /* ---------- 9. Hastighetstest ---------- */
  ...[["hastighet-inlagg", F45], ["hastighet-story", STORY]].map(([id, size]) => ({ id, dir: "09-hastighet", size, html: () => `<div class="tex"></div>
      <div class="pad"${size === STORY ? ' style="padding-top:240px;padding-bottom:260px"' : ""}>${topbar("Gratis test")}
      <div class="h" style="font-size:${size === STORY ? 112 : 96}px;margin-top:40px">Hur snabb är din hemsida <em>i mobilen?</em></div>
      <div class="gauge"><div class="ring"><span>?</span></div><div class="gtxt"><b>Skicka adressen i DM.</b>Vi kör Googles hastighetstest och skickar tillbaka resultatet, med vad som borde fixas.</div></div>
      ${foot("Skicka DM →")}</div>` })),

  /* ---------- 10. Fråga en snickare som kodar ---------- */
  { id: "fredag-fraga", dir: "10-fredagsfragor", size: STORY, html: () => `${img(K + "tak-montor-nock.webp", "35% 40%")}<div class="grad grad--full"></div>
      <div class="pad" style="padding-top:240px;padding-bottom:260px">${topbar("Varje fredag")}<div class="h" style="font-size:118px;margin-top:40px">Fråga en snickare <em>som kodar.</em></div>
      <div class="hint" style="margin-top:60px">Frågesticker här 👇</div><div style="flex:1"></div><div class="sub">Tak, plåt, hemsidor – vi svarar på allt.</div></div>` },
  { id: "fredag-svar", dir: "10-fredagsfragor", size: STORY, html: () => `<div class="tex"></div><div class="pad" style="padding-top:240px;padding-bottom:260px">${topbar("Veckans fråga")}
      <div class="hint" style="margin-top:40px">Dela frågan här (tryck på den i svaren) 👇</div><div style="height:520px"></div>
      <div class="h" style="font-size:72px"><em>Svaret:</em></div><div class="hint" style="margin-top:20px">Skriv eller spela in svaret här</div>${foot("")}</div>` },
  { id: "hl-fragor", dir: "10-fredagsfragor", size: STORY, html: () => `<div class="tex" style="background-position:center"></div>
      <svg class="hl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.9 2.9 0 015.6.9c0 1.9-2.8 2.4-2.8 4.1M12 17.4v.2"/></svg>` },
];
