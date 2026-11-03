// Family Pilot — Phase 1, vanilla JS. No framework.
//
// Dates: "today" and the 14-day window are ET calendar dates
// (America/New_York via Intl), formatted YYYY-MM-DD as plain
// text. They are never built from UTC timestamps, so a late-night
// ET session does not flip to the next day.
//
// Views: Today = today's lunch per kid + items due today or
// overdue. Next 14 days = lunch per kid for the window + items
// due in the window (plus overdue, which are still open).
// A day with no lunch row is an empty day; a day with
// no_school = true is flagged "No school" and styled differently.

const KIDS = [
  { value: "pia", label: "Pia" },
  { value: "misha", label: "Misha" },
];
const PLANS = [
  { value: "undecided", label: "Undecided" },
  { value: "school", label: "School lunch" },
  { value: "pack", label: "Pack lunch" },
];

function etToday() {
  // en-CA gives YYYY-MM-DD; timeZone pins it to ET.
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

const statusEl = document.getElementById("status");
function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.className = isError ? "error" : "";
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

let items = [];
let lunch = [];
let editingItemId = null;
let editingLunchId = null;

function lunchCard(day, childLabel) {
  if (!day) {
    return `<div class="card lunch-card empty"><strong>${esc(childLabel)}</strong><p>No lunch day saved yet for this date.</p></div>`;
  }
  const planBtns = PLANS.map((p) => `<button type="button" class="plan-btn${day.plan === p.value ? " active" : ""}" data-lunch-id="${day.id}" data-plan="${p.value}">${esc(p.label)}</button>`).join(" ");
  return `<div class="card lunch-card${day.no_school ? " no-school" : ""}">
    <strong>${esc(childLabel)}</strong>
    ${day.no_school ? `<span class="flag">No school</span>` : ""}
    <p>${day.no_school ? "No school — no lunch needed." : esc(day.menu_text) || "No menu yet."}</p>
    ${day.note ? `<p class="note">Note: ${esc(day.note)}</p>` : ""}
    <div class="plan-row" aria-label="Lunch plan">${planBtns}</div>
    <div class="row-actions">
      <button type="button" data-edit-lunch="${day.id}">Edit</button>
      <button type="button" data-delete-lunch="${day.id}">Delete</button>
    </div>
  </div>`;
}

function itemCard(it) {
  const overdue = it.status === "open" && it.due_date < etToday();
  return `<div class="card item-card${it.status === "done" ? " done" : ""}">
    <strong>${esc(it.title)}</strong>
    <span class="meta">${esc(it.child)} · ${esc(it.category.replaceAll("_", " "))} · ${fmtDate(it.due_date)}${it.due_time ? " " + esc(it.due_time) : ""}${overdue ? " · Overdue" : ""}</span>
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
  document.getElementById("today-line").textContent = "Today: " + fmtDate(today) + " (ET)";

  const todayLunch = document.getElementById("today-kids");
  todayLunch.innerHTML = KIDS.map((k) => {
    const day = lunch.find((l) => l.child === k.value && l.date === today);
    return `<h3>${k.label} — today</h3>` + lunchCard(day, k.label);
  }).join("");

  const todayItems = items.filter((i) => i.status === "open" && i.due_date <= today);
  document.getElementById("today-items").innerHTML =
    todayItems.length ? todayItems.map(itemCard).join("") : "<p>No open items due today or overdue.</p>";

  const showDone = document.getElementById("show-done").checked;
  const weekLunch = document.getElementById("week-kids");
  weekLunch.innerHTML = KIDS.map((k) => {
    const days = lunch.filter((l) => l.child === k.value && l.date >= today && l.date <= weekEnd);
    return `<h3>${k.label} — next 14 days</h3>` +
      (days.length
        ? days.map((d) => `<p class="day-head">${fmtDate(d.date)}</p>` + lunchCard(d, k.label)).join("")
        : "<p>No lunch days saved in this window yet.</p>");
  }).join("");

  const weekItems = items.filter((i) => {
    if (i.status === "done") return showDone && i.due_date >= today && i.due_date <= weekEnd;
    return i.due_date <= weekEnd; // open: includes overdue + window
  });
  document.getElementById("week-items").innerHTML =
    weekItems.length ? weekItems.map(itemCard).join("") : "<p>No items in this window.</p>";
}

function wireCardActions(root) {
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    try {
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
        document.getElementById("item-form").scrollIntoView({ behavior: "smooth" });
        return;
      } else if (btn.dataset.deleteItem) {
        if (!confirm("Delete this item?")) return;
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
        document.getElementById("lunch-form").scrollIntoView({ behavior: "smooth" });
        return;
      } else if (btn.dataset.deleteLunch) {
        if (!confirm("Delete this lunch day? A future import can recreate it, but its plan will be undecided.")) return;
        await api(`/api/lunch/${btn.dataset.deleteLunch}`, { method: "DELETE" });
        setStatus("Lunch day deleted.");
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
    api(`/api/lunch?from=${today}&to=${weekEnd}`).catch(async () => {
      // Today view needs only today, but week view needs the window;
      // if the window fetch fails, fall back to today only.
      const d = await api(`/api/lunch?from=${today}&to=${today}`);
      return d;
    }),
  ]);
  items = itemData.items;
  lunch = lunchData.lunch;
  // Today view also needs today's lunch even if the window fetch
  // above was the fallback; the window fetch already covers today.
  render();
}

document.getElementById("tab-today").addEventListener("click", () => {
  document.getElementById("view-today").hidden = false;
  document.getElementById("view-week").hidden = true;
  document.getElementById("tab-today").classList.add("active");
  document.getElementById("tab-week").classList.remove("active");
});
document.getElementById("tab-week").addEventListener("click", () => {
  document.getElementById("view-today").hidden = true;
  document.getElementById("view-week").hidden = false;
  document.getElementById("tab-week").classList.add("active");
  document.getElementById("tab-today").classList.remove("active");
});
document.getElementById("show-done").addEventListener("change", render);

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
document.getElementById("item-due-date").value = etToday();
document.getElementById("lunch-date").value = etToday();
load().catch((err) => setStatus("Could not load data: " + err.message, true));
