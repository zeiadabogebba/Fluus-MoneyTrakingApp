/* ============================================================
   Fluus · فلوس — app logic
   Vanilla JS. Data lives in localStorage. No backend.
   ============================================================ */

"use strict";

/* ---------------- helpers ---------------- */

const $ = (sel) => document.querySelector(sel);

const NF = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmt = (n) => NF.format(Math.round((Number(n) + Number.EPSILON) * 100) / 100);

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const currentYM = () => ymKey(new Date());
const ymParts = (ym) => ym.split("-").map(Number); // [year, month1-12]
const shiftYM = (ym, delta) => {
  const [y, m] = ymParts(ym);
  return ymKey(new Date(y, m - 1 + delta, 1));
};
const daysInYM = (ym) => {
  const [y, m] = ymParts(ym);
  return new Date(y, m, 0).getDate();
};
const monthLabel = (ym) => {
  const [y, m] = ymParts(ym);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};
const monthShort = (ym) => {
  const [y, m] = ymParts(ym);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long" });
};
const dayKeyOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabelOf = (ts) => {
  const k = dayKeyOf(ts);
  if (k === dayKeyOf(Date.now())) return "Today";
  if (k === dayKeyOf(Date.now() - 864e5)) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};
const timeOf = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/* ---------------- state ---------------- */

const LS_KEY = "fluus-v1";

const PALETTE = ["#34d399", "#22d3ee", "#f472b6", "#facc15", "#94a3b8", "#2dd4bf", "#c084fc", "#fb923c", "#a3e635", "#38bdf8"];

const ICONS = ["cookie","sparkles","utensils","car","coffee","zap","cart","cup-soda","pizza","cigarette","fuel","gamepad","film","gift","pill","dumbbell","shirt","scissors","smartphone","laptop","grad-cap","home","cat","plane","receipt","banknote","gem","wallet"];

const icon = (id, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

function freshState() {
  return {
    v: 1,
    currency: "LE",
    categories: [],
    months: {},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return freshState();
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || typeof s.months !== "object" || !Array.isArray(s.categories)) return freshState();
    return s;
  } catch {
    return freshState();
  }
}

function save() {
  state.updatedAt = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  schedulePush();
}

let state = load();

/* view state */
let viewYM = currentYM();
let filterCat = null;            // category name or null
let editingTxId = null;          // tx id when editing, else null
let selectedCat = null;          // {name, emoji, color}
let lastUsedCat = null;
let lastShownRemaining = null;   // for count-up animation
let lastDeleted = null;          // {tx, ym} for undo
let catSheetReturnsToAdd = false;
let pickedIcon = null;

const pads = { add: "", bal: "" };

/* ---------------- month data ---------------- */

const monthData = (ym) => state.months[ym] || { start: null, tx: [] };
const ensureMonth = (ym) => {
  if (!state.months[ym]) state.months[ym] = { start: null, tx: [] };
  return state.months[ym];
};
const spentOf = (ym) => monthData(ym).tx.reduce((s, t) => s + t.amt, 0);
const remainingOf = (ym) => {
  const m = monthData(ym);
  return m.start === null ? null : round2(m.start - spentOf(ym));
};

/* ---------------- formatting the keypad buffer ---------------- */

function fmtBuffer(buf) {
  if (buf === "") return "0";
  const [int, dec] = buf.split(".");
  const intFmt = NF.format(Number(int || "0"));
  return dec !== undefined ? `${intFmt}.${dec}` : intFmt;
}
const padValue = (which) => round2(parseFloat(pads[which]) || 0);

function padInput(which, key) {
  let buf = pads[which];
  if (key === "back") buf = buf.slice(0, -1);
  else if (key === ".") {
    if (!buf.includes(".")) buf = buf === "" ? "0." : buf + ".";
  } else {
    const [int, dec] = buf.split(".");
    if (dec !== undefined && dec.length >= 2) return;
    if (dec === undefined && int && int.length >= 7) return;
    buf = buf === "0" ? key : buf + key;
  }
  pads[which] = buf;
  renderPad(which);
}

function renderPad(which) {
  if (which === "add") {
    $("#amount-val").textContent = fmtBuffer(pads.add);
    updateAfterLine();
    updateSaveState();
  } else {
    $("#bal-val").textContent = fmtBuffer(pads.bal);
  }
}

function updateAfterLine() {
  const el = $("#amount-after");
  const rem = remainingOf(viewYM);
  if (rem === null || viewYM !== currentYM()) { el.innerHTML = "&nbsp;"; el.classList.remove("neg"); return; }
  let base = rem;
  if (editingTxId) {
    const old = monthData(viewYM).tx.find((t) => t.id === editingTxId);
    if (old) base = round2(base + old.amt);
  }
  const after = round2(base - padValue("add"));
  el.textContent = `Left after: ${fmt(after)} ${state.currency}`;
  el.classList.toggle("neg", after < 0);
}

function updateSaveState() {
  $("#btn-save").disabled = !(padValue("add") > 0 && selectedCat);
}

/* ---------------- sheets ---------------- */

const backdrop = $("#backdrop");
backdrop.hidden = false; // visibility handled via .show

function openSheet(id) {
  closeSheets(true);
  backdrop.classList.add("show");
  $(id).classList.add("open");
}
function closeSheets(keepBackdrop = false) {
  document.querySelectorAll(".sheet.open").forEach((s) => s.classList.remove("open"));
  if (!keepBackdrop) backdrop.classList.remove("show");
}

/* ---------------- add / edit sheet ---------------- */

