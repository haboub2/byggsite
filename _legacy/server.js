import express from "express";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import multer from "multer";
import compression from "compression";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const GALLERY_FILE = path.join(DATA_DIR, "gallery.json");

const app = express();
const PORT = process.env.PORT || 3000;
const MAIL_TO = process.env.MAIL_TO || "info@byggly.se";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

// ---- Ensure folders exist ----
for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---- Default content (seed on first run) ----
const DEFAULT_CONTENT = {
  brand: "Byggly 01",
  hero: {
    eyebrow: "Experter på bygg & renovering",
    titleHtml: 'Vi bygger, renoverar & <span class="hl">förvandlar</span> ditt hem',
    lead: "Från totalrenoveringar till badrum, kök och tillbyggnader — Byggly levererar hantverk du kan lita på, i tid och inom budget.",
    stats: [
      { value: "15+", label: "Års erfarenhet" },
      { value: "500+", label: "Genomförda projekt" },
      { value: "4,9★", label: "Kundbetyg" }
    ]
  },
  services: [
    { title: "Totalrenovering", desc: "Kompletta renoveringar av hus och lägenheter, skötta från rivning till sista detaljen.", icon: '<path d="M2 20h20"/><path d="M4 20V8l8-5 8 5v12"/><path d="M9 20v-7h6v7"/>' },
    { title: "Badrum", desc: "Tätskikt, kakel, VVS och moderna inredningar för ett badrum byggt för att hålla.", icon: '<path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z"/><path d="M6 12V5a2 2 0 0 1 2-2 2 2 0 0 1 2 2"/><path d="M9 5h2"/>' },
    { title: "Kök", desc: "Skräddarsydd köksdesign och montering — snickerier, bänkskivor, belysning och vitvaror.", icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M7 6h.01M11 6h.01"/>' },
    { title: "Tillbyggnad", desc: "Skapa mer yta och värde med tillbyggnader, inredda vindar och öppna planlösningar.", icon: '<path d="M3 21h18"/><path d="M5 21V11l5-4 5 4"/><path d="M14 21V8l6-4v17"/>' },
    { title: "Takarbeten", desc: "Nya tak, reparationer och tätning som håller din fastighet skyddad året runt.", icon: '<path d="m2 12 10-8 10 8"/><path d="M4 10v10h16V10"/><path d="M9 20v-6h6v6"/>' },
    { title: "Golvläggning", desc: "Trä, laminat, klinker och vinyl — fackmannamässigt avjämnat och lagt för perfekt finish.", icon: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>' },
    { title: "Måleri & Puts", desc: "Släta väggar och skarp, hållbar målning inomhus och utomhus med förstklassiga material.", icon: '<path d="M19 11V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4h16z"/><path d="M19 7h2v4a2 2 0 0 1-2 2h-6v3"/><rect x="10" y="16" width="4" height="5" rx="1"/>' },
    { title: "El & VVS", desc: "Certifierade elektriker och rörmokare för säkra, standardenliga installationer och uppgraderingar.", icon: '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>' },
    { title: "Projektledning", desc: "En kontaktperson som samordnar yrkesgrupper, tidplaner och budget — så slipper du.", icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' }
  ],
  contact: {
    person: "Mohamed Al Haboub",
    phone: "+46793049737",
    phoneDisplay: "079-304 97 37",
    email: "info@byggly.se",
    address: "Montörgatan 7, 302 62 Halmstad",
    hours: "Mån–Fre, 07:00–16:00"
  }
};

// ---- JSON store helpers ----
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
if (!fs.existsSync(CONTENT_FILE)) writeJson(CONTENT_FILE, DEFAULT_CONTENT);
if (!fs.existsSync(GALLERY_FILE)) writeJson(GALLERY_FILE, []);

// ---- Middleware ----
app.use(compression()); // gzip responses → faster loads / better Core Web Vitals
app.use(express.json({ limit: "200kb" }));

// Cache policy: always revalidate HTML/JS/CSS (so no stale code); cache media long.
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/admin" || /\.(html|js|css)$/.test(req.path)) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  } else if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=2592000"); // 30 days
  }
  next();
});

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));

