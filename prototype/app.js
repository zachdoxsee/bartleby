// bartleby: the page. The transcription itself lives in engine/ (engine.js and worker.js) and runs on the
// visitor's device; this file is the interface around it.

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const app = $(".app"), sprite = $("#sprite"), chat = $("#chat"), input = $("#link"), send = $("#send");
const bubble = $("#bubble"), tools = $("#tools"), meter = $("#meter"), meterText = $("#meter-text"), meterBar = $("#meter-bar");
const doc = $("#doc"), gutter = $("#gutter"), mirror = $("#mirror"), preview = $("#preview"), fmt = $("#fmt"), tablist = $("#tablist");

// His idle line is usually the first one; now and then (about one time in five each) one of the other two.
const IDLE = ["i suppose you have a link.", "a link. if you must.", "a link. if you insist."];
const LINES = {
  get idle() { const r = Math.random(); return IDLE[r < 0.6 ? 0 : r < 0.8 ? 1 : 2]; },
  sigh: "ugh. fine.",
  listening: "go on. i'm listening.",
  typing: "writing it down. every word.",
  done: "there. word for word.",
  error: "can't. that one's private. next.",
};

/* ---------- welcome tab ---------- */
const WELCOME = [
  ["h", "bartleby"], ["", ""],
  ["", "any video to text."], ["", ""],
  ["c", "## how"],
  ["", "1. copy a video link"],
  ["", "2. press paste. he sighs."],
  ["", "3. the transcript lands in transcript.md"],
  ["", "4. edit it here, then download the .md"], ["", ""],
  ["c", "## also"],
  ["", "- press + for a blank page and just write"],
  ["", "- the bar above the page formats for you; no markdown needed"],
  ["", "- double-click a tab to rename it"], ["", ""],
  ["c", "## what"],
  ["", "- instagram reels and youtube by link; tiktok and anything else by file"],
  ["", "- runs on your device. nothing is uploaded."],
  ["", "- no ads, no signup, no tracking. he would prefer not to."],
  ["", "- free and open source."], ["", ""],
  ["c", "psst: he answers to more than links. try typing help."],
];
for (const [cls, text] of WELCOME) $("#welcome").appendChild(el("div", cls, text));
asciiRain($("#rain"), { density: 0.35 });

/* ---------- documents and tabs ----------
   welcome.md is fixed. transcript.md appears when he writes one. "+" adds blank pages. Everything except
   the welcome page is kept in this browser's storage so a reload doesn't lose it. */
const tabs = [{ id: "welcome", name: "welcome.md", fixed: true }];
const docs = {};
let tab = "welcome", untitled = 0, made = 0, previewing = false, audioTab = null;
const segs = {};                                   // page id -> [[start, end, text]], for subtitles; not kept across reloads
const isTranscript = (t) => t && (t.kind === "transcript" || t.id === "transcript");

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem("bartleby-docs", JSON.stringify({ tabs: tabs.filter((t) => !t.fixed), docs, untitled, made })); } catch {}
  }, 300);
}
try {
  const kept = JSON.parse(localStorage.getItem("bartleby-docs") || "null");
  if (kept) { tabs.push(...kept.tabs); Object.assign(docs, kept.docs); untitled = kept.untitled || 0; made = kept.made || 0; }
} catch {}

function renderTabs() {
  tablist.textContent = "";
  for (const t of tabs) {
    const b = el("div");
    b.setAttribute("role", "tab");
    b.tabIndex = 0;
    b.setAttribute("aria-selected", String(t.id === tab));
    b.appendChild(el("span", "tab-name", t.name));
    b.onclick = () => showTab(t.id);
    b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showTab(t.id); } };
    if (!t.fixed) {
      b.title = "Double-click to rename";
      b.ondblclick = () => renameTab(t, b);
      const x = el("button", "tab-x", "x");
      x.type = "button";
      x.setAttribute("aria-label", `Close ${t.name}`);
      x.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
      b.appendChild(x);
    }
    tablist.appendChild(b);
    if (t.id === tab) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
function addTab(id, name, text = "") {
  if (!tabs.some((t) => t.id === id)) tabs.push({ id, name });
  docs[id] = text;
}
function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  tabs.splice(i, 1);
  delete docs[id];
  delete segs[id];
  if (audioTab === id) audioTab = null;
  if (tab === id) { tab = "welcome"; showTab(tabs[Math.max(0, i - 1)].id); } else renderTabs();
  applyMode();                                             // closing the last document returns to the start screen
  save();
}
function renameTab(t, node) {
  const field = el("input", "tab-name-input");
  field.value = t.name.replace(/\.md$/i, "");
  field.setAttribute("aria-label", "Tab name");
  node.querySelector(".tab-name").replaceWith(field);
  field.focus(); field.select();
  field.onclick = (e) => e.stopPropagation();
  let finished = false;
  const finish = (keep) => {                       // Enter or clicking away keeps the name; Escape drops it
    if (finished) return;
    finished = true;
    const name = field.value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\.md$/i, "");
    if (keep && name) t.name = name + ".md";
    renderTabs(); save();
  };
  field.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
  field.onblur = () => finish(true);
}
$("#new-tab").onclick = () => {
  const id = "u" + Date.now();
  addTab(id, `untitled-${++untitled}.md`);
  atStart = false;
  applyMode();
  showTab(id);
  doc.focus();
  save();
};

function showTab(id) {
  if (tab !== "welcome" && tab in docs) docs[tab] = doc.value;
  tab = id;
  renderTabs();
  const editing = id !== "welcome";
  $("#pane-welcome").hidden = editing;
  $("#pane-doc").hidden = !editing;
  tools.hidden = fmt.hidden = !editing;
  $("#insert-menu").hidden = true;
  $("#translate-btn").hidden = !(id === audioTab && Engine.canTranslate());
  toggleSave(false);
  if (editing) { doc.value = docs[id] ?? ""; setPreview(false); syncPaint(); syncGutter(); }
}

/* ---------- the editor: a textarea, with a hidden mirror that measures how tall each line is once wrapped,
   so the line numbers in the gutter stay beside the right line ---------- */
function syncGutter() {
  const lines = doc.value.split("\n");
  mirror.textContent = "";
  for (const l of lines) mirror.appendChild(el("div", "", l || " "));
  gutter.textContent = "";
  [...mirror.children].forEach((m, i) => { const g = el("div", "", String(i + 1)); g.style.height = m.offsetHeight + "px"; gutter.appendChild(g); });
  gutter.scrollTop = doc.scrollTop;
  const words = doc.value.trim() ? doc.value.trim().split(/\s+/).length : 0;
  $("#count").textContent = `${words} words`;
}
function setDoc(id, text, { follow = false } = {}) {
  docs[id] = text;
  if (tab !== id) return;
  doc.value = text;
  if (follow) doc.scrollTop = doc.scrollHeight;
  if (!preview.hidden) { preview.innerHTML = renderMarkdown(text); if (follow) preview.scrollTop = preview.scrollHeight; }
  syncGutter();
}
doc.addEventListener("input", () => { docs[tab] = doc.value; syncGutter(); save(); });
doc.addEventListener("scroll", () => { gutter.scrollTop = doc.scrollTop; });
new ResizeObserver(() => { if (tab !== "welcome") syncGutter(); }).observe(doc);

