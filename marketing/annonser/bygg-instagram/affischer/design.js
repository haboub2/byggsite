/* En affisch per byggtjänst, med era egna foton. design.html?id=<id> visar en, rendera.js gör PNG av alla.
   Varje tjänst blir tre bilder: A3 för tryck, inlägg 4:5 och story. Ändra texterna i TJANSTER. */

const K = "../../_kalla/bilder/ref/", BR = "../../../../public/brand/";
const photo = (f, pos = "50% 50%") => `<img class="bg" src="${K}${f}" style="object-position:${pos}" alt="">`;
const logo = () => `<img class="logo" src="${BR}binaafy-light.svg" alt="Binaafy">`;
const PHONE = "079-304 97 37";

const TJANSTER = [
  { slug: "tak", namn: "Tak", hero: ["tak-tegel-himmel.jpg", "50% 60%"],
    h: "Nytt tak. <em>Tätt i decennier.</em>", sub: "Takbyte med tegel eller falsad plåt – från rivning till sista nockpannan.",
    pols: [["tak-rotskada.jpg", "50% 50%", "före: rötskadat"], ["tak-lakt-solnedgang.jpg", "50% 60%", "ny läkt och duk"]],
    list: ["Rivning och ny takduk", "Ny läkt, pannor eller plåt", "Rötskador åtgärdas först", "Nock, beslag och avslutning"] },
  { slug: "maleri", namn: "Måleri", hero: ["maleri-hall.jpg", "50% 60%"],
    h: "Inflyttningsklart. <em>Färg som håller.</em>", sub: "Målning inne och ute – väggar, tak, snickerier, fasad och puts.",
    pols: [["fasad-puts.jpg", "50% 60%", "fasad och puts"], ["maleri-rum.jpg", "50% 50%", "släta väggar"]],
    list: ["Spackling och slipning", "Grundning och två strykningar", "Dörrar, lister och snickerier", "Fasad och puts utomhus"] },
  { slug: "uteplats", namn: "Uteplats", hero: ["mark-tradack.jpg", "50% 60%"],
    h: "Uteplatsen du <em>faktiskt använder.</em>", sub: "Trädäck, trappsteg och skiffer – byggt för svenskt väder.",
    pols: [["uteplats-fore.jpg", "50% 60%", "före"], ["uteplats-tradack-3.jpg", "50% 60%", "efter"]],
    list: ["Markarbete och nytt underlag", "Trädäck med trappsteg", "Skiffer eller plattor runt om"] },
  { slug: "gang", namn: "Gång och entré", hero: ["mark-skiffer.jpg", "50% 55%"],
    h: "En entré som <em>välkomnar.</em>", sub: "Gångar och entréer i naturskiffer – rakt, stabilt och utan ogräs i fogarna.",
    pols: [["gang-fore.jpg", "50% 60%", "före"], ["gang-skiffer-2.jpg", "50% 60%", "efter"]],
    list: ["Gamla plattor bort", "Nytt, packat underlag", "Naturskiffer läggs och fogas"] },
];

const poster = (t, fmt) => `<div class="poster ${fmt}">
    <div class="p-hero">${photo(...t.hero)}<div class="p-top">${logo()}<span class="kick">Binaafy Bygg · ${t.namn}</span></div>
      <div class="p-head"><div class="h">${t.h}</div><div class="sub">${t.sub}</div></div></div>
    <div class="p-mid"><div class="pols">${t.pols.map(([f, pos, cap]) => `<div class="pol"><div class="ph">${photo(f, pos)}</div><span>${cap}</span></div>`).join("")}</div>
      <ul class="list">${t.list.map((x) => `<li>${x}</li>`).join("")}</ul></div>
    <div class="p-foot"><div class="badges"><span>Kostnadsfritt hembesök</span><span>ROT 30 % på arbetet</span><span>Fast pris i offerten</span></div>
      <div class="contact"><div><small>Ring eller boka besök</small><b>${PHONE}</b><span>binaafy.se/bygg</span></div><img class="qr" src="qr-offert.svg" alt=""></div></div>
  </div>`;

const DESIGNS = TJANSTER.flatMap((t) => [
  { id: `${t.slug}-affisch-a3`, size: [1240, 1754], scale: 2, html: () => poster(t, "a3") },
  { id: `${t.slug}-inlagg`, size: [1080, 1350], html: () => poster(t, "") },
  { id: `${t.slug}-story`, size: [1080, 1920], html: () => poster(t, "story") },
]);
