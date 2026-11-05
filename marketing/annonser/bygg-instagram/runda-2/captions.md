# binaafy.bygg – runda 2

Eget konto för bygget. Inget här nämner hemsidor, kod eller fakturering, och allt länkar till `/bygg`-sidor.
Målet är fler bokade hembesök och offertförfrågningar från villaägare.

Inläggen bygger på riktiga jobbfoton. Det som ska läsas ligger som saker på fotot: priset som en offert på papper,
stegen på ett block och tiden i en kalender. Texter och priser ändras i `design.js`, sedan körs `node rendera.js` i den här
mappen (eller `node rendera.js takpris` för bara ett inlägg).

> **Innan ni postar:**
> - **Priserna i "Vad kostar ett nytt tak?" är exempelsiffror.** De kommer från `lib/pricing.ts`, där det står att de gäller tills ni har riktiga priser. Byt till era egna siffror i `design.js` (raden `const TAK`) innan inlägget läggs upp – summa, ROT och pris per m² räknas om automatiskt. Samma siffror står på sajten.
> - Området: bygginläggen säger **Halland**, men startsidan säger "Göteborg till Malmö". Bestäm ett och använd det överallt.
> - Den delade loggan (`ig-logga`) och highlighten Programmering används inte längre. Programmering-omslaget ligger nu i `software-instagram`.

## Profilen

**Namn:** Binaafy Bygg · **Användarnamn:** binaafy.bygg

**Bio:**
> Tak, plåt och renovering i Halland 🏠
> Kostnadsfritt hembesök · ROT direkt på fakturan
> En kontaktperson från offert till sista spiken
> 👇 Boka besök

**Länk:** binaafy.se/bygg/offert

**Fäst överst:** taket före/efter (`fore-efter/taket-karusell`), Vad kostar ett nytt tak (`runda-2/bygg-takpris`), Hej Halland (`ig-intro`).
**Highlights** (`highlights/`): Takbyten, Plåttak, Före/efter, ROT, Så funkar det, Omdömen, Offert.

---

## Nya inlägg

### Vad kostar ett nytt tak? – `bygg-takpris.png` (fäst) + `bygg-takpris-story.png`
> Vad kostar ett nytt tak? 🏠 Här är ett räkneexempel
>
> Plåttak, 150 m²: 210 000 kr inkl. moms.
> ROT-avdraget (30 % på arbetet): −33 000 kr.
> Du betalar: 177 000 kr.
>
> Varje tak är olika, så vi ger alltid ett fast pris efter ett kostnadsfritt hembesök. ROT drar vi direkt på fakturan – vi sköter ansökan.
>
> 👉 Boka besök – länk i bio
>
> #takbyte #plåttak #rotavdrag #vadkostar #villaägare #halland #halmstad

**Story:** frågesticker "Hur stort är ditt tak?" – svara med ett ungefärligt pris i DM.

### Inför våren – `bygg-infor-varen.png` + `bygg-infor-varen-story.png`
> Nytt tak till våren? Boka besöket nu 🌱
>
> Vårens kalender fylls under vintern. Vi kommer ut, tittar på taket, mäter och lämnar en skriftlig offert – kostnadsfritt och utan krav.
>
> 💰 ROT-avdrag 30 % på arbetet
> 👉 Länk i bio
>
> #takbyte #plåttak #tegeltak #takläggare #rotavdrag #villaägare #halland

**Story:** länksticker "Boka besök" till binaafy.se/bygg/offert.

### Så går hembesöket till – `bygg-hembesoket.png`
> Så går hembesöket till ✅
>
> 1. Du bokar en tid som passar dig.
> 2. Vi tittar på taket och mäter.
> 3. Du får en skriftlig offert med ROT-avdraget uträknat.
> 4. Inga krav – du bestämmer i lugn och ro.
>
> Det kostar ingenting. Länk i bio.
>
> #takbyte #renovering #hantverkare #villaägare #halland