/* ---------- formatting: each button writes the Markdown, so nobody has to know the syntax ---------- */
function put(text, selStart, selEnd) {             // replaces the selection, keeping undo working where the browser allows
  doc.focus();
  if (!document.execCommand("insertText", false, text)) doc.setRangeText(text, doc.selectionStart, doc.selectionEnd, "end");
  if (selStart != null) doc.setSelectionRange(selStart, selEnd);
  doc.dispatchEvent(new Event("input"));
}
function wrap(before, after, placeholder) {        // **like this**, around the selection or a placeholder
  const s = doc.selectionStart, sel = doc.value.slice(s, doc.selectionEnd) || placeholder;
  put(before + sel + after, s + before.length, s + before.length + sel.length);
}
function eachLine(fn) {                            // rewrites every line the selection touches
  const v = doc.value, s = v.lastIndexOf("\n", doc.selectionStart - 1) + 1;
  let e = v.indexOf("\n", doc.selectionEnd); if (e < 0) e = v.length;
  const out = v.slice(s, e).split("\n").map(fn).join("\n");
  doc.setSelectionRange(s, e);
  put(out, s, s + out.length);
}
function block(text) {                             // drops a block on its own lines after the current line, never inside it
  let end = doc.value.indexOf("\n", doc.selectionEnd); if (end < 0) end = doc.value.length;
  doc.setSelectionRange(end, end);
  const before = doc.value.slice(0, end);
  const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  put(lead + text + "\n");
}
const bare = (l) => l.replace(/^\s*(#{1,6} |> |- \[[ x]\] |[-*] |\d+\. )/, "");
const FORMAT = {
  h1: () => eachLine((l) => "# " + bare(l)),
  h2: () => eachLine((l) => "## " + bare(l)),
  bold: () => wrap("**", "**", "bold text"),
  italic: () => wrap("*", "*", "italic text"),
  code: () => wrap("`", "`", "code"),
  ul: () => eachLine((l) => "- " + bare(l)),
  ol: () => eachLine((l, i) => `${i + 1}. ` + bare(l)),
  task: () => eachLine((l) => "- [ ] " + bare(l)),
  quote: () => eachLine((l) => "> " + bare(l)),
  link: () => wrap("[", "](https://)", "link text"),
  hr: () => block("---"),
};
for (const b of fmt.querySelectorAll("[data-f]")) b.onclick = () => { if (previewing) setPreview(false); FORMAT[b.dataset.f](); };
doc.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !doc.readOnly) { e.preventDefault(); return put("  "); }     // Tab indents instead of leaving the editor
  const f = (e.metaKey || e.ctrlKey) && { b: "bold", i: "italic", k: "link" }[e.key.toLowerCase()];
  if (f) { e.preventDefault(); FORMAT[f](); }
});

/* Insert menu: tables, checklists, and a few plain-text diagrams. The diagrams are our own, in the spirit of
   the ASCII figure components at mdxcn.dev; those are React components and can come in with the real build. */
const fence = (s) => "```text\n" + s + "\n```";
const INSERTS = [
  ["table", "markdown", "| column | column |\n| ------ | ------ |\n| cell   | cell   |"],
  ["checklist", "markdown", "- [ ] first thing\n- [ ] second thing"],
  ["callout", "markdown", "> [!NOTE]\n> the thing worth remembering."],
  ["collapsible", "markdown", "<details>\n<summary>more</summary>\n\nhidden until opened.\n\n</details>"],
  ["boxed note", "diagram", fence("┌────────────────────────────────┐\n│ key takeaway                   │\n└────────────────────────────────┘")],
  ["timeline", "diagram", fence("0:00 ──●── hook\n0:08 ──●── first point\n0:22 ──●── second point\n0:31 ──●── close")],
  ["bar chart", "diagram", fence("hook    ████████████  12\nscript  ███████        7\nedit    ███            3")],
  ["flow", "diagram", fence("[ idea ] ──▶ [ script ] ──▶ [ film ] ──▶ [ post ]")],
  ["today's date", "text", () => new Date().toISOString().slice(0, 10)],
  ["a quote", "from his list", () => { const q = QUOTES[qi++ % (QUOTES.length || 1)]; return q ? `> ${q.text}\n>\n> ${q.by}` : "> (no quotes loaded)"; }],
];
const menu = $("#insert-menu"), insertBtn = $("#insert-btn");
for (const [name, kind, content] of INSERTS) {
  const b = el("button", "", name);
  b.type = "button";
  b.appendChild(el("span", "", kind));
  b.onclick = () => { toggleMenu(false); if (previewing) setPreview(false); const text = typeof content === "function" ? content() : content; kind === "text" ? put(text) : block(text); };
  menu.appendChild(b);
}
function toggleMenu(open = menu.hidden) {
  menu.hidden = !open;
  insertBtn.setAttribute("aria-expanded", String(open));
  if (open) menu.style.left = Math.min(insertBtn.getBoundingClientRect().left - $(".editor").getBoundingClientRect().left, $(".editor").clientWidth - 262) + "px";
}
insertBtn.onclick = () => toggleMenu();

/* A small Markdown renderer for the preview. Text is escaped first, so nothing typed in the editor can
   become markup; only the tags written out below are ever produced. */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
