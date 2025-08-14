// API base: local by default; override in browser console with:
// localStorage.setItem("apiBase","https://snaptradernaija-api.fly.dev")
import { getIdToken, wireAuthUI } from "./auth.js";

const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";

/* ---------- Mobile nav ---------- */
const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");
menuBtn?.addEventListener("click", () => navLinks.classList.toggle("open"));

/* ---------- Auth wiring (real Firebase in auth.js) ---------- */
wireAuthUI?.();

/* ---------- DOM refs ---------- */
const authModal   = document.getElementById("authModal");
const gateEl      = document.getElementById("gate");
const gateLoginBtn = document.getElementById("gateLoginBtn");
const gateSignupBtn= document.getElementById("gateSignupBtn");

const fileInput   = document.getElementById("file");
const form        = document.getElementById("uploadForm");
const dropArea    = document.getElementById("dropArea");
const previewImg  = document.getElementById("preview");
const progressEl  = document.getElementById("progress");
const barEl       = document.getElementById("bar");
const errorEl     = document.getElementById("error");
const resultsCard = document.getElementById("results");
const directionEl = document.getElementById("direction");
const scoreEl     = document.getElementById("score");
const entryEl     = document.getElementById("entry");
const tpEl        = document.getElementById("tp");
const slEl        = document.getElementById("sl");
const pipsToTPEl  = document.getElementById("pipsToTP");
const pipsToSLEl  = document.getElementById("pipsToSL");
const rrEl        = document.getElementById("rr");
const notesEl     = document.getElementById("notes");
const evidenceEl  = document.getElementById("evidence");
const demoBtn     = document.getElementById("demoBtn");
const clearBtn    = document.getElementById("clearBtn");

const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- Helpers ---------- */
function setDirection(d) {
  directionEl.textContent = d || "UNCLEAR";
  directionEl.classList.remove("buy", "sell", "unclear");
  if (d === "BUY") directionEl.classList.add("buy");
  else if (d === "SELL") directionEl.classList.add("sell");
  else directionEl.classList.add("unclear");
}

function renderResult(res, forceShow = false) {
  resultsCard.classList.remove("hidden");

  // Require login to reveal; show a gate overlay if not logged in
  const isLogged = !!localStorage.getItem("stn_user"); // auth.js sets this for UI state
  const canShow = forceShow || isLogged;

  if (!canShow) {
    gateEl?.classList.remove("hidden");
    localStorage.setItem("stn_pending_result", JSON.stringify(res));
    setDirection("—");
    scoreEl.textContent = entryEl.textContent = tpEl.textContent = slEl.textContent =
      pipsToTPEl.textContent = pipsToSLEl.textContent = rrEl.textContent = "—";
    notesEl.innerHTML = "";
    evidenceEl.innerHTML = "";
    return;
  }
  gateEl?.classList.add("hidden");

  setDirection(res.direction);
  scoreEl.textContent    = Number.isFinite(res.score) ? Math.round(res.score) : "—";
  entryEl.textContent    = res.entry ?? "—";
  tpEl.textContent       = res.tp ?? "—";
  slEl.textContent       = res.sl ?? "—";
  pipsToTPEl.textContent = res.pipsToTP ?? "—";
  pipsToSLEl.textContent = res.pipsToSL ?? "—";
  rrEl.textContent       = Number.isFinite(res.rr) ? res.rr.toFixed(2) : "—";

  notesEl.innerHTML = "";
  (res.notes || []).forEach(n => {
    const li = document.createElement("li");
    li.textContent = n;
    notesEl.appendChild(li);
  });

  evidenceEl.innerHTML = "";
  (res.evidence || []).forEach(e => {
    const li = document.createElement("li");
    li.innerHTML = `<b>${e.label}:</b> ${e.value}`;
    evidenceEl.appendChild(li);
  });
}

/* ---------- Drag & drop + preview ---------- */
["dragenter", "dragover"].forEach(evt => {
  dropArea?.addEventListener(evt, e => {
    e.preventDefault();
    dropArea.classList.add("hover");
  });
});
["dragleave", "drop"].forEach(evt => {
  dropArea?.addEventListener(evt, e => {
    e.preventDefault();
    dropArea.classList.remove("hover");
  });
});
dropArea?.addEventListener("drop", e => {
  const f = e.dataTransfer?.files?.[0];
  if (f) {
    fileInput.files = e.dataTransfer.files;
    showPreview(f);
  }
});
fileInput?.addEventListener("change", e => {
  const f = e.target.files?.[0];
  if (f) showPreview(f);
});
function showPreview(f) {
  if (!/^image\/(png|jpeg)$/.test(f.type)) return;
  const url = URL.createObjectURL(f);
  previewImg?.classList.remove("hidden");
  previewImg.src = url;
}
clearBtn?.addEventListener("click", () => {
  fileInput.value = "";
  previewImg?.classList.add("hidden");
  resultsCard?.classList.add("hidden");
  errorEl?.classList.add("hidden");
});

/* ---------- Analyze (sends ID token if logged in) ---------- */
async function analyze(file) {
  errorEl.classList.add("hidden");
  resultsCard.classList.add("hidden");
  progressEl.classList.remove("hidden");

  try {
    const data = new FormData();
    data.append("file", file);

    // Pretty loading bar
    let pct = 10;
    const t = setInterval(() => {
      pct = Math.min(95, pct + 6);
      barEl.style.width = pct + "%";
    }, 120);

    // Attach Firebase ID token if available
    const tok = await getIdToken?.();
    const headers = tok ? { Authorization: `Bearer ${tok}` } : {};

    const res = await fetch(`${API_BASE}/analyze`, { method: "POST", headers, body: data });

    clearInterval(t);
    barEl.style.width = "100%";

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `Server responded ${res.status}`);
    }
    const json = await res.json();
    renderResult(json);
  } catch (err) {
    errorEl.textContent = err.message || "Something went wrong.";
    errorEl.classList.remove("hidden");
  } finally {
    progressEl.classList.add("hidden");
    barEl.style.width = "0%";
  }
}

/* ---------- Form submit ---------- */
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = fileInput.files?.[0];
  if (!f) {
    errorEl.textContent = "Please select an image (PNG/JPG, ≤ 10MB).";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!/^image\/(png|jpeg)$/.test(f.type)) {
    errorEl.textContent = "Only PNG or JPG allowed.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (f.size > 10 * 1024 * 1024) {
    errorEl.textContent = "File too large (max 10MB).";
    errorEl.classList.remove("hidden");
    return;
  }
  analyze(f);
});

/* ---------- Demo button ---------- */
demoBtn?.addEventListener("click", () => {
  renderResult({
    direction: "BUY",
    score: 88,
    entry: 2420.0,
    tp: 2425.5,
    sl: 2416.2,
    pipSize: 0.10,
    pipsToTP: 55.0,
    pipsToSL: 38.0,
    rr: 55.0 / 38.0,
    notes: [
      "Bullish structure on M15/H1",
      "Clean retest of 2419.8",
      "No red-flag news in next 2h"
    ],
    evidence: [
      { label: "Trend", value: "EMA stack up" },
      { label: "S/R", value: "2419.8 support held twice" }
    ]
  });
});

/* ---------- Gate buttons open the modal (auth.js handles modal actions) ---------- */
gateLoginBtn?.addEventListener("click", () => {
  document.getElementById("loginOpenBtn")?.click();
});
gateSignupBtn?.addEventListener("click", () => {
  document.getElementById("signupOpenBtn")?.click();
});

