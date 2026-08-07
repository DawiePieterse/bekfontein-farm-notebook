// Shared helpers used by the notebook app.
// Everything is served from the same origin as the backend, so API_BASE is relative.
const API_BASE = "";

const NB = {
  // Bump on every deploy that touches frontend code. Shown in the header so
  // it's obvious at a glance whether a device's cached copy is actually up
  // to date - especially useful given the service worker's cache-first
  // strategy (see frontend/app/service-worker.js).
  VERSION: "1.1",

  getToken() { return localStorage.getItem("nb_token"); },
  setToken(t) { localStorage.setItem("nb_token", t); },
  clearToken() { localStorage.removeItem("nb_token"); },

  getRole() { return localStorage.getItem("nb_role"); },
  setRole(r) { localStorage.setItem("nb_role", r); },

  getDisplayName() { return localStorage.getItem("nb_display_name") || ""; },
  setDisplayName(n) { localStorage.setItem("nb_display_name", n); },

  async login(username, password) {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(`${API_BASE}/api/auth/login`, { method: "POST", body });
    if (!res.ok) throw new Error("Invalid username or password");
    const data = await res.json();
    NB.setToken(data.access_token);
    NB.setRole(data.role);
    NB.setDisplayName(data.display_name || "");
    return data;
  },

  logout() {
    NB.clearToken();
    localStorage.removeItem("nb_role");
    localStorage.removeItem("nb_display_name");
  },

  async api(path, { method = "GET", body, isForm = false } = {}) {
    const headers = {};
    const token = NB.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    let payload = body;
    if (body && !isForm) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${text}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return res.json();
    return res.blob();
  },

  toast(message) {
    let el = document.getElementById("nb-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "nb-toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 2200);
  },

  // Short synthesized confirmation chime (no audio file needed, works fully
  // offline) - plays when an entry is saved locally, before sync even happens.
  _tone(frequency, duration, delay = 0) {
    try {
      const ctx = NB._audioCtx || (NB._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const startAt = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.2, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);
    } catch (e) { /* audio isn't critical - never block capture on it */ }
  },
  beepSaved() { NB._tone(660, 0.09); NB._tone(988, 0.14, 0.1); },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
};
