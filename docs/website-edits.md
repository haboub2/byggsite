# Website edits: plan

Gathered from the owners' notes (October 2026). Work through the steps in order;
photos can be uploaded from `/admin` at any point.

| Step | What | Status |
|---|---|---|
| 1 | Company details, contact page, team contacts | **In progress** (see open questions) |
| 2 | Subcontractor wording + rich text across the site | To do |
| 3 | References page (Bygg + Software) | To do |
| 4 | Trustpilot page | To do |
| 5 | Premium animations | To do |

---

## 1. Company details, contact, team

**Done**
- Address: **Uppstigen 130, 412 80 Göteborg** (footer, contact page, structured data, `llms.txt`).
- Structured data region: Västra Götalands län.
- Contact page shows **info@binaafy.se**, phone, address and hours. The "Kontaktperson" row is gone,
  and the field is removed from `/admin → Företaget`.
- Team members have optional **email** and **work phone**, editable in `/admin → Team` and shown on `/om-oss`:

  | Name | Role | Email | Phone |
  |---|---|---|---|
  | Mohamed Al Haboub | Byggingenjör | haboub@binaafy.se | _to add_ |
  | Abdulmalek (Malek) Alnajjar | Byggingenjör | malek@binaafy.se | _to add_ |
  | Ibrahim Al Haboub | Dataingenjör | ibra@binaafy.se | _to add_ |

**Why info@ and not support@:** most people writing are new customers asking for a quote, and
`info@` is what they expect. `support@` signals after-sales help; add it later for software clients
if needed. Make sure the `info@binaafy.se` mailbox exists and is in `MAIL_TO`.

**Waiting on answers**
- Göteborg: does the whole business move, or only the address? "Halmstad" appears in about 50
  places (page titles, SEO text, guides, service areas "Halmstad, Laholm, Falkenberg, Hallands län",
  the footer line "Vi bygger hus i Halland"). These stay until we know which areas to serve.
- Work phone numbers for each person, and whether the main number (079-304 97 37) stays.
- Org.nr (shown in the footer once set in `/admin → Företaget`).

> If company details or the team were already saved from `/admin`, the saved version wins over the
> new defaults: update the address there too, and add the emails under `/admin → Team`.

## 2. Subcontractors, said professionally + rich text

Proposed copy (home page, `/om-oss`, Bygg services):

> **Ett ansvar – hela vägen**
> Merparten av arbetet utför vi med egen personal. För specialistmoment som el, VVS eller
> våtrumscertifierade arbeten anlitar vi noggrant utvalda och behöriga underentreprenörer som vi har
> arbetat med länge. Du har alltid en kontaktperson och ett avtal med oss – vi samordnar,
> kvalitetssäkrar och tar fullt ansvar för helheten, inklusive garantin.

- Replace the value card "Eget hus — inga mellanhänder" (contradicts the above) with
  **"En kontakt, ett ansvar — Du har ett avtal med oss, oavsett vem som utför momentet."**
- Service pages: 600–1000 words each (what's included, step by step, price, FAQ, subcontractors).
- Longer "Om oss": story, way of working, values, insurance, F-skatt, ID06.
- Short headings and paragraphs so the extra text stays easy to scan.

## 3. References page: `/referenser`

- Both sides, filterable **Bygg / Software**.
- Card: cover photo, title, place, year, short quote. Click opens a detail page with a photo
  gallery (lightbox), the work done, and the customer's review.
- Bygg: reuse the existing projects system (`/bygg/projekt`, editable in `/admin`). The current
  projects are **placeholders**; replace them with real jobs.
- Software: **Autobazar** and other clients as cases, also editable from `/admin` (new).
- Client logo strip on the home page.

**Needed:** list of real jobs per side; for each software client what you built, a link, and
permission to show and quote them.

## 4. Trustpilot page: `/omdomen`

- Score, stars, review count, latest reviews, "leave a review" button.
- Needs a (free) **Trustpilot Business** account. The TrustBox widget sets cookies, so it loads only
  after cookie consent; before that the page shows the score as text with a link.
- Real reviews only. Invented or copied reviews break Swedish marketing law.

**Needed:** Trustpilot profile link.

## 5. Premium animations

Already there: photos revealed behind a curtain, blueprint lines that draw themselves, crossfade
between Bygg and Software. To add:

1. Headings reveal line by line on scroll (fade + lift).
2. Numbers count up when they come into view.
3. Subtle parallax on large photos.
4. Before/after drag slider on Bygg references.
5. Gallery lightbox that opens from the clicked image.
6. Slowly scrolling client logo strip.
7. Buttons that follow the cursor slightly; gentle zoom on cards on hover.
8. Page transitions between all pages.

All lightweight (no heavy libraries) and off for visitors who prefer reduced motion.