function openAddSheet(opts = {}) {
  const { catName = null, tx = null, preserve = false } = opts;

  if (tx) {
    editingTxId = tx.id;
    pads.add = String(tx.amt % 1 === 0 ? tx.amt : tx.amt.toFixed(2));
    selectedCat = { name: tx.name, icon: tx.icon, color: tx.color };
    $("#add-note").value = tx.note || "";
    const d = new Date(tx.ts);
    $("#edit-date").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    $("#edit-extras").hidden = false;
    $("#add-title").textContent = "Edit spending";
    $("#btn-save").textContent = "Save changes";
  } else if (!preserve) {
    editingTxId = null;
    pads.add = "";
    $("#add-note").value = "";
    $("#edit-extras").hidden = true;
    $("#add-title").textContent = "Add spending";
    $("#btn-save").textContent = "Add spending";
    if (catName) {
      const c = state.categories.find((c) => c.name === catName);
      selectedCat = c ? { name: c.name, icon: c.icon, color: c.color } : null;
    } else if (lastUsedCat) {
      selectedCat = lastUsedCat;
    } else {
      selectedCat = null;
    }
  }

  renderAddCats();
  renderPad("add");
  resetDeleteBtn();
  openSheet("#sheet-add");
}

function renderAddCats() {
  const row = $("#add-cats");
  let html = "";
  const inList = selectedCat && state.categories.some((c) => c.name === selectedCat.name);
  if (selectedCat && !inList) {
    // category was deleted/renamed since — keep a temp chip so editing old tx still works
    html += catChipHTML(selectedCat, true);
  }
  for (const c of state.categories) {
    html += catChipHTML(c, selectedCat && selectedCat.name === c.name);
  }
  html += `<button class="cchip cchip-new" data-act="new-cat"><span class="cc-ic">${icon("plus")}</span> new</button>`;
  row.innerHTML = html;
}

const catChipHTML = (c, active) =>
  `<button class="cchip${active ? " active" : ""}" style="--c:${c.color}" data-pick-cat="${esc(c.name)}" data-icon="${esc(c.icon)}" data-color="${c.color}">
     <span class="cc-ic">${icon(c.icon)}</span><span>${esc(c.name)}</span>
   </button>`;

function saveTx() {
  const amt = padValue("add");
  if (!(amt > 0) || !selectedCat) return;
  const note = $("#add-note").value.trim();

  if (editingTxId) {
    const m = ensureMonth(viewYM);
    const idx = m.tx.findIndex((t) => t.id === editingTxId);
    if (idx === -1) return;
    const tx = m.tx[idx];
    tx.amt = amt;
    tx.name = selectedCat.name;
    tx.icon = selectedCat.icon;
    tx.color = selectedCat.color;
    tx.note = note;
    // date may move the tx to another month bucket
    const dateVal = $("#edit-date").value;
    if (dateVal) {
      const [y, mo, d] = dateVal.split("-").map(Number);
      const old = new Date(tx.ts);
      const nd = new Date(y, mo - 1, d, old.getHours(), old.getMinutes());
      tx.ts = nd.getTime();
      const newYM = ymKey(nd);
      if (newYM !== viewYM) {
        m.tx.splice(idx, 1);
        ensureMonth(newYM).tx.push(tx);
        toast(`Moved to ${monthShort(newYM)}`);
      }
    }
  } else {
    let ts;
    if (viewYM === currentYM()) {
      ts = Date.now();
    } else {
      const [y, mo] = ymParts(viewYM);
      ts = new Date(y, mo - 1, Math.min(15, daysInYM(viewYM)), 12, 0).getTime();
    }
    ensureMonth(viewYM).tx.push({
      id: uid(), amt,
      name: selectedCat.name, icon: selectedCat.icon, color: selectedCat.color,
      note, ts,
    });
    lastUsedCat = { ...selectedCat };
    if (navigator.vibrate) navigator.vibrate(10);
    const rem = remainingOf(viewYM);
    toast(
      rem === null
        ? `${selectedCat.name} — ${fmt(amt)} ${state.currency} added`
        : `${fmt(amt)} ${state.currency} added · ${fmt(rem)} ${state.currency} left`
    );
  }

  save();
  closeSheets();
  renderAll();
}

/* delete (armed confirm) */
let deleteArmTimer = null;
function resetDeleteBtn() {
  const b = $("#btn-delete");
  b.classList.remove("armed");
  b.textContent = "Delete";
  clearTimeout(deleteArmTimer);
}
function onDeleteTx() {
  const b = $("#btn-delete");
  if (!b.classList.contains("armed")) {
    b.classList.add("armed");
    b.textContent = "Sure? Tap again";
    deleteArmTimer = setTimeout(resetDeleteBtn, 2600);
    return;
  }
  const m = ensureMonth(viewYM);
  const idx = m.tx.findIndex((t) => t.id === editingTxId);
  if (idx !== -1) {
    lastDeleted = { tx: m.tx[idx], ym: viewYM };
    m.tx.splice(idx, 1);
    save();
    toast("Spending deleted", {
      action: "UNDO",
      onAction() {
        ensureMonth(lastDeleted.ym).tx.push(lastDeleted.tx);
        lastDeleted = null;
        save();
        renderAll();
      },
    });
  }
  resetDeleteBtn();
  closeSheets();
  renderAll();
}

/* ---------------- balance sheet ---------------- */

function openBalanceSheet() {
  const m = monthData(viewYM);
  pads.bal = m.start === null ? "" : String(m.start % 1 === 0 ? m.start : m.start.toFixed(2));
  $("#balance-sub").textContent = `The money you're starting ${monthShort(viewYM)} with. You can change it anytime.`;
  renderPad("bal");
  openSheet("#sheet-balance");
}

