// API base: local by default; later set with localStorage.setItem("apiBase","https://your-api")
const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";

/* ---------- Auth (client-side placeholder) ---------- */
const authModal = document.getElementById("authModal");
const loginOpenBtn = document.getElementById("loginOpenBtn");
const signupOpenBtn = document.getElementById("signupOpenBtn");
const authTitle = document.getElementById("authTitle");
const authEmail = document.getElementById("authEmail");
const authPass = document.getElementById("authPass");
const authForm = document.getElementById("authForm");
const gateEl = document.getElementById("gate");
const gateLoginBtn = document.getElementById("gateLoginBtn");
const gateSignupBtn = document.getElementById("gateSignupBtn");

function isLoggedIn(){ return !!localStorage.getItem("stn_user"); }
function openAuth(mode){
  if(!authModal) return;
  authTitle.textContent = mode === "signup" ? "Sign up" : "Log in";
  authEmail.value = ""; authPass.value = "";
  authModal.showModal();
}
function closeAuth(){ authModal.close(); }
if(loginOpenBtn) loginOpenBtn.onclick = ()=>openAuth("login");
if(signupOpenBtn) signupOpenBtn.onclick = ()=>openAuth("signup");
if(gateLoginBtn) gateLoginBtn.onclick = ()=>openAuth("login");
if(gateSignupBtn) gateSignupBtn.onclick = ()=>openAuth("signup");
document.getElementById("authCancelBtn")?.addEventListener("click",(e)=>{ e.preventDefault(); closeAuth(); });

authForm?.addEventListener("submit",(e)=>{
  e.preventDefault();
  const email = authEmail.value.trim();
  const pass = authPass.value.trim();
  if(!email || !pass) return;
  // Placeholder auth: save a simple token. Replace with real API later.
  localStorage.setItem("stn_user", JSON.stringify({ email, at: Date.now() }));
  closeAuth();
  // If a result was blocked by gate, reveal it now
  const pending = localStorage.getItem("stn_pending_result");
  if(pending){
    const data = JSON.parse(pending);
    localStorage.removeItem("stn_pending_result");
    renderResult(data, /*forceShow*/ true);
  }
});

/* ---------- App (upload + results) ---------- */
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
document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());

function setDirection(d){
  directionEl.textContent = d || "UNCLEAR";
  directionEl.classList.remove("buy","sell","unclear");
  if(d==="BUY") directionEl.classList.add("buy");
  else if(d==="SELL") directionEl.classList.add("sell");
  else directionEl.classList.add("unclear");
}

function renderResult(res, forceShow=false){
  resultsCard.classList.remove("hidden");
  // Gate: require login to reveal numbers (but still show the card & gate overlay)
  const canShow = forceShow || isLoggedIn();
  if(!canShow){
    gateEl?.classList.remove("hidden");
    // Save data so we can render after login
    localStorage.setItem("stn_pending_result", JSON.stringify(res));
    // Obfuscate values until login
    setDirection("—"); scoreEl.textContent="—"; entryEl.textContent="—";
    tpEl.textContent="—"; slEl.textContent="—"; pipsToTPEl.textContent="—"; pipsToSLEl.textContent="—"; rrEl.textContent="—";
    notesEl.innerHTML=""; evidenceEl.innerHTML="";
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
  errorEl.classList.add("hidden"); resultsCard.classList.add("hidden"); progressEl.classList.remove("hidden");
  try{
    const data = new FormData(); data.append("file", file);
    let pct=10; const t=setInterval(()=>{ pct=Math.min(95,pct+6); barEl.style.width=pct+"%"; }, 120);
    const res = await fetch(`${API_BASE}/analyze`, { method:"POST", body:data });
    clearInterval(t); barEl.style.width="100%";
    if(!res.ok){ const msg = await res.text(); throw new Error(msg || \`Server responded \${res.status}\`); }
    const json = await res.json();
    renderResult(json);
  }catch(err){
    errorEl.textContent = err.message || "Something went wrong.";
    errorEl.classList.remove("hidden");
  }finally{ progressEl.classList.add("hidden"); barEl.style.width="0%"; }
}

form?.addEventListener("submit", (e)=>{
  e.preventDefault();
  const f = fileInput.files?.[0];
  if(!f){ errorEl.textContent="Please select an image (PNG/JPG, ≤ 10MB)."; errorEl.classList.remove("hidden"); return; }
  if(!/^image\/(png|jpeg)$/.test(f.type)){ errorEl.textContent="Only PNG or JPG allowed."; errorEl.classList.remove("hidden"); return; }
  if(f.size > 10 * 1024 * 1024){ errorEl.textContent="File too large (max 10MB)."; errorEl.classList.remove("hidden"); return; }
  analyze(f);
});

demoBtn?.addEventListener("click", ()=>{
  renderResult({
    direction:"BUY", score:84, entry:2420.0, tp:2425.5, sl:2416.2, pipSize:0.10,
    pipsToTP:55.0, pipsToSL:38.0, rr:55.0/38.0,
    notes:["Bullish structure on M15 and H1","Clean retest of 2419.8","No red-flag news in next 2h"],
    evidence:[{label:"Trend",value:"EMA stack up"},{label:"S/R",value:"2419.8 support held twice"}]
  });
});
