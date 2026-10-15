# Offerter — skriva, skicka och mallar

Offertverktyget finns under **/admin → Offerter**. Det används för både Bygg
och Software och ger en PDF med logotyp, företagsuppgifter, radspecifikation,
moms, ROT-avdrag (privatpersoner på Bygg) och villkor.

## Så används det

1. **Offerter → Ny offert.** Välj en mall. Kommer du från en förfrågan i inkorgen
   (knappen *Skriv offert*) fylls kundens uppgifter i automatiskt.
2. Fyll i kund, rader och villkor. Summeringen räknas om medan du skriver.
   - *Inkl. moms / Exkl. moms* styr hur priserna skrivs och visas. Att byta
     räknar om priserna så att summorna inte ändras.
   - På Bygg märks varje rad som *Arbete*, *Material* eller *Övrigt*. ROT
     räknas bara på arbete (30 %, högst 50 000 kr per person och år). Antal
     personer, namn och personnummer anges under raderna.
3. **Spara offerten**, sedan **Visa PDF** (öppnas i ny flik) eller **Ladda ner**.
4. **Skicka till kund** mejlar PDF:en med ett standardmeddelande och sätter
   status *Skickad*. Kräver Resend och en verifierad avsändaradress
   (`RESEND_API_KEY` + `MAIL_FROM`, se setup-forms.md). Utan det: ladda ner och
   bifoga i ett vanligt mejl.
5. Status (*Utkast, Skickad, Accepterad, Avböjd*) sätts i sidopanelen.
   *Duplicera* gör en kopia med dagens datum. *Spara som mall* sparar rader,
   texter och villkor (inte kunden) som en egen mall under Ny offert.

## Vad som står på PDF:en

| Del | Kommer från |
|---|---|
| Logotyp | `public/brand/binaafy-logo.png`, inbäddad i `lib/pdf/logo.ts` |
| Företagsnamn, adress, telefon, e-post, org.nr | Admin → **Företaget** |
| Bankgiro/plusgiro/IBAN, momsreg.nr, F-skatt, undertecknare, dröjsmålsränta, standardvillkor | Admin → **Offertuppgifter** |
| Offertnummer | Löpnummer från 1001 (`quote_number_seq` i databasen) |

Nya offerter fylls i med standardtexterna från Offertuppgifter och mallen; i
den enskilda offerten går allt att ändra.

## Teknik

- `lib/quotes/schema.ts` — datamodellen (zod), delad av redigeraren och servern.
- `lib/quotes/math.ts` — summor, moms per sats och ROT (återanvänder `lib/rot.ts`). Testad i `math.test.ts`.
- `lib/quotes/templates.ts` — de inbyggda mallarna. Lägg till en mall genom att lägga till ett objekt i listan.
- `lib/quotes/store.ts` — tabellerna `quotes` och `quote_templates` (`supabase/migrations/0007_quotes.sql`). Demo-läge i minnet utan Supabase.
- `lib/pdf/QuotePdf.tsx` — PDF-layouten med `@react-pdf/renderer`; `lib/pdf/render.tsx` renderar till bytes.
- `app/admin/(dashboard)/offerter/[id]/pdf/route.ts` — PDF:en, bara för inloggade admins.
- `app/admin/quote-actions.ts` — spara, status, duplicera, mallar, skicka.

Byt logotyp: lägg nya PNG:n i `public/brand/` och kör

```bash
node -e 'const fs=require("fs");const b=fs.readFileSync("public/brand/binaafy-logo.png").toString("base64");fs.writeFileSync("lib/pdf/logo.ts","/** public/brand/binaafy-logo.png as a data URI, so the PDF renderer never\\n *  depends on the file system of the host it runs on. Regenerate with the\\n *  command in docs/offerter.md. */\\nexport const LOGO_DATA_URI = \"data:image/png;base64,"+b+"\";\\n")'
```

Två egenheter i `@react-pdf/renderer` 4.9 som layouten tar hänsyn till:
`lineHeight` på `Page` gör att absolut positionerade `fixed`-element (sidfoten)
försvinner, och ett enhetslöst `lineHeight` på en `Text` som ärver sin
fontstorlek räknas mot standardstorleken. Därför sätts `lineHeight` bara på
`Text` tillsammans med `fontSize`.
