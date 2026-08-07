// Bekfontein Farm Notebook: capture, browse, and offline-sync farm knowledge.

let currentTags = [];
let pendingPhotos = [];   // [{tempId, blob, filename}] - newly added, not yet synced
let existingPhotos = [];  // [{id, filename}] - already on the server (edit mode only)
let editingEntryId = null;
let allTagNames = [];

function isRecorder() { return NB.getRole() === "recorder"; }

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
async function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");
  try {
    await NB.login(username, password);
    showApp();
  } catch (e) {
    errEl.textContent = "Invalid username or password";
    errEl.classList.remove("hidden");
  }
}

function logout() {
  NB.logout();
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("headerUser").textContent =
    `Signed in as ${NB.getDisplayName() || NB.getRole()} (${NB.getRole()})`;
  document.getElementById("appVersion").textContent = `v${NB.VERSION}`;
  document.getElementById("tabCapture").classList.toggle("hidden", !isRecorder());
  loadTagSuggestions();
  updateUnsyncedBadge();
  showPage("dashboard");
  loadDashboard();
  loadEntries();
}

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------
function showPage(name) {
  document.querySelectorAll(".page").forEach((el) => el.classList.add("hidden"));
  document.getElementById(`page-${name}`).classList.remove("hidden");
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === name));
  if (name === "dashboard") loadDashboard();
  if (name === "entries") loadEntries();
}

// ---------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------
async function loadTagSuggestions() {
  try {
    const tags = await NB.api("/api/tags");
    allTagNames = tags.map((t) => t.name);
    document.getElementById("tagSuggestions").innerHTML =
      allTagNames.map((n) => `<option value="${n}">`).join("");
    const filterSelect = document.getElementById("tagFilter");
    const current = filterSelect.value;
    filterSelect.innerHTML = `<option value="">All tags</option>` +
      tags.map((t) => `<option value="${t.name}">${t.name} (${t.count})</option>`).join("");
    filterSelect.value = current;
  } catch (e) { /* offline - keep whatever suggestions were already loaded */ }
}

function renderTagChips() {
  document.getElementById("tagChips").innerHTML = currentTags.map((t, i) => `
    <span class="tag-chip">${t} <button type="button" data-i="${i}" class="remove-tag">&times;</button></span>
  `).join("");
  document.querySelectorAll(".remove-tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTags.splice(parseInt(btn.dataset.i), 1);
      renderTagChips();
    });
  });
}

function addTagFromInput() {
  const input = document.getElementById("tagInput");
  const name = input.value.trim();
  if (name && !currentTags.includes(name)) {
    currentTags.push(name);
    renderTagChips();
  }
  input.value = "";
}

// ---------------------------------------------------------------------
// Photo capture (native camera input, downscaled client-side before storing)
// ---------------------------------------------------------------------
function downscaleImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

function renderPhotoThumbs() {
  const existing = existingPhotos.map((p) => `
    <div class="relative">
      <img src="/photos/${p.filename}" class="w-20 h-20 object-cover rounded-lg border">
      <button type="button" data-existing="${p.id}" class="remove-photo absolute -top-2 -right-2 bg-white rounded-full w-6 h-6 shadow text-red-600 text-xs">&times;</button>
    </div>`).join("");
  const pending = pendingPhotos.map((p) => `
    <div class="relative">
      <img src="${URL.createObjectURL(p.blob)}" class="w-20 h-20 object-cover rounded-lg border">
      <button type="button" data-pending="${p.tempId}" class="remove-photo absolute -top-2 -right-2 bg-white rounded-full w-6 h-6 shadow text-red-600 text-xs">&times;</button>
    </div>`).join("");
  document.getElementById("photoThumbs").innerHTML = existing + pending;
  document.querySelectorAll(".remove-photo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.existing) {
        const photoId = parseInt(btn.dataset.existing);
        try {
          await NB.api(`/api/entries/${editingEntryId}/photos/${photoId}`, { method: "DELETE" });
        } catch (e) { NB.toast("Could not remove photo - try again once online"); return; }
        existingPhotos = existingPhotos.filter((p) => p.id !== photoId);
      } else if (btn.dataset.pending) {
        pendingPhotos = pendingPhotos.filter((p) => p.tempId !== btn.dataset.pending);
      }
      renderPhotoThumbs();
    });
  });
}

async function handlePhotoInput(event) {
  const file = event.target.files[0];
  if (!file) return;
  const blob = await downscaleImage(file);
  pendingPhotos.push({ tempId: NB.uuid(), blob, filename: `photo-${Date.now()}.jpg` });
  renderPhotoThumbs();
  event.target.value = "";
}

// ---------------------------------------------------------------------
// Capture form: save (create or edit)
// ---------------------------------------------------------------------
function resetCaptureForm() {
  document.getElementById("entryTitle").value = "";
  document.getElementById("entryBlock").value = "";
  document.getElementById("entryBody").value = "";
  document.getElementById("tagInput").value = "";
  currentTags = [];
  pendingPhotos = [];
  existingPhotos = [];
  editingEntryId = null;
  document.getElementById("captureFormTitle").textContent = "New Entry";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  renderTagChips();
  renderPhotoThumbs();
}