// Dynamic sitemap with image entries so gallery photos get indexed by Google.
app.get("/sitemap.xml", (req, res) => {
  const base = process.env.SITE_URL || "https://byggly.se";
  const gallery = readJson(GALLERY_FILE, []);
  const today = new Date().toISOString().slice(0, 10);
  const images = gallery
    .map((g) => `    <image:image><image:loc>${base}${g.url}</image:loc>` +
      (g.caption ? `<image:caption>${escapeXml(g.caption)}</image:caption>` : "") +
      `</image:image>`)
    .join("\n");
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `  <url>\n    <loc>${base}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n${images ? images + "\n" : ""}  </url>\n` +
    `</urlset>\n`
  );
});

app.use(express.static(__dirname));
app.use("/uploads", express.static(UPLOAD_DIR));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "För många förfrågningar. Försök igen senare." }
});
app.use("/api/", limiter);

// ===== Auth (simple in-memory token sessions) =====
const activeTokens = new Set();

app.post("/api/admin/login", (req, res) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  // constant-time-ish comparison
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) {
    return res.status(401).json({ ok: false, error: "Fel lösenord." });
  }
  const token = crypto.randomBytes(24).toString("hex");
  activeTokens.add(token);
  res.json({ ok: true, token });
});

app.post("/api/admin/logout", requireAuth, (req, res) => {
  activeTokens.delete(req.token);
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ ok: false, error: "Ej inloggad. Logga in igen." });
  }
  req.token = token;
  next();
}

// ===== Public content =====
app.get("/api/content", (req, res) => {
  res.json({
    ok: true,
    content: readJson(CONTENT_FILE, DEFAULT_CONTENT),
    gallery: readJson(GALLERY_FILE, [])
  });
});

// ===== Admin: update content =====
app.put("/api/admin/content", requireAuth, (req, res) => {
  const incoming = req.body && req.body.content;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ ok: false, error: "Ogiltigt innehåll." });
  }
  // Merge over existing so partial saves are safe
  const current = readJson(CONTENT_FILE, DEFAULT_CONTENT);
  const merged = { ...current, ...incoming };
  writeJson(CONTENT_FILE, merged);
  res.json({ ok: true, content: merged });
});

// ===== Admin: gallery =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
    cb(null, "img_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex") + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/"))
});

app.post("/api/admin/gallery", requireAuth, upload.array("photos", 12), (req, res) => {
  const gallery = readJson(GALLERY_FILE, []);
  const added = (req.files || []).map((f) => ({
    id: path.parse(f.filename).name,
    url: "/uploads/" + f.filename,
    caption: path.parse(f.originalname).name
  }));
  const next = [...added, ...gallery];
  writeJson(GALLERY_FILE, next);
  res.json({ ok: true, added, gallery: next });
});