function saveBalance() {
  ensureMonth(viewYM).start = padValue("bal");
  save();
  closeSheets();
  renderAll();
  toast(`Starting balance set: ${fmt(padValue("bal"))} ${state.currency}`);
}

/* ---------------- new category sheet ---------------- */

function openCatSheet(fromAdd) {
  catSheetReturnsToAdd = !!fromAdd;
  pickedIcon = null;
  $("#cat-name").value = "";
  renderIconGrid();
  updateCatPreview();
  openSheet("#sheet-cat");
  setTimeout(() => $("#cat-name").focus(), 380);
}

function renderIconGrid() {
  $("#emoji-grid").innerHTML = ICONS.map(
    (id) => `<button class="eg${pickedIcon === id ? " active" : ""}" data-icon-pick="${id}" aria-label="${id}">${icon(id)}</button>`
  ).join("");
}

function updateCatPreview() {
  const name = $("#cat-name").value.trim();
  const color = PALETTE[state.categories.length % PALETTE.length];
  const pv = $("#cat-preview");
  pv.style.setProperty("--c", color);
  pv.querySelector(".cp-emoji").innerHTML = icon(pickedIcon || "tag");
  pv.querySelector(".cp-name").textContent = name || "new category";
  $("#btn-save-cat").disabled = !(name && pickedIcon);
}

function saveCat() {
  const name = $("#cat-name").value.trim();
  if (!name || !pickedIcon) return;
  if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    toast("That category already exists");
    return;
  }
  const cat = { id: uid(), name, icon: pickedIcon, color: PALETTE[state.categories.length % PALETTE.length] };
  state.categories.push(cat);
  save();
  if (catSheetReturnsToAdd) {
    selectedCat = { name: cat.name, icon: cat.icon, color: cat.color };
    openAddSheet({ preserve: true });
  } else {
    closeSheets();
  }
  renderAll();
  toast(`${cat.name} created!`);
}

/* ---------------- toast ---------------- */

let toastTimer = null;
function toast(msg, opts = {}) {
  const t = $("#toast");
  $("#toast-msg").textContent = msg;
  const act = $("#toast-action");
  if (opts.action) {
    act.hidden = false;
    act.textContent = opts.action;
    act.onclick = () => { t.hidden = true; opts.onAction && opts.onAction(); };
  } else {
    act.hidden = true;
    act.onclick = null;
  }
  t.hidden = false;
  // restart animation
  t.style.animation = "none";
  void t.offsetHeight;
  t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, opts.ms || 4200);
}

/* ---------------- count-up animation ---------------- */