### Be om omdöme – `bygg-omdome-story.png`
Story till följare, och skicka bilden direkt till varje kund när ett jobb är klart, tillsammans med länken till er Google-profil. Riktiga omdömen är det som avgör för nya kunder, och de fyller highlighten Omdömen.

---

## Allt material för kontot

| Typ | Filer |
|---|---|
| Före/efter | `fore-efter/` (gången, uteplatsen, tegeltaket) och `fore-efter-2/` (plåttaket, rötskadan, gissa-storys) |
| Organiska inlägg | `ig-*` (17 st, från `_kalla/build.js`), captions i `../captions.md` |
| Banner för de fästa platserna | `ig-banner/` (Tak · logga · Plåt) – alternativ till tre fästa inlägg |
| Nya i runda 2 | Takpris, Inför våren, Hembesöket, Omdöme |

## Postningsplan, de första åtta veckorna

Två inlägg i veckan plus storys. Villaägare är mest aktiva kvällar och helger.

| Vecka | Inlägg | Story |
|---|---|---|
| 1 | Hej Halland (`ig-intro`) · Taket före/efter | Takpris-story |
| 2 | Vad kostar ett nytt tak? · Gången före/efter | Gissa: gången |
| 3 | Inför våren · Rötskadan | Inför våren-story |
| 4 | Så går hembesöket till · Plåttaket före/efter | Plåttak: frågesticker |
| 5 | Fem tecken (`ig-tecken`) · Uteplatsen före/efter | Gissa: uteplatsen |
| 6 | ROT-räkneexempel (`ig-rot`) · Falsad plåt (`ig-falsad`) | Omdöme-story |
| 7 | Kundportalen (`ig-portal`) · Tegeltaket | Inför våren-story igen |
| 8 | Därför oss (`ig-fordelar`) · Nock (`ig-nock`) | Hur gammalt är ditt tak? |

## Annonser

- **Meta (Facebook + Instagram):** taket före/efter som karusellannons och "Inför våren" som bildannons. Mål: formulär för förfrågningar eller klick till /bygg/offert. Rikta mot husägare 35–65 år inom 3–4 mil från där ni jobbar. Börja med 100 kr/dag och flytta pengarna till den som ger flest förfrågningar efter en vecka.
- **Google Ads:** "takbyte halmstad", "takläggare halmstad", "plåttak pris". Texterna finns i `../../annonstexter.md`.
- **Google-företagsprofil:** lägg upp samma före/efter-bilder där, och be varje kund om ett omdöme.

---

## Affisch: alla byggtjänster – `tjanster-affisch-a3.png`, `tjanster-inlagg.png`, `tjanster-story.png`

Sex tjänster med era egna foton: takbyte, plåttak, tillbyggnad, fasad och puts, målning, och uteplats och mark. Badrum, kök,
golv, totalrenovering och projektledning står som text, eftersom det inte finns egna foton från de jobben än. QR-koden går till
binaafy.se/bygg/offert. Testa den innan tryck.

- **A3** (2480×3508 px, 300 dpi): affisch, anslagstavlor, flygblad i brevlådor. Går att skala till A2/A1.
- **Inlägg 4:5**: fäst på profilen, och använd som annons.
- **Story**: med länksticker till /bygg/offert.

> Ett team. Hela huset. 🏠
>
> Takbyte, plåttak, tillbyggnad, fasad och puts, målning, uteplats – och även badrum, kök och golv. En kontaktperson från offert till sista spiken.
>
> ✓ Kostnadsfritt hembesök ✓ ROT 30 % på arbetet ✓ Fast pris i offerten
>
> 📞 079-304 97 37 · 👉 Länk i bio
>
> #byggfirma #renovering #takbyte #hantverkare #rotavdrag #villaägare #halland

Bilderna kommer från `_kalla/bilder/ref/` (kopierade från mappen "Referenser bygg Binnafy"). Fler riktiga bilder att välja
bland finns kvar där, t.ex. rivning, rötskador, solceller och fler takvinklar.