app.patch("/api/admin/gallery/:id", requireAuth, (req, res) => {
  const gallery = readJson(GALLERY_FILE, []);
  const item = gallery.find((g) => g.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Bilden hittades inte." });
  item.caption = typeof req.body.caption === "string" ? req.body.caption.trim() : item.caption;
  writeJson(GALLERY_FILE, gallery);
  res.json({ ok: true, gallery });
});

app.delete("/api/admin/gallery/:id", requireAuth, (req, res) => {
  const gallery = readJson(GALLERY_FILE, []);
  const item = gallery.find((g) => g.id === req.params.id);
  if (item) {
    const filePath = path.join(__dirname, item.url.replace(/^\//, ""));
    fs.promises.unlink(filePath).catch(() => {});
  }
  const next = gallery.filter((g) => g.id !== req.params.id);
  writeJson(GALLERY_FILE, next);
  res.json({ ok: true, gallery: next });
});

// ===== Mail transport =====
function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE) === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
const transporter = createTransport();

const isEmail = (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function escapeXml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap"><strong>${esc(
    label
  )}</strong></td><td style="padding:6px 0;color:#14161a">${esc(value).replace(/\n/g, "<br>")}</td></tr>`;
}

async function sendMail({ subject, replyTo, fields, kind }) {
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto">
      <div style="background:#24624d;padding:18px 22px;border-radius:12px 12px 0 0">
        <h2 style="margin:0;color:#ffffff;font-size:18px">Byggly — ny ${kind}</h2>
      </div>
      <div style="border:1px solid #e7e8ec;border-top:none;border-radius:0 0 12px 12px;padding:22px">
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${fields.map((f) => row(f.label, f.value)).join("")}
        </table>
      </div>
      <p style="color:#9aa0ab;font-size:12px;margin-top:14px">Skickat från byggly-webbplatsen den ${new Date().toLocaleString(
        "sv-SE"
      )}.</p>
    </div>`;
  const text = fields.filter((f) => f.value).map((f) => `${f.label}: ${f.value}`).join("\n");
  return transporter.sendMail({
    from: `"Byggly webbformulär" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: MAIL_TO,
    replyTo: replyTo || undefined,
    subject,
    text,
    html
  });
}

function mailGuard(res) {
  if (!transporter) {
    res.status(503).json({
      ok: false,
      error: "E-posttjänsten är inte konfigurerad ännu. Lägg in SMTP-uppgifter i .env (se .env.example)."
    });
    return false;
  }
  return true;
}

app.post("/api/contact", async (req, res) => {
  const name = clean(req.body.name);
  const email = clean(req.body.email);
  const subject = clean(req.body.subject);
  const message = clean(req.body.message);
  if (!name || !isEmail(email) || !message) {
    return res.status(400).json({ ok: false, error: "Fyll i namn, en giltig e-post och meddelande." });
  }
  if (!mailGuard(res)) return;
  try {
    await sendMail({
      kind: "kontaktförfrågan",
      subject: `Kontakt: ${subject || name}`,
      replyTo: email,
      fields: [
        { label: "Namn", value: name },
        { label: "E-post", value: email },
        { label: "Ämne", value: subject },
        { label: "Meddelande", value: message }
      ]
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Contact mail error:", err.message);
    res.status(500).json({ ok: false, error: "Kunde inte skicka meddelandet. Försök igen senare." });
  }
});

app.post("/api/offer", async (req, res) => {
  const name = clean(req.body.name);
  const phone = clean(req.body.phone);
  const email = clean(req.body.email);
  const projectType = clean(req.body.projectType);
  const budget = clean(req.body.budget);
  const timeline = clean(req.body.timeline);
  const message = clean(req.body.message);
  if (!name || !phone || !isEmail(email) || !projectType || !message) {
    return res.status(400).json({ ok: false, error: "Fyll i alla obligatoriska fält med giltiga uppgifter." });
  }
  if (!mailGuard(res)) return;
  try {
    await sendMail({
      kind: "offertförfrågan",
      subject: `Offertförfrågan: ${projectType} — ${name}`,
      replyTo: email,
      fields: [
        { label: "Namn", value: name },
        { label: "Telefon", value: phone },
        { label: "E-post", value: email },
        { label: "Typ av projekt", value: projectType },
        { label: "Budget", value: budget },
        { label: "Önskad start", value: timeline },
        { label: "Beskrivning", value: message }
      ]
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Offer mail error:", err.message);
    res.status(500).json({ ok: false, error: "Kunde inte skicka förfrågan. Försök igen senare." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mailConfigured: Boolean(transporter), mailTo: MAIL_TO });
});

// Multer / generic error handler
app.use((err, req, res, next) => {
  if (err) {
    console.error("Error:", err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Byggly körs på http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  console.log(`E-post skickas till: ${MAIL_TO}`);
  if (ADMIN_PASSWORD === "admin") {
    console.warn("⚠  Admin-lösenordet är standardvärdet 'admin'. Sätt ADMIN_PASSWORD i .env!");
  }
  if (!transporter) {
    console.warn("⚠  SMTP är inte konfigurerat — formulär returnerar 503 tills .env är ifylld.");
  }
});