async function saveEntry() {
  const title = document.getElementById("entryTitle").value.trim();
  const body = document.getElementById("entryBody").value.trim();
  if (!title && !body) { NB.toast("Add a title or some notes first"); return; }
  addTagFromInput(); // capture anything left un-submitted in the tag input

  const id = editingEntryId || NB.uuid();
  const entry = {
    id,
    title,
    body,
    block: document.getElementById("entryBlock").value.trim(),
    tags: currentTags,
    created_at: new Date().toISOString(),
    synced: false,
  };
  await IDB.addEntry(entry);
  for (const p of pendingPhotos) {
    await IDB.addPhoto({ entry_id: id, blob: p.blob, filename: p.filename, synced: false });
  }

  NB.beepSaved();
  NB.toast(editingEntryId ? "Entry updated" : "Saved to notebook");
  resetCaptureForm();
  updateUnsyncedBadge();
  showPage("entries");
  syncLoop();
}

async function editEntry(entry) {
  editingEntryId = entry.id;
  document.getElementById("entryTitle").value = entry.title;
  document.getElementById("entryBlock").value = entry.block || "";
  document.getElementById("entryBody").value = entry.body;
  currentTags = [...entry.tags];
  existingPhotos = [...entry.photos];
  pendingPhotos = [];
  document.getElementById("captureFormTitle").textContent = "Edit Entry";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  renderTagChips();
  renderPhotoThumbs();
  closeDetailModal();
  showPage("capture");
}

// ---------------------------------------------------------------------
// Sync loop - mirrors the harvest app's field/app.js pattern: entries
// before their photos (the server's photo endpoint needs the Entry row
// to exist first), never throws, silently retries next tick.
// ---------------------------------------------------------------------
async function syncLoop() {
  if (!navigator.onLine) return;
  try {
    const unsyncedEntries = await IDB.getUnsyncedEntries();
    for (const entry of unsyncedEntries) {
      try {
        await NB.api("/api/entries", { method: "POST", body: entry });
        await IDB.markEntrySynced(entry.id);
      } catch (e) { /* leave unsynced, retry next tick */ }
    }

    const syncedIds = new Set((await IDB.getAllEntries()).filter((e) => e.synced).map((e) => e.id));
    const unsyncedPhotos = await IDB.getUnsyncedPhotos();
    for (const photo of unsyncedPhotos) {
      if (!syncedIds.has(photo.entry_id)) continue; // parent entry not synced yet
      try {
        const form = new FormData();
        form.append("file", photo.blob, photo.filename);
        await NB.api(`/api/entries/${photo.entry_id}/photos`, { method: "POST", body: form, isForm: true });
        await IDB.deletePhoto(photo.local_id);
      } catch (e) { /* leave unsynced, retry next tick */ }
    }
  } catch (e) { /* never let a sync failure surface as an error */ }
  updateUnsyncedBadge();
  loadTagSuggestions();
}

