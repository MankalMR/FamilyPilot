// Family Pilot — Phase 1.5 redesign, vanilla JS. No framework.
//
// Dates: "today" and the 14-day window are ET calendar dates
// (America/New_York via Intl), formatted YYYY-MM-DD as plain
// text. They are never built from UTC timestamps, so a late-night
// ET session does not flip to the next day.
//
// Views: Today = summary + today's lunch per kid + items due
// today or overdue. Next 14 days = days grouped by date, lunch
// and items together. A day with no lunch row is an empty day;
// a day with no_school = true is a friendly "No school" card.
// The kid filter (both / Pia / Misha) applies to both views and
// to the summary counts. Lunch only.

const KIDS = [
  { value: "pia", label: "Pia", school: "New Albany Intermediate · Grade 4" },
  { value: "misha", label: "Misha", school: "Cornerstone Academy · Kindergarten" },
];
const PLANS = [
  { value: "undecided", label: "Undecided" },
  { value: "school", label: "School lunch" },
  { value: "pack", label: "Pack lunch" },
];
let filterKid = "all";
// Show lunch / Show calendar are display toggles, persisted per
// device (localStorage, like the theme) — user decision Nov 5,
// 2026. Both start unchecked: lunch as before, calendar unchecked
// while the mirror is being tested. Items are always shown.
let showLunch = localStorage.getItem("family-pilot-show-lunch") === "1";
let showCalendar = localStorage.getItem("family-pilot-show-calendar") === "1";
// VAPID public key for push subscriptions (spike). The matching private
// JWK is a Pages secret (VAPID_PRIVATE_KEY), never in the repo.
const VAPID_PUBLIC_KEY = "BE_-RxVbDf3GqCin_DzFOfzTAZgyKyyB8-6Gw6HnZYsx5wlSc04DVzM8wg1dpqSgulDTmA8hnNuMQM_YJFCF8yw";
// Category icons, from Spark Muse's approved set, redrawn as inline
// SVG for 16–20px pill size: thick strokes, no fine detail, no text.
// Tiny-size fixes from Spark applied: solid pencil (homework), no
// signature squiggle (form_to_sign), simplified calendar grid (event),
// teal apple on transparent (lunch), house + slash only (no_school).
const ICONS = {
  test: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12.5 L11 15.5 L16.5 9" fill="none" stroke="#7C3AED" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  homework: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6 Q8 4 12 6 Q16 4 20 6 L20 18 Q16 16 12 18 Q8 16 4 18 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6 L12 18" stroke="currentColor" stroke-width="2"/></svg>',
  project: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="14" width="9" height="6" rx="1" fill="#C96F4A"/><rect x="11" y="8" width="9" height="6" rx="1" fill="#C96F4A"/><rect x="6.5" y="11" width="3" height="3" fill="#C96F4A"/><rect x="13.5" y="5" width="3" height="3" fill="#C96F4A"/></svg>',
  form_to_sign: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="12" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 4 L20 9 L15 14 L13 12 Z" fill="currentColor"/></svg>',
  event: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 10 H20" stroke="currentColor" stroke-width="2"/><path d="M12 12.5 L13 14.5 L15 14.5 L13.5 16 L14 18 L12 17 L10 18 L10.5 16 L9 14.5 L11 14.5 Z" fill="#C96F4A"/></svg>',
  no_school: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 L12 6 L19 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11 L8 19 L16 19 L16 11" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 4 L20 20" stroke="#C96F4A" stroke-width="2.5" stroke-linecap="round"/></svg>',
  heads_up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 Q16 4 16 10 L17 16 Q17 18 15 18 L9 18 Q7 18 7 16 L8 10 Q8 4 12 4 Z" fill="currentColor"/><circle cx="18" cy="6" r="2.5" fill="#C96F4A"/></svg>',
  lunch: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="13" r="5" fill="#0F766E"/><circle cx="15" cy="13" r="5" fill="#0F766E"/><path d="M12 8 Q13 5 16 5 Q15 8 12 8 Z" fill="#0F766E"/></svg>',
};
function pill(category, label) {
  return `<span class="pill ${esc(category)}">${ICONS[category] || ""}${esc(label)}</span>`;
}

function etToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}
function addDays(dateText, n) {
  const [y, m, d] = dateText.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function fmtDate(dateText) {
  const [y, m, d] = dateText.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function kidVisible(child) {
  return filterKid === "all" || filterKid === child;
}
function actorName(actor) {
  if (!actor || actor === "service") return "";
  return esc(actor.split("@")[0]);
}

const statusEl = document.getElementById("status");
// API errors must never reach the user as API talk: no PATCH, no
// /api/... paths, no status codes. Translate the ones we know,
// and strip API references from anything else.
function friendlyError(msg) {
  const m = String(msg || "");
  if (/already exists for this child and date/i.test(m)) {
    return "That lunch day already exists for this kid and date. Find it in Today or Next Up and tap Edit there.";
  }
  if (/Request failed \(\d+\)|Failed to fetch|NetworkError/i.test(m)) {
    return "Couldn't reach Family Pilot. Check your connection and try again.";
  }
  if (/PATCH|\/api\//i.test(m)) {
    return "Couldn't save that. Please check the fields and try again.";
  }
  return m.replace(/\/api\/[^\s]*/g, "").trim() || "Couldn't save that. Please try again.";
}
function setStatus(msg, isError = false) {
  statusEl.textContent = isError ? friendlyError(msg) : (msg || "");
  statusEl.className = isError ? "error" : "";
}
function setFormStatus(elId, msg, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = isError ? friendlyError(msg) : (msg || "");
  el.className = isError ? "form-status" : "form-status ok";
}
// Add view shows ONE form at a time (item or lunch), not both
// stacked under a single + Add tab. Edit flows jump to the right
// pane; the + Add tab keeps whichever pane was last used.
function showAddPane(kind) {
  const itemPane = document.getElementById("add-item-pane");
  const lunchPane = document.getElementById("add-lunch-pane");
  if (!itemPane || !lunchPane) return;
  itemPane.hidden = kind !== "item";
  lunchPane.hidden = kind !== "lunch";
  document.getElementById("add-item-tab").classList.toggle("on", kind === "item");
  document.getElementById("add-lunch-tab").classList.toggle("on", kind === "lunch");
}
async function api(path, options) {
  // One retry for transient network failures only (e.g. a first-load
  // "Failed to fetch" that succeeds after a reload). API errors are
  // not retried — they are real responses, not network hiccups.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(path, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    } catch (err) {
      const isNetwork = err instanceof TypeError || /Failed to fetch|NetworkError/i.test(err.message);
      if (isNetwork && attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw err;
    }
  }
}

let items = [];
let lunch = [];
let calendarEvents = [];
let lastSynced = null;
let editingItemId = null;
let editingLunchId = null;

// Calendar mirror (approved Nov 5, 2026): display-only rows from
// Google Calendar, in their own D1 table. No checkbox, no action
// buttons, no alerts, no push. Family (unattributed) events show
// only under the Both-kids filter — never guessed to a kid.
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
}
function calVisible(ev) {
  if (!showCalendar) return false;
  if (ev.child === "family") return filterKid === "all";
  return kidVisible(ev.child);
}
// Avatar style (approved Nov 5, 2026): per-device Photos / Letters
// setting, default Photos (anime). Both the letter and the photo
// are emitted and CSS picks by html[data-avatar-style], so flipping
// the setting needs no re-render. Photos are the anime face crops
// (34px circles, tight face crop — variant C, user-picked Nov 5);
// Family uses the site icon in Photos mode. The anime drawings are
// used instead of the real photos so no photo of the kids sits in
// the public repo.
const PIA_AVATAR = "data:image/jpeg;base64,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";
const MISHA_AVATAR = "data:image/jpeg;base64,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";
function kidAvatar(child) {
  if (child === "family") {
    return `<div class="avatar avatar-letter">F</div><img class="avatar-photo family-icon" src="/icon.svg" alt="" />`;
  }
  const letter = child === "pia" ? "P" : "M";
  const photo = child === "pia" ? PIA_AVATAR : MISHA_AVATAR;
  return `<div class="avatar avatar-letter">${letter}</div><img class="avatar-photo" src="${photo}" alt="" />`;
}
function calendarCard(ev) {
  const who = ev.child === "family" ? "Family" : ev.child === "pia" ? "Pia" : "Misha";
  const when = ev.all_day ? "All day" : fmtTime(ev.start_time) + (ev.end_time ? " – " + fmtTime(ev.end_time) : "");
  return `<div class="card item-card calendar-card ${esc(ev.child)}">
    <div class="kid-head">${kidAvatar(ev.child)}<div><div class="card-title-row"><span class="title">${esc(ev.title)}</span>${pill("event", "calendar")}</div><span class="meta">${esc(who)} · ${esc(when)}${ev.location ? " · " + esc(ev.location) : ""}${ev.calendar_name ? " · " + esc(ev.calendar_name) : ""}</span></div></div>
  </div>`;
}

