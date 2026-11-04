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
let showLunch = true; // checkbox: show lunch or not. Items are always shown.
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
function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.className = isError ? "error" : "";
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
let editingItemId = null;
let editingLunchId = null;

function lunchCard(day, kid) {
  if (!day) {
    return `<div class="card lunch-card empty ${kid.value}"><strong>${esc(kid.label)}</strong><p>No lunch day saved yet for this date.</p></div>`;
  }
  if (day.no_school) {
    return `<div class="card lunch-card no-school ${kid.value}">
      <div class="kid-head"><div class="avatar">${esc(kid.label[0])}</div><div><div class="card-title-row"><span class="title">No school</span>${pill("no_school", "no school")}</div><span class="meta">${esc(kid.label)} · ${esc(kid.school)}</span></div></div>
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
    <div class="kid-head"><div class="avatar">${esc(kid.label[0])}</div><div><div class="card-title-row"><p class="main-dish">${esc(mainDish)}</p>${pill("lunch", "lunch")}</div><span class="meta">${esc(kid.label)} · ${esc(kid.school)}</span></div></div>
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
    <div class="kid-head"><div class="avatar">${esc(it.child === "pia" ? "P" : "M")}</div><div><div class="card-title-row"><span class="title">${esc(it.title)}</span>${pill(it.category, it.category.replaceAll("_", " "))}</div><span class="meta">${esc(it.child === "pia" ? "Pia" : "Misha")} · ${fmtDate(it.due_date)}${it.due_time ? " " + esc(it.due_time) : ""}${overdue ? " · Overdue" : ""}${actor ? " · by " + actor : ""}</span></div></div>
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

  document.getElementById("today-lunch-heading").hidden = !showLunch;
  const todayKids = document.getElementById("today-kids");
  todayKids.innerHTML = showLunch ? (KIDS.filter((k) => kidVisible(k.value)).map((k) => {
    const day = lunch.find((l) => l.child === k.value && l.date === today);
    return lunchCard(day, k);
  }).join("") || "<p>No kids selected.</p>") : "";

  document.getElementById("today-items").innerHTML =
    openToday.length ? openToday.map(itemCard).join("") : "<p>No open items due today or overdue.</p>";

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
    if (dayLunch || dayItemsHtml) {
      weekHtml += `<p class="day-head">${fmtDate(d)}${d === today ? " <span>— today</span>" : ""}</p>` + dayLunch + dayItemsHtml;
    }
  }
  document.getElementById("week-days").innerHTML = weekHtml || "<p>No lunch days or items in this window yet.</p>";
}

function showView(name) {
  for (const v of ["today", "week", "history", "add"]) {
    document.getElementById("view-" + v).hidden = v !== name;
    document.getElementById("nav-" + v).classList.toggle("on", v === name);
  }
  if (name === "history") loadHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
      : "<p>No notifications sent yet. Enable notifications below, then send a test push — it will appear here.</p>";
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
  render();
}

document.getElementById("nav-today").addEventListener("click", () => showView("today"));
document.getElementById("nav-week").addEventListener("click", () => showView("week"));
document.getElementById("nav-history").addEventListener("click", () => showView("history"));
document.getElementById("nav-add").addEventListener("click", () => showView("add"));
document.getElementById("enable-push").addEventListener("click", enableNotifications);
document.getElementById("test-push").addEventListener("click", sendTestPush);
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
  }
});
function resetItemForm() {
  editingItemId = null;
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
  }
});
function resetLunchForm() {
  editingLunchId = null;
  document.getElementById("lunch-form").reset();
  document.getElementById("lunch-date").value = etToday();
  document.getElementById("lunch-form-title").textContent = "Add a lunch day";
  document.getElementById("lunch-submit").textContent = "Add lunch day";
  document.getElementById("lunch-cancel").hidden = true;
}
document.getElementById("lunch-cancel").addEventListener("click", resetLunchForm);

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
load().catch((err) => setStatus("Could not load data: " + err.message, true));