function animateNumber(el, from, to, suffixHTML) {
  if (from === null || from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.innerHTML = esc(fmt(to)) + suffixHTML;
    return;
  }
  const dur = 750;
  const t0 = performance.now();
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    const v = from + (to - from) * ease(p);
    el.innerHTML = esc(fmt(v)) + suffixHTML;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------------- render: hero ---------------- */

const RING_R = 88;
const RING_C = 2 * Math.PI * RING_R;

function renderHero() {
  const hero = $("#hero");
  const m = monthData(viewYM);
  const cur = esc(state.currency);
  const isCurrent = viewYM === currentYM();
  const isFuture = viewYM > currentYM();
  const spent = spentOf(viewYM);
  const rem = remainingOf(viewYM);

  /* --- setup variant: no starting balance yet --- */
  if (m.start === null && m.tx.length === 0) {
    const prevYM = shiftYM(viewYM, -1);
    const prevRem = remainingOf(prevYM);
    const carryBtn =
      prevRem !== null && prevRem > 0
        ? `<button class="ghost-btn" data-act="carry-over" data-carry="${prevRem}">Carry over ${fmt(prevRem)} ${cur} from ${monthShort(prevYM)}</button>`
        : "";
    hero.className = "card hero hero-setup";
    hero.innerHTML = `
      <span class="e-icon">${icon(isFuture ? "sparkles" : "wallet")}</span>
      <h3>${isFuture ? `Planning ahead for ${monthShort(viewYM)}?` : `New month, who dis?`}</h3>
      <p>Set the amount you're starting ${monthShort(viewYM)} with — you can edit it anytime.</p>
      <div class="setup-btns">
        <button class="save-btn small" data-act="edit-balance">Set starting balance</button>
        ${carryBtn}
      </div>`;
    return;
  }

  /* --- normal variant --- */
  hero.className = "card hero";

  const hasStart = m.start !== null && m.start > 0;
  const pct = hasStart ? Math.max(0, Math.min(1, rem / m.start)) : 0;
  const grad = pct > 0.5 ? "rg-ok" : pct > 0.2 ? "rg-warn" : "rg-low";
  const dashoffset = RING_C * (1 - pct);

  const today = new Date();
  const totalDays = daysInYM(viewYM);
  const dayOfMonth = isCurrent ? today.getDate() : totalDays;
  const daysLeft = Math.max(1, totalDays - dayOfMonth + 1);

  let centerHTML;
  if (m.start === null) {
    centerHTML = `
      <span class="r-label">spent</span>
      <span class="r-num" id="r-remaining">${esc(fmt(spent))}<span class="r-cur">${cur}</span></span>
      <button class="r-set" data-act="edit-balance">set starting balance</button>`;
  } else {
    centerHTML = `
      <span class="r-label">${isCurrent ? "left" : "ended with"}</span>
      <span class="r-num${rem < 0 ? " is-low" : ""}" id="r-remaining">${esc(fmt(rem))}<span class="r-cur">${cur}</span></span>
      <span class="r-pct">${Math.round(pct * 100)}% of ${esc(fmt(m.start))}</span>`;
  }

  let pillsHTML = "";
  if (isCurrent && m.start !== null) {
    const safe = Math.floor(Math.max(0, rem) / daysLeft);
    const safePill =
      rem < 0
        ? `<span class="pill bad">${icon("alert")} Overspent by ${esc(fmt(-rem))} ${cur}</span>`
        : `<span class="pill good">${icon("sun")} Safe today: ${esc(fmt(safe))} ${cur}</span>`;
    const idealSpent = (m.start * dayOfMonth) / totalDays;
    let pacePill = "";
    if (spent > idealSpent * 1.05) pacePill = `<span class="pill bad">${icon("trend-up")} ${esc(fmt(spent - idealSpent))} ${cur} over pace</span>`;
    else if (spent < idealSpent * 0.95) pacePill = `<span class="pill good">${icon("trend-down")} ${esc(fmt(idealSpent - spent))} ${cur} under pace</span>`;
    else pacePill = `<span class="pill warn">${icon("scale")} right on pace</span>`;
    pillsHTML = `<div class="pills">${safePill}${pacePill}</div>`;
  }

  const pencil = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>`;
  const statsHTML = `
    <div class="hero-stats">
      <button class="hs" data-act="edit-balance">
        <span class="hs-label">started ${pencil}</span>
        <span class="hs-val">${m.start === null ? "—" : esc(fmt(m.start))}</span>
      </button>
      <div class="hs">
        <span class="hs-label">spent</span>
        <span class="hs-val">${esc(fmt(spent))}</span>
      </div>
      <div class="hs">
        ${isCurrent
          ? `<span class="hs-label">days left</span><span class="hs-val">${daysLeft}</span>`
          : `<span class="hs-label">spendings</span><span class="hs-val">${m.tx.length}</span>`}
      </div>
    </div>`;

  hero.innerHTML = `
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="rg-ok" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#22d3ee"/>
          </linearGradient>
          <linearGradient id="rg-warn" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#f97316"/>
          </linearGradient>
          <linearGradient id="rg-low" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fb7185"/><stop offset="100%" stop-color="#f43f5e"/>
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="100" cy="100" r="${RING_R}"/>
        <circle class="ring-prog" cx="100" cy="100" r="${RING_R}"
          stroke="url(#${grad})"
          stroke-dasharray="${RING_C}"
          stroke-dashoffset="${RING_C}"/>
      </svg>
      <div class="ring-center">${centerHTML}</div>
    </div>
    ${pillsHTML}
    ${statsHTML}`;

  // animate the ring in
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const prog = hero.querySelector(".ring-prog");
      if (prog) prog.style.strokeDashoffset = dashoffset;
    })
  );

  // count-up on remaining
  if (m.start !== null) {
    const el = $("#r-remaining");
    animateNumber(el, lastShownRemaining, rem, `<span class="r-cur">${cur}</span>`);
    if (rem < 0) el.classList.add("is-low");
    lastShownRemaining = rem;
  }

  if (isCurrent && rem !== null) document.title = `Fluus · ${fmt(rem)} ${state.currency} left`;
  else document.title = "Fluus · فلوس";
}

/* ---------------- render: quick chips ---------------- */

let manageCats = false;

function renderChips() {
  const m = monthData(viewYM);
  const totals = {};
  for (const t of m.tx) totals[t.name] = (totals[t.name] || 0) + t.amt;

  const manageBtn = $("#btn-manage-cats");
  if (state.categories.length === 0) manageCats = false;
  manageBtn.hidden = state.categories.length === 0;
  manageBtn.textContent = manageCats ? "done" : "manage";
  manageBtn.classList.toggle("active", manageCats);

  if (state.categories.length === 0) {
    $("#chips").innerHTML = `
      <button class="chip chip-new chip-wide" data-act="new-cat-home">
        <span class="chip-emoji">${icon("plus")}</span>
        <span class="chip-name">Create your first category</span>
      </button>`;
    return;
  }

  $("#chips").innerHTML =
    state.categories
      .map(
        (c, i) => `
      <button class="chip${manageCats ? " managing" : ""}" style="--c:${c.color}; animation-delay:${Math.min(i * 35, 280)}ms" data-chip-cat="${esc(c.name)}" aria-label="${manageCats ? `Remove ${esc(c.name)}` : esc(c.name)}">
        ${manageCats ? `<span class="chip-x">${icon("x")}</span>` : ""}
        <span class="chip-emoji">${icon(c.icon)}</span>
        <span class="chip-name">${esc(c.name)}</span>
        <span class="chip-amt">${totals[c.name] ? esc(fmt(totals[c.name])) + " " + esc(state.currency) : "·"}</span>
      </button>`
      )
      .join("") +
    (manageCats
      ? ""
      : `<button class="chip chip-new" data-act="new-cat-home">
          <span class="chip-emoji">${icon("plus")}</span>
          <span class="chip-name">new</span>
          <span class="chip-amt">category</span>
        </button>`);
}

function removeCategory(name) {
  const idx = state.categories.findIndex((c) => c.name === name);
  if (idx === -1) return;
  const [cat] = state.categories.splice(idx, 1);
  if (lastUsedCat && lastUsedCat.name === cat.name) lastUsedCat = null;
  save();
  renderChips();
  toast(`Removed ${cat.name} — past spendings are kept`, {
    action: "UNDO",
    onAction() {
      state.categories.splice(Math.min(idx, state.categories.length), 0, cat);
      save();
      renderChips();
    },
  });
}

/* ---------------- render: insights ---------------- */

const DONUT_R = 48;
const DONUT_C = 2 * Math.PI * DONUT_R;

function renderInsights() {
  const box = $("#insights");
  const m = monthData(viewYM);
  const cur = esc(state.currency);
  const isCurrent = viewYM === currentYM();
  const spent = spentOf(viewYM);
  const rem = remainingOf(viewYM);
  const totalDays = daysInYM(viewYM);
  const dayOfMonth = isCurrent ? new Date().getDate() : totalDays;

  if (m.tx.length === 0) {
    box.innerHTML =
      m.start !== null
        ? `<div class="insight-line">${icon("sparkles", "il-ic")}<span>Fresh month, full wallet — ${esc(fmt(m.start))} ${cur} ready. Yalla!</span></div>`
        : "";
    return;
  }

  /* per-category totals */
  const byCat = {};
  for (const t of m.tx) {
    if (!byCat[t.name]) byCat[t.name] = { name: t.name, icon: t.icon, color: t.color, amt: 0 };
    byCat[t.name].amt += t.amt;
  }
  const cats = Object.values(byCat).sort((a, b) => b.amt - a.amt);
  const top = cats[0];

  /* insight sentence */
  const avg = spent / Math.max(1, dayOfMonth);
  let line;
  const hour = new Date().getHours();
  const todaySpent = m.tx.filter((t) => dayKeyOf(t.ts) === dayKeyOf(Date.now())).reduce((s, t) => s + t.amt, 0);
  const topShare = Math.round((top.amt / spent) * 100);
  if (!isCurrent) {
    line = `${esc(monthShort(viewYM))} wrapped — spent ${esc(fmt(spent))} ${cur}${rem !== null ? `, ended with ${esc(fmt(rem))} ${cur}` : ""}.`;
  } else if (todaySpent === 0 && hour >= 18) {
    line = `Zero spent today — el ma7af-za level 100. Respect.`;
  } else if (m.start !== null && spent > (m.start * dayOfMonth) / totalDays * 1.08) {
    line = `Easy ya basha — you're burning faster than the month. ~${esc(fmt(avg))} ${cur}/day so far.`;
  } else if (topShare >= 30) {
    line = `<b>${esc(top.name)}</b> swallowed ${topShare}% of your spending so far.`;
  } else if (m.start !== null && spent < (m.start * dayOfMonth) / totalDays * 0.92) {
    line = `Mashy 3al 7elw — spending below pace. Keep it up!`;
  } else {
    line = `Steady — averaging ${esc(fmt(avg))} ${cur}/day this month.`;
  }

  /* stats */
  let fourth;
  if (isCurrent && m.start !== null && dayOfMonth >= 3) {
    const proj = round2(m.start - avg * totalDays);
    fourth = `<div class="stat"><div class="st-label">projected end</div>
      <div class="st-val${proj < 0 ? "" : ""}">${esc(fmt(proj))} <span class="st-cur">${cur}</span></div>
      <div class="st-sub">at current pace</div></div>`;
  } else if (!isCurrent && rem !== null) {
    fourth = `<div class="stat"><div class="st-label">ended with</div>
      <div class="st-val">${esc(fmt(rem))} <span class="st-cur">${cur}</span></div>
      <div class="st-sub">final balance</div></div>`;
  } else {
    fourth = `<div class="stat"><div class="st-label">spendings</div>
      <div class="st-val">${m.tx.length}</div>
      <div class="st-sub">logged this month</div></div>`;
  }

  const statsHTML = `
    <div class="stats-grid">
      <div class="stat"><div class="st-label">total spent</div>
        <div class="st-val">${esc(fmt(spent))} <span class="st-cur">${cur}</span></div>
        <div class="st-sub">${m.tx.length} spending${m.tx.length === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="st-label">avg / day</div>
        <div class="st-val">${esc(fmt(avg))} <span class="st-cur">${cur}</span></div>
        <div class="st-sub">over ${dayOfMonth} day${dayOfMonth === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="st-label">top category</div>
        <div class="st-val st-cat"><span class="st-ic" style="color:${top.color}">${icon(top.icon)}</span>${esc(top.name)}</div>
        <div class="st-sub">${esc(fmt(top.amt))} ${cur}</div></div>
      ${fourth}
    </div>`;

  /* daily bars */
  const perDay = new Array(totalDays).fill(0);
  for (const t of m.tx) {
    const d = new Date(t.ts).getDate();
    if (d >= 1 && d <= totalDays) perDay[d - 1] += t.amt;
  }
  const maxDay = Math.max(...perDay, 1);
  const todayD = isCurrent ? new Date().getDate() : -1;
  let barsHTML = "";
  for (let d = 1; d <= totalDays; d++) {
    const v = perDay[d - 1];
    const h = v === 0 ? 2 : Math.max(5, (v / maxDay) * 100);
    const cls = d === todayD ? "b-today" : isCurrent && d > todayD ? "b-future" : v === 0 ? "b-zero" : "";
    const showLbl = d === 1 || d % 5 === 0 || d === todayD;
    barsHTML += `
      <button class="bar-col" data-bar-day="${d}" aria-label="Day ${d}">
        <span class="bar ${cls}" style="height:${h}%; animation-delay:${Math.min(d * 12, 320)}ms"></span>
        <span class="bar-day ${d === todayD ? "bd-today" : ""}">${showLbl ? d : ""}</span>
      </button>`;
  }

  /* donut: top 6 + an overflow bucket (flagged, so it can never
     collide with a real category the user named "other(s)") */
  const MAXSEG = 6;
  const segs = cats.slice(0, MAXSEG);
  const restAmt = cats.slice(MAXSEG).reduce((s, c) => s + c.amt, 0);
  if (restAmt > 0) segs.push({ name: "everything else", icon: "banknote", color: "#64748b", amt: restAmt, rest: true });
  const gap = segs.length > 1 ? 0.012 : 0;
  let acc = 0;
  let arcs = "";
  for (const s of segs) {
    const frac = s.amt / spent;
    const dash = Math.max(frac - gap, 0.004) * DONUT_C;
    arcs += `<circle cx="60" cy="60" r="${DONUT_R}" stroke="${s.color}"
      stroke-dasharray="${dash} ${DONUT_C - dash}" stroke-dashoffset="${-acc * DONUT_C}"/>`;
    acc += frac;
  }
  const legendHTML = segs
    .map(
      (s) => `
    <button class="leg" data-leg="${s.rest ? "__rest__" : esc(s.name)}">
      <span class="leg-dot" style="background:${s.color}"></span>
      <span class="leg-name">${esc(s.name)}</span>
      <span class="leg-amt">${esc(fmt(s.amt))}</span>
      <span class="leg-pct">${Math.round((s.amt / spent) * 100)}%</span>
    </button>`
    )
    .join("");

  box.innerHTML = `
    <div class="insight-line">${icon("sparkles", "il-ic")}<span>${line}</span></div>
    ${statsHTML}
    <div class="card chart-card">
      <div class="card-title">DAILY SPENDING — ${esc(monthShort(viewYM)).toUpperCase()}</div>
      <div class="bars">${barsHTML}</div>
    </div>
    <div class="card chart-card">
      <div class="card-title">WHERE IT WENT</div>
      <div class="donut-flex">
        <div class="donut-wrap">
          <svg class="donut" viewBox="0 0 120 120">${arcs}</svg>
          <div class="donut-center"><span class="dc-emoji" style="color:${top.color}">${icon(top.icon)}</span><span class="dc-label">top</span></div>
        </div>
        <div class="legend">${legendHTML}</div>
      </div>
    </div>`;
}