function lunchCard(day, kid) {
  if (!day) {
    return `<div class="card lunch-card empty ${kid.value}"><strong>${esc(kid.label)}</strong><p>No lunch day saved yet for this date.</p></div>`;
  }
  if (day.no_school) {
    return `<div class="card lunch-card no-school ${kid.value}">
      <div class="kid-head">${kidAvatar(kid.value)}<div><div class="card-title-row"><span class="title">No school</span>${pill("no_school", "no school")}</div><span class="meta">${esc(kid.label)} · ${esc(kid.school)}</span></div></div>
      <p>🎉 No lunch needed.</p>
      ${day.note ? `<p class="note">Note: ${esc(day.note)}</p>` : ""}
      <div class="row-actions">
        <button type="button" data-edit-lunch="${day.id}">Edit</button>
        <button type="button" data-delete-lunch="${day.id}">Delete</button>
      </div>
    </div>`;
  }
  const mainDish = (day.menu_text || "").split("·")[0].trim() || "No menu yet.";
  const planBtns = PLANS.map((p) => `<button type="button" class="${day.plan === p.value ? "on" : ""}" data-lunch-id="${day.id}" data-plan="${p.value}">${esc(p.label)}</button>`).join("");
  const full = day.menu_text && day.menu_text.includes("·")
    ? `<button type="button" class="linkbtn" data-expand-menu>Full menu ↓</button><p class="fullmenu">${esc(day.menu_text)}</p>` : "";
  return `<div class="card lunch-card ${kid.value}">
    <div class="kid-head">${kidAvatar(kid.value)}<div><div class="card-title-row"><p class="main-dish">${esc(mainDish)}</p>${pill("lunch", "lunch")}</div><span class="meta">${esc(kid.label)} · ${esc(kid.school)}</span></div></div>
    ${full}
    ${day.note ? `<p class="note">Note: ${esc(day.note)}</p>` : ""}
    <div class="seg" aria-label="Lunch plan">${planBtns}</div>
    <div class="row-actions">
      <button type="button" data-edit-lunch="${day.id}">Edit</button>
      <button type="button" data-delete-lunch="${day.id}">Delete</button>
    </div>
  </div>`;
}

function itemCard(it) {
  const overdue = it.status === "open" && it.due_date < etToday();
  const actor = actorName(it.actor);
  return `<div class="card item-card ${esc(it.child)}${it.status === "done" ? " done" : ""}">
    <div class="kid-head">${kidAvatar(it.child)}<div><div class="card-title-row"><span class="title">${esc(it.title)}</span>${pill(it.category, it.category.replaceAll("_", " "))}</div><span class="meta">${esc(it.child === "pia" ? "Pia" : "Misha")} · ${fmtDate(it.due_date)}${it.due_time ? " " + esc(it.due_time) : ""}${overdue ? " · Overdue" : ""}${actor ? " · by " + actor : ""}</span></div></div>
    ${it.details ? `<p>${esc(it.details)}</p>` : ""}
    <div class="row-actions">
      <button type="button" data-toggle-item="${it.id}">${it.status === "done" ? "Reopen" : "Mark done"}</button>
      <button type="button" data-edit-item="${it.id}">Edit</button>
      <button type="button" data-delete-item="${it.id}">Delete</button>
    </div>
  </div>`;
}

