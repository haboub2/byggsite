/* ===== NordBygg admin ===== */
(function () {
  "use strict";

  const TOKEN_KEY = "nordbygg.admin.token";
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let content = null;
  let gallery = [];

  const $ = (id) => document.getElementById(id);

  /* ---- API helpers ---- */
  function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    if (token) options.headers.Authorization = "Bearer " + token;
    return fetch(path, options).then(function (res) {
      if (res.status === 401) { logout(); throw new Error("Sessionen har gått ut. Logga in igen."); }
      return res.json().then(function (data) {
        if (!res.ok || data.ok === false) throw new Error(data.error || "Något gick fel.");
        return data;
      });
    });
  }

  /* ---- Auth ---- */
  function showLogin() { $("loginScreen").hidden = false; $("adminApp").hidden = true; $("saveBar").hidden = true; }
  function showApp() { $("loginScreen").hidden = true; $("adminApp").hidden = false; $("saveBar").hidden = false; }

  function logout() {
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const msg = $("loginMsg");
    msg.textContent = "";
    msg.className = "msg";
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("loginPassword").value })
    })
      .then(function (res) {
        return res.json().catch(function () {
          throw new Error("Kunde inte nå servern. Öppna sidan via http://localhost:3000/admin (kör 'npm start' först).");
        });
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "Fel lösenord.");
        token = data.token;
        localStorage.setItem(TOKEN_KEY, token);
        $("loginPassword").value = "";
        boot();
      })
      .catch(function (err) {
        msg.textContent = err.message === "Failed to fetch"
          ? "Kunde inte nå servern. Öppna sidan via http://localhost:3000/admin (kör 'npm start' först)."
          : err.message;
        msg.className = "msg error";
      });
  });

  $("logoutBtn").addEventListener("click", function () {
    api("/api/admin/logout", { method: "POST" }).catch(function () {});
    logout();
  });

  /* ---- Tabs ---- */
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      const name = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t === tab); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.dataset.panel === name); });
      // Hide save bar on the gallery tab (gallery saves instantly)
      $("saveBar").hidden = name === "gallery";
    });
  });

  /* ---- Load + populate ---- */
  function boot() {
    showApp();
    api("/api/content").then(function (data) {
      content = data.content || {};
      gallery = data.gallery || [];
      populate();
      renderServices();
      renderGallery();
    }).catch(function (err) {
      setSaveStatus(err.message, "error");
    });
  }

  function populate() {
    $("f-brand").value = content.brand || "";
    const h = content.hero || {};
    $("f-hero-eyebrow").value = h.eyebrow || "";
    $("f-hero-title").value = h.titleHtml || "";
    $("f-hero-lead").value = h.lead || "";
    const stats = h.stats || [];
    for (let i = 0; i < 3; i++) {
      $("f-stat-" + i + "-value").value = (stats[i] && stats[i].value) || "";
      $("f-stat-" + i + "-label").value = (stats[i] && stats[i].label) || "";
    }
    const c = content.contact || {};
    $("f-person").value = c.person || "";
    $("f-hours").value = c.hours || "";
    $("f-phone").value = c.phone || "";
    $("f-phoneDisplay").value = c.phoneDisplay || "";
    $("f-email").value = c.email || "";
    $("f-address").value = c.address || "";
  }

  /* ---- Services editor ---- */
  function renderServices() {
    const list = $("servicesList");
    const services = content.services || [];
    list.innerHTML = "";
    services.forEach(function (s, i) {
      const row = document.createElement("div");
      row.className = "service-row";
      row.innerHTML =
        '<div class="sr-head"><strong>Tjänst ' + (i + 1) + '</strong>' +
          '<button type="button" class="btn btn-danger btn-sm" data-remove="' + i + '">Ta bort</button></div>' +
        '<div class="field"><label>Titel</label><input type="text" data-field="title" value="' + attr(s.title) + '" /></div>' +
        '<div class="field"><label>Beskrivning</label><textarea data-field="desc" rows="2">' + esc(s.desc) + '</textarea></div>' +
        '<details class="icon-field"><summary>SVG-ikon (avancerat)</summary>' +
          '<div class="field"><textarea data-field="icon" rows="2">' + esc(s.icon) + '</textarea>' +
          '<small class="hint">SVG path-element, t.ex. &lt;path d="…"/&gt;. Lämna som det är om du är osäker.</small></div></details>';
      list.appendChild(row);
    });

    list.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        collectServices();
        content.services.splice(Number(btn.dataset.remove), 1);
        renderServices();
      });
    });
  }

  function collectServices() {
    const rows = $("servicesList").querySelectorAll(".service-row");
    content.services = Array.prototype.map.call(rows, function (row) {
      return {
        title: row.querySelector('[data-field="title"]').value.trim(),
        desc: row.querySelector('[data-field="desc"]').value.trim(),
        icon: row.querySelector('[data-field="icon"]').value.trim()
      };
    }).filter(function (s) { return s.title || s.desc; });
  }

  $("addServiceBtn").addEventListener("click", function () {
    collectServices();
    content.services = content.services || [];
    content.services.push({ title: "Ny tjänst", desc: "Beskrivning…", icon: '<circle cx="12" cy="12" r="9"/>' });
    renderServices();
  });

  /* ---- Save content ---- */
  $("saveBtn").addEventListener("click", function () {
    collectServices();
    const next = {
      brand: $("f-brand").value.trim(),
      hero: {
        eyebrow: $("f-hero-eyebrow").value.trim(),
        titleHtml: $("f-hero-title").value.trim(),
        lead: $("f-hero-lead").value.trim(),
        stats: [0, 1, 2].map(function (i) {
          return { value: $("f-stat-" + i + "-value").value.trim(), label: $("f-stat-" + i + "-label").value.trim() };
        })
      },
      services: content.services || [],
      contact: {
        person: $("f-person").value.trim(),
        hours: $("f-hours").value.trim(),
        phone: $("f-phone").value.trim(),
        phoneDisplay: $("f-phoneDisplay").value.trim(),
        email: $("f-email").value.trim(),
        address: $("f-address").value.trim()
      }
    };

    const btn = $("saveBtn");
    btn.disabled = true;
    setSaveStatus("Sparar…", "");
    api("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: next })
    })
      .then(function (data) { content = data.content; setSaveStatus("Sparat! Ändringarna är live.", "success"); })
      .catch(function (err) { setSaveStatus(err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  function setSaveStatus(text, kind) {
    const el = $("saveStatus");
    el.textContent = text;
    el.className = "save-status" + (kind ? " " + kind : "");
  }

  /* ---- Gallery ---- */
  function renderGallery() {
    const wrap = $("galleryAdmin");
    if (!gallery.length) { wrap.innerHTML = '<p class="muted">Inga bilder ännu.</p>'; return; }
    wrap.innerHTML = "";
    gallery.forEach(function (item) {
      const el = document.createElement("div");
      el.className = "ga-item";
      el.innerHTML =
        '<img src="' + attr(item.url) + '" alt="' + attr(item.caption) + '" />' +
        '<div class="ga-body">' +
          '<input type="text" value="' + attr(item.caption) + '" data-caption />' +
          '<div class="ga-actions">' +
            '<button type="button" class="btn btn-ghost" data-save>Spara text</button>' +
            '<button type="button" class="btn btn-danger" data-del>Ta bort</button>' +
          '</div>' +
        '</div>';
      el.querySelector("[data-save]").addEventListener("click", function () {
        const caption = el.querySelector("[data-caption]").value;
        api("/api/admin/gallery/" + item.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caption: caption })
        }).then(function (data) { gallery = data.gallery; uploadMsg("Bildtext sparad.", "success"); })
          .catch(function (err) { uploadMsg(err.message, "error"); });
      });
      el.querySelector("[data-del]").addEventListener("click", function () {
        if (!confirm("Ta bort den här bilden?")) return;
        api("/api/admin/gallery/" + item.id, { method: "DELETE" })
          .then(function (data) { gallery = data.gallery; renderGallery(); })
          .catch(function (err) { uploadMsg(err.message, "error"); });
      });
      wrap.appendChild(el);
    });
  }

  function uploadFiles(files) {
    files = Array.prototype.slice.call(files).filter(function (f) { return f.type.indexOf("image/") === 0; });
    if (!files.length) return;
    const fd = new FormData();
    files.forEach(function (f) { fd.append("photos", f); });
    uploadMsg("Laddar upp…", "");
    api("/api/admin/gallery", { method: "POST", body: fd })
      .then(function (data) { gallery = data.gallery; renderGallery(); uploadMsg(data.added.length + " bild(er) uppladdade.", "success"); })
      .catch(function (err) { uploadMsg(err.message, "error"); });
  }

  function uploadMsg(text, kind) {
    const el = $("uploadMsg");
    el.textContent = text;
    el.className = "msg" + (kind ? " " + kind : "");
  }

  const dz = $("dropzone");
  const input = $("photoInput");
  input.addEventListener("change", function () { uploadFiles(input.files); input.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("dragover"); });
  });
  dz.addEventListener("drop", function (e) { if (e.dataTransfer) uploadFiles(e.dataTransfer.files); });

  /* ---- Utils ---- */
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function attr(v) { return esc(v).replace(/"/g, "&quot;"); }

  /* ---- Start ---- */
  if (token) boot(); else showLogin();
})();