/* ---------------- render: filters & history ---------------- */

function renderFilters() {
  const m = monthData(viewYM);
  const box = $("#filters");
  if (m.tx.length === 0) { box.innerHTML = ""; return; }
  const seen = new Map();
  for (const t of m.tx) if (!seen.has(t.name)) seen.set(t.name, t);
  if (filterCat && !seen.has(filterCat)) filterCat = null;
  let html = `<button class="fchip${filterCat === null ? " active" : ""}" data-filter="">All</button>`;
  for (const [name, t] of seen) {
    html += `<button class="fchip${filterCat === name ? " active" : ""}" data-filter="${esc(name)}">
      <span class="f-dot" style="background:${t.color}"></span>${esc(name)}</button>`;
  }
  box.innerHTML = html;
}

function renderHistory() {
  const m = monthData(viewYM);
  const list = $("#tx-list");
  const cur = esc(state.currency);
  const txs = m.tx
    .filter((t) => !filterCat || t.name === filterCat)
    .sort((a, b) => b.ts - a.ts);

  $("#tx-count").textContent = m.tx.length ? `${m.tx.length} this month` : "";

  if (txs.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <span class="e-icon">${icon(m.tx.length === 0 ? "sprout" : "search")}</span>
        <div class="e-title">${m.tx.length === 0 ? "Nothing spent yet" : "Nothing here"}</div>
        <div class="e-sub">${m.tx.length === 0 ? "Enjoy it while it lasts — tap a category above to log your first one." : "No spendings match this filter."}</div>
      </div>`;
    return;
  }

  let html = "";
  let curDay = null;
  let i = 0;
  for (const t of txs) {
    const dk = dayKeyOf(t.ts);
    if (dk !== curDay) {
      curDay = dk;
      const dayTotal = txs.filter((x) => dayKeyOf(x.ts) === dk).reduce((s, x) => s + x.amt, 0);
      html += `<div class="day-head"><span class="day-label">${dayLabelOf(t.ts)}</span>
        <span class="day-total">${esc(fmt(dayTotal))} ${cur}</span></div>`;
    }
    html += `
      <button class="tx" style="--c:${t.color}; animation-delay:${Math.min(i * 25, 250)}ms" data-tx="${t.id}">
        <span class="tx-emoji">${icon(t.icon)}</span>
        <span class="tx-mid">
          <span class="tx-name">${esc(t.name)}</span>
          <span class="tx-note">${t.note ? esc(t.note) + " · " : ""}${timeOf(t.ts)}</span>
        </span>
        <span class="tx-amt">−${esc(fmt(t.amt))}</span>
      </button>`;
    i++;
  }
  list.innerHTML = html;
}

/* ---------------- render: shell ---------------- */

function renderMonthNav() {
  $("#month-name").textContent = monthLabel(viewYM);
  const cm = currentYM();
  $("#month-sub").textContent = viewYM === cm ? "this month" : viewYM > cm ? "future month" : "past month";
}

function renderGreeting() {
  const h = new Date().getHours();
  $("#greeting").textContent =
    h < 5 ? "Sahran lessa? 🌙" : h < 12 ? "Sabah el kheir ☀️" : h < 18 ? "Masa el kheir 🌤️" : "Masa el noor 🌙";
}

function syncCur() {
  document.querySelectorAll("[data-cur]").forEach((el) => (el.textContent = state.currency));
}

function renderAll() {
  renderMonthNav();
  renderHero();
  renderChips();
  renderInsights();
  renderFilters();
  renderHistory();
  syncCur();
}

/* ---------------- settings ---------------- */

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `fluus-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Backup downloaded");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(reader.result);
      if (!s || s.v !== 1 || typeof s.months !== "object" || !Array.isArray(s.categories)) throw new Error("bad");
      state = s;
      save();
      viewYM = currentYM();
      filterCat = null;
      lastShownRemaining = null;
      closeSheets();
      renderAll();
      toast("Backup restored");
    } catch {
      toast("Hmm, that file doesn't look like a Fluus backup");
    }
  };
  reader.readAsText(file);
}