function render() {
  const today = etToday();
  const weekEnd = addDays(today, 13);
  document.getElementById("today-line").textContent = fmtDate(today) + " (ET)";
  // Keep the persisted toggles in sync with their checkboxes.
  document.getElementById("show-lunch").checked = showLunch;
  document.getElementById("show-calendar").checked = showCalendar;

  // Summary, recounted for the current kid filter.
  const openToday = items.filter((i) => kidVisible(i.child) && i.status === "open" && i.due_date <= today);
  const undecidedToday = lunch.filter((l) => kidVisible(l.child) && l.date === today && !l.no_school && l.plan === "undecided");
  const nextOpen = items.filter((i) => kidVisible(i.child) && i.status === "open" && i.due_date > today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const scope = filterKid === "all" ? "both kids" : (filterKid === "pia" ? "Pia" : "Misha");
  document.getElementById("today-summary").innerHTML =
    `<h2>Today at a glance</h2>` +
    `<p>${openToday.length ? `<b>${openToday.length} item${openToday.length > 1 ? "s" : ""} due or overdue</b> for ${scope}.` : `<b>Nothing due today</b> for ${scope}.`}</p>` +
    (showLunch ? `<p>${undecidedToday.length ? `<b>${undecidedToday.length} lunch decision${undecidedToday.length > 1 ? "s" : ""}</b> still undecided for today.` : `<b>Today's lunch is decided.</b>`}</p>` : "") +
    (nextOpen ? `<p>Up next: <b>${esc(nextOpen.title)}, ${fmtDate(nextOpen.due_date)}</b>.</p>` : "");
  // Glance stripe follows the kid filter, like the summary text.
  const sumEl = document.getElementById("today-summary");
  sumEl.classList.remove("glance-both", "glance-pia", "glance-misha");
  sumEl.classList.add(filterKid === "pia" ? "glance-pia" : filterKid === "misha" ? "glance-misha" : "glance-both");

  document.getElementById("today-lunch-heading").hidden = !showLunch;
  const todayKids = document.getElementById("today-kids");
  todayKids.innerHTML = showLunch ? (KIDS.filter((k) => kidVisible(k.value)).map((k) => {
    const day = lunch.find((l) => l.child === k.value && l.date === today);
    return lunchCard(day, k);
  }).join("") || "<p>No kids selected.</p>") : "";

  document.getElementById("today-items").innerHTML =
    openToday.length ? openToday.map(itemCard).join("") : "<p>No open items due today or overdue.</p>";

  // Today's calendar, only when Show calendar is on. School items
  // have no time, so they stay in their block above; timed calendar
  // events list below in time order. The summary above stays
  // school-only — calendar events never count toward it.
  document.getElementById("today-calendar-heading").hidden = !showCalendar;
  document.getElementById("calendar-sync-line").hidden = !showCalendar;
  if (showCalendar) {
    document.getElementById("calendar-sync-line").textContent = lastSynced
      ? "Calendar synced " + fmtDateTimeET(lastSynced) + " · Google Calendar is the source"
      : "Calendar not synced yet — the next sync will fill this in.";
    const todayCal = calendarEvents.filter((ev) => ev.start_date === today && calVisible(ev))
      .sort((a, b) => (a.start_time || "") < (b.start_time || "") ? -1 : 1);
    document.getElementById("today-calendar").innerHTML =
      todayCal.length ? todayCal.map(calendarCard).join("") : "<p>No calendar events today.</p>";
  } else {
    document.getElementById("today-calendar").innerHTML = "";
  }

  // Next 14 days, grouped by day.
  const showDone = document.getElementById("show-done").checked;
  let weekHtml = "";
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const dayLunch = !showLunch ? "" : KIDS.filter((k) => kidVisible(k.value)).map((k) => {
      const day = lunch.find((l) => l.child === k.value && l.date === d);
      return day ? lunchCard(day, k) : "";
    }).join("");
    const dayItems = items.filter((it) => {
      if (!kidVisible(it.child)) return false;
      if (it.due_date !== d) return false;
      if (it.status === "done") return showDone;
      return true;
    });
    // Overdue open items also appear on the first day, so they are not lost.
    const extra = i === 0 ? items.filter((it) => kidVisible(it.child) && it.status === "open" && it.due_date < today) : [];
    const dayItemsHtml = [...extra, ...dayItems].map(itemCard).join("");
    const dayCalHtml = calendarEvents.filter((ev) => ev.start_date === d && calVisible(ev))
      .sort((a, b) => (a.start_time || "") < (b.start_time || "") ? -1 : 1)
      .map(calendarCard).join("");
    if (dayLunch || dayItemsHtml || dayCalHtml) {
      weekHtml += `<p class="day-head">${fmtDate(d)}${d === today ? " <span>— today</span>" : ""}</p>` + dayLunch + dayItemsHtml + dayCalHtml;
    }
  }
  document.getElementById("week-days").innerHTML = weekHtml || "<p>No lunch days or items in this window yet.</p>";
}

function showView(name) {
  const views = ["today", "week", "history", "settings", "add", "records"];
  const navFor = { today: "nav-today", week: "nav-week", add: "nav-add", history: "nav-more", settings: "nav-more", records: "nav-more" };
  for (const v of views) {
    document.getElementById("view-" + v).hidden = v !== name;
  }
  for (const navId of ["nav-today", "nav-week", "nav-add", "nav-more"]) {
    document.getElementById(navId).classList.toggle("on", navId === navFor[name]);
  }
  // Kid filter + Show lunch only mean anything on Today / Next 14
  // days. They did nothing on Add, History, Settings, or Records,
  // so they are hidden there instead of sitting above an unrelated
  // view. Records has its own Pia/Misha chooser.
  document.getElementById("view-controls").hidden = !(name === "today" || name === "week");
  if (name === "history") loadHistory();
  if (name === "settings") { loadPushPrefs(); applyTheme(); applyAvatarStyle(); }
  if (name === "records") loadRecords();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// More menu: a bottom sheet over the current view. Tapping an
// option closes the menu and opens that view; More stays selected
// while in a More section, and tapping More again reopens the menu.
function openMoreMenu() {
  document.getElementById("more-backdrop").hidden = false;
  document.getElementById("more-menu").hidden = false;
}
function closeMoreMenu() {
  document.getElementById("more-backdrop").hidden = true;
  document.getElementById("more-menu").hidden = true;
}

// Records: info-only reference records, per child. Never in Today
// / Next Up, no due dates, no alerts. Rows are written by Parent
// Muse scans directly to D1 (not via this API); this view only reads.
let records = [];
let recordsKid = "pia";
async function loadRecords() {
  try {
    const data = await api("/api/records");
    records = data.records || [];
    renderRecords();
  } catch (err) {
    document.getElementById("records-list").innerHTML = "<p>Could not load records: " + esc(err.message) + "</p>";
  }
}
function setRecordsKid(kid) {
  recordsKid = kid;
  for (const k of ["pia", "misha"]) {
    document.getElementById("records-" + k).classList.toggle("on", k === kid);
  }
  renderRecords();
}
function recordCard(r) {
  const kidClass = r.child === "misha" ? " misha" : "";
  const detail = r.detail ? `<div class="record-detail" id="record-detail-${r.id}"><p>${esc(r.detail)}</p></div>` : "";
  const pdf = r.pdf_url ? `<p><a class="linkbtn" href="${esc(r.pdf_url)}" target="_blank" rel="noopener">Open full report (PDF)</a></p>` : "";
  const infoBtn = r.detail ? `<button type="button" class="linkbtn record-info-btn" data-id="${r.id}" aria-label="More info">ⓘ</button>` : "";
  return `<article class="card item-card${kidClass}"><div class="card-title-row"><span class="title">${esc(r.title)}</span>${infoBtn}</div><span class="meta">As of ${fmtDate(r.as_of)} · Source: ${esc(r.source)}</span><p>${esc(r.summary)}</p>${detail}${pdf}</article>`;
}
function renderRecords() {
  const list = document.getElementById("records-list");
  const kidName = recordsKid === "pia" ? "Pia" : "Misha";
  const kidRecords = records.filter((r) => r.child === recordsKid);
  if (!kidRecords.length) {
    list.innerHTML = `<div class="card"><p><b>No records yet for ${kidName}.</b></p><p class="sub">No PowerSchool or MAP report has been scanned for ${kidName} yet. When one arrives, it will appear here, per child, with its own as-of date and source.</p></div>`;
    return;
  }
  list.innerHTML = kidRecords.map(recordCard).join("");
  list.querySelectorAll(".record-info-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("record-detail-" + btn.dataset.id).classList.toggle("open");
    });
  });
}

