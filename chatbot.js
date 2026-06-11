/* Chat bot - Portfolio assistant
 * Dynamically reads the portfolio DOM on load and answers questions
 * about Ajay using only the live page content. No hardcoded data.
 */
(function () {
  "use strict";

  // ---------- DOM scaffolding ----------
  const root = document.createElement("div");
  root.id = "aj-chatbot";
  root.innerHTML = `
    <button id="aj-chatbot-toggle" aria-label="Open chat">💬</button>
    <div id="aj-chatbot-window" role="dialog" aria-label="Chat bot">
      <div class="aj-header">
        <div class="aj-header-title">
          <div class="aj-avatar">🤖</div>
          <div>
            <h3>Chat bot</h3>
            <div class="aj-status">● Online</div>
          </div>
        </div>
        <div class="aj-header-actions">
          <button id="aj-min" title="Minimize" aria-label="Minimize">—</button>
          <button id="aj-close" title="Close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="aj-body" id="aj-body"></div>
      <div class="aj-quick" id="aj-quick">
        <button data-q="Show me your projects">🚀 Projects</button>
        <button data-q="What are your skills?">💻 Skills</button>
        <button data-q="What is your education?">🎓 Education</button>
        <button data-q="How can I contact you?">📞 Contact</button>
        <button data-q="Tell me about Ajay">👤 About Ajay</button>
      </div>
      <form class="aj-input-area" id="aj-form">
        <input id="aj-input" type="text" placeholder="Ask me anything about Ajay..." autocomplete="off" />
        <button id="aj-send" type="submit" aria-label="Send">➤</button>
      </form>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  const win = $("aj-chatbot-window");
  const body = $("aj-body");
  const input = $("aj-input");

  // ---------- Portfolio knowledge extraction ----------
  // Scans the live DOM for sections and builds a structured KB.
  const KB = { about: [], skills: [], projects: [], education: [], experience: [], contact: { emails: [], links: [] }, social: [], sections: [], name: "Ajay", title: "" };

  function textOf(el) { return (el && el.textContent || "").replace(/\s+/g, " ").trim(); }

  function extract() {
    // Try to detect name & title from hero/h1/h2
    const hero = document.querySelector(".hero, header, #hero, .header");
    const h1 = document.querySelector("h1, h2");
    if (h1) {
      const t = textOf(h1);
      const m = t.match(/(?:I[' ]?m|I am|Hello,?\s*I[' ]?m)\s+([A-Z][\w. ]+)/i);
      if (m) KB.name = m[1].trim();
    }
    if (hero) {
      const tagline = hero.querySelector("p");
      if (tagline) KB.title = textOf(tagline);
    }

    // Generic section collector by id or heading
    const sectionSelectors = ["section", "div.section", "article", "main > div"];
    const seen = new Set();
    const sections = [];
    sectionSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(s => {
        if (seen.has(s)) return;
        seen.add(s);
        const heading = s.querySelector("h1,h2,h3");
        const id = (s.id || "").toLowerCase();
        const headText = textOf(heading).toLowerCase();
        const key = id || headText;
        if (!key) return;
        sections.push({ el: s, id, heading: textOf(heading), key });
      });
    });
    KB.sections = sections;

    sections.forEach(({ el, key, heading }) => {
      const k = (key + " " + heading).toLowerCase();
      if (/about/.test(k)) {
        el.querySelectorAll("p").forEach(p => { const t = textOf(p); if (t) KB.about.push(t); });
      } else if (/skill|tech|stack/.test(k)) {
        // category cards
        const cats = el.querySelectorAll(".skill-category, .skill, .category, li, .card");
        if (cats.length) {
          cats.forEach(c => {
            const h = c.querySelector("h3,h4,strong,.title");
            const items = c.querySelector(".skills-list, p, span");
            const name = textOf(h) || textOf(c).split(":")[0];
            const list = textOf(items) || textOf(c);
            if (name || list) KB.skills.push({ category: name, items: list });
          });
        } else {
          KB.skills.push({ category: "Skills", items: textOf(el).replace(/^skills\s*/i, "") });
        }
      } else if (/project|work|portfolio/.test(k)) {
        const cards = el.querySelectorAll(".project-card, .project, .card, article");
        const list = cards.length ? cards : el.querySelectorAll("li");
        list.forEach(c => {
          const h = c.querySelector("h3,h4,h2,strong,.title");
          const p = c.querySelector("p, .desc, .description");
          const a = c.querySelector("a[href]");
          const title = textOf(h);
          const desc = textOf(p);
          if (title || desc) KB.projects.push({ title, description: desc, link: a ? a.href : "" });
        });
      } else if (/education|academic|qualifi/.test(k)) {
        const items = el.querySelectorAll("li, .card, .item, p");
        items.forEach(i => { const t = textOf(i); if (t) KB.education.push(t); });
      } else if (/experience|work history|employment|intern/.test(k)) {
        const items = el.querySelectorAll("li, .card, .item, .experience, p");
        items.forEach(i => { const t = textOf(i); if (t) KB.experience.push(t); });
      } else if (/contact|connect|reach|hire/.test(k)) {
        el.querySelectorAll("a[href]").forEach(a => {
          const href = a.getAttribute("href") || "";
          if (href.startsWith("mailto:")) KB.contact.emails.push(href.replace("mailto:", ""));
          else if (href.startsWith("tel:")) KB.contact.links.push({ label: "Phone", url: href });
          else if (href.startsWith("http")) KB.contact.links.push({ label: textOf(a) || href, url: href });
        });
        el.querySelectorAll("p").forEach(p => { const t = textOf(p); if (t) KB.contact.links.push({ label: t, url: "" }); });
      }
    });

    // Sweep entire page for emails / social links not in a contact section
    document.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("mailto:")) {
        const e = href.replace("mailto:", "");
        if (!KB.contact.emails.includes(e)) KB.contact.emails.push(e);
      }
      const social = /(github|linkedin|twitter|x\.com|instagram|facebook|youtube|scratch|medium|dev\.to|stackoverflow|gitlab|bitbucket|behance|dribbble)\.com/i;
      if (social.test(href) && !KB.social.find(s => s.url === href)) {
        const m = href.match(social);
        KB.social.push({ name: m[1].replace(/\..*/, ""), url: href });
      }
    });
  }

  // ---------- Intent + semantic matching ----------
  const STOP = new Set("a an the is are am was were be been being do does did have has had i you your my of in on at to for and or but with about tell me show what which who whose when where how can could would should please".split(" "));
  function tokens(s) { return (s || "").toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w && !STOP.has(w)); }
  function score(query, text) {
    const q = tokens(query), t = (text || "").toLowerCase();
    let s = 0;
    q.forEach(w => { if (t.includes(w)) s += 1 + (w.length > 4 ? 0.5 : 0); });
    return s;
  }

  const INTENTS = [
    { name: "about",     patterns: /\b(about|who|bio|background|introduce|yourself|tell me about (you|ajay|him)|summary)\b/i },
    { name: "skills",    patterns: /\b(skill|tech|technology|technologies|stack|language|languages|tool|tools|framework|know|good at|proficien|expert)\b/i },
    { name: "projects",  patterns: /\b(project|projects|built|build|made|work|works|portfolio|app|apps|game|games|created|develop)\b/i },
    { name: "education", patterns: /\b(educat|degree|study|studying|school|college|university|qualific|academic|grade|cgpa|gpa|b\.?tech|btech|bachelor|master)\b/i },
    { name: "experience",patterns: /\b(experience|intern|internship|job|work history|employ|career|company)\b/i },
    { name: "contact",   patterns: /\b(contact|email|mail|reach|phone|hire|connect|message|get in touch)\b/i },
    { name: "social",    patterns: /\b(github|linkedin|twitter|instagram|scratch|social|profile|link|links)\b/i },
    { name: "greeting",  patterns: /^(hi|hello|hey|yo|hola|namaste|greetings|sup)\b/i },
    { name: "thanks",    patterns: /\b(thanks|thank you|thx|appreciate)\b/i },
  ];
  function detectIntent(q) {
    for (const i of INTENTS) if (i.patterns.test(q)) return i.name;
    return null;
  }

  // ---------- Response generation ----------
  function fmtProjects(list) {
    if (!list.length) return null;
    let html = `Here are ${KB.name.split(" ")[0]}'s projects:<ul>`;
    list.forEach(p => {
      html += `<li><strong>${p.title || "Untitled"}</strong>` +
              (p.description ? ` — ${p.description}` : "") +
              (p.link ? ` <a href="${p.link}" target="_blank" rel="noreferrer">View</a>` : "") + `</li>`;
    });
    return html + `</ul>`;
  }

  function findProject(q) {
    const qt = tokens(q).join(" ");
    let best = null, bestScore = 0;
    KB.projects.forEach(p => {
      const s = score(q, p.title + " " + p.description);
      if (s > bestScore) { bestScore = s; best = p; }
    });
    return bestScore >= 1 ? best : null;
  }

  function answer(query) {
    const q = query.trim();
    if (!q) return { html: "Please ask me something about Ajay 🙂" };

    // Project-specific lookup first (handles "Tell me about Chakra Simulator")
    if (/\b(project|simulator|clone|game|maze|calculator|matrix|chakra|geometry|dash)\b/i.test(q)) {
      const p = findProject(q);
      if (p && /\b(tell|explain|what|describe|about|details?)\b/i.test(q)) {
        return {
          html: `<strong>${p.title}</strong><br>${p.description || "No description available."}` +
                (p.link ? `<br><a href="${p.link}" target="_blank" rel="noreferrer">🔗 View Project</a>` : ""),
          followups: ["Show me other projects", "What skills did this use?", "How can I contact Ajay?"]
        };
      }
    }

    const intent = detectIntent(q);

    switch (intent) {
      case "greeting":
        return { html: `Hey there! 👋 What would you like to know about ${KB.name.split(" ")[0]}?`,
                 followups: ["Tell me about Ajay", "Show projects", "What are his skills?"] };
      case "thanks":
        return { html: "You're welcome! 😊 Anything else?", followups: ["Show projects", "Contact info"] };
      case "about": {
        if (!KB.about.length) break;
        return { html: KB.about.join("<br><br>"),
                 followups: ["What are his skills?", "Show projects", "Contact info"] };
      }
      case "skills": {
        if (!KB.skills.length) break;
        let html = `<strong>${KB.name.split(" ")[0]}'s skills:</strong><ul>`;
        KB.skills.forEach(s => { html += `<li><strong>${s.category}:</strong> ${s.items}</li>`; });
        return { html: html + "</ul>", followups: ["Show projects", "Education", "Contact info"] };
      }
      case "projects": {
        const html = fmtProjects(KB.projects);
        if (!html) break;
        return { html, followups: ["Tell me about Chakra Simulator", "What skills does he use?", "Contact info"] };
      }
      case "education": {
        if (!KB.education.length) {
          // fallback to about (often mentions B.Tech)
          const eduLine = KB.about.find(a => /b\.?tech|bachelor|degree|college|university|student/i.test(a));
          if (eduLine) return { html: eduLine, followups: ["What is he studying?", "Skills", "Projects"] };
          break;
        }
        return { html: "<strong>Education:</strong><ul>" + KB.education.map(e => `<li>${e}</li>`).join("") + "</ul>",
                 followups: ["Skills", "Projects", "Contact"] };
      }
      case "experience": {
        if (!KB.experience.length) break;
        return { html: "<strong>Experience:</strong><ul>" + KB.experience.map(e => `<li>${e}</li>`).join("") + "</ul>" };
      }
      case "contact": {
        const parts = [];
        if (KB.contact.emails.length) parts.push("📧 " + KB.contact.emails.map(e => `<a href="mailto:${e}">${e}</a>`).join(", "));
        if (KB.social.length) parts.push(KB.social.map(s => `<a href="${s.url}" target="_blank" rel="noreferrer">${s.name}</a>`).join(" • "));
        if (!parts.length) break;
        return { html: "Here's how you can reach Ajay:<br>" + parts.join("<br>"),
                 followups: ["Show projects", "What are his skills?"] };
      }
      case "social": {
        if (!KB.social.length && !KB.contact.emails.length) break;
        const social = KB.social.map(s => `<a href="${s.url}" target="_blank" rel="noreferrer">${s.name}</a>`).join(" • ");
        return { html: (social || "") + (KB.contact.emails.length ? `<br>📧 ${KB.contact.emails.join(", ")}` : "") };
      }
    }

    // Semantic fallback: rank against all KB chunks
    const corpus = [];
    KB.about.forEach(a => corpus.push({ text: a, render: () => a }));
    KB.skills.forEach(s => corpus.push({ text: s.category + " " + s.items, render: () => `<strong>${s.category}:</strong> ${s.items}` }));
    KB.projects.forEach(p => corpus.push({ text: p.title + " " + p.description,
      render: () => `<strong>${p.title}</strong><br>${p.description}` + (p.link ? `<br><a href="${p.link}" target="_blank" rel="noreferrer">View</a>` : "") }));
    KB.education.forEach(e => corpus.push({ text: e, render: () => e }));
    KB.experience.forEach(e => corpus.push({ text: e, render: () => e }));

    let best = null, bestS = 0;
    corpus.forEach(c => { const s = score(q, c.text); if (s > bestS) { bestS = s; best = c; } });
    if (best && bestS >= 1.5) {
      return { html: best.render(), followups: ["Show projects", "Skills", "Contact"] };
    }

    return { html: "I couldn't find that information in Ajay's portfolio. Try asking about projects, skills, education, experience, or contact details.",
             followups: ["Show projects", "Skills", "Contact"] };
  }

  // ---------- UI logic ----------
  function now() { const d = new Date(); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  function addMsg(html, who, followups) {
    const m = document.createElement("div");
    m.className = "aj-msg " + who;
    m.innerHTML = html + `<span class="aj-time">${now()}</span>`;
    if (followups && followups.length) {
      const fu = document.createElement("div");
      fu.className = "aj-followup";
      followups.forEach(f => {
        const b = document.createElement("button");
        b.textContent = f;
        b.onclick = () => handleUser(f);
        fu.appendChild(b);
      });
      m.appendChild(fu);
    }
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
  }
  function addTyping() {
    const m = document.createElement("div");
    m.className = "aj-msg bot"; m.id = "aj-typing-msg";
    m.innerHTML = `<div class="aj-typing"><span></span><span></span><span></span></div>`;
    body.appendChild(m); body.scrollTop = body.scrollHeight;
  }
  function removeTyping() { const t = $("aj-typing-msg"); if (t) t.remove(); }

  const history = [];
  function handleUser(text) {
    if (!text || !text.trim()) return;
    addMsg(escapeHtml(text), "user");
    history.push({ role: "user", text });
    addTyping();
    setTimeout(() => {
      removeTyping();
      const res = answer(text);
      addMsg(res.html, "bot", res.followups);
      history.push({ role: "bot", text: res.html });
    }, 450 + Math.random() * 350);
  }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // Events
  $("aj-chatbot-toggle").onclick = () => {
    win.classList.toggle("aj-open");
    win.classList.remove("aj-minimized");
    if (win.classList.contains("aj-open") && !body.children.length) {
      addMsg(`👋 May I help you?<br><br>I can answer questions about ${KB.name}, his projects, skills, education, experience, and contact information.`, "bot",
        ["Show projects", "What are his skills?", "Contact info"]);
    }
    if (win.classList.contains("aj-open")) setTimeout(() => input.focus(), 200);
  };
  $("aj-min").onclick = (e) => { e.stopPropagation(); win.classList.toggle("aj-minimized"); };
  $("aj-close").onclick = (e) => { e.stopPropagation(); win.classList.remove("aj-open"); };
  $("aj-form").onsubmit = (e) => { e.preventDefault(); const v = input.value; input.value = ""; handleUser(v); };
  document.querySelectorAll("#aj-quick button").forEach(b => b.onclick = () => handleUser(b.dataset.q));

  // Boot
  function boot() {
    extract();
    // Re-extract if the portfolio updates content dynamically
    const mo = new MutationObserver(() => { KB.about=[]; KB.skills=[]; KB.projects=[]; KB.education=[]; KB.experience=[]; KB.contact={emails:[],links:[]}; KB.social=[]; KB.sections=[]; extract(); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