let wipeArmTimer = null;
function onWipeMonth() {
  const b = $("#btn-wipe-month");
  if (!b.classList.contains("armed")) {
    b.classList.add("armed");
    b.textContent = "Sure? This deletes the whole month";
    wipeArmTimer = setTimeout(() => {
      b.classList.remove("armed");
      b.textContent = "Clear this month's data";
    }, 3000);
    return;
  }
  clearTimeout(wipeArmTimer);
  b.classList.remove("armed");
  b.textContent = "Clear this month's data";
  delete state.months[viewYM];
  lastShownRemaining = null;
  save();
  closeSheets();
  renderAll();
  toast(`${monthShort(viewYM)} wiped clean`);
}

/* ---------------- theme ---------------- */

const THEME_KEY = "fluus-theme";

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#f4f1e8" : "#06080d");
}

/* head script set it pre-paint; sync the meta + wire the toggle */
applyTheme(document.documentElement.dataset.theme || "dark");

$("#btn-theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* ---------------- cloud sync (Supabase, optional) ----------------
   The whole state lives as one JSONB document per user (last write
   wins). localStorage stays the source of truth for instant/offline
   use; the cloud copy is backup + multi-device sync. */

const SUPA = window.FLUUS_SUPABASE || {};
const sb =
  window.supabase && typeof SUPA.url === "string" && SUPA.url.startsWith("https://") && !SUPA.url.includes("YOUR-")
    ? window.supabase.createClient(SUPA.url, SUPA.anonKey)
    : null;

let cloudUser = null;
let pushTimer = null;

function setSyncMsg(msg) {
  const el = $("#sync-status");
  if (el) el.textContent = msg;
}

function renderSyncUI() {
  const note = $("#sync-note");
  if (!sb) {
    $("#sync-out").hidden = true;
    $("#sync-in").hidden = true;
    note.textContent = "Add your Supabase keys in config.js to enable backup & multi-device sync.";
    return;
  }
  $("#sync-out").hidden = !!cloudUser;
  $("#sync-in").hidden = !cloudUser;
  note.textContent = cloudUser
    ? `Signed in as ${cloudUser.email}`
    : "Sign in with an email code to back up & sync across devices.";
}

function schedulePush() {
  if (!sb || !cloudUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(cloudPush, 1500);
}

async function cloudPush() {
  if (!sb || !cloudUser) return false;
  setSyncMsg("Syncing…");
  const { error } = await sb
    .from("app_state")
    .upsert({ user_id: cloudUser.id, data: state, updated_at: new Date().toISOString() });
  if (error) {
    setSyncMsg(navigator.onLine ? "Sync failed — will retry on next change" : "Offline — will sync when back online");
  } else {
    setSyncMsg("Synced just now");
  }
  return !error;
}

async function cloudPull() {
  if (!sb || !cloudUser) return;
  setSyncMsg("Syncing…");
  const { data, error } = await sb.from("app_state").select("data").eq("user_id", cloudUser.id).maybeSingle();
  if (error) {
    setSyncMsg("Couldn't reach the cloud — using local data");
    return;
  }
  const remote = data && data.data;
  const localHasData = Object.keys(state.months).length > 0 || state.categories.length > 0;
  if (remote && (!localHasData || (remote.updatedAt || 0) > (state.updatedAt || 0))) {
    state = remote;
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    filterCat = null;
    lastShownRemaining = null;
    renderAll();
    setSyncMsg("Synced — loaded latest from cloud");
  } else {
    cloudPush();
  }
}

if (sb) {
  sb.auth.getSession().then(({ data }) => {
    cloudUser = data.session ? data.session.user : null;
    renderSyncUI();
    if (cloudUser) cloudPull();
  });
  sb.auth.onAuthStateChange((_event, session) => {
    const wasId = cloudUser && cloudUser.id;
    cloudUser = session ? session.user : null;
    renderSyncUI();
    if (cloudUser && cloudUser.id !== wasId) cloudPull();
  });

  $("#btn-send-code").addEventListener("click", async () => {
    const email = $("#sync-email").value.trim();
    if (!email) return;
    const btn = $("#btn-send-code");
    btn.disabled = true;
    btn.textContent = "Sending…";
    const { error } = await sb.auth.signInWithOtp({ email });
    btn.disabled = false;
    btn.textContent = "Send sign-in code";
    if (error) {
      toast(`Couldn't send code: ${error.message}`);
      return;
    }
    $("#sync-code-row").hidden = false;
    $("#sync-code").focus();
    toast("Code sent — check your email");
  });

  $("#btn-verify-code").addEventListener("click", async () => {
    const email = $("#sync-email").value.trim();
    const code = $("#sync-code").value.trim();
    if (!email || !code) return;
    const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) {
      toast("That code didn't work — try again");
      return;
    }
    $("#sync-code-row").hidden = true;
    $("#sync-code").value = "";
    toast("Signed in — syncing");
  });

  $("#btn-signout").addEventListener("click", async () => {
    // flush unsynced changes first — never wipe data that isn't safely in the cloud
    clearTimeout(pushTimer);
    const pushed = await cloudPush();
    if (!pushed) {
      toast("Couldn't back up your latest changes — check your connection and try again");
      return;
    }
    await sb.auth.signOut();
    state = freshState();
    localStorage.removeItem(LS_KEY);
    filterCat = null;
    lastShownRemaining = null;
    manageCats = false;
    closeSheets();
    renderAll();
    toast("Signed out — this device was wiped. Your data is safe in the cloud.");
  });

  $("#btn-sync-now").addEventListener("click", () => cloudPull());

  window.addEventListener("online", schedulePush);
}

/* ---------------- events ---------------- */

$("#btn-settings").addEventListener("click", () => {
  $("#set-currency").value = state.currency;
  renderSyncUI();
  openSheet("#sheet-settings");
});

$("#m-prev").addEventListener("click", () => { viewYM = shiftYM(viewYM, -1); filterCat = null; lastShownRemaining = null; renderAll(); });
$("#m-next").addEventListener("click", () => { viewYM = shiftYM(viewYM, +1); filterCat = null; lastShownRemaining = null; renderAll(); });

$("#fab").addEventListener("click", () => openAddSheet({}));

$("#btn-manage-cats").addEventListener("click", () => {
  manageCats = !manageCats;
  renderChips();
});

backdrop.addEventListener("click", () => closeSheets());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheets(); });

