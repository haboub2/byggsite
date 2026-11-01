# SEO review of binaafy.se — 2026-11-01

Written after a live check of the site, Google, Bing, Lighthouse and the code on `main`.
Companion to the code change in this branch (see section 3). Swedish search terms are kept in Swedish.

## 1. Why a Google search for "binaafy" does not show the site

Three things combine. None of them is a penalty, and the site is not blocked.

**1a. Google treats "binaafy" as a misspelling of "Benify".**
Benify is a large Swedish employee-benefits company with an app, thousands of pages and years of
search history. For the bare word *binaafy* Google shows Benify's knowledge panel and ten Benify
results, and binaafy.se is not on page 1. The query *"binaafy" bygg* does return the site, the
Google Business Profile "Binaafy AB" (5,0 of 5, 6 reviews, Generalentreprenör, Uppstigen 130) and
the company registers (Bolagsfakta, Ratsit, Merinfo, Kompass). So Google knows the company; it just
does not yet trust that someone typing *binaafy* means it. The spell-corrector learns from brand
signals: how many sites mention the name, profiles that link to the site, and whether people who
search the word click "Sök istället efter binaafy". A company founded in 2026 with a site that went
live in September–October 2026 has almost none of that yet.

**1b. The site is served on www but every URL in the markup says non-www.**
Vercel answers `https://binaafy.se` with a 308 redirect to `https://www.binaafy.se`. The code's
`SITE_URL` was `https://binaafy.se`, so the canonical tag, `og:url`, every JSON-LD `@id`/`url`, all
43 sitemap entries and the `Sitemap:` line in robots.txt point at the hostname that redirects.
Google's canonicalization docs call redirects a strong signal and rel=canonical a strong signal;
here they contradict each other. The `site:binaafy.se` result confirms it: Google has indexed a mix
of `www.binaafy.se/...` and `binaafy.se/...` URLs, some with titles from an older crawl. Until this is
consistent, link signals are split over two hostnames and Search Console will report
"Duplicate, Google chose different canonical than user" / "Alternate page with proper canonical tag".

**1c. Thin entity signals.**
`Organization.sameAs` was empty (no profiles anywhere), `legalName` said "Binaafy" while every
register says "Binaafy AB", and the home page never said the brand name or "byggfirma i Göteborg" in
visible text (only in the `<title>` and a screen-reader-only span).

**What is fine** (checked, no action needed): no `noindex` anywhere, robots.txt allows everything but
`/admin` and `/api/`, sitemap has 43 URLs that all return 200, every page has a unique title and
description, canonical tags are self-referential, JSON-LD parses (Organization, WebSite,
HomeAndConstructionBusiness, Service, FAQPage, Article, BreadcrumbList), the Google verification TXT
record exists in DNS (so a Search Console Domain property exists), TTFB is about 50 ms, Lighthouse
SEO score is 100 and the site is indexed in Google.

## 2. Measurements (live, mobile Lighthouse 12, 2026-11-01)

| Metric | Value | Target |
|---|---|---|
| Performance | 75 | 90 |
| Accessibility | 95 | 100 |
| Best practices | 100 | – |
| SEO | 100 | – |
| LCP | 3,6 s | < 2,5 s |
| TBT | 410 ms | < 200 ms |
| CLS | 0 | 0 |
| Home page words | 1 337 | – |
| Service page words (badrum, tak) | 890–930 | – |
| Guide words (ROT 2026) | 940 | – |

Biggest performance costs: project photos uploaded through /admin (two of them are 90–100 KB after
next/image at 750 px), and main-thread work from the scroll animations (Style & Layout 740 ms).
Accessibility: footer heading jumped from h2 to h4 (fixed in this branch); inactive steps in the
"Fyra steg" story have 1,6–2,0:1 contrast while faded (design choice, not changed).

## 3. Fixed in this branch

- `lib/env.ts`: default `SITE_URL` is now `https://www.binaafy.se`, matching the live redirect.
  **The Vercel env var `NEXT_PUBLIC_SITE_URL` must say the same** (section 4, step 1).