async function updateUnsyncedBadge() {
  const counts = await IDB.getUnsyncedCounts();
  const total = counts.entries + counts.photos;
  const wrap = document.getElementById("unsyncedBadgeWrap");
  if (total > 0) {
    document.getElementById("unsyncedBadge").textContent = `${total} not yet synced`;
    wrap.classList.remove("hidden");
  } else {
    wrap.classList.add("hidden");
  }
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
async function loadDashboard() {
  try {
    const stats = await NB.api("/api/entries/stats");
    document.getElementById("statTotal").textContent = stats.total;
    document.getElementById("statWeek").textContent = stats.this_week;
    document.getElementById("statPhotos").textContent = stats.with_photos;
    document.getElementById("statTags").textContent = stats.tags_used;
    document.getElementById("tagBreakdown").innerHTML = stats.tag_breakdown.map(([name, count]) => `
      <div class="flex justify-between"><span>${name}</span><span class="text-slate-500">${count}</span></div>
    `).join("") || `<div class="text-slate-400">No tags used yet</div>`;
    document.getElementById("recentEntries").innerHTML = stats.recent.map(entryCardHtml).join("") ||
      `<div class="text-slate-400">No entries yet</div>`;
    bindEntryCards("#recentEntries");
  } catch (e) { /* offline - dashboard just shows whatever was last loaded */ }
}

// ---------------------------------------------------------------------
// Entries list
// ---------------------------------------------------------------------
function entryCardHtml(e) {
  const photoThumb = e.photos.length ? `<img src="/photos/${e.photos[0].filename}" class="w-12 h-12 object-cover rounded-lg">` : "";
  const tags = e.tags.map((t) => `<span class="tag-chip">${t}</span>`).join(" ");
  return `
    <button data-id="${e.id}" class="entry-card w-full text-left bg-white rounded-xl shadow p-3 flex gap-3 items-start">
      ${photoThumb}
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm truncate">${e.title || "(untitled)"}</div>
        <div class="text-xs text-slate-500">${e.block ? e.block + " · " : ""}${new Date(e.created_at).toLocaleDateString()}</div>
        <div class="mt-1 flex flex-wrap gap-1">${tags}</div>
      </div>
    </button>`;
}

function bindEntryCards(containerSelector) {
  document.querySelectorAll(`${containerSelector} .entry-card`).forEach((btn) => {
    btn.addEventListener("click", () => showEntryDetail(btn.dataset.id));
  });
}

async function loadEntries() {
  const q = document.getElementById("searchInput").value.trim();
  const tag = document.getElementById("tagFilter").value;
  let entries = [];
  let offline = false;
  try {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (tag) qs.set("tag", tag);
    entries = await NB.api(`/api/entries?${qs.toString()}`);
  } catch (e) {
    offline = true;
  }

  // Merge in anything captured on this device that hasn't synced yet, so it
  // doesn't look like it vanished just because the server hasn't seen it.
  const localUnsynced = await IDB.getUnsyncedEntries();
  const serverIds = new Set(entries.map((e) => e.id));
  for (const local of localUnsynced) {
    if (!serverIds.has(local.id)) {
      entries.unshift({
        id: local.id, title: local.title, body: local.body, block: local.block,
        tags: local.tags, created_at: local.created_at, photos: [], archived: false,
        created_by: "(not yet synced)",
      });
    }
  }
  if (offline && entries.length === 0) {
    entries = (await IDB.getAllEntries()).map((local) => ({
      id: local.id, title: local.title, body: local.body, block: local.block,
      tags: local.tags, created_at: local.created_at, photos: [], archived: false,
      created_by: local.synced ? "" : "(not yet synced)",
    }));
  }

  document.getElementById("entriesList").innerHTML = entries.map(entryCardHtml).join("");
  document.getElementById("entriesEmpty").classList.toggle("hidden", entries.length > 0);
  bindEntryCards("#entriesList");
}

// ---------------------------------------------------------------------
// Entry detail modal
// ---------------------------------------------------------------------
let currentDetailEntry = null;

async function showEntryDetail(id) {
  let entry;
  try {
    entry = await NB.api(`/api/entries/${id}`);
  } catch (e) {
    NB.toast("Could not load entry - check connection");
    return;
  }
  currentDetailEntry = entry;
  document.getElementById("detailTitle").textContent = entry.title || "(untitled)";
  document.getElementById("detailMeta").textContent =
    `${new Date(entry.created_at).toLocaleString()}${entry.created_by ? " · " + entry.created_by : ""}`;
  document.getElementById("detailBlock").textContent = entry.block ? `📍 ${entry.block}` : "";
  document.getElementById("detailTags").innerHTML = entry.tags.map((t) => `<span class="tag-chip">${t}</span>`).join("");
  document.getElementById("detailBody").textContent = entry.body;
  document.getElementById("detailPhotos").innerHTML = entry.photos.map((p) =>
    `<img src="/photos/${p.filename}" class="w-full rounded-lg border">`).join("");
  document.getElementById("detailActions").classList.toggle("hidden", !isRecorder());
  document.getElementById("detailModal").classList.remove("hidden");
  document.getElementById("detailModal").classList.add("flex");
}

function closeDetailModal() {
  document.getElementById("detailModal").classList.add("hidden");
  document.getElementById("detailModal").classList.remove("flex");
  currentDetailEntry = null;
}

async function archiveCurrentEntry() {
  if (!currentDetailEntry) return;
  if (!confirm(`Archive "${currentDetailEntry.title || "this entry"}"? It can be restored later if needed.`)) return;
  try {
    await NB.api(`/api/entries/${currentDetailEntry.id}`, { method: "DELETE" });
    NB.toast("Entry archived");
    closeDetailModal();
    loadEntries();
    loadDashboard();
  } catch (e) {
    NB.toast("Could not archive - check connection");
  }
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
function init() {
  document.getElementById("loginBtn").addEventListener("click", login);
  document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", () => showPage(btn.dataset.tab)));

  document.getElementById("tagInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTagFromInput(); }
  });
  document.getElementById("photoInput").addEventListener("change", handlePhotoInput);
  document.getElementById("saveEntryBtn").addEventListener("click", saveEntry);
  document.getElementById("cancelEditBtn").addEventListener("click", resetCaptureForm);

  document.getElementById("searchInput").addEventListener("keyup", loadEntries);
  document.getElementById("tagFilter").addEventListener("change", loadEntries);

  document.getElementById("closeDetailBtn").addEventListener("click", closeDetailModal);
  document.getElementById("editEntryBtn").addEventListener("click", () => currentDetailEntry && editEntry(currentDetailEntry));
  document.getElementById("archiveEntryBtn").addEventListener("click", archiveCurrentEntry);

  setInterval(syncLoop, 10000);
  window.addEventListener("online", syncLoop);

  if (NB.getToken()) {
    showApp();
  } else {
    document.getElementById("loginScreen").classList.remove("hidden");
  }
  syncLoop();
}

document.addEventListener("DOMContentLoaded", init);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
