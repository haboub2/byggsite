# Mejlmallar för kundportalen (Supabase Auth)

Supabase skickar två mejl åt portalen. Mallarna här är på svenska och i
sajtens uttryck (antracit, orange, cream). Klistra in dem i
**Supabase → Authentication → Email Templates**:

| Mall i Supabase | Fil | Ämnesrad |
|---|---|---|
| **Invite user** | `invite.html` | `Välkommen till Mitt projekt hos Binaafy` |
| **Magic Link** | `magic-link.html` | `Din kod till Mitt projekt: {{ .Token }}` |

Kopiera hela filens innehåll till fältet *Message body* (knappen `<>`/Source
om editorn visar formaterad text) och ämnesraden till *Subject heading*.

## Varför koden står med

Vissa mejlprogram öppnar länkar automatiskt för att kontrollera dem. Då är
länken förbrukad innan kunden hunnit klicka. Koden `{{ .Token }}` fungerar
ändå på inloggningssidan, så Magic Link-mallen visar alltid båda.

## Övriga inställningar som hör ihop

- **Authentication → Providers → Email**: *Confirm email* kan vara på;
  *Allow new users to sign up* ska vara **av**. Konton skapas bara av
  *Bjud in kund* i /admin.
- **Authentication → URL Configuration**: Site URL `https://binaafy.se`,
  Redirect URLs `https://binaafy.se/mitt-projekt/callback`.
- **Authentication → Rate limits / Sessions**: OTP-giltighet 3600 s (texten
  i mallen säger en timme), session minst 30 dagar så kunden slipper logga
  in varje gång.
- Avsändare: standard är `noreply@mail.app.supabase.io`. Snyggare är
  **Authentication → SMTP Settings** med Resend (host `smtp.resend.com`,
  port 465, användare `resend`, lösenord = API-nyckeln, avsändare
  `Binaafy <hej@binaafy.se>` när domänen är verifierad i Resend).

## Variabler som används

`{{ .Token }}` koden, `{{ .ConfirmationURL }}` länken, `{{ .SiteURL }}`,
`{{ .Email }}` och `{{ .Data.name }}` (namnet från inbjudan). Ändra inte
dem; allt annat i filerna får skrivas om fritt.
