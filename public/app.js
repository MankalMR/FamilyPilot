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

// Action feedback (approved Nov 5, 2026): a tapped action shows a
// spinner on its own button while the server confirms, then the
// card animates — delete slides out, Done morphs in place.
// Delete offers Undo for 5s: the row is re-created from a snapshot
// taken before the delete (new server id, same content, including
// status/plan; only the import `source` is not carried over).
// Only one undo is pending at a time — a second delete replaces it.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let toastTimer = null;
function setBusy(btn, busy) {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || btn.textContent;
    delete btn.dataset.label;
  }
}
function hideToast() {
  clearTimeout(toastTimer);
  document.getElementById("toast").hidden = true;
}
function showUndoToast(label, onUndo) {
  const toast = document.getElementById("toast");
  clearTimeout(toastTimer);
  toast.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = label;
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.textContent = "Undo";
  undoBtn.addEventListener("click", async () => {
    undoBtn.disabled = true;
    hideToast();
    await onUndo();
  });
  toast.append(span, undoBtn);
  toast.hidden = false;
  toastTimer = setTimeout(hideToast, 5000);
}
async function slideOutCard(card) {
  // max-height must be a number to animate: pin the current height,
  // then let .leaving collapse it to 0.
  card.style.maxHeight = card.offsetHeight + "px";
  void card.offsetHeight; // reflow so the pin takes before collapsing
  card.classList.add("leaving");
  await sleep(340);
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
// (loose crop — whole face + margin — in rounded squares, variant C,
// user-picked Nov 5 after the tight circular crop clipped the
// girls' chins); Family uses the site icon in Photos mode. The
// anime drawings are used instead of the real photos so no photo
// of the kids sits in the public repo.
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
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 13);
  const showDone = document.getElementById("show-done").checked;
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

  // Done items for today only show when "Show done items" is on
  // (they used to live on Next Up's first day — see below).
  const doneToday = showDone ? items.filter((i) => kidVisible(i.child) && i.status === "done" && i.due_date === today) : [];
  document.getElementById("today-items").innerHTML =
    (openToday.length || doneToday.length) ? [...openToday, ...doneToday].map(itemCard).join("") : "<p>No open items due today or overdue.</p>";

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

  // Tomorrow, full cards — the Today tab is now today + tomorrow,
  // and Next Up starts on the 3rd day, so each day lives in exactly
  // one tab. Same cards as today, so Mark done, lunch plans and
  // delete (with Undo) all work inline here. Done items for
  // tomorrow show only when "Show done items" is on, as above.
  document.getElementById("tomorrow-heading").textContent = "Tomorrow · " + fmtDate(tomorrow);
  document.getElementById("tomorrow-lunch-heading").hidden = !showLunch;
  document.getElementById("tomorrow-kids").innerHTML = showLunch ? (KIDS.filter((k) => kidVisible(k.value)).map((k) => {
    const day = lunch.find((l) => l.child === k.value && l.date === tomorrow);
    return lunchCard(day, k);
  }).join("") || "<p>No kids selected.</p>") : "";
  const openTomorrow = items.filter((i) => kidVisible(i.child) && i.status === "open" && i.due_date === tomorrow);
  const doneTomorrow = showDone ? items.filter((i) => kidVisible(i.child) && i.status === "done" && i.due_date === tomorrow) : [];
  document.getElementById("tomorrow-items").innerHTML =
    (openTomorrow.length || doneTomorrow.length) ? [...openTomorrow, ...doneTomorrow].map(itemCard).join("") : "<p>No open items due tomorrow.</p>";
  document.getElementById("tomorrow-calendar-heading").hidden = !showCalendar;
  if (showCalendar) {
    const tomorrowCal = calendarEvents.filter((ev) => ev.start_date === tomorrow && calVisible(ev))
      .sort((a, b) => (a.start_time || "") < (b.start_time || "") ? -1 : 1);
    document.getElementById("tomorrow-calendar").innerHTML =
      tomorrowCal.length ? tomorrowCal.map(calendarCard).join("") : "<p>No calendar events tomorrow.</p>";
  } else {
    document.getElementById("tomorrow-calendar").innerHTML = "";
  }

  // From the 3rd day onwards, grouped by day. Today + tomorrow
  // live on the Today tab now, so this loop starts at day 2 —
  // and the old overdue-extra on day 0 is gone with it, since
  // overdue items already show under Items due today or overdue.
  let weekHtml = "";
  for (let i = 2; i < 14; i++) {
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
    const dayItemsHtml = dayItems.map(itemCard).join("");
    const dayCalHtml = calendarEvents.filter((ev) => ev.start_date === d && calVisible(ev))
      .sort((a, b) => (a.start_time || "") < (b.start_time || "") ? -1 : 1)
      .map(calendarCard).join("");
    if (dayLunch || dayItemsHtml || dayCalHtml) {
      weekHtml += `<p class="day-head">${fmtDate(d)}</p>` + dayLunch + dayItemsHtml + dayCalHtml;
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
        if (!it) return;
        const toDone = it.status !== "done";
        setBusy(btn, true);
        try {
          await api(`/api/items/${btn.dataset.toggleItem}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: toDone ? "done" : "open" }),
          });
        } catch (err) {
          setBusy(btn, false);
          throw err;
        }
        // Server confirmed: morph the card in place (the .card.done
        // dim + line-through animates via the .card transition),
        // flip the button, then reload so the summary catches up —
        // the re-rendered card looks identical to the morphed one.
        it.status = toDone ? "done" : "open";
        const card = btn.closest(".card");
        if (card) card.classList.toggle("done", toDone);
        setBusy(btn, false);
        btn.textContent = toDone ? "Reopen" : "Mark done";
        setStatus("Item updated.");
        await sleep(320);
        await load();
        return;
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
        const itemId = btn.dataset.deleteItem;
        const it = items.find((x) => String(x.id) === itemId);
        const card = btn.closest(".card");
        setBusy(btn, true);
        try {
          await api(`/api/items/${itemId}`, { method: "DELETE" });
        } catch (err) {
          setBusy(btn, false);
          btn.dataset.confirming = "";
          btn.textContent = "Delete";
          btn.classList.remove("danger");
          throw err;
        }
        // Server confirmed: slide the card out, drop it locally,
        // and offer Undo (re-creates the row from the snapshot).
        if (card) await slideOutCard(card);
        items = items.filter((x) => String(x.id) !== itemId);
        render();
        setStatus("Item deleted.");
        if (it) {
          showUndoToast("Item deleted.", async () => {
            try {
              await api("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ child: it.child, title: it.title, category: it.category, due_date: it.due_date, due_time: it.due_time, details: it.details || "", status: it.status }),
              });
              setStatus("Item restored.");
              await load();
            } catch (err) {
              setStatus(err.message, true);
            }
          });
        }
        return;
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
        const lunchId = btn.dataset.deleteLunch;
        const day = lunch.find((x) => String(x.id) === lunchId);
        const card = btn.closest(".card");
        setBusy(btn, true);
        try {
          await api(`/api/lunch/${lunchId}`, { method: "DELETE" });
        } catch (err) {
          setBusy(btn, false);
          btn.dataset.confirming = "";
          btn.textContent = "Delete";
          btn.classList.remove("danger");
          throw err;
        }
        // Server confirmed: slide the card out, drop it locally,
        // and offer Undo (re-creates the day, plan included).
        if (card) await slideOutCard(card);
        lunch = lunch.filter((x) => String(x.id) !== lunchId);
        render();
        setStatus("Lunch day deleted.");
        if (day) {
          showUndoToast("Lunch day deleted.", async () => {
            try {
              await api("/api/lunch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ child: day.child, date: day.date, menu_text: day.menu_text || "", no_school: !!day.no_school, plan: day.plan || "undecided", note: day.note || "" }),
              });
              setStatus("Lunch day restored.");
              await load();
            } catch (err) {
              setStatus(err.message, true);
            }
          });
        }
        return;
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