function fmtDateTimeET(text) {
  if (!text) return "";
  const d = new Date(String(text).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return esc(text);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  }).format(d);
}
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function loadHistory() {
  const notifEl = document.getElementById("history-notifications");
  const recentEl = document.getElementById("history-recent");
  try {
    const data = await api("/api/notifications");
    notifEl.innerHTML = data.notifications.length
      ? data.notifications.map((n) => `<div class="card"><div><span class="pill">${esc(n.event_type)}</span><span class="title">${esc(n.title)}</span></div><span class="meta">${fmtDateTimeET(n.created_at)} · to ${esc(n.recipient || "all")} · ${n.sent ? "sent" : "not sent"}${n.actor ? " · by " + actorName(n.actor) : ""}</span>${n.body ? `<p>${esc(n.body)}</p>` : ""}</div>`).join("")
      : "<p>No notifications sent yet. Enable notifications in Settings, then send a test push — it will appear here.</p>";
    recentEl.innerHTML = data.recent_changes.length
      ? data.recent_changes.map((r) => r.kind === "item"
        ? `<div class="card"><div><span class="title">${esc(r.title)}</span></div><span class="meta">Item · ${esc(r.child)} · ${esc(r.status)} · due ${fmtDate(r.due_date)} · ${fmtDateTimeET(r.updated_at)}</span></div>`
        : `<div class="card"><div><span class="title">${esc(r.child)} lunch · ${fmtDate(r.date)}</span></div><span class="meta">Lunch · plan ${esc(r.plan)}${r.no_school ? " · no school" : ""} · ${fmtDateTimeET(r.updated_at)}</span></div>`).join("")
      : "<p>No recent changes yet.</p>";
  } catch (err) {
    notifEl.innerHTML = "<p>Could not load history: " + esc(err.message) + "</p>";
  }
}
async function enableNotifications() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Push is not supported in this browser. On iPhone, add Family Pilot to the Home Screen first.", true);
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("Notification permission was not granted.", true);
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const subJson = sub.toJSON();
    await api("/api/push/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
    });
    setStatus("Notifications enabled on this device.");
  } catch (err) {
    setStatus("Could not enable notifications: " + err.message, true);
  }
}
async function sendTestPush() {
  try {
    const data = await api("/api/push/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true, title: "Family Pilot test push", body: "Test push — if you see this notification, push works on this device." }),
    });
    setStatus(`Test push sent: ${data.sent} sent, ${data.failed} failed, ${data.pruned} pruned.`);
    await loadHistory();
  } catch (err) {
    setStatus("Test push failed: " + err.message, true);
  }
}
async function loadPushPrefs() {
  const el = document.getElementById("push-prefs");
  if (!el) return;
  try {
    const data = await api("/api/push/prefs");
    el.innerHTML = data.prefs.map((p) => `<label class="check"><input type="checkbox" data-pref="${esc(p.event_type)}" ${p.enabled ? "checked" : ""} /> ${esc(p.label)}</label>`).join("");
    el.querySelectorAll("[data-pref]").forEach((box) => box.addEventListener("change", async () => {
      try {
        await api("/api/push/prefs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: box.dataset.pref, enabled: box.checked }),
        });
      } catch (err) {
        setStatus("Could not save notification type: " + err.message, true);
        box.checked = !box.checked;
      }
    }));
  } catch (err) {
    el.innerHTML = "<p>Could not load notification types: " + esc(err.message) + "</p>";
  }
}
async function disableNotifications() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Push is not supported in this browser.", true);
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await api("/api/push/subscribe", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    }
    setStatus("Notifications disabled on this device.");
  } catch (err) {
    setStatus("Could not disable notifications: " + err.message, true);
  }
}