- `lib/seo.ts`: `CONTENT_UPDATED` bumped to 2026-11-01 (sitemap `lastmod` and llms.txt said
  2026-09-26 although pages changed in October).
- `lib/placeholder.ts`: `legalName` "Binaafy AB"; `profiles` (schema.org `sameAs`) now lists the three
  verified company registers; new `cities` list; the FAQ answer about areas names the towns and the
  places already built in (Hyltebruk, Helsingborg, Göteborg).
- `lib/sides.ts`: the hero lead on the Bygg side now reads "Binaafy är en byggfirma i Göteborg som…";
  the Software lead says "Binaafy Software bygger…". The brand and the main keyword are visible text.
- `components/Footer.tsx`: a "Byggfirma i Göteborg, Mölndal, … och Malmö" line on every page;
  column headings h4 → h3 so heading order is valid.

## 4. What only the owner can do — in priority order

1. **Vercel → project → Settings → Environment Variables:** set `NEXT_PUBLIC_SITE_URL` to
   `https://www.binaafy.se` for Production and redeploy. (The project is not in the Vercel account
   the CLI on this Mac is logged into, so it was not changed here.) Verify afterwards:
   `curl -s https://www.binaafy.se | grep canonical` must show `https://www.binaafy.se`.
   Alternative: keep non-www by making `binaafy.se` the primary domain in Vercel so that www
   redirects to it, and set the env var to `https://binaafy.se`. Pick one; www is what Google has
   mostly indexed today, so it is the smaller change.
2. **Search Console:** add a URL-prefix property for `https://www.binaafy.se/` next to the Domain
   property, submit `https://www.binaafy.se/sitemap.xml`, then use URL inspection → "Begär indexering"
   for the home page and the eight service pages. Check "Sidor" for the two duplicate statuses above;
   they should clear within a few weeks after step 1.
3. **Google Business Profile "Binaafy AB":** set the website to `https://www.binaafy.se`, primary
   category Byggfirma (plus Takläggare, Badrumsrenovering, Målare, Snickare as secondary), list the
   service area (Göteborg, Mölndal, Partille, Kungsbacka, Kungälv, Borås, Halmstad, Helsingborg,
   Malmö), add the eight services with the site's prices, upload 10–20 before/after photos from the
   project pages, post once a month, answer every review. Copy the profile's public URL into
   `site.profiles` in `lib/placeholder.ts`. This profile is the single strongest local ranking asset.
4. **Reviews:** competitors for *badrumsrenovering göteborg* have 70–175 Reco reviews. Ask every
   finished customer for a Google review with the direct review link, and fill in the platforms on
   `/admin` so `/omdomen` shows real scores. Trustpilot is optional; Google and Reco matter most here.
5. **Claim the registers and add the website** on allabolag.se, bolagsfakta.se, ratsit.se,
   hitta.se and eniro.se ("Är detta ditt företag?"). Identical name, address and phone everywhere
   (NAP): Binaafy AB, Uppstigen 130, 412 80 Göteborg, 079-304 97 37. These are the first links and the
   citations Google and AI assistants use to confirm the company.
6. **Brand profiles:** a LinkedIn company page, an Instagram and a Facebook page named "Binaafy",
   each linking to the site, each added to `site.profiles`. The `@binaafy` handles are free on
   Instagram and TikTok as of today.
7. **Bing Webmaster Tools:** import the site from Search Console (one click); `BingSiteAuth.xml`
   is already in `public/`.
8. **/admin → Företag:** change the company name to "Binaafy AB" so the live JSON-LD and footer match
   the register (the database value overrides the new default).
9. **Byggly.se:** the old domain still serves an HTML5 UP placeholder page. Either redirect it (301)
   to `https://www.binaafy.se` or take it down; a second "Byggly" site dilutes the entity.

## 5. What an SEO agency would do, month by month

An agency sells three things: technical hygiene, content, and authority (links, reviews, mentions).
Most of the first is now done in code. The rest is work the owners can do themselves; an agency's
value is doing it consistently every month and reporting on it.

