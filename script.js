/* ===== NordBygg — interaktioner & animationer ===== */
(function () {
  "use strict";

  var motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var pointerFine = window.matchMedia("(pointer: fine)").matches;
  var revealObserver = null;

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ===== Content from server ===== */
  function applyContent(content) {
    if (!content) return;

    if (content.brand) {
      document.querySelectorAll(".logo-text").forEach(function (el) {
        el.textContent = content.brand;
      });
    }

    if (content.hero) {
      var h = content.hero;
      setText("heroEyebrow", h.eyebrow);
      setHtml("heroTitle", h.titleHtml);
      setText("heroLead", h.lead);
      if (Array.isArray(h.stats)) {
        var stats = document.getElementById("heroStats");
        if (stats) {
          stats.innerHTML = h.stats.map(function (s) {
            return "<li><strong>" + escapeHtml(s.value) + "</strong><span>" + escapeHtml(s.label) + "</span></li>";
          }).join("");
        }
      }
    }

    if (Array.isArray(content.services)) renderServices(content.services);

    if (content.contact) {
      var c = content.contact;
      bindAll("[data-person]", function (el) { el.textContent = c.person || ""; });
      bindAll("[data-address]", function (el) { el.textContent = c.address || ""; });
      bindAll("[data-hours]", function (el) { el.textContent = c.hours || ""; });
      bindAll("[data-phone-link]", function (el) { if (c.phone) el.setAttribute("href", "tel:" + c.phone.replace(/\s/g, "")); });
      bindAll("[data-phone-text]", function (el) { if (c.phoneDisplay) el.textContent = c.phoneDisplay; });
      bindAll("[data-email]", function (el) {
        if (!c.email) return;
        if (el.tagName === "A") el.setAttribute("href", "mailto:" + c.email);
        el.textContent = c.email;
      });
    }
  }

  function setText(id, value) { var el = document.getElementById(id); if (el && value != null) el.textContent = value; }
  function setHtml(id, value) { var el = document.getElementById(id); if (el && value != null) el.innerHTML = value; }
  function bindAll(sel, fn) { document.querySelectorAll(sel).forEach(fn); }

  function renderServices(services) {
    var grid = document.getElementById("servicesGrid");
    if (!grid) return;
    grid.innerHTML = services.map(function (s) {
      return (
        '<article class="service-card reveal">' +
          '<div class="service-icon">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (s.icon || "") + '</svg>' +
          '</div>' +
          '<h3>' + escapeHtml(s.title) + '</h3>' +
          '<p>' + escapeHtml(s.desc) + '</p>' +
        '</article>'
      );
    }).join("");
    observeRevealElements(grid.querySelectorAll(".reveal"));
  }

  function renderGallery(items) {
    var grid = document.getElementById("galleryGrid");
    var empty = document.getElementById("galleryEmpty");
    if (!grid) return;
    items = Array.isArray(items) ? items : [];
    grid.innerHTML = items.map(function (item) {
      var caption = item.caption ? '<figcaption class="gi-caption">' + escapeHtml(item.caption) + "</figcaption>" : "";
      return (
        '<figure class="gallery-item reveal reveal-scale">' +
          '<img src="' + escapeHtml(item.url) + '" alt="' + escapeHtml(item.caption || "Projektbild") + '" loading="lazy" />' +
          caption +
        "</figure>"
      );
    }).join("");
    if (empty) empty.hidden = items.length > 0;

    if (!grid._lightboxBound) {
      grid._lightboxBound = true;
      grid.addEventListener("click", function (e) {
        var img = e.target.closest("img");
        if (img) openLightbox(img.src);
      });
    }

    observeRevealElements(grid.querySelectorAll(".reveal"));
  }

  /* ---- Lightbox ---- */
  function openLightbox(src) {
    var box = document.getElementById("lightbox");
    var img = document.getElementById("lightboxImg");
    if (!box || !img) return;
    img.src = src;
    box.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function initLightbox() {
    var box = document.getElementById("lightbox");
    var close = document.getElementById("lightboxClose");
    if (!box) return;
    function hide() { box.hidden = true; document.body.style.overflow = ""; }
    if (close) close.addEventListener("click", hide);
    box.addEventListener("click", function (e) { if (e.target === box) hide(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) hide(); });
  }

  /* ---- Mobilmeny ---- */
  function initNav() {
    var toggle = document.getElementById("navToggle");
    var nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---- Skugga på header vid scroll ---- */
  function initHeaderScroll() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- Scroll reveal ---- */
  function getRevealObserver() {
    if (revealObserver) return revealObserver;
    if (!("IntersectionObserver" in window)) return null;
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    return revealObserver;
  }

  function observeRevealElements(nodes) {
    var io = getRevealObserver();
    if (!io || !motionOk) {
      (nodes || []).forEach(function (el) { el.classList.add("in"); });
      return;
    }
    (nodes || []).forEach(function (el) {
      if (!el.classList.contains("in")) io.observe(el);
    });
  }

  function initHeroEntrance() {
    if (!motionOk) {
      document.querySelectorAll(".reveal-hero").forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var heroes = document.querySelectorAll(".reveal-hero");
    heroes.forEach(function (el, i) {
      setTimeout(function () { el.classList.add("in"); }, 120 + i * 140);
    });
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal:not(.reveal-hero)");
    if (!motionOk || !items.length) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    observeRevealElements(items);
  }

  /* ---- Hero mus-parallax (tilt) ---- */
  function initHeroTilt() {
    if (!motionOk || !pointerFine) return;
    var visual = document.querySelector("[data-tilt]");
    if (!visual) return;

    visual.setAttribute("data-tilt-active", "");
    var cards = visual.querySelectorAll("[data-depth]");
    var raf = 0;
    var targetX = 0;
    var targetY = 0;

    function applyTilt() {
      raf = 0;
      cards.forEach(function (card) {
        var depth = Number(card.getAttribute("data-depth")) || 12;
        var tx = targetX * depth * 0.04;
        var ty = targetY * depth * 0.04;
        card.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
      });
    }

    visual.addEventListener("mousemove", function (e) {
      var rect = visual.getBoundingClientRect();
      targetX = (e.clientX - rect.left) / rect.width - 0.5;
      targetY = (e.clientY - rect.top) / rect.height - 0.5;
      if (!raf) raf = requestAnimationFrame(applyTilt);
    });

    visual.addEventListener("mouseleave", function () {
      targetX = 0;
      targetY = 0;
      if (!raf) raf = requestAnimationFrame(applyTilt);
    });
  }

  /* ---- Mus-glow (endast pekare) ---- */
  function initCursorGlow() {
    if (!motionOk || !pointerFine) return;
    var glow = document.getElementById("cursorGlow");
    if (!glow) return;

    document.body.classList.add("has-cursor-glow");
    var raf = 0;
    var x = 0;
    var y = 0;

    function paint() {
      raf = 0;
      document.documentElement.style.setProperty("--mouse-x", x + "px");
      document.documentElement.style.setProperty("--mouse-y", y + "px");
    }

    document.addEventListener("mousemove", function (e) {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
  }

  /* ---- Subtil magnetism på knappar ---- */
  function initMagneticButtons() {
    if (!motionOk || !pointerFine) return;
    document.querySelectorAll(".btn-primary, .nav-cta").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var rect = btn.getBoundingClientRect();
        var dx = (e.clientX - rect.left - rect.width / 2) * 0.12;
        var dy = (e.clientY - rect.top - rect.height / 2) * 0.12;
        btn.style.transform = "translate(" + dx + "px," + dy + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
      });
    });
  }

  /* ===== Formulärvalidering & inskick ===== */
  function setError(field, msg) {
    field.classList.toggle("invalid", !!msg);
    var out = field.querySelector("[data-error]");
    if (out) out.textContent = msg || "";
  }

  function validateField(input) {
    var field = input.closest(".field");
    if (!field) return true;
    var value = (input.value || "").trim();
    if (input.required && !value) { setError(field, "Detta fält är obligatoriskt."); return false; }
    if (input.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setError(field, "Ange en giltig e-postadress."); return false; }
    if (input.type === "tel" && value && !/^[+\d][\d\s().-]{5,}$/.test(value)) { setError(field, "Ange ett giltigt telefonnummer."); return false; }
    setError(field, "");
    return true;
  }

  function initForm(formId, endpoint, successMsg) {
    var form = document.getElementById(formId);
    if (!form) return;
    var feedback = form.querySelector("[data-form-feedback]");
    var inputs = Array.prototype.slice.call(form.querySelectorAll("input, select, textarea"));

    inputs.forEach(function (input) {
      input.addEventListener("blur", function () { validateField(input); });
      input.addEventListener("input", function () {
        var field = input.closest(".field");
        if (field && field.classList.contains("invalid")) validateField(input);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true;
      var firstInvalid = null;
      inputs.forEach(function (input) {
        if (input.type === "checkbox") {
          if (input.required && !input.checked) { ok = false; if (!firstInvalid) firstInvalid = input; }
          return;
        }
        if (!validateField(input)) { ok = false; if (!firstInvalid) firstInvalid = input; }
      });
      if (!ok) {
        if (feedback) { feedback.textContent = "Rätta de markerade fälten."; feedback.className = "form-feedback error"; }
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      var originalText = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "Skickar…"; }
      if (feedback) { feedback.textContent = ""; feedback.className = "form-feedback"; }

      var payload = Object.fromEntries(new FormData(form));
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok && data.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error((result.data && result.data.error) || "Något gick fel.");
          form.reset();
          inputs.forEach(function (input) { var field = input.closest(".field"); if (field) setError(field, ""); });
          if (feedback) { feedback.textContent = successMsg; feedback.className = "form-feedback success"; }
        })
        .catch(function (err) {
          if (feedback) { feedback.textContent = err.message || "Kunde inte skicka just nu. Försök igen senare."; feedback.className = "form-feedback error"; }
        })
        .finally(function () { if (btn) { btn.disabled = false; btn.textContent = originalText; } });
    });
  }

  function initYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = new Date().getFullYear();
  }

  function bootAnimations() {
    initHeroEntrance();
    initReveal();
    initHeroTilt();
    initCursorGlow();
    initMagneticButtons();
  }

  /* ---- Bootstrap ---- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initHeaderScroll();
    initLightbox();
    initForm("offerForm", "/api/offer", "Tack! Vi har tagit emot din förfrågan och återkommer med en offert inom 24 timmar.");
    initForm("contactForm", "/api/contact", "Tack för ditt meddelande — vi hör av oss inom kort.");
    initYear();

    fetch("/api/content")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.ok) {
          applyContent(data.content);
          renderGallery(data.gallery);
        }
        bootAnimations();
      })
      .catch(function () {
        bootAnimations();
      });
  });
})();