// For a page that came from YouTube, the address of the video at a given second. Other sites have no such link.
function momentLink(seconds) {
  const t = tabs.find((x) => x.id === tab);
  if (!t || t.platform !== "youtube" || !t.source) return null;
  try { const u = new URL(t.source); u.searchParams.set("t", seconds + "s"); return u.href; } catch { return null; }
}
const stampLinks = (html) => html.replace(/^\[(?:(\d+):)?(\d+):(\d{2})\]/, (m, h, min, sec) => {
  const href = momentLink((+h || 0) * 3600 + +min * 60 + +sec);
  return href ? `<a class="ts" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Open the video at this moment">${m}</a>` : `<span class="ts">${m}</span>`;
});
function renderMarkdown(src) {
  const out = [];
  let list = null, para = [], code = null, table = null;
  const flush = () => {
    if (para.length) out.push(`<p>${para.map((l) => stampLinks(inline(l))).join("<br>")}</p>`); para = [];
    if (list) out.push(`</${list}>`); list = null;
    if (table) {
      const rows = table.filter((r) => !/^\|[\s:|-]+\|$/.test(r)).map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim())));
      out.push("<table>" + rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join("")}</tr>`).join("") + "</table>");
      table = null;
    }
  };
  for (const line of src.split("\n")) {
    if (code) { if (line.startsWith("```")) { out.push(`<pre>${esc(code.join("\n"))}</pre>`); code = null; } else code.push(line); continue; }
    let m;
    if (line.startsWith("```")) { flush(); code = []; }
    else if (/^\|.*\|$/.test(line.trim())) { if (!table) { flush(); table = []; } table.push(line.trim()); }
    else if (line.trim() === "---") { flush(); out.push("<hr>"); }
    else if (line.trim() === "<details>" || line.trim() === "</details>") { flush(); out.push(line.trim()); }
    else if ((m = line.trim().match(/^<summary>(.*)<\/summary>$/))) { flush(); out.push(`<summary>${inline(m[1])}</summary>`); }
    else if ((m = line.match(/^(#{1,3}) (.*)/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^> ?\[!(\w+)\]/))) { flush(); out.push(`<blockquote class="note"><strong>${esc(m[1].toLowerCase())}</strong></blockquote>`); }
    else if ((m = line.match(/^> ?(.*)/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if ((m = line.match(/^- \[([ x])\] (.*)/))) {
      if (para.length || table || (list && list !== "ul")) flush();
      if (!list) { list = "ul"; out.push("<ul>"); }
      out.push(`<li class="task">${m[1] === "x" ? "[x]" : "[ ]"} ${inline(m[2])}</li>`);
    }
    else if ((m = line.match(/^(?:[-*]|(\d+)\.) (.*)/))) {
      const kind = m[1] ? "ol" : "ul";
      if (para.length || table || (list && list !== kind)) flush();
      if (!list) { list = kind; out.push(`<${kind}>`); }
      out.push(`<li>${inline(m[2])}</li>`);
    }
    else if (!line.trim()) flush();
    else { if (list || table) flush(); para.push(line); }
  }
  if (code) out.push(`<pre>${esc(code.join("\n"))}</pre>`);
  flush();
  return out.join("\n");
}
// Shows the page as formatted text (on) or as the Markdown editor (off).
function paint(on) {
  doc.hidden = gutter.hidden = on;
  preview.hidden = !on;
  if (on) preview.innerHTML = renderMarkdown(doc.value);
}
// Pro: the preview button switches between the editor and the formatted page.
function setPreview(on) {
  previewing = on;
  $("#preview-btn").setAttribute("aria-pressed", String(on));
  $("#preview-btn").textContent = on ? "edit" : "preview";
  for (const b of document.querySelectorAll('[data-act="preview"]')) b.setAttribute("aria-pressed", String(on));
  paint(on);
}
// Simple: the page is always shown formatted, unless "edit text" (in the more sheet) was chosen.
let editPlain = false;
function syncPaint() { if (tab !== "welcome") paint(app.dataset.view === "simple" ? !editPlain : previewing); }
$("#preview-btn").onclick = () => setPreview(!previewing);

/* ---------- link panels: hovering an icon shows only its name (a CSS tooltip); clicking opens the panel.
   Click the icon again, click outside, press Escape or close to shut it. ---------- */
const flyBtns = [...document.querySelectorAll("[data-fly]")];
const flyouts = [...document.querySelectorAll(".flyout")];
const scrim = $("#scrim");
let openFly = null;
function showFly(id) {
  openFly = id;
  if (id === "pages") renderPages();
  if (id === "save") renderSaves($("#save-rows"));
  if (id === "sites") renderSites();
  if (id === "more") {
    $("#m-edit").hidden = app.dataset.view !== "simple";
    $("#m-edit .lbl").textContent = editPlain ? "show formatted" : "edit text";
    $("#m-translate").hidden = !(tab === audioTab && Engine.canTranslate());
    $("#m-share").hidden = !navigator.share;
  }
  for (const f of flyouts) f.hidden = f.id !== "fly-" + id;
  for (const b of flyBtns) b.setAttribute("aria-expanded", String(b.dataset.fly === id));
  scrim.hidden = !(id && app.dataset.view !== "pro");          // start and simple dim the page behind their sheets
}
for (const b of flyBtns) b.onclick = () => showFly(openFly === b.dataset.fly ? null : b.dataset.fly);
for (const f of flyouts) {
  f.querySelector(".x").onclick = () => showFly(null);
  const big = el("button", "btn sec close-big", "close");       // the large close button simple mode uses
  big.type = "button";
  big.onclick = () => showFly(null);
  f.appendChild(big);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { showFly(null); toggleMenu(false); } });
document.addEventListener("pointerdown", (e) => {
  if (openFly && !e.target.closest(".flyout, [data-fly], .dialog")) showFly(null);
  if (!menu.hidden && !e.target.closest("#insert-menu, #insert-btn")) toggleMenu(false);
  if (!saveMenu.hidden && !e.target.closest("#save-menu, #save-btn")) toggleSave(false);
});

/* ---------- simple and pro ----------
   Everyone starts on the same screen: bartleby and one big button. Two independent switches sit in the top bar:
   the moon turns the page dark, and "pro" swaps the plain result for the full editor once a transcript exists
   (tabs, formatting bar, preview, translate, more files). On the start screen pro only adds a small tag by the
   name and a faint drizzle behind him.
   data-theme and data-mode on .app are the switches; data-view is what is on screen: "start", "simple" or "pro". */
const modeBtn = $("#mode");
const themeBtn = $("#theme");
let mode = "simple", theme = "dark", atStart = false, tool = "transcribe";          // dark is the default; the moon switches to light
try { mode = localStorage.getItem("bartleby-mode") || "simple"; theme = localStorage.getItem("bartleby-theme") || "dark"; } catch {}
function applyMode() {
  // tabs[0] is the welcome page. Simple shows a result only when a page has words in it; pro shows the
  // editor as soon as any page exists. "new" (atStart) returns to the start screen without losing pages.
  const filled = tabs.filter((t) => !t.fixed && (docs[t.id] || "").trim());
  const view = atStart ? "start" : mode === "pro" ? (tabs.length > 1 ? "pro" : "start") : filled.length ? "simple" : "start";
  app.dataset.mode = mode;
  app.dataset.view = view;
  app.dataset.theme = theme;
  themeBtn.setAttribute("aria-pressed", String(theme === "dark"));
  themeBtn.querySelector(".ic")?.replaceWith(icon(theme === "dark" ? "moonfull" : "moon", 16));   // outline in light, filled in dark
  syncLook();
  modeBtn.setAttribute("aria-pressed", String(mode === "pro"));
  input.placeholder = view === "pro" ? "paste a link" : "or type a link here";
  showFly(null);
  $("#back").hidden = !(view === "start" && tabs.length > 1);
  if (view === "simple" && !(docs[tab] || "").trim()) showTab(([...filled].reverse().find(isTranscript) || filled[0]).id);
  if (view !== "start" && tool !== "transcribe") setToolState("transcribe");      // the other tools only live on the start screen
  syncPaint();
  if (tab !== "welcome") syncGutter();
}
modeBtn.onclick = () => { mode = mode === "pro" ? "simple" : "pro"; try { localStorage.setItem("bartleby-mode", mode); } catch {} applyMode(); };
themeBtn.onclick = () => { theme = theme === "dark" ? "light" : "dark"; try { localStorage.setItem("bartleby-theme", theme); } catch {} applyMode(); };
asciiRain($("#hero-rain"), { density: 0.3 });

/* ---------- what bartleby says and does ---------- */
const turns = new WeakMap();
async function type(node, text, ms = 16) {
  const id = (turns.get(node) || 0) + 1;
  turns.set(node, id);
  node.textContent = "";
  for (const ch of text) { if (turns.get(node) !== id) return; node.textContent += ch; await sleep(ms); }
}
function says(text) {
  const d = el("div", "him");
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return type(d, text);
}

/* The small label in his pane's header morphs between states using Torph (torph.lochie.me, MIT), loaded
   from a CDN at a pinned version. If it fails to load, the label just changes as plain text. */
const DOING = { idle: "waiting", sigh: "sighing", listening: "listening", typing: "writing", done: "done", error: "unmoved" };
const torph = import("https://esm.sh/torph@0.1.4").catch(() => null);
let doingMorph = null;
async function setDoing(text) {
  const lib = await torph, node = $("#doing");
  if (!lib?.TextMorph) { node.textContent = text; return; }
  doingMorph ??= new lib.TextMorph({ element: node, duration: 350 });
  doingMorph.update(text);
}
// What he was doing and saying the last time he was at rest (waiting, or done with a transcript). Dismissing
// an error puts both back exactly as they were.
let resting = { state: "idle", line: LINES.idle };
function mood(state, line = LINES[state]) {
  if (state === "idle" || state === "done") resting = { state, line };
  BT.set(sprite, state);
  setDoing(DOING[state]);
  return says(line);
}

/* ---------- quotes: speech bubbles from him while the transcript loads ---------- */
let QUOTES = [], qi = 0, qTimer = 0;
fetch("../brand/quotes.json").then((r) => r.json()).then((d) => { QUOTES = d.quotes.sort(() => Math.random() - 0.5); });
function showQuote() {
  if (!QUOTES.length) return;
  const q = QUOTES[qi++ % QUOTES.length];
  bubble.hidden = false;
  bubble.classList.add("off");
  setTimeout(() => {
    bubble.querySelector("blockquote").textContent = q.text;
    bubble.querySelector("figcaption").textContent = "// " + q.by;
    bubble.classList.remove("off");
  }, 220);
}
function startQuotes() { clearInterval(qTimer); showQuote(); qTimer = setInterval(showQuote, 2800); }
function stopQuotes() { clearInterval(qTimer); bubble.hidden = true; bubble.classList.add("off"); }

/* ---------- the run: sigh, listen (quotes fill the wait), write, done ---------- */
const stamp = (s) => Engine.clock(s);
const SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
let runId = 0, batchId = 0, spin = 0, lastTitle = "", batchNote = "";

// One quiet status line and a thin track under him: real stage names, real sizes, real progress.
function progress(text, pct) { meter.hidden = false; meterText.textContent = text; if (pct != null) meterBar.style.width = pct + "%"; }

// Writes text into a document a word at a time, as if he were typing it. The words are already known by
// then, so this is quick: it is there for the feel, not as a wait.
async function write(alive, id, head, blocks) {
  const total = blocks.reduce((n, b) => n + b.split(" ").length, 0);
  const pause = Math.max(4, Math.min(30, 2500 / total));
  let text = head, words = 0;
  doc.readOnly = true;
  for (const b of blocks) {
    for (const w of b.split(" ")) {
      text += w + " ";
      words++;
      setDoc(id, text, { follow: true });
      progress(`${SPIN[words % SPIN.length]} writing it down`, 90 + (words / total) * 10);
      await sleep(pause); if (!alive()) { doc.readOnly = false; return false; }
    }
    text = text.trimEnd() + "\n\n";
  }
  setDoc(id, text.trimEnd() + "\n", { follow: true });
  doc.readOnly = false;
  return true;
}

/* ---------- long recordings ----------
   Anything five minutes or longer gets a popup first, with the estimated time, and then a plainer waiting
   screen meant to sit in a background tab: a big percentage, the time left, and the tab title counting up.
   The estimate uses how fast this device has actually been (kept after each run), or a typical laptop's
   speed the first time. Once the job is going, the percentage and time left come from real progress. */
const RATES = { standard: 3.2, accurate: 1.4, ultra: 6 };           // seconds of audio per second of work, on one laptop
const engineName = () => stored("bartleby-engine") || "standard";
const rateFor = (name) => Number(stored("bartleby-rate-" + name)) || RATES[name];
const span = (s) => (s < 50 ? "under a minute" : s < 100 ? "about a minute" : `about ${Math.round(s / 60)} minutes`);
const BASE_TITLE = document.title;
let longJob = null, wake = null, answerLong = null;

function askLong({ seconds }) {
  const name = engineName(), measured = !!stored("bartleby-rate-" + name);
  $("#long-len").textContent = stamp(seconds);
  $("#long-est").textContent = span(seconds / rateFor(name)).replace("about ", "");
  $("#long-engine").textContent = name;
  $("#long-hint").textContent = (measured ? "based on how fast this device has been so far." : "a rough figure: this device hasn't done a long one yet.")
    + (name !== "ultra" && "gpu" in navigator ? ` ultra would take ${span(seconds / rateFor("ultra"))}.` : "");
  showFly(null);
  $("#long-dialog").hidden = false; scrim.hidden = false;
  $("#long-yes").focus();
  return new Promise((resolve) => { answerLong = (yes) => { answerLong = null; $("#long-dialog").hidden = true; scrim.hidden = true; resolve(yes); }; });
}
$("#long-yes").onclick = () => answerLong?.(true);
$("#long-no").onclick = () => answerLong?.(false);
scrim.addEventListener("click", () => answerLong?.(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") answerLong?.(false); });

function startLong(seconds) {
  longJob = { seconds, estimate: seconds / rateFor(engineName()) };
  stopQuotes();
  app.dataset.long = "1";
  $("#long").hidden = false;
  updateLong(undefined, 0);
  navigator.wakeLock?.request("screen").then((lock) => { wake = lock; }).catch(() => {});   // keeps a phone's screen on, where allowed
}
function updateLong(fraction, listening = 0) {
  // Before the first section is done there is no real progress, so lean on the estimate. After that, each
  // finished section fixes the real pace; between sections the figures move along at that pace.
  const real = fraction != null && fraction > 0;
  let pct, left;
  if (real) {
    if (fraction !== longJob.fraction) { longJob.fraction = fraction; longJob.at = listening; }
    const total = longJob.at / longJob.fraction;                       // how long the whole job takes at the measured pace
    const nextSection = Math.min(1, longJob.fraction + 0.9 * (120 / longJob.seconds));
    pct = Math.round(Math.min(listening / total, nextSection) * 100);
    left = Math.max(0, total - listening);
  } else {
    pct = Math.min(95, Math.round((listening / longJob.estimate) * 100));
    left = Math.max(0, longJob.estimate - listening);
  }
  $("#long-pct").textContent = pct + "%";
  $("#long-bar").style.width = pct + "%";
  $("#long-left").textContent = `${span(left)} left` + (real ? "" : " (estimate)");
  document.title = `${pct}% · bartleby`;
}
function endLong(finished) {
  if (!longJob) return;
  longJob = null;
  delete app.dataset.long;
  $("#long").hidden = true;
  wake?.release().catch(() => {}); wake = null;
  document.title = finished && document.hidden ? "done · bartleby" : BASE_TITLE;
  if (finished && document.hidden && window.Notification?.permission === "granted") new Notification("bartleby", { body: "your transcript is ready." });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && !longJob) document.title = BASE_TITLE; });
$("#long-notify").onclick = async (e) => {
  const label = e.currentTarget.querySelector(".lbl");
  if (!window.Notification) return (label.textContent = "this browser can't notify");
  const answer = await Notification.requestPermission();
  label.textContent = answer === "granted" ? "i'll tell you when it's done" : "notifications are blocked here";
};

/* ---------- when it goes wrong: say what actually happened ----------
   Every failure gets his one line, plus a card with three things: what happened, the likely reason, and what
   to do next. The raw technical detail is shown small underneath, so nothing is hidden.
   Where the fix is on our side, the card also says we are working on it (`note`). Failures that come from the
   post itself (private, deleted, pictures only) or from the visitor's own browser get no such promise. */
const WHY = {
  "no-fetcher": {
    says: "i can't fetch from that site yet. drop the video file on me instead.",
    title: "this copy can't download from video sites",
    text: "Fetching a link needs a helper service, and none is set up here. Files you drop or choose, and direct links to audio or video files, work without it.",
    note: "link fetching is being set up for this site.",
    acts: ["file"],
  },
  tiktok: {
    says: "tiktok wants a login now. save the video in the app, then drop the file on me.",
    title: "tiktok asked for a login",
    text: "TikTok now sends anyone who isn't signed in to a login page before it shows a video, so its links can't be fetched. In the TikTok app, use Share, then Save video, and give me that file.",
    note: "we're looking for a proper way to bring tiktok links back.",
    acts: ["file"],
  },
  empty: {
    says: "the site wouldn't hand that one over. try another, or drop the file on me.",
    title: "the site refused to send the audio",
    text: "The download opened and then closed with nothing in it. YouTube does this for many videos when the request doesn't come from a signed-in browser; short and older videos get through more often. Another link may work, or you can give me the video as a file.",
    note: "we're working on making these links reliable.",
    acts: ["file", "again"],
  },
  "no-video": {
    says: "that post is pictures. nothing to hear.",
    title: "there's no video in that post",
    text: "The link points to a post made of pictures, so there is no sound to transcribe.",
    acts: ["again"],
  },
  "no-audio": {
    says: "there's no sound in that i can read.",
    title: "the file has no audio i can read",
    text: "The file opened, but this browser couldn't decode an audio track from it. That happens with unusual formats, protected files, and videos with no sound. mp4, mov, mp3, m4a and wav are the safest.",
    note: "we're working on reading more kinds of file.",
    acts: ["file"],
  },
  "no-speech": {
    says: "nobody says anything in that one.",
    title: "no words were found",
    text: "The audio was read all the way through and no speech was recognised. Usually it's music only, silence, or speech in a different language from the one chosen in settings.",
    note: "we're working on detecting the language automatically, so this setting goes away.",
    acts: ["settings", "again"],
  },
  engine: {
    says: "my ears gave out. reload and try again.",
    title: "the listening engine failed",
    text: "The speech model couldn't load or run. The usual causes are an interrupted download, the device running out of memory on a long video, or the browser refusing the graphics card. Reloading the page fixes most of these. If you're on accurate or ultra, standard needs far less memory.",
    note: "we're working on making the engine lighter and sturdier on long videos.",
    acts: ["settings"],
  },
  clipboard: {
    says: "this browser won't let me read the clipboard. paste it in the box instead.",
    title: "the clipboard is off limits here",
    text: "Browsers only let a page read the clipboard if you allow it, and this one said no. Nothing is wrong with your link: click the box and paste it the usual way.",
    acts: [],
  },
  "not-link": {
    says: "that's not a link. i need a link.",
    title: "that didn't look like a link",
    text: "I look for a web address, like the one you get from Share, then Copy link. Check that the whole address was copied.",
    acts: [],
  },
};
// cobalt reports why a fetch failed as a code; these turn the common ones into plain words.
const FETCH_REASONS = [
  [/private/, "the post is private", "Only people the owner has approved can see it, so it can't be fetched."],
  [/\.age/, "the post is age-restricted", "The site only shows it to signed-in adults, so it can't be fetched without an account."],
  [/region/, "the post isn't available in this region", "The site blocks it where the fetch is made from."],
  [/\.live/, "that's a live stream", "Live streams can't be fetched while they're running. Try again once it's posted as a video."],
  [/too_long/, "the video is too long", "The fetcher has a length limit and this video is over it. A shorter clip, or the file itself, will work.", "we're working on raising the limit."],
  [/rate/, "too many requests", "The fetcher is being asked too often. Wait a minute and try again.", "we're working on more capacity."],
  [/login|session|token/, "the site wants a sign-in", "The site refuses this video to anyone who isn't signed in.", "we're working on making these links reliable."],
  [/link\.|service\./, "that site or link isn't supported", "The address isn't one the fetcher knows how to read. Check the supported list, or give me the file.", "we're adding and testing more sites."],
  [/unavailable/, "the post isn't available", "It may have been deleted or taken down."],
];
function explain(e, name = "") {
  const detail = e.message && e.message !== e.code ? `${e.code}: ${e.message}` : e.code || "";
  if (e.code === "fetch-failed" && /tiktok\.com/i.test(name)) return { ...WHY.tiktok, detail };
  if (e.code === "fetch-failed") {
    const hit = FETCH_REASONS.find(([re]) => re.test(e.message || ""));
    return hit
      ? { says: `can't. ${hit[1]}. next.`, title: hit[1], text: hit[2], note: hit[3], acts: ["file", "again"], detail }
      : { says: "can't get it. private, deleted, or blocked. next.", title: "the site didn't return the video",
          text: "The fetcher asked the site for this post and got nothing usable back. The post may be private or deleted, or the site may be turning away automated requests right now. If it plays in your browser, saving it and giving me the file will work.",
          note: "we're working on making fetches more reliable.", acts: ["file", "again"], detail };
  }
  return { ...(WHY[e.code] || WHY.engine), detail };
}
const WHY_ACTS = {
  file: ["choose a file", "file", () => picker.click()],
  again: ["another link", "link", () => { dismissWhy(); input.focus(); }],
  settings: ["open settings", "settings", () => showFly("settings")],
};
function showWhy(x) {
  $("#why-title").textContent = x.title;
  $("#why-text").textContent = x.text;
  $("#why-note").textContent = x.note || "";
  $("#why-detail").textContent = x.detail || "";
  $("#why-detail").hidden = !x.detail;
  // Compact: the title and what to do. The explanation folds under "why?", open from the start only in the
  // pro workspace on a wide screen, where his pane has the room.
  $("#why-more").open = app.dataset.view === "pro" && matchMedia("(min-width: 761px)").matches;
  const box = $("#why-acts");
  box.textContent = "";
  for (const key of x.acts || []) {
    const [label, ic, go] = WHY_ACTS[key];
    const b = el("button", "btn sec", label);
    b.type = "button";
    b.prepend(icon(ic, 14));
    b.onclick = go;
    box.appendChild(b);
  }
  $("#why").hidden = false;
  clearTimeout(whyTimer);
  whyTimer = setTimeout(dismissWhy, 15000);          // goes away on its own; hovering or touching the card holds it
}
let whyTimer = 0;
function hideWhy() { clearTimeout(whyTimer); $("#why").hidden = true; }
// Dismissing an error puts him back as he was before it: the card goes, and his line and pose return.
function dismissWhy() {
  if ($("#why").hidden) return;
  hideWhy();
  if (sprite.dataset.state === "error") { BT.set(sprite, resting.state); setDoing(DOING[resting.state]); says(resting.line); }
}
$("#why-x").onclick = dismissWhy;
$("#why").addEventListener("pointerenter", () => clearTimeout(whyTimer));
$("#why").addEventListener("pointerleave", () => { clearTimeout(whyTimer); whyTimer = setTimeout(dismissWhy, 6000); });
function failWith(e, name) {
  stopQuotes();
  meter.hidden = true;
  console.warn("bartleby:", e.code || "error", e.message);
  const x = explain(e, name);
  showWhy(x);
  return mood("error", x.says);
}

// source is a link (string) or a File. The stages and numbers shown are the engine's real ones.
// While anything is running the big button becomes "stop".
let active = 0;
function setBusy(on) {
  send.querySelector(".lbl").textContent = on ? "stop" : "paste link";
  send.querySelector(".ic")?.replaceWith(icon(on ? "close" : "paste"));
  send.classList.toggle("pri", !on); send.classList.toggle("sec", on);
  send.dataset.busy = on ? "1" : "";
  app.dataset.busy = on ? "1" : "";             // shows the skeleton of the transcript to come
}
async function track(job, ...args) {
  active++; setBusy(true);
  try { await job(...args); } finally { if (--active === 0) setBusy(false); }
}
const run = (source) => track(runInner, source);

async function runInner(source) {
  const id = ++runId;
  const alive = () => id === runId;
  const name = typeof source === "string" ? source : source.name;
  stopQuotes();
  hideWhy();
  progress("...", 0);
  await mood("sigh"); await sleep(500); if (!alive()) return;
  mood("listening");
  startQuotes();
  const SHARE = { fetch: [0, 20], decode: [20, 25], model: [25, 55], listen: [55, 90] };
  let result;
  try {
    result = await Engine.transcribe(source, {
      language: lang.value,
      confirmLong: (info) => (alive() ? askLong(info).then((yes) => { if (yes && alive()) startLong(info.seconds); return yes; }) : false),
      onStatus: ({ stage, text, fraction, elapsed, listening }) => {
        if (!alive()) return;
        const [from, to] = SHARE[stage];
        // While listening, long audio reports real progress; short audio has none, so its bar eases toward the end.
        const part = stage !== "listen" ? fraction || 0 : fraction != null ? fraction : 1 - Math.exp(-elapsed / 12);
        progress(`${SPIN[spin++ % SPIN.length]} ${batchNote}${text}`, from + (to - from) * part);
        if (longJob && stage === "listen") updateLong(fraction, listening);
      },
    });
  } catch (e) {
    if (!alive()) return;
    endLong(false);
    if (e.code === "cancelled") { stopQuotes(); meter.hidden = true; BT.set(sprite, "idle"); setDoing(DOING.idle); return says("fine. another time."); }
    return failWith(e, name);
  }
  if (!alive()) return;
  if (result.listened > 5 && result.seconds > 60) store("bartleby-rate-" + engineName(), (result.seconds / result.listened).toFixed(2));   // how fast this device really is
  endLong(true);
  stopQuotes();
  const chunks = result.chunks.filter((c) => c.text.trim());
  if (!chunks.length) return failWith({ code: "no-speech" }, name);
  mood("typing");
  // The page: the video's title (when the platform has one) and creator on top, the words, then a details
  // block and a credit at the bottom. All of it is ordinary text in the editor and can be deleted.
  const m = result.meta, spoken = lang.selectedOptions[0].textContent;
  const head = `# ${m.title || "transcript"}\n\n` + (m.creator ? `> ${m.creator}\n\n` : "");
  const details = [
    `- source: ${m.source}`,
    m.creator && `- creator: ${m.creator}`,
    `- platform: ${m.platform}`,
    `- length: ${stamp(result.seconds)}`,
    `- language: ${spoken}`,
    `- transcribed: ${new Date().toISOString().slice(0, 10)}, on this device`,
  ].filter(Boolean).join("\n");
  const tail = ["---", details, "transcribed with bartleby"];
  const fileName = (m.title ? m.title.replace(/[\\/:*?"<>|#]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) : "") || "transcript";
  const tid = "t" + ++made;                                  // every transcript gets its own page, named after the video
  addTab(tid, fileName + ".md", head);
  Object.assign(tabs.find((t) => t.id === tid), { kind: "transcript", source: m.source, platform: m.platform });
  lastTitle = m.title || "";
  audioTab = tid;                                            // the page whose audio the engine still holds, for translate
  atStart = false;
  applyMode();
  showTab(tid);
  if (!(await write(alive, tid, head, [...chunks.map((c) => `[${stamp(c.timestamp[0] || 0)}] ${c.text.trim()}`), ...tail]))) return;
  segs[tid] = chunks.map((c, i) => [c.timestamp[0] || 0, c.timestamp[1] ?? chunks[i + 1]?.timestamp[0] ?? result.seconds, c.text.trim()]);
  $("#translate-btn").hidden = tab !== tid;
  const words = chunks.reduce((n, c) => n + c.text.trim().split(/\s+/).length, 0);
  progress(`[ok] ${words} words from ${stamp(result.seconds)} of audio in ${result.took.toFixed(1)}s, on your device (${result.device})`, 100);
  save();
  await mood("done");
  // Once, after the first transcript on the default engine: point at the more accurate one. Not awaited,
  // so the run counts as finished (and the button stops saying "stop") as soon as he is done.
  if ((stored("bartleby-engine") || "standard") === "standard" && !stored("bartleby-hinted")) {
    store("bartleby-hinted", "1");
    sleep(1800).then(() => { if (alive()) says("words wrong? try accurate. it's in settings."); });
  }
}
// Translate: the same audio again, into English, in its own tab. Whisper does this itself, on the device.
// English into other languages would need a separate translation model and is not built.
async function translateRun() {
  if (lang.value === "en") return says("it's already english. set the spoken language in settings if it isn't.");
  const id = ++runId;
  const alive = () => id === runId;
  stopQuotes();
  await mood("sigh", "*sigh* if you insist."); if (!alive()) return;
  mood("listening", "again, in english this time.");
  startQuotes();
  let result;
  try {
    result = await Engine.translate({
      language: lang.value,
      onStatus: ({ text, elapsed }) => { if (alive()) progress(`${SPIN[spin++ % SPIN.length]} ${text}`, 90 * (1 - Math.exp(-elapsed / 12))); },
    });
  } catch (e) {
    if (!alive()) return;
    return failWith(e);
  }
  if (!alive()) return;
  stopQuotes();
  const chunks = result.chunks.filter((c) => c.text.trim());
  mood("typing");
  const xid = "x" + ++made;
  addTab(xid, ((lastTitle || "translation").replace(/[\\/:*?"<>|#]+/g, " ").trim().slice(0, 40) || "translation") + " (english).md", " ");
  applyMode();
  showTab(xid);
  const head = `# ${lastTitle ? lastTitle + " (english)" : "translation"}\n\n`;
  const tail = ["---", `- translated from: ${lang.selectedOptions[0].textContent}\n- translated: ${new Date().toISOString().slice(0, 10)}, on this device`, "translated with bartleby"];
  if (!(await write(alive, xid, head, [...chunks.map((c) => `[${stamp(c.timestamp[0] || 0)}] ${c.text.trim()}`), ...tail]))) return;
  progress(`[ok] translated into english in ${result.took.toFixed(1)}s, on your device (${result.device})`, 100);
  save();
  mood("done", "there. in english.");
}
$("#translate-btn").onclick = () => track(translateRun);

function cancelRun() { hideWhy(); if (longJob) { Engine.reset(); endLong(false); } runId++; batchId++; stopQuotes(); doc.readOnly = false; meter.hidden = true; setBusy(false); }

/* ---------- document actions ---------- */
const two = (n) => String(Math.floor(n)).padStart(2, "0");
const srtTime = (s) => `${two(s / 3600)}:${two((s % 3600) / 60)}:${two(s % 60)},${String(Math.round((s % 1) * 1000)).padStart(3, "0")}`;
const vttTime = (s) => srtTime(s).replace(",", ".");
const stem = () => tabs.find((t) => t.id === tab).name.replace(/\.md$/i, "");
// Plain text: just the words. From the timed segments when we have them, otherwise the page with its marks stripped.
const plain = () => (segs[tab]
  ? segs[tab].map((x) => x[2]).join("\n\n")
  : doc.value.replace(/^\[\d+:\d{2}(?::\d{2})?\]\s*/gm, "").replace(/^#+\s*/gm, "").replace(/^>\s?/gm, "").replace(/\*\*|`/g, "").trim()) + "\n";
const timed = () => !!segs[tab]?.length;
const SAVES = [
  ["md", ".md", "markdown, as it is in the editor", () => download(stem() + ".md", doc.value, "text/markdown"), () => true],
  ["txt", ".txt", "plain text, no timestamps", () => download(stem() + ".txt", plain(), "text/plain"), () => true],
  ["srt", ".srt", "subtitles", () => download(stem() + ".srt", segs[tab].map(([a, b, t], i) => `${i + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${t}\n`).join("\n"), "text/plain"), timed],
  ["vtt", ".vtt", "subtitles for the web", () => download(stem() + ".vtt", "WEBVTT\n\n" + segs[tab].map(([a, b, t]) => `${vttTime(a)} --> ${vttTime(b)}\n${t}\n`).join("\n"), "text/vtt"), timed],
];
// Fills a container with one button per format that applies to the current page.
function renderSaves(box) {
  box.textContent = "";
  for (const [, ext, what, save, ok] of SAVES) {
    if (!ok()) continue;
    const b = el("button", "", ext);
    b.type = "button";
    b.appendChild(el("span", "", what));
    b.onclick = () => { toggleSave(false); showFly(null); save(); };
    box.appendChild(b);
  }
}
const saveMenu = $("#save-menu"), saveBtn = $("#save-btn");
function toggleSave(open = saveMenu.hidden) {
  saveMenu.hidden = !open;
  saveBtn.setAttribute("aria-expanded", String(open));
  if (open) { renderSaves(saveMenu); saveMenu.style.left = Math.max(8, saveBtn.getBoundingClientRect().right - $(".editor").getBoundingClientRect().left - 262) + "px"; }
}
saveBtn.onclick = () => toggleSave();
function download(name, text, type) {
  const a = el("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$("#copy").onclick = async (e) => {
  try { await navigator.clipboard.writeText(doc.value); e.target.textContent = "copied"; }
  catch { doc.select(); e.target.textContent = "press copy"; }
  setTimeout(() => { e.target.textContent = "copy"; }, 1400);
};
$("#dl-md").onclick = () => SAVES[0][3]();                           // the editor's text, edits included

/* ---------- the prompt: links start a run, a few other words get an answer ---------- */
const EGGS = [
  [/^help$/, () => "copy a link, press paste. or drop a file on me. or try: whoami, ls, sudo, clear, rain, hat, quote."],
  [/^(hi|hello|hey)\b/, () => "link."],
  [/^whoami$/, () => "a customer. allegedly."],
  [/^ls\b/, () => tabs.map((t) => t.name).join("  ") + "  your-patience.tmp"],
  [/^sudo\b/, () => "nice try."],
  [/^rm\b/, () => "i would prefer not to."],
  [/^(i would|i'd) prefer not to\.?$/, () => "that's my line."],
  [/\b(ads?|sign ?up|subscribe|tracking)\b/, () => "i would prefer not to."],
  [/^(thanks|thank you|ty)\b/, () => "mm."],
  [/^quote$/, () => { const q = QUOTES[qi++ % (QUOTES.length || 1)]; return q ? `"${q.text}" // ${q.by}` : "none on me."; }],
  [/^hat$/, () => "bowler. london, 1849. don't touch it."],
  [/^rain$/, () => { const c = $("#rain"); c.hidden = !c.hidden; return c.hidden ? "fine. dry." : "it's the pacific northwest. it rains."; }],
  [/^clear$/, () => { chat.textContent = ""; return "cleared."; }],
];
const LINK = /^(https?:\/\/)?(localhost(:\d+)?|([\w-]+\.)+[a-z]{2,})\/\S+/i;

function handle(text) {
  chat.appendChild(el("div", "me", text.length > 34 ? text.slice(0, 31) + "..." : text));   // long input is shortened in the log
  const links = text.split(/[\s,]+/).filter((t) => LINK.test(t));
  if (links.length === 1) return run(links[0]);
  if (links.length > 1) return runAll(links);
  cancelRun();                                      // anything else typed mid-run cancels it
  const egg = EGGS.find(([re]) => re.test(text.toLowerCase()));
  if (egg) { BT.set(sprite, "idle"); setDoing(DOING.idle); return says(egg[1]()); }
  showWhy(explain({ code: "not-link" }));
  mood("error", WHY["not-link"].says);
}
// Several links pasted together: one after another, each into its own page. Stop cancels the rest.
function runAll(links) {
  return track(async () => {
    const batch = batchId;
    await says(`${links.length} links. *sigh*. one at a time.`);
    for (let i = 0; i < links.length && batch === batchId; i++) {
      batchNote = `(${i + 1} of ${links.length}) `;
      await runInner(links[i]);
    }
    batchNote = "";
  });
}

// The big button pastes whatever link is on the clipboard and starts (or stops a run in progress).
// Typing in the box shows a small go button; Enter works too. The file button opens the file picker.
const refreshSend = () => { $("#go").hidden = !input.value.trim(); };
input.addEventListener("input", refreshSend);
async function pasteFromClipboard() {
  let text = "";
  try { text = (await navigator.clipboard.readText()).trim(); }
  catch { input.focus(); showWhy(explain({ code: "clipboard" })); return says(WHY.clipboard.says); }
  if (!text) return says("your clipboard's empty. copy a link first.");
  handle(text);
}
send.onclick = () => {
  if (send.dataset.busy) { cancelRun(); BT.set(sprite, "idle"); setDoing(DOING.idle); return says("stopped. fine."); }
  pasteFromClipboard();
};
$("#ask").onsubmit = (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  refreshSend();
  handle(text);
};
$("#back").onclick = () => { atStart = false; applyMode(); };

/* ---------- the dock and the sheets' action rows ---------- */
async function copyDoc(btn) {
  let ok = true;
  try { await navigator.clipboard.writeText(doc.value); }
  catch {
    ok = false;
    if (!doc.hidden) doc.select();
    else { const r = document.createRange(); r.selectNodeContents(preview); getSelection().removeAllRanges(); getSelection().addRange(r); }
  }
  const label = btn.querySelector(".lbl"), old = btn.querySelector(".ic");
  if (label) label.textContent = ok ? "copied" : "select all, then copy";
  if (ok && old) old.replaceWith(icon("check"));
  setTimeout(() => { if (label) label.textContent = "copy"; btn.querySelector(".ic")?.replaceWith(icon("copy")); }, 1400);
}
const ACTS = {
  new: () => { atStart = true; applyMode(); },
  copy: (btn) => copyDoc(btn),
  md: () => showFly(openFly === "save" ? null : "save"),          // the dock's save button opens the list of formats
  preview: () => $("#preview-btn").click(),
  translate: () => $("#translate-btn").click(),
  pages: () => showFly(openFly === "pages" ? null : "pages"),
  newpage: () => $("#new-tab").click(),
  edit: () => { editPlain = !editPlain; syncPaint(); },
  share: async () => { try { await navigator.share({ title: tabs.find((t) => t.id === tab)?.name, text: doc.value }); } catch {} },
};
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  if (btn.closest(".flyout")) showFly(null);
  ACTS[btn.dataset.act]?.(btn);
});
if (!navigator.share) for (const b of document.querySelectorAll('.dock [data-act="share"]')) b.hidden = true;

// The supported-sites sheet lists whatever the cobalt instance says it handles, each with its logo.
// "works" and "not tried yet" are our own test notes and only show while developing (on localhost).
// A note that matters to a visitor, like TikTok needing a saved file, always shows.
const DEV = /^(localhost|127\.|\[::1\])/.test(location.hostname);
const TRIED = { youtube: "works", instagram: "works" };
const CAVEAT = { tiktok: "by saved file for now" };
const NAMES = { twitter: "x", ok: "ok.ru", "twitch clips": "twitch clips" };
// Shown most familiar first: the big social video sites, then the rest roughly by how widely they are known.
const ORDER = ["youtube", "instagram", "tiktok", "facebook", "twitter", "reddit", "snapchat", "pinterest", "twitch clips", "soundcloud",
  "vimeo", "tumblr", "bluesky", "bilibili", "vk", "dailymotion", "loom", "ok", "streamable", "rutube", "newgrounds"];
function brandIcon(service) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", 18); svg.setAttribute("height", 18);
  svg.setAttribute("class", "ic"); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  if (BRANDS[service]) path.setAttribute("d", BRANDS[service]);
  else return icon("link", 18);                       // no logo in the set (rutube, streamable): a plain link mark
  svg.appendChild(path);
  return svg;
}
function siteRow(service, soon) {
  const li = el("li");
  const text = el("span", "txt");
  text.appendChild(el("b", "", NAMES[service] || service));
  const note = soon ? "coming soon" : CAVEAT[service] || (DEV ? TRIED[service] || "not tried yet" : "");
  if (note) text.appendChild(el("span", "dim", note));
  li.append(brandIcon(service), text);
  return li;
}
async function renderSites() {
  const box = $("#site-list");
  if (box.dataset.done) return;
  const api = (window.BARTLEBY || {}).cobalt;
  let services = ["youtube", "instagram"];            // what is confirmed, shown if the fetcher can't be asked
  try { if (api) services = (await (await fetch(api)).json()).cobalt.services; } catch {}
  box.dataset.done = "1";
  box.textContent = "";
  const rank = (name) => { const i = ORDER.indexOf(name); return i < 0 ? ORDER.length : i; };
  if (!api) services = ["youtube", "instagram", "tiktok", "facebook", "twitter", "reddit"];    // no fetcher on this copy yet: the main sites, marked as coming
  for (const name of [...services].sort((a, b) => rank(a) - rank(b))) box.appendChild(siteRow(name, !api));
}

// The pages sheet: every page, tap to open, a bin to close it.
function renderPages() {
  const list = $("#page-list");
  list.textContent = "";
  for (const t of tabs) {
    const row = el("div", "row");
    row.setAttribute("role", "button"); row.tabIndex = 0;
    row.setAttribute("aria-current", String(t.id === tab));
    row.append(icon(t.fixed ? "about" : "pages", 18), el("span", "name", t.name));
    row.onclick = () => { showFly(null); showTab(t.id); };
    row.onkeydown = (e) => { if (e.key === "Enter") row.click(); };
    if (!t.fixed) {
      const del = el("button", "del");
      del.type = "button"; del.setAttribute("aria-label", `Close ${t.name}`);
      del.append(icon("trash", 18));
      del.onclick = (e) => { e.stopPropagation(); closeTab(t.id); if (openFly === "pages") renderPages(); };
      row.append(del);
    }
    list.append(row);
  }
}

/* ---------- settings: which engine does the listening ----------
   standard = the small model on the processor (73 MB). accurate = the larger model on the processor
   (240 MB, slower). ultra = the larger model on the graphics card (393 MB, fastest and most accurate).
   The first switch to ultra opens a dialog explaining what it is for; after that the choice just applies.
   The choice is remembered. Measurements behind these are in engine/worker.js. */
const SMALL = "onnx-community/whisper-small";
const ENGINES = {
  standard: null,
  accurate: { model: SMALL, device: "wasm", dtype: "q8" },
  ultra: { model: SMALL, device: "webgpu", dtype: { encoder_model: "fp16", decoder_model_merged: "q4" } },
};
const radios = [...document.querySelectorAll('input[name="engine"]')], engineNote = $("#engine-note"), ultraDialog = $("#ultra-dialog");
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const canGpu = "gpu" in navigator;
const lang = $("#lang");
lang.value = stored("bartleby-lang") || "en";
lang.onchange = () => store("bartleby-lang", lang.value);
function setEngine(name, announce) {
  if (name === "ultra" && !canGpu) name = "standard";
  window.BARTLEBY.setup = ENGINES[name];
  store("bartleby-engine", name);
  for (const r of radios) r.checked = r.value === name;
  engineNote.textContent = canGpu ? `using ${name}. the next transcript uses it.` : "ultra needs a browser that can use the graphics card. this one can't.";
  if (announce) { cancelRun(); Engine.reset(); says({ ultra: "ultra. big download, best ears.", accurate: "accurate. slower, but i'll get the words right.", standard: "standard. fine by me." }[name]); }
}
// The MVP popup: once per visitor, and again from the about panel.
function showMvp(open) {
  showFly(null);
  $("#mvp-dialog").hidden = !open;
  scrim.hidden = !open;
  if (open) $("#mvp-ok").focus();
  else store("bartleby-mvp-seen", "1");
}
$("#mvp-ok").onclick = () => showMvp(false);
$("#mvp-again").onclick = (e) => { e.preventDefault(); showMvp(true); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#mvp-dialog").hidden) showMvp(false); });
function askUltra(open) {
  showFly(null);
  ultraDialog.hidden = !open;
  scrim.hidden = !open;
  if (open) $("#ultra-yes").focus();
}
for (const r of radios) r.onchange = () => {
  if (r.value !== "ultra") return setEngine(r.value, true);
  const before = stored("bartleby-engine") || "standard";
  if (!canGpu) return setEngine(before);
  if (stored("bartleby-ultra-seen")) return setEngine("ultra", true);
  setEngine(before);                              // stays where it was until the dialog is answered
  askUltra(true);
};
$("#ultra-yes").onclick = () => { store("bartleby-ultra-seen", "1"); askUltra(false); setEngine("ultra", true); };
$("#ultra-no").onclick = () => askUltra(false);
scrim.addEventListener("click", () => { if (!ultraDialog.hidden) askUltra(false); });
scrim.addEventListener("click", () => { if (!$("#mvp-dialog").hidden) showMvp(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ultraDialog.hidden) askUltra(false); });
if (!canGpu) radios.find((r) => r.value === "ultra").disabled = true;
setEngine(stored("bartleby-engine") || "standard");

// Settings is split into four tabs along its bottom edge, so no tab needs to scroll.
for (const t of document.querySelectorAll("#set-tabs button")) t.onclick = () => {
  for (const b of document.querySelectorAll("#set-tabs button")) b.setAttribute("aria-selected", String(b === t));
  for (const p of document.querySelectorAll(".set-pane")) p.hidden = p.dataset.pane !== t.dataset.pane;
};

// Settings also carries the two look switches, and a way to clear what is kept on this device.
function syncLook() {
  $("#set-dark").setAttribute("aria-pressed", String(theme === "dark"));
  $("#set-pro").setAttribute("aria-pressed", String(mode === "pro"));
}
$("#set-dark").onclick = () => { themeBtn.click(); syncLook(); };
$("#set-pro").onclick = () => { const was = openFly; modeBtn.click(); showFly(was); syncLook(); };
$("#clear-pages").onclick = (e) => {
  const b = e.currentTarget;
  if (!b.dataset.sure) { b.dataset.sure = "1"; b.querySelector(".lbl").textContent = "tap again to delete every page"; return setTimeout(() => { delete b.dataset.sure; b.querySelector(".lbl").textContent = "delete saved pages"; }, 3000); }
  for (const t of tabs.filter((t) => !t.fixed)) { delete docs[t.id]; delete segs[t.id]; }
  tabs.length = 1; tab = "welcome"; audioTab = null; atStart = false;
  delete b.dataset.sure; b.querySelector(".lbl").textContent = "delete saved pages";
  save(); showTab("welcome"); applyMode();
  says("gone. all of it.");
};

/* ---------- shared from another app ----------
   When the site is installed, other apps can share a link to it; the link arrives in the address as ?url= or
   ?text=. The same works by hand: opening the page with ?url=<link> starts on that link. */
function takeShared() {
  const q = new URLSearchParams(location.search);
  const found = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ").split(/\s+/).filter((t) => LINK.test(t));
  if (!found.length) return;
  history.replaceState(null, "", location.pathname);
  handle(found[0]);
}

/* ---------- tools: transcribe works; compress and convert are placeholders for now ----------
   The switcher sits in the top bar on every screen. Choosing a tool that isn't built yet shows the start
   screen with a note where the buttons were, and he says so. Nothing is faked: those tools do nothing yet. */
const TOOLS = {
  transcribe: {},
  compress: { says: "compress? not yet. i'm working on it.", title: "compress files, coming soon",
    text: "shrink videos, audio and images so they're easy to send. on your device, nothing uploaded." },
  convert: { says: "convert? not yet. give me time.", title: "convert files, coming soon",
    text: "turn .mov into .mp4, .wav into .mp3 and so on. on your device, nothing uploaded." },
};
function setToolState(name) {
  tool = name;
  app.dataset.tool = name;
  $("#tool-btn .lbl").textContent = name;
  $("#tool-btn .ic")?.remove();
  $("#tool-btn").prepend(icon({ transcribe: "subtitles", compress: "compress", convert: "convert" }[name]));
  for (const b of document.querySelectorAll("#fly-tools [data-tool]")) b.setAttribute("aria-current", String(b.dataset.tool === name));
  const t = TOOLS[name];
  $("#stub").hidden = !t.title;
  if (t.title) { $("#stub-title").textContent = t.title; $("#stub-text").textContent = t.text; }
}
function setTool(name) {
  showFly(null);
  if (name === tool) return;
  if (send.dataset.busy && name !== "transcribe") return says("busy. one thing at a time.");
  hideWhy();
  setToolState(name);
  atStart = name !== "transcribe" || atStart;
  applyMode();
  BT.set(sprite, "idle"); setDoing(DOING.idle);
  says(name === "transcribe" ? resting.line : TOOLS[name].says);
}
for (const b of document.querySelectorAll("#fly-tools [data-tool]")) b.onclick = () => setTool(b.dataset.tool);
setToolState("transcribe");

/* ---------- files: drop one anywhere, or pick one ---------- */
const picker = $("#file");
function takeFile(file) {
  if (!file) return;
  if (tool !== "transcribe") return says(`${tool}? not yet. switch back to transcribe for that.`);
  chat.appendChild(el("div", "me", file.name.length > 34 ? file.name.slice(0, 31) + "..." : file.name));
  run(file);
}
$("#pick").onclick = () => picker.click();   // the file button
picker.onchange = () => { takeFile(picker.files[0]); picker.value = ""; };
addEventListener("dragover", (e) => { e.preventDefault(); app.classList.add("dropping"); });
addEventListener("dragleave", (e) => { if (!e.relatedTarget) app.classList.remove("dropping"); });
addEventListener("drop", (e) => { e.preventDefault(); app.classList.remove("dropping"); takeFile(e.dataTransfer.files[0]); });

/* ---------- commands you can copy, and a prompt to hand to a coding agent ---------- */
$("#agent-prompt").textContent = `Set up bartleby on this machine so I can use it in my browser.

1. Clone https://github.com/zachdoxsee/bartleby into a new folder.
2. Read README.md and PLAN.md before changing anything.
3. Serve the folder with a static file server on port 4174 (for example: python3 -m http.server 4174) and tell me the address of prototype/.
4. Fetching links needs my own cobalt instance; the public cobalt service is not for other projects. If Docker is installed, ask me first, then run:
   docker run -d --name bartleby-cobalt --init --read-only -p 127.0.0.1:9000:9000 -e API_URL="http://localhost:9000/" ghcr.io/imputnet/cobalt:11
5. Check that prototype/config.js points at http://localhost:9000/ when the page is served from localhost.
6. Open the page, give it a short audio file, and confirm a transcript appears. Tell me what worked and what didn't.

Don't install anything globally or change system settings without asking me first.`;
// Every command box marked data-copy gets a copy button. An empty data-copy means "copy the box's own text".
for (const box of document.querySelectorAll(".cmd[data-copy]")) {
  const own = box.textContent;
  const b = el("button", "copy-cmd");
  b.type = "button";
  b.setAttribute("aria-label", "Copy");
  b.title = "Copy";
  b.append(icon("copy", 16));
  b.onclick = async () => {
    const text = box.dataset.copy || own;
    let ok = true;
    try { await navigator.clipboard.writeText(text); } catch { ok = false; }
    b.querySelector(".ic").replaceWith(icon(ok ? "check" : "close", 16));
    b.title = ok ? "Copied" : "This browser blocked copying; select the text instead";
    setTimeout(() => { b.querySelector(".ic").replaceWith(icon("copy", 16)); b.title = "Copy"; }, 1500);
  };
  if (box.classList.contains("prompt")) box.prepend(b); else box.append(b);   // the long one scrolls, so its button goes first and sticks to the top
}

/* ---------- a clock in the top bar: UTC, to the second ---------- */
const clockEl = $("#clock");
function tickClock() {
  clockEl.textContent = new Date().toISOString().slice(11, 19) + " UTC";
  setTimeout(tickClock, 1000 - (Date.now() % 1000) + 5);       // re-aim at the start of each second so it doesn't drift
}
tickClock();

/* ---------- ready immediately ---------- */
placeIcons();
renderTabs();
applyMode();
refreshSend();
BT.set(sprite, "idle");
setDoing(DOING.idle);
says(LINES.idle);
if (matchMedia("(min-width: 761px)").matches) input.focus();
takeShared();
if (!stored("bartleby-mvp-seen")) showMvp(true);          // first visit: say what v1.0 does and doesn't do yet
