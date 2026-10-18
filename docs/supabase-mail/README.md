# Mejlmallar för kundportalen (Supabase Auth)

Supabase skickar två mejl åt portalen. Mallarna här är på svenska och i
sajtens uttryck (antracit, orange, cream). Klistra in dem i
**Supabase → Authentication → Email Templates**:

| Mall i Supabase | Fil | Ämnesrad | Används av |
|---|---|---|---|
| **Invite user** | `invite.html` | `Välkommen till Mitt projekt hos Binaafy` | Portalen: *Bjud in kund* |
| **Magic link or OTP** | `magic-link.html` | `Din kod till Mitt projekt: {{ .Token }}` | Portalen: kundens inloggning |
| **Reset password** | `reset-password.html` | `Återställ ditt lösenord till Binaafy admin` | Admin (se nedan) |
| **Reauthentication** | `reauthentication.html` | `Din bekräftelsekod: {{ .Token }}` | Admin: byte av lösenord |
| **Change email address** | `change-email.html` | `Bekräfta din nya e-postadress hos Binaafy` | Admin: byte av adress |
| **Confirm sign up** | `confirm-signup.html` | `Bekräfta din e-postadress hos Binaafy` | Skickas inte i dag (sign-up är av), men ifylld så inget Supabase-standardmejl kan gå ut |

De två första är de som kunder ser. De övriga rör admin-konton: sajten har
ännu ingen "glömt lösenord"-sida, så **Reset password** går i dag bara att
använda om länken pekar på en sida som tar emot den. Tills vidare byts ett
admin-lösenord i Supabase → Authentication → Users → *Send password
recovery* eller *Reset password*. Mallen finns klar för när sidan byggs.

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
