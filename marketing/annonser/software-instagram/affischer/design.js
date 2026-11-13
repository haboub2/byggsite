/* En affisch per mjukvarutjänst. Bakgrunden är en suddad skärmbild av vår egen sajt, och det som ska läsas ligger
   som riktiga saker: dator och mobil med sajten, en prislapp, en faktura på papper, ett Excelark.
   design.html?id=<id> visar en, rendera.js gör PNG av alla (A3, inlägg 4:5 och story per tjänst). */

const P = "../../../postverktyg/bilder/", BR = "../../../../public/brand/";
const logo = () => `<img class="logo" src="${BR}binaafy-light.svg" alt="Binaafy">`;
const PHONE = "079-304 97 37";

const faktura = () => `<div class="paper faktura">
    <div class="f-head"><img src="${BR}binaafy.svg" alt=""><div><b>Faktura 1042</b><span>Exempel</span></div></div>
    <div class="f-to">Till: Exempelkund AB</div>
    ${[["Arbete, 24 h", "18 000 kr"], ["Material", "4 200 kr"], ["Moms 25 %", "5 550 kr"]].map(([a, b]) => `<div class="f-row"><span>${a}</span><i></i><b>${b}</b></div>`).join("")}
    <div class="f-sum"><span>Att betala</span><b>27 750 kr</b></div>
    <div class="f-pay"><span>OCR 1042 2031 08</span><span>Swish ✓</span></div>
    <div class="f-stamp">Betald</div></div>`;

const excel = () => {
  const rows = [["Kund", "Offert", "Faktura", "Betald?"], ["Nordström", "12 400", "skickad?", "??"], ["Café Linné", "3 450", "", "ja"], ["Studio Ek", "—", "12 800", "nej!!"], ["Hallberg", "6 900", "6 900", ""], ["(ny kund)", "", "", ""]];
  return `<div class="paper sheet"><div class="s-bar">kunder_FINAL_v3 (2).xlsx</div><table>${rows.map((r, i) => `<tr>${r.map((c, j) => i ? `<td class="${(i === 3 && j === 3) || (i === 1 && j === 2) ? "warn" : ""}">${c}</td>` : `<th>${c}</th>`).join("")}</tr>`).join("")}</table></div>`;
};

const TJANSTER = [
  { slug: "hemsida", namn: "Hemsida", bg: "sajt-kop-hemsida-dator.png", qr: "qr-hemsida.svg", url: "binaafy.se/mjukvara",
    h: "En hemsida som <em>ger kunder.</em>", sub: "Snabb i mobilen, syns på Google och leder till fler förfrågningar.",
    stage: () => `<div class="laptop" style="left:40px;top:40px"><div class="scr"><img src="${P}sajt-kop-hemsida-dator.png" alt=""></div><div class="base"></div></div>
      <div class="mob" style="right:60px;top:150px"><img src="${P}sajt-kop-hemsida-mobil.png" alt=""></div>
      <div class="tag" style="left:70px;top:430px;transform:rotate(-6deg)"><small>Fast pris</small><b>från 9 900 kr</b></div>
      <div class="hand note" style="left:470px;top:530px;transform:rotate(-4deg)">klar på ca 2 veckor!</div>`,
    list: ["Design i er logga och färger", "Syns på Google från start", "Koden och domänen är era"],
    badges: ["Fast pris innan vi börjar", "Fakturering gratis första året", "Priser exkl. moms"] },
  { slug: "fakturering", namn: "Fakturering", bg: "sajt-fakturering-dator.png", qr: "qr-fakturering.svg", url: "binaafy.se/fakturering",
    h: "Fakturan klar <em>på en minut.</em>", sub: "Offerten blir faktura med en knapp. Betalningar och påminnelser sköts av sig själva.",
    stage: () => `${faktura()}<div class="mob" style="right:70px;top:60px"><img src="${P}sajt-fakturering-mobil.png" alt=""></div>
      <div class="tag" style="right:110px;top:470px;transform:rotate(5deg)"><small>Med hemsida</small><b><s>490 kr</s> 0 kr</b></div>
      <div class="hand note" style="right:90px;top:600px;transform:rotate(-3deg)">första året!</div>`,
    list: ["OCR, Swish och påminnelser", "ROT och betalplaner uträknat", "Ingen bindningstid"],
    badges: ["Ordinarie 490 kr/mån", "Gratis första året med hemsida", "Priser exkl. moms"] },
  { slug: "system", namn: "System och automation", bg: "sajt-mjukvara-dator.png", qr: "qr-system.svg", url: "binaafy.se/mjukvara",
    h: "Från Excelark <em>till ett system.</em>", sub: "Kunder, offerter, schema och fakturor på ett ställe – byggt efter hur ni jobbar.",
    stage: () => `${excel()}<div class="hand arrow" style="left:500px;top:300px">→</div>
      <div class="paper app"><div class="a-h">${logo().replace("binaafy-light", "binaafy")}<span>Ert system</span></div>
        ${["Kunder", "Offerter", "Schema", "Fakturor"].map((m, i) => `<div class="a-row"><i>${["👥", "📝", "📅", "💳"][i]}</i>${m}<em>✓</em></div>`).join("")}</div>
      <div class="hand note" style="left:560px;top:600px;transform:rotate(-4deg)">byggt efter er!</div>`,
    list: ["Ersätter ark, mejl och lappar", "Fast pris per etapp", "Koden är er"],
    badges: ["Kostnadsfritt första samtal", "Fast pris per etapp", "Ni äger koden"] },
];

const poster = (t, fmt) => `<div class="sw ${fmt}"><img class="blurbg" src="${P}${t.bg}" alt=""><div class="glow"></div>
    <div class="sw-top">${logo()}<span class="kick">Binaafy Software · ${t.namn}</span></div>
    <div class="sw-head"><div class="h">${t.h}</div><div class="sub">${t.sub}</div></div>
    <div class="stage"><div class="stage-in">${t.stage()}</div></div>
    <ul class="chips">${t.list.map((x) => `<li>${x}</li>`).join("")}</ul>
    <div class="p-foot"><div class="badges">${t.badges.map((b) => `<span>${b}</span>`).join("")}</div>
      <div class="contact"><div><small>Ring eller boka ett samtal</small><b>${PHONE}</b><span>${t.url}</span></div><img class="qr" src="${t.qr}" alt=""></div></div>
  </div>`;

const DESIGNS = TJANSTER.flatMap((t) => [
  { id: `${t.slug}-affisch-a3`, size: [1240, 1754], scale: 2, html: () => poster(t, "a3") },
  { id: `${t.slug}-inlagg`, size: [1080, 1350], html: () => poster(t, "") },
  { id: `${t.slug}-story`, size: [1080, 1920], html: () => poster(t, "story") },
]);