$("#btn-save").addEventListener("click", saveTx);
$("#btn-save-bal").addEventListener("click", saveBalance);
$("#btn-save-cat").addEventListener("click", saveCat);
$("#btn-delete").addEventListener("click", onDeleteTx);
$("#cat-name").addEventListener("input", updateCatPreview);

$("#set-currency").addEventListener("change", () => {
  const v = $("#set-currency").value.trim();
  if (v) { state.currency = v; save(); renderAll(); toast(`Currency set to ${v}`); }
});

$("#btn-export").addEventListener("click", exportBackup);
$("#btn-import").addEventListener("click", () => $("#file-import").click());
$("#file-import").addEventListener("change", (e) => {
  if (e.target.files[0]) importBackup(e.target.files[0]);
  e.target.value = "";
});
$("#btn-wipe-month").addEventListener("click", onWipeMonth);

/* global delegation */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-key],[data-qamt],[data-act],[data-chip-cat],[data-pick-cat],[data-tx],[data-filter],[data-leg],[data-bar-day],[data-icon-pick]");
  if (!t) return;

  /* keypad */
  if (t.dataset.key !== undefined) {
    const pad = t.closest(".keypad").dataset.pad;
    padInput(pad, t.dataset.key);
    return;
  }
  /* quick amounts */
  if (t.dataset.qamt !== undefined) {
    const v = round2(padValue("add") + Number(t.dataset.qamt));
    pads.add = v % 1 === 0 ? String(v) : v.toFixed(2);
    renderPad("add");
    return;
  }
  /* actions */
  if (t.dataset.act) {
    switch (t.dataset.act) {
      case "close-sheet": closeSheets(); return;
      case "pad-clear": pads.add = ""; renderPad("add"); return;
      case "edit-balance": openBalanceSheet(); return;
      case "carry-over": {
        ensureMonth(viewYM).start = round2(Number(t.dataset.carry));
        save(); renderAll();
        toast(`Carried over ${fmt(Number(t.dataset.carry))} ${state.currency}`);
        return;
      }
      case "new-cat": openCatSheet(true); return;
      case "new-cat-home": openCatSheet(false); return;
    }
    return;
  }
  /* home quick chip → open add preselected (or remove in manage mode) */
  if (t.dataset.chipCat) {
    if (manageCats) removeCategory(t.dataset.chipCat);
    else openAddSheet({ catName: t.dataset.chipCat });
    return;
  }
  /* category pick inside add sheet */
  if (t.dataset.pickCat) {
    selectedCat = { name: t.dataset.pickCat, icon: t.dataset.icon, color: t.dataset.color };
    renderAddCats();
    updateSaveState();
    return;
  }
  /* tap a transaction → edit */
  if (t.dataset.tx) {
    const tx = monthData(viewYM).tx.find((x) => x.id === t.dataset.tx);
    if (tx) openAddSheet({ tx });
    return;
  }
  /* history filter */
  if (t.dataset.filter !== undefined) {
    filterCat = t.dataset.filter || null;
    renderFilters();
    renderHistory();
    return;
  }
  /* legend tap → filter history */
  if (t.dataset.leg) {
    filterCat = t.dataset.leg === "__rest__" ? null : t.dataset.leg;
    renderFilters();
    renderHistory();
    document.querySelector(".history").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  /* bar tap → day detail toast */
  if (t.dataset.barDay) {
    const d = Number(t.dataset.barDay);
    const [y, mo] = ymParts(viewYM);
    const total = monthData(viewYM).tx
      .filter((x) => new Date(x.ts).getDate() === d)
      .reduce((s, x) => s + x.amt, 0);
    const label = new Date(y, mo - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    toast(`${label} — ${total ? fmt(total) + " " + state.currency : "nothing spent"}`);
    return;
  }
  /* icon pick in cat sheet */
  if (t.dataset.iconPick) {
    pickedIcon = t.dataset.iconPick;
    renderIconGrid();
    updateCatPreview();
    return;
  }
});

/* ---------------- boot ---------------- */

renderGreeting();
renderAll();

/* first-run nudge */
(function firstRunNudge() {
  const m = monthData(viewYM);
  if (m.start === null && m.tx.length === 0 && Object.keys(state.months).length === 0) {
    setTimeout(() => toast("Ahlan! Set your starting balance and create your categories"), 900);
  }
})();

/* PWA service worker (https / localhost only) */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
