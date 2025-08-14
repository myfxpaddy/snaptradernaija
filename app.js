// Point to local API during development. Override later with:
// localStorage.setItem("apiBase","https://your-fly-app.fly.dev")
const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";

const fileInput   = document.getElementById("file");
const form        = document.getElementById("uploadForm");
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
document.getElementById("year").textContent = new Date().getFullYear();

function setDirection(d){
  directionEl.textContent = d || "UNCLEAR";
  directionEl.classList.remove("buy","sell","unclear");
  if(d==="BUY") directionEl.classList.add("buy");
  else if(d==="SELL") directionEl.classList.add("sell");
  else directionEl.classList.add("unclear");
}

function renderResult(res){
  resultsCard.classList.remove("hidden");
  setDirection(res.direction);
  scoreEl.textContent    = Number.isFinite(res.score) ? Math.round(res.score) : "—";
  entryEl.textContent    = res.entry ?? "—";
  tpEl.textContent       = res.tp ?? "—";
  slEl.textContent       = res.sl ?? "—";
  pipsToTPEl.textContent = res.pipsToTP ?? "—";
  pipsToSLEl.textContent = res.pipsToSL ?? "—";
  rrEl.textContent       = Number.isFinite(res.rr) ? res.rr.toFixed(2) : "—";

  notesEl.innerHTML = "";
  (res.notes || []).forEach(n=>{
    const li=document.createElement("li"); li.textContent=n; notesEl.appendChild(li);
  });

  evidenceEl.innerHTML = "";
  (res.evidence || []).forEach(e=>{
    const li=document.createElement("li"); li.innerHTML = `<b>${e.label}:</b> ${e.value}`;
    evidenceEl.appendChild(li);
  });
}

async function analyze(file){
  errorEl.classList.add("hidden");
  resultsCard.classList.add("hidden");
  progressEl.classList.remove("hidden");

  try{
    const data = new FormData();
    data.append("file", file);

    let pct=10; const t=setInterval(()=>{ pct=Math.min(95,pct+6); barEl.style.width=pct+"%"; }, 120);

    const res = await fetch(`${API_BASE}/analyze`, { method:"POST", body:data });
    clearInterval(t); barEl.style.width="100%";

    if(!res.ok){
      const msg = await res.text();
      throw new Error(msg || `Server responded ${res.status}`);
    }

    const json = await res.json();
    renderResult(json);
  }catch(err){
    errorEl.textContent = err.message || "Something went wrong.";
    errorEl.classList.remove("hidden");
  }finally{
    progressEl.classList.add("hidden");
    barEl.style.width = "0%";
  }
}

form.addEventListener("submit", (e)=>{
  e.preventDefault();
  const f = fileInput.files?.[0];
  if(!f){ errorEl.textContent="Please select an image (PNG/JPG, ≤ 10MB)."; errorEl.classList.remove("hidden"); return; }
  if(!/^image\/(png|jpeg)$/.test(f.type)){ errorEl.textContent="Only PNG or JPG allowed."; errorEl.classList.remove("hidden"); return; }
  if(f.size > 10 * 1024 * 1024){ errorEl.textContent="File too large (max 10MB)."; errorEl.classList.remove("hidden"); return; }
  analyze(f);
});

demoBtn.addEventListener("click", ()=>{
  // Demo output mirrors backend contract
  renderResult({
    direction: "BUY",
    score: 84,
    entry: 2420.00,
    tp: 2425.50,
    sl: 2416.20,
    pipSize: 0.10,
    pipsToTP: 55.0,
    pipsToSL: 38.0,
    rr: 55.0 / 38.0,
    notes: [
      "Bullish structure on M15 and H1",
      "Clean retest of intraday support (2419.8)",
      "No red-flag news in next 2h"
    ],
    evidence: [
      { label:"Trend", value:"EMA stack up" },
      { label:"S/R",   value:"2419.8 support held twice" }
    ]
  });
});