function wireCardActions(root) {
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    try {
      if (btn.dataset.expandMenu !== undefined) {
        const menu = btn.nextElementSibling;
        if (menu) menu.classList.toggle("open");
        btn.textContent = menu && menu.classList.contains("open") ? "Hide full menu" : "Full menu ↓";
        return;
      }
      if (btn.dataset.plan && btn.dataset.lunchId) {
        await api(`/api/lunch/${btn.dataset.lunchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: btn.dataset.plan }),
        });
        setStatus("Lunch plan saved.");
      } else if (btn.dataset.toggleItem) {
        const it = items.find((x) => String(x.id) === btn.dataset.toggleItem);
        await api(`/api/items/${btn.dataset.toggleItem}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: it && it.status === "done" ? "open" : "done" }),
        });
        setStatus("Item updated.");
      } else if (btn.dataset.editItem) {
        const it = items.find((x) => String(x.id) === btn.dataset.editItem);
        if (!it) return;
        editingItemId = it.id;
        document.getElementById("item-id").value = it.id;
        document.getElementById("item-child").value = it.child;
        document.getElementById("item-title").value = it.title;
        document.getElementById("item-category").value = it.category;
        document.getElementById("item-due-date").value = it.due_date;
        document.getElementById("item-due-time").value = it.due_time || "";
        document.getElementById("item-details").value = it.details || "";
        document.getElementById("item-form-title").textContent = "Edit item";
        document.getElementById("item-submit").textContent = "Save item";
        document.getElementById("item-cancel").hidden = false;
        showAddPane("item");
        showView("add");
        return;
      } else if (btn.dataset.deleteItem) {
        // Two-tap confirm, not native confirm(). Native confirm() is
        // auto-dismissed as Cancel in automated browsers and is
        // unreliable in PWA standalone mode — that made Delete look
        // dead: no dialog, no error, no change. First tap arms the
        // button visibly; second tap within 3s actually deletes.
        if (btn.dataset.confirming !== "1") {
          btn.dataset.confirming = "1";
          btn.textContent = "Tap again to delete";
          btn.classList.add("danger");
          setTimeout(() => {
            btn.dataset.confirming = "";
            btn.textContent = "Delete";
            btn.classList.remove("danger");
          }, 3000);
          return;
        }
        await api(`/api/items/${btn.dataset.deleteItem}`, { method: "DELETE" });
        setStatus("Item deleted.");
      } else if (btn.dataset.editLunch) {
        const day = lunch.find((x) => String(x.id) === btn.dataset.editLunch);
        if (!day) return;
        editingLunchId = day.id;
        document.getElementById("lunch-id").value = day.id;
        document.getElementById("lunch-child").value = day.child;
        document.getElementById("lunch-date").value = day.date;
        document.getElementById("lunch-menu").value = day.menu_text || "";
        document.getElementById("lunch-no-school").checked = day.no_school;
        document.getElementById("lunch-note").value = day.note || "";
        document.getElementById("lunch-form-title").textContent = "Edit lunch day";
        document.getElementById("lunch-submit").textContent = "Save lunch day";
        document.getElementById("lunch-cancel").hidden = false;
        showAddPane("lunch");
        showView("add");
        return;
      } else if (btn.dataset.deleteLunch) {
        // Same two-tap pattern as item delete (see above) — lunch
        // delete shared the native confirm() problem.
        if (btn.dataset.confirming !== "1") {
          btn.dataset.confirming = "1";
          btn.textContent = "Tap again to delete";
          btn.classList.add("danger");
          setTimeout(() => {
            btn.dataset.confirming = "";
            btn.textContent = "Delete";
            btn.classList.remove("danger");
          }, 3000);
          return;
        }
        await api(`/api/lunch/${btn.dataset.deleteLunch}`, { method: "DELETE" });
        setStatus("Lunch day deleted. A future import can recreate it, but its plan will be undecided.");
      } else {
        return;
      }
      await load();
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

