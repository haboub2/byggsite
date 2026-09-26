# Koppla formulären — Supabase och Resend

Koden är klar. Det som saknas är två konton och några nycklar. När stegen nedan
är gjorda sparas varje offertförfrågan, brief och kontaktmeddelande i databasen,
och ni får ett mejl om varje ny förfrågan.

Tidsåtgång: cirka 20 minuter.

---

## 1. Supabase (databasen)

1. Logga in på [supabase.com](https://supabase.com) → organisationen **Haboub** → **New project**.
   - Namn: `binaafy`
   - Region: **Stockholm (eu-north-1)** — datan stannar i Sverige.
   - Lösenord: välj ett starkt och spara det i en lösenordshanterare.
2. Vänta tills projektet är klart (ett par minuter).
3. Säg till Claude att projektet finns. Tabellerna (`supabase/migrations/0001`–`0004`)
   kan då köras direkt härifrån. Vill ni göra det själva: öppna **SQL Editor** och kör
   filerna i ordning, `0001` → `0004`.
4. Hämta nycklarna under **Project Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret** → `SUPABASE_SERVICE_ROLE_KEY`

> **service_role-nyckeln är hemlig.** Den kringgår alla behörigheter i databasen.
> Klistra bara in den i `.env.local` på er egen dator och i Vercels miljövariabler —
> aldrig i koden, i ett chattmeddelande eller i ett mejl.

## 2. Resend (e-post)

1. Skapa ett konto på [resend.com](https://resend.com) med den e-postadress som ska få
   förfrågningarna.
2. **API Keys → Create API Key** (behörighet: *Sending access*) → `RESEND_API_KEY`.
3. `MAIL_TO` = samma adress som kontot. Innan domänen är verifierad kan Resend bara
   skicka till kontots egen adress.

**När `binaafy.se` är köpt:**

4. **Domains → Add Domain** → `binaafy.se`. Lägg in de DNS-poster Resend visar hos er
   domänleverantör och vänta på *Verified*.
5. Sätt `MAIL_FROM`, t.ex. `Binaafy <hej@binaafy.se>`. Först då skickas även det
   automatiska tack-mejlet till kunden.

## 3. Lägg in nycklarna

Lokalt, i `.env.local` (filen finns redan och checkas aldrig in):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
MAIL_TO=...
MAIL_FROM=
```

Starta om utvecklingsservern efteråt. I produktion läggs samma värden in under
**Vercel → Project → Settings → Environment Variables**.

## 4. Testa

1. Skicka ett offertformulär på `/bygg/offert` med er egen e-post.
2. Kontrollera att raden syns i Supabase: **Table Editor → leads**.
3. Kontrollera att notismejlet kom fram till `MAIL_TO`.

## Hur det fungerar

| Steg | Vad händer |
|---|---|
| Kontroll | Fälten valideras, max 5 förfrågningar per IP och 10 minuter, och en dold fälla stoppar botar. |
| Spara | Förfrågan sparas i `leads` med alla fält, sidan besökaren var på, UTM-taggar och tidpunkt för samtycke. |
| Notis | Ett mejl går till `MAIL_TO`. Misslyckas mejlet finns förfrågan ändå kvar i databasen. |
| Tack-mejl | Skickas till kunden först när `MAIL_FROM` är satt. |

Är Supabase inte kopplat svarar formuläret med ett tydligt fel och ber besökaren ringa
eller mejla — ingen förfrågan tappas i tysthet.
