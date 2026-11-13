# Postverktyg

Bygg Instagram- och Facebookinlägg i Binaafys stil, redigera dem och ladda ner som PNG.

## Starta

Dubbelklicka på `starta.cmd`. Sidan öppnas på http://localhost:8765/marketing/postverktyg/.
Stäng fönstret med servern när du är klar.

Eller från projektets rot:

```
python -m http.server 8765 --bind 127.0.0.1
```

Sidan måste öppnas via servern, inte som fil, annars hittas inte bilderna och loggan.

## Så funkar det

- **Redigera**: välj mall, klicka **+ Nytt inlägg** och fyll i fälten till höger. `*ord*` i rubriker blir orange.
- **Bilder**: lägg egna foton i `marketing/postverktyg/bilder/` så dyker de upp i bildväljaren. Bilderna i
  `marketing/annonser/_kalla/bilder/` finns också med. "Ladda upp egen…" fungerar också, men stora bilder tar mycket
  plats i webbläsarens minne, så mappen är bättre.
- **Caption**: skriv texten under formuläret. Den räknar tecken och hashtaggar och visar vad som syns före "mer".
- **Rutnät**: fliken visar hur profilen ser ut med highlights, fästa inlägg och ordningen. Listan till vänster är
  postningsordningen (överst postas först).
- **Ladda ner PNG**: sparar bilden i rätt storlek i mappen Hämtade filer. Delad logga ger tre bilder.

## Mallar

| Mall | Användning |
|---|---|
| Foto + text | Jobbilder med rubrik, text och knapp (som ig-intro) |
| Stort foto | Helbildsfoto med stort ord, t.ex. "Tak." |
| Lista | Tips och steg, numrerade |
| Före/efter | Karusell (före med krok → ev. under arbetet → efter → så gjorde vi) eller en bild med före ovanför efter |
| Skärm | Hemsida i dator och/eller mobil, för mjukvarudelen. Skärmbilder av binaafy.se ligger i `bilder/sajt-*.png` |
| Priser | Paketkort: en rad per paket, `Namn \| Pris \| Text`, `!` först gör kortet orange ("Populärast") |
| Delad logga | Tre inlägg som bildar loggan i rutnätet |
| Highlight-omslag | Ikon för highlights (1080×1920) |

Format: Flöde 4:5, Rutnät 3:4, Kvadrat 1:1 och Story 9:16.

## Spara

Inläggen sparas automatiskt i webbläsaren (bara på den här datorn och i den här webbläsaren).
Använd **Säkerhetskopiera** för att spara allt till en fil och **Läs in** för att hämta tillbaka den, till exempel på
en annan dator.

## Göra många bilder på en gång

`rendera.js` gör PNG av alla inlägg i en säkerhetskopia (kräver Node och Chrome):

```
node rendera.js min-kopia.json [utmapp]
```

## Ändra eller lägga till mallar

Mallarna finns i `mallar.js` (fält, standardvärden och HTML) och utseendet i `poster.css`.