**Month 1 — foundation.** Everything in section 4. Set up GA4 goals for form submissions and calls,
and a monthly Search Console export of impressions/clicks per page.

**Month 2–3 — content that matches how people search.**
Target one page per intent, not one page per town (town pages with the same text are "doorway pages"
and get filtered). The pages exist; the work is deepening them:

| Search intent | Page | Add |
|---|---|---|
| byggfirma göteborg | `/` | done: brand + keyword in hero, towns in footer |
| badrumsrenovering göteborg, renovera badrum pris | `/bygg/tjanster/badrumsrenovering` | price table by size, a finished Göteborg project with photos, certificates if held (Säker Vatten, GVK, BKR) |
| takbyte göteborg, takläggare göteborg, byta tak kostnad | `/bygg/tjanster/tak` | the four roof projects linked with location, price per m² per material |
| köksrenovering göteborg | `/bygg/tjanster/koksrenovering` | a project, price examples |
| tillbyggnad göteborg, bygglov tillbyggnad | `/bygg/tjanster/tillbyggnad` | bygglov steps in Göteborgs stad, timeline |
| rot-avdrag 2026 | `/guider/rot-avdrag-2026` | already strong; refresh each January |
| webbyrå göteborg, köp hemsida företag | `/mjukvara/kop-hemsida` | add "webbyrå i Göteborg" wording, a Göteborg case |

New guides (one per month, 900+ words, FAQ schema, dated, with sources like Skatteverket and
Boverket): *Vad kostar ett takbyte 2026*, *Köksrenovering: pris och tidplan*, *Bygglov för tillbyggnad i
Göteborg*, *Solceller på taket: ROT, bygglov och vad det kostar*, *Så väljer du byggfirma (checklista
med F-skatt, försäkring, ID06, referenser)*.

**Month 3 onwards — authority.** Links from suppliers' "våra återförsäljare" pages, local
sponsorships (a club, a school event) with a link, a Byggahus.se forum presence answering questions,
Offerta/Servicefinder profiles, a press mention when a notable project finishes (Göteborgs-Posten
local pages, Hallandsposten for Hyltebruk/Halmstad jobs). Ten real local links beat a hundred
directory links.

**Every month — the loop.** Ask for reviews, post photos to the Business Profile, publish one
guide, check Search Console for pages with impressions but a low click rate and rewrite their titles.

## 6. What "first page" realistically takes

- *binaafy* (brand): once the hostname is fixed and the Business Profile links to the site, the
  autocorrect usually relaxes within weeks to a couple of months. Profiles and register links speed it up.
- *byggfirma göteborg*, *badrumsrenovering göteborg*: 188 companies compete on hitta.se alone; the
  local pack (map) is won by the Business Profile (reviews, category, proximity), the organic list by
  page depth plus links. Page 1 in the map pack is plausible in 3–6 months with steady reviews; page 1
  organic typically 6–12 months.
- Long-tail guides (*rot-avdrag 2026*, *badrumsrenovering steg för steg*): these can rank within
  weeks because the competition is thinner, and they feed AI answers.

## 7. Sources used

- Google Search Central, canonicalization: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google Search Central, site names: https://developers.google.com/search/docs/appearance/site-names
- Visit Västsverige, Google Företagsprofil 2026: https://www.vastsverige.com/globalassets/turistradet-vastsverige/pdf/digital-narvaro/digital-handbok---googleforetagsprofil-2026.pdf
- Ranktracker, local SEO 2026: https://www.ranktracker.com/sv/blog/local-seo-2026-what-still-moves-the-needle/
- Ranktracker, SEO för entreprenörer: https://www.ranktracker.com/sv/blog/construction-contractors-seo/
- Fixing "Duplicate, Google chose different canonical": https://rightblogger.com/blog/canonical-errors
- Reco, badrum i Göteborg: https://www.reco.se/kategori/badrum/g%C3%B6teborg/1
- Hitta.se, badrumsrenovering Göteborg: https://www.hitta.se/badrumsrenovering+g%C3%B6teborg/f%C3%B6retag/2
