// Renders the portfolio from data/profile.json.
// All content is inserted with textContent / DOM APIs, so nothing in the
// JSON can inject markup into the page.

(function () {
  "use strict";

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------- tiny DOM helper ----------
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false || c === "") continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  const has = (v) => Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "";

  function safeUrl(url) {
    if (!has(url)) return null;
    try {
      const u = new URL(url, location.href);
      return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.href : null;
    } catch { return null; }
  }

  // ---------- dates ----------
  // Accepts "2021", "2021-03", "Mar 2021", "March 2021". Returns {y, m|null} or null.
  function parseDate(s) {
    if (!has(s)) return null;
    s = String(s).trim();
    let m = s.match(/^(\d{4})(?:-(\d{1,2}))?/);
    if (m) return { y: +m[1], m: m[2] ? +m[2] - 1 : null };
    m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(?:\d{1,2},\s*)?(\d{4})$/);
    if (m) {
      const idx = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
      return { y: +m[2], m: idx >= 0 ? idx : null };
    }
    return null;
  }

  function fmtDate(s) {
    const d = parseDate(s);
    if (!d) return has(s) ? String(s) : "";
    return d.m == null ? String(d.y) : `${MONTHS[d.m]} ${d.y}`;
  }

  function fmtRange(start, end, { duration = false } = {}) {
    const a = fmtDate(start);
    const b = has(end) ? fmtDate(end) : (has(start) ? "Present" : "");
    let out = a && b ? `${a} – ${b}` : a || b;
    if (duration) {
      const len = fmtDuration(start, end);
      if (len) out += ` · ${len}`;
    }
    return out;
  }

  function fmtDuration(start, end) {
    const a = parseDate(start);
    if (!a || a.m == null) return "";
    let b = parseDate(end);
    if (!b) { const now = new Date(); b = { y: now.getFullYear(), m: now.getMonth() }; }
    if (b.m == null) return "";
    const months = (b.y - a.y) * 12 + (b.m - a.m) + 1; // inclusive, like LinkedIn
    if (months <= 0) return "";
    const y = Math.floor(months / 12), mo = months % 12;
    const parts = [];
    if (y) parts.push(`${y} yr${y > 1 ? "s" : ""}`);
    if (mo) parts.push(`${mo} mo${mo > 1 ? "s" : ""}`);
    return parts.join(" ");
  }

  // ---------- rich-ish text ----------
  // Blank lines split paragraphs; lines starting with •, -, * or – become bullets.
  function prose(text, cls) {
    const box = h("div", { class: "prose" + (cls ? " " + cls : "") });
    if (!has(text)) return box;
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    let para = [], list = null;
    const flushPara = () => { if (para.length) { box.append(h("p", null, para.join(" "))); para = []; } };
    const flushList = () => { if (list) { box.append(list); list = null; } };
    for (const raw of lines) {
      const line = raw.trim();
      const bullet = line.match(/^[•\-*–·▪]\s*(.+)$/);
      if (!line) { flushPara(); flushList(); }
      else if (bullet) { flushPara(); (list ||= h("ul")).append(h("li", null, bullet[1])); }
      else { flushList(); para.push(line); }
    }
    flushPara(); flushList();
    return box;
  }

  function initials(name) {
    return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  }

  // ---------- sections ----------
  function section(id, title, ...content) {
    return h("section", { class: "section", id }, h("h2", null, title), ...content);
  }

  function renderHero(p) {
    const hero = document.getElementById("hero");
    hero.removeAttribute("aria-busy");
    hero.replaceChildren();

    const avatarSrc = safeUrl(p.avatar);
    hero.append(avatarSrc
      ? h("img", { class: "avatar", src: avatarSrc, alt: p.name || "", width: 112, height: 112 })
      : h("div", { class: "avatar", "aria-hidden": "true" }, initials(p.name)));

    const links = (p.links || [])
      .map((l) => ({ ...l, href: safeUrl(l.url) }))
      .filter((l) => l.href)
      .map((l) => h("a", { class: "btn", href: l.href, target: "_blank", rel: "noopener" }, l.label || new URL(l.href).hostname));

    const email = has(p.email) ? h("a", { class: "btn primary", href: "mailto:" + p.email }, "Email me") : null;
    const resume = safeUrl(p.resume) ? h("a", { class: "btn", href: safeUrl(p.resume), target: "_blank", rel: "noopener" }, "Résumé") : null;

    hero.append(h("div", { class: "hero-text" },
      h("h1", null, p.name),
      has(p.headline) && h("p", { class: "headline" }, p.headline),
      has(p.location) && h("p", { class: "location" }, "📍 ", p.location),
      (email || resume || links.length) && h("div", { class: "links" }, email, resume, links),
    ));
  }

  function renderExperience(items) {
    // Group consecutive roles at the same company, LinkedIn-style.
    const groups = [];
    for (const job of items) {
      const last = groups[groups.length - 1];
      if (last && has(job.company) && last.company === job.company) last.roles.push(job);
      else groups.push({ company: job.company, roles: [job] });
    }
    return groups.map((g) => {
      const first = g.roles[g.roles.length - 1], latest = g.roles[0];
      const meta = g.roles.length > 1
        ? fmtDuration(first.start, latest.end)
        : (latest.location || "");
      return h("div", { class: "company" },
        h("h3", { class: "company-name" }, g.company || "Independent"),
        has(meta) && h("p", { class: "company-meta" }, meta),
        h("ul", { class: "roles" }, g.roles.map((r) => h("li", { class: "role" },
          h("p", { class: "role-title" }, r.title),
          h("p", { class: "role-dates" },
            fmtRange(r.start, r.end, { duration: true }),
            g.roles.length > 1 && has(r.location) ? ` · ${r.location}` : ""),
          has(r.description) && prose(r.description),
        ))),
      );
    });
  }

  function card({ title, meta, body, url, linkText }) {
    const href = safeUrl(url);
    const inner = [
      h("h3", null, title),
      has(meta) && h("p", { class: "meta" }, meta),
      has(body) && prose(body),
      href && h("span", { class: "arrow" }, (linkText || "View") + " →"),
    ];
    return href
      ? h("a", { class: "card", href, target: "_blank", rel: "noopener" }, inner)
      : h("div", { class: "card" }, inner);
  }

  function render(p) {
    document.title = p.name + (has(p.headline) ? ` — ${p.headline}` : "");
    document.getElementById("brand").textContent = p.name;
    const desc = document.querySelector('meta[name="description"]');
    if (has(p.headline)) desc.setAttribute("content", `${p.name} — ${p.headline}`);

    renderHero(p);

    const out = [];
    if (has(p.summary)) out.push(section("about", "About", prose(p.summary, "about")));
    if (has(p.experience)) out.push(section("experience", "Experience", renderExperience(p.experience)));
    if (has(p.projects)) out.push(section("projects", "Projects", h("div", { class: "cards two" },
      p.projects.map((x) => card({ title: x.title, meta: fmtRange(x.start, x.end), body: x.description, url: x.url })))));
    if (has(p.education)) out.push(section("education", "Education", h("div", { class: "cards" },
      p.education.map((e) => card({
        title: e.school,
        meta: [e.degree, fmtRange(e.start, e.end)].filter(has).join(" · "),
        body: [e.notes, e.activities].filter(has).join("\n\n"),
      })))));
    if (has(p.certifications)) out.push(section("certifications", "Certifications", h("div", { class: "cards two" },
      p.certifications.map((c) => card({
        title: c.name,
        meta: [c.authority, fmtDate(c.start)].filter(has).join(" · "),
        url: c.url, linkText: "Credential",
      })))));
    if (has(p.skills)) out.push(section("skills", "Skills", h("ul", { class: "chips" },
      p.skills.map((s) => h("li", { class: "chip" }, s)))));
    if (has(p.languages)) out.push(section("languages", "Languages", h("ul", { class: "chips" },
      p.languages.map((l) => h("li", { class: "chip" }, l.name, has(l.proficiency) && h("small", null, l.proficiency))))));
    const linkedin = (p.links || []).find((l) => /linkedin\.com/i.test(l.url || "") && safeUrl(l.url));
    if (has(p.email) || linkedin) {
      out.push(section("contact", "Contact", h("div", { class: "contact" },
        h("p", null, p.contactBlurb || "The best way to reach me is by email or on LinkedIn."),
        h("div", { class: "links" },
          has(p.email) && h("a", { class: "btn primary", href: "mailto:" + p.email }, p.email),
          linkedin && h("a", { class: "btn", href: safeUrl(linkedin.url), target: "_blank", rel: "noopener" }, "LinkedIn"),
        ),
      )));
    }
    document.getElementById("sections").replaceChildren(...out);

    document.getElementById("nav").replaceChildren(...out
      .filter((s) => ["about", "experience", "projects", "education", "skills", "contact"].includes(s.id))
      .map((s) => h("a", { href: "#" + s.id }, s.querySelector("h2").textContent)));

    document.getElementById("footer").textContent = `© ${new Date().getFullYear()} ${p.name}`;
  }

  fetch("data/profile.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch((err) => {
      console.error(err);
      const hero = document.getElementById("hero");
      hero.removeAttribute("aria-busy");
      hero.replaceChildren(h("p", { class: "error" },
        "Couldn't load profile data. If you opened this file directly, serve the folder instead: ",
        h("code", null, "python3 -m http.server -d site")));
    });
})();
