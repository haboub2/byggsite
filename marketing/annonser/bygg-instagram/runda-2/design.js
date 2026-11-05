/* Bygginläggen i runda 2: riktiga jobbfoton i bakgrunden, och det som ska läsas (pris, steg, kalender)
   som saker på fotot – en offert på papper, ett block, en kalender. design.html?id=<id> visar ett inlägg,
   rendera.js gör PNG av alla. Ändra texter och priser här. */

const K = "../../_kalla/bilder/", BR = "../../../../public/brand/";
const F45 = [1080, 1350], STORY = [1080, 1920];

const photo = (f, pos = "50% 50%") => `<img class="bg" src="${K}${f}" style="object-position:${pos}" alt="">`;
const logo = (dark) => `<img class="logo" src="${BR}${dark ? "binaafy.svg" : "binaafy-light.svg"}" alt="Binaafy">`;
const kr = (n) => (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("sv-SE").replace(/ /g, " ") + " kr";

// Räkneexemplet. EXEMPELSIFFROR från lib/pricing.ts – byt till riktiga priser innan publicering.
const TAK = { yta: 150, arbete: 110000, material: 100000 };
TAK.rot = -Math.round(TAK.arbete * 0.3);
TAK.total = TAK.arbete + TAK.material + TAK.rot;

const offert = () => `<div class="paper offert">
    <div class="o-head">${logo(true)}<div><b>Offert</b><span>Räkneexempel</span></div></div>
    <div class="o-title">Takbyte · falsad plåt, ${TAK.yta} m²</div>
    <div class="o-row"><span>Arbete</span><i></i><b>${kr(TAK.arbete)}</b></div>
    <div class="o-row"><span>Material</span><i></i><b>${kr(TAK.material)}</b></div>
    <div class="o-row rot"><span>ROT-avdrag 30 % på arbetet</span><i></i><b>${kr(TAK.rot)}</b></div>
    <div class="o-sum"><span>Att betala</span><b>${kr(TAK.total)}</b></div>
    <div class="o-foot">Inkl. moms · ca ${kr(Math.round(TAK.total / TAK.yta))}/m² efter ROT</div>
    <div class="stamp">ROT<br>direkt på<br>fakturan</div>
  </div>`;

const kalender = () => {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return `<div class="paper cal"><div class="cal-h"><b>Mars</b><span>2027</span></div>
    <div class="cal-g">${["M", "T", "O", "T", "F", "L", "S"].map((d) => `<em>${d}</em>`).join("")}
    ${days.map((d) => `<span class="${d === 15 ? "on" : ""}">${d}</span>`).join("")}</div></div>`;
};

const block = (items) => `<div class="paper block"><div class="clip"></div><div class="b-h">Hembesök</div>
    ${items.map((t) => `<div class="b-row"><i>✓</i><span>${t}</span></div>`).join("")}</div>`;

const DESIGNS = [
  // ---------- Vad kostar ett nytt tak? ----------
  { id: "bygg-takpris", size: F45, html: () => `${photo("ref/plat-falsad.jpg", "50% 40%")}<div class="shade top"></div>
      <div class="head"><div class="kick">Räkneexempel</div><div class="h">Vad kostar <em>ett nytt tak?</em></div></div>
      <div class="offert-wrap">${offert()}<div class="hand" style="left:30px;top:600px;transform:rotate(-4deg)">↑ det här betalar du</div></div>
      <div class="cta">Fast pris efter kostnadsfritt hembesök <b>binaafy.se</b></div>` },
  { id: "bygg-takpris-story", size: STORY, html: () => `${photo("ref/plat-falsad.jpg", "50% 40%")}<div class="shade top"></div>
      <div class="head" style="top:230px"><div class="kick">Räkneexempel</div><div class="h" style="font-size:104px">Vad kostar <em>ett nytt tak?</em></div></div>
      <div class="offert-wrap" style="top:720px">${offert()}<div class="hand" style="left:30px;top:600px;transform:rotate(-4deg)">↑ det här betalar du</div></div>
      <div class="cta" style="bottom:250px">Fast pris efter hembesök · länk i bio</div>` },

  // ---------- Nytt tak till våren ----------
  { id: "bygg-infor-varen", size: F45, html: () => `${photo("ref/tak-tegel-himmel.jpg", "50% 50%")}<div class="shade bottom"></div>
      <div class="cal-wrap">${kalender()}<div class="hand" style="left:-10px;top:470px;transform:rotate(-6deg)">ditt hembesök?</div></div>
      <div class="foot-txt"><div class="kick">Inför våren</div><div class="h">Nytt tak till våren? <em>Boka besöket nu.</em></div>
      <div class="sub">Vi kommer ut, mäter och lämnar en skriftlig offert – kostnadsfritt.</div>
      <div class="row">${logo()}<span class="pill">ROT 30 % på arbetet</span></div></div>` },
  { id: "bygg-infor-varen-story", size: STORY, html: () => `${photo("ref/tak-tegel-himmel.jpg", "50% 50%")}<div class="shade bottom"></div>
      <div class="cal-wrap" style="top:260px">${kalender()}<div class="hand" style="left:-10px;top:470px;transform:rotate(-6deg)">ditt hembesök?</div></div>
      <div class="foot-txt" style="bottom:260px"><div class="kick">Inför våren</div><div class="h" style="font-size:100px">Nytt tak till våren? <em>Boka besöket nu.</em></div>
      <div class="sub">Kostnadsfritt hembesök och skriftlig offert.</div><div class="row">${logo()}<span class="pill">Länk i bio</span></div></div>` },

  // ---------- Så går hembesöket till ----------
  { id: "bygg-hembesoket", size: F45, html: () => `${photo("ref/plat-montor.jpg", "40% 35%")}<div class="shade left"></div>
      <div class="head" style="max-width:560px"><div class="kick">Kostnadsfritt</div><div class="h" style="font-size:88px">Så går <em>hembesöket</em> till.</div></div>
      <div class="block-wrap">${block(["Du bokar en tid som passar", "Vi tittar på taket och mäter", "Skriftlig offert, ROT uträknat", "Inga krav – du bestämmer"])}</div>
      <div class="corner">${logo()}<span>binaafy.se</span></div>` },

  // ---------- Omdöme ----------
  { id: "bygg-omdome-story", size: STORY, html: () => `${photo("ref/tak-tegel-hus.jpg", "50% 50%")}<div class="shade full"></div>
      <div class="head" style="top:260px"><div class="kick">Till våra kunder</div><div class="h" style="font-size:104px">Hur blev <em>ditt nya tak?</em></div></div>
      <div class="paper review"><div class="stars">${"<i>★</i>".repeat(5)}</div><div class="r-line"></div><div class="r-line short"></div>
        <div class="r-btn">Skriv ett omdöme</div></div>
      <div class="hand" style="left:600px;top:1330px;transform:rotate(-5deg)">tack! 🙏</div>
      <div class="cta" style="bottom:250px">Ditt omdöme hjälper andra villaägare · länk i bio</div>` },
];

// ---------- Affisch: alla byggtjänster ----------
const TJANSTER = [
  ["ref/tak-tegel-nock.jpg", "50% 50%", "Takbyte", "Nya pannor, läkt och duk"],
  ["ref/plat-falsad.jpg", "50% 40%", "Plåttak", "Falsad plåt, nock och beslag"],
  ["ref/takstol-1.jpg", "50% 45%", "Tillbyggnad", "Stomme och nya takstolar"],
  ["ref/fasad-puts.jpg", "50% 50%", "Fasad och puts", "Puts, fasad och takfot"],
  ["ref/maleri-hall.jpg", "50% 55%", "Målning", "Väggar, tak och snickerier"],
  ["ref/mark-skiffer.jpg", "50% 60%", "Uteplats och mark", "Skiffer, plattor och trädäck"],
];
const AVEN = "Även badrum · kök · golv · totalrenovering · projektledning";
const PHONE = "079-304 97 37";

const affisch = (story) => `<div class="af ${story ? "af--story" : ""}">
    <div class="af-hero">${photo("ref/tak-tegel-himmel.jpg", "50% 60%")}<div class="shade af-shade"></div>
      <div class="af-top">${logo()}<span class="kick">Binaafy Bygg</span></div>
      <div class="af-h"><div class="h">Ett team. <em>Hela huset.</em></div>
      <div class="sub">Tak, fasad, målning och uteplats – med en kontaktperson från offert till sista spiken.</div></div></div>
    <div class="af-grid">${TJANSTER.map(([f, pos, t, d]) => `<div class="tile">${photo(f, pos)}<div class="tile-txt"><b>${t}</b><span>${d}</span></div></div>`).join("")}</div>
    <div class="af-aven">${AVEN}</div>
    <div class="af-foot"><div class="badges"><span>✓ Kostnadsfritt hembesök</span><span>✓ ROT 30 % på arbetet</span><span>✓ Fast pris i offerten</span></div>
      <div class="contact"><div><small>Ring eller boka besök</small><b>${PHONE}</b><span>binaafy.se/bygg</span></div><img class="qr" src="qr-offert.svg" alt=""></div></div>
  </div>`;

DESIGNS.push(
  { id: "tjanster-affisch-a3", size: [1240, 1754], scale: 2, html: () => affisch(false) },
  { id: "tjanster-inlagg", size: F45, html: () => affisch(false) },
  { id: "tjanster-story", size: STORY, html: () => affisch(true) },
);