async function load() {
  const today = etToday();
  const weekEnd = addDays(today, 13);
  const [itemData, lunchData] = await Promise.all([
    api(`/api/items?to=${weekEnd}`),
    api(`/api/lunch?from=${today}&to=${weekEnd}`),
  ]);
  items = itemData.items;
  lunch = lunchData.lunch;
  // Calendar is non-fatal: if the mirror endpoint is not deployed
  // yet (or the table is empty before the first sync), the page
  // still loads with school data and an empty calendar.
  try {
    const calData = await api(`/api/calendar?from=${today}&to=${weekEnd}`);
    calendarEvents = calData.events || [];
    lastSynced = calData.last_synced || null;
  } catch {
    calendarEvents = [];
    lastSynced = null;
  }
  render();
}

document.getElementById("nav-today").addEventListener("click", () => { setStatus(""); showView("today"); });
document.getElementById("nav-week").addEventListener("click", () => { setStatus(""); showView("week"); });
document.getElementById("nav-add").addEventListener("click", () => { setStatus(""); showView("add"); });
document.getElementById("nav-more").addEventListener("click", openMoreMenu);
document.getElementById("more-backdrop").addEventListener("click", closeMoreMenu);
document.getElementById("more-cancel").addEventListener("click", closeMoreMenu);
document.querySelectorAll(".more-option").forEach((btn) => {
  btn.addEventListener("click", () => { closeMoreMenu(); setStatus(""); showView(btn.dataset.view); });
});
document.getElementById("records-pia").addEventListener("click", () => setRecordsKid("pia"));
document.getElementById("records-misha").addEventListener("click", () => setRecordsKid("misha"));
document.getElementById("add-item-tab").addEventListener("click", () => showAddPane("item"));
document.getElementById("add-lunch-tab").addEventListener("click", () => showAddPane("lunch"));
document.getElementById("enable-push").addEventListener("click", enableNotifications);
document.getElementById("test-push").addEventListener("click", sendTestPush);
document.getElementById("disable-push").addEventListener("click", disableNotifications);
document.getElementById("show-done").addEventListener("change", render);

function setFilter(kid) {
  filterKid = kid;
  for (const k of ["all", "pia", "misha"]) {
    document.getElementById("filter-" + k).classList.toggle("on", k === kid);
  }
  render();
}
document.getElementById("filter-all").addEventListener("click", () => setFilter("all"));
document.getElementById("filter-pia").addEventListener("click", () => setFilter("pia"));
document.getElementById("filter-misha").addEventListener("click", () => setFilter("misha"));

document.getElementById("show-lunch").addEventListener("change", (e) => {
  showLunch = e.target.checked;
  localStorage.setItem("family-pilot-show-lunch", showLunch ? "1" : "0");
  render();
});
document.getElementById("show-calendar").addEventListener("change", (e) => {
  showCalendar = e.target.checked;
  localStorage.setItem("family-pilot-show-calendar", showCalendar ? "1" : "0");
  render();
});

