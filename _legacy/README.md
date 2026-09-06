# Byggly — bygg & renovering

Modern Swedish construction/renovation website with a working backend that emails
contact and offer-request submissions to **info@byggly.se** (`MAIL_TO`).

## What's included
- `index.html`, `styles.css`, `script.js` — the public website (Swedish, Nordic-green accent)
- `admin.html`, `admin.css`, `admin.js` — the admin panel at **/admin**
- `server.js` — Node/Express backend:
  - `POST /api/contact` / `POST /api/offer` — forms, emailed to `MAIL_TO`
  - `GET /api/content` — live site content (read by the public site)
  - `POST /api/admin/login`, `PUT /api/admin/content`, gallery upload/delete (password-protected)
- The site content (brand, hero text, services, contact details) and the photo
  gallery are stored on the server in `data/` + `uploads/`, so edits are live for
  **all** visitors.

## Admin panel
Go to **http://localhost:3000/admin** and log in with `ADMIN_PASSWORD` (set it in `.env`).
From there you can edit, in real time:
- Company name
- Hero heading, intro text and the three stats
- Services (add / edit / remove)
- Contact details (person, phone, email, address, hours)
- The photo gallery (upload, rename, delete)

Changes are saved to the server and appear immediately on the public site on next load.

## Setup

1. **Install Node.js 18+** (https://nodejs.org) if you don't have it.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure email + admin password.** Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set:
   - `ADMIN_PASSWORD` — your password for the `/admin` panel (change it!)
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (see the file for Gmail / Outlook
     examples). The recipient defaults to `info@byggly.se` (override with `MAIL_TO`).

   > **Tip:** For Gmail you must create an *App Password* (Google Account →
   > Security → 2-Step Verification → App passwords) and use that as `SMTP_PASS`.

4. **Run the server:**
   ```bash
   npm start
   ```
   Open http://localhost:3000

## Notes
- Submissions arrive as nicely formatted emails. The sender's email is set as the
  `Reply-To`, so you can reply directly from your inbox.
- Until `.env` has valid SMTP credentials, the forms return a clear error and no
  mail is sent (the rest of the site still works).
- Gallery photos are stored on the server (`uploads/`) and shown to every visitor.
- The site must be run via `npm start` (not by opening `index.html` directly) for
  the admin panel and live content to work, since they need the backend.

## SEO

The site ships with professional technical SEO already built in:
- Keyword-rich, localized `<title>` and meta description (Halmstad + services)
- Open Graph + Twitter cards (`og-image.svg`) for nice link previews
- **Structured data (JSON-LD):** `GeneralContractor` (local business, with services, contact point, payment, opening hours), `BreadcrumbList`, `WebSite`, and `FAQPage`
- `robots.txt`, dynamic `/sitemap.xml` (auto-includes gallery photos as image entries), `favicon.svg`, `site.webmanifest`
- Deferred JS with scroll reveals, hero parallax tilt, floating cards, and a subtle pointer glow (respects `prefers-reduced-motion`)
- Geo meta tags, canonical URL, semantic HTML, visible FAQ section
- The admin page is `noindex` so it stays out of search results

### ⚠️ Before going live — confirm the domain
Everything currently points to `https://byggly.se`. If the final domain differs,
search-and-replace it in these files (or set `SITE_URL`, which drives
`sitemap.xml`):
- `index.html` (canonical, og:url, og:image, twitter:image, JSON-LD `url`/`image`)
- `robots.txt` (Sitemap line)
- `.env` / `render.yaml` (`SITE_URL`)
- `site.webmanifest` (if you add absolute URLs)

### Off-site steps (this is what actually drives local ranking)
Code alone won't put you at #1 — these do the heavy lifting for a local contractor:
1. **Create a free [Google Business Profile](https://www.google.com/business/)** for
   Byggly with the exact same name, address (Montörgatan 7, 302 62 Halmstad) and
   phone (079-304 97 37). This is the #1 factor for showing up in local "byggfirma Halmstad" searches.
2. **Verify the site in [Google Search Console](https://search.google.com/search-console)**
   and submit `sitemap.xml`.
3. **Collect Google reviews** from happy customers.
4. **Get listed** on hitta.se, eniro.se, allabolag.se and relevant Swedish trade
   directories (consistent name/address/phone everywhere).
5. Add real project photos and text over time — fresh, original content ranks better.

> A note on expectations: no developer can *guarantee* a #1 ranking. The technical
> SEO here makes you fully eligible and competitive; the off-site steps above plus
> time are what move you up the results.

## Deploying
Repository: **https://github.com/haboub2/byggsite**

Any Node host works (Render, Railway, Fly.io, a VPS, etc.). Set the same
environment variables there and run `npm start`.

**Render (easiest from GitHub):**
1. Go to [render.com](https://render.com) → New → Blueprint → connect `haboub2/byggsite`
2. Set `ADMIN_PASSWORD`, `SMTP_*`, and `SITE_URL` in the dashboard
3. Deploy — the included `render.yaml` handles the rest

**Manual deploy:**
```bash
git clone https://github.com/haboub2/byggsite.git
cd byggsite
cp .env.example .env   # fill in SMTP + admin password
npm install
npm start
```