document.getElementById("item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    child: document.getElementById("item-child").value,
    title: document.getElementById("item-title").value.trim(),
    category: document.getElementById("item-category").value,
    due_date: document.getElementById("item-due-date").value,
    due_time: document.getElementById("item-due-time").value || null,
    details: document.getElementById("item-details").value.trim(),
  };
  try {
    if (editingItemId) {
      await api(`/api/items/${editingItemId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setStatus("Item saved.");
    } else {
      await api("/api/items", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setStatus("Item added.");
    }
    resetItemForm();
    await load();
    showView("today");
  } catch (err) {
    setStatus(err.message, true);
    setFormStatus("item-form-status", err.message, true);
  }
});
function resetItemForm() {
  editingItemId = null;
  setFormStatus("item-form-status", "");
  document.getElementById("item-form").reset();
  document.getElementById("item-due-date").value = etToday();
  document.getElementById("item-form-title").textContent = "Add an item";
  document.getElementById("item-submit").textContent = "Add item";
  document.getElementById("item-cancel").hidden = true;
}
document.getElementById("item-cancel").addEventListener("click", resetItemForm);

document.getElementById("lunch-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    child: document.getElementById("lunch-child").value,
    date: document.getElementById("lunch-date").value,
    menu_text: document.getElementById("lunch-menu").value.trim(),
    no_school: document.getElementById("lunch-no-school").checked,
    note: document.getElementById("lunch-note").value.trim(),
  };
  try {
    if (editingLunchId) {
      await api(`/api/lunch/${editingLunchId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setStatus("Lunch day saved.");
    } else {
      await api("/api/lunch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setStatus("Lunch day added.");
    }
    resetLunchForm();
    await load();
    showView("today");
  } catch (err) {
    setStatus(err.message, true);
    setFormStatus("lunch-form-status", err.message, true);
  }
});
function resetLunchForm() {
  editingLunchId = null;
  setFormStatus("lunch-form-status", "");
  document.getElementById("lunch-form").reset();
  document.getElementById("lunch-date").value = etToday();
  document.getElementById("lunch-form-title").textContent = "Add a lunch day";
  document.getElementById("lunch-submit").textContent = "Add lunch day";
  document.getElementById("lunch-cancel").hidden = true;
}
document.getElementById("lunch-cancel").addEventListener("click", resetLunchForm);

// Appearance: System / Light / Dark. The override is per device
// (localStorage), not per parent — unlike notification prefs, which
// live in D1 per user. Effective theme = override, or the phone's
// setting when override is System. Approved dark palette, current
// kid pair only — the proposed teal/pink pair is NOT applied here.
function themeOverride() {
  const v = localStorage.getItem("family-pilot-theme");
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}
function effectiveTheme() {
  const o = themeOverride();
  if (o !== "system") return o;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme() {
  const eff = effectiveTheme();
  document.documentElement.setAttribute("data-theme", eff);
  const meta = document.getElementById("theme-color-meta");
  if (meta) meta.setAttribute("content", eff === "dark" ? "#171512" : "#FFF8F1");
  for (const k of ["system", "light", "dark"]) {
    const btn = document.getElementById("theme-" + k);
    if (btn) btn.classList.toggle("on", themeOverride() === k);
  }
}
function setTheme(override) {
  localStorage.setItem("family-pilot-theme", override);
  applyTheme();
}
document.getElementById("theme-system").addEventListener("click", () => setTheme("system"));
document.getElementById("theme-light").addEventListener("click", () => setTheme("light"));
document.getElementById("theme-dark").addEventListener("click", () => setTheme("dark"));

// Avatars: Photos / Letters. Same pattern as the theme — per device
// (localStorage), not per parent. Default Photos (anime, variant C).
// The attribute drives both the filter tabs and every card avatar
// via CSS, so flipping it needs no re-render and no data reload.
function avatarStyle() {
  const v = localStorage.getItem("family-pilot-avatar-style");
  return v === "letters" ? "letters" : "photos";
}
function applyAvatarStyle() {
  const s = avatarStyle();
  document.documentElement.setAttribute("data-avatar-style", s);
  for (const k of ["photos", "letters"]) {
    const btn = document.getElementById("avatar-" + k);
    if (btn) btn.classList.toggle("on", s === k);
  }
}
function setAvatarStyle(style) {
  localStorage.setItem("family-pilot-avatar-style", style);
  applyAvatarStyle();
}
document.getElementById("avatar-photos").addEventListener("click", () => setAvatarStyle("photos"));
document.getElementById("avatar-letters").addEventListener("click", () => setAvatarStyle("letters"));
applyAvatarStyle();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (themeOverride() === "system") applyTheme();
});

document.getElementById("health-btn").addEventListener("click", async () => {
  const out = document.getElementById("health-out");
  out.textContent = "Checking…";
  try {
    const res = await fetch("/api/health");
    out.textContent = JSON.stringify(await res.json(), null, 2);
  } catch (err) {
    out.textContent = "Health check failed: " + err.message;
  }
});

wireCardActions(document.body);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
document.getElementById("item-due-date").value = etToday();
document.getElementById("lunch-date").value = etToday();
applyTheme();
load().catch((err) => setStatus("Could not load data: " + err.message, true));
