cat <<'EOF' > dashboard.js
console.log("dashboard.js v-deriv-2025-08-15");

import { getIdToken, onAuthChange, logout } from "./auth.js";

const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";
document.getElementById("logoutBtn")?.addEventListener("click", logout);

// KPI elements
const rowsEl   = document.getElementById("rows");
const k_total  = document.getElementById("k_total");
const k_win    = document.getElementById("k_winrate");
const k_pips   = document.getElementById("k_pips");
const k_best   = document.getElementById("k_best");
const derivStatus = document.getElementById("derivStatus");

// helpers
function elFor(sym){ return document.querySelector(`[data-ticker="${sym}"]`); }
function ensurePriceEl(root){
  if(!root) return null;
  return root.querySelector(".price") || root.querySelector(".px") ||
    (()=>{ const d=document.createElement("div"); d.className="px price"; root.appendChild(d); return d; })();
}
function statusFor(a, price){
  let status="OPEN", dpips=0;
  if(a.direction==="BUY"){
    if(price>=a.tp) status="WIN"; else if(price<=a.sl) status="LOSS";
    dpips = (price - a.entry)/a.pipSize;
  }else if(a.direction==="SELL"){
    if(price<=a.tp) status="WIN"; else if(price>=a.sl) status="LOSS";
    dpips = (a.entry - price)/a.pipSize;
  }
  return { status, dpips: Math.round(dpips*10)/10 };
}

async function loadTableAndKPIs(){
  const token = await getIdToken();
  if(!token){ location.href="./"; return; }
  const res = await fetch(`${API_BASE}/me/analyses`, { headers: { Authorization: `Bearer ${token}` }});
  const items = (await res.json()).items || [];
  rowsEl.innerHTML = "";
  let wins=0, decided=0, pipSum=0;
  const bySym = {};
  items.forEach(a=>{
    const {status, dpips} = statusFor(a, a.entry);
    if(status!=="OPEN") decided++;
    if(status==="WIN") wins++;
    pipSum += dpips;
    bySym[a.symbol] = bySym[a.symbol] || {pips:0,count:0};
    bySym[a.symbol].pips += dpips; bySym[a.symbol].count++;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(a.ts).toLocaleString()}</td>
      <td>${a.symbol}</td>
      <td>${a.direction}</td>
      <td>${a.score}</td>
      <td>${a.entry}</td>
      <td>${a.tp}</td>
      <td>${a.sl}</td>
      <td>${(a.rr||0).toFixed?.(2) ?? a.rr}</td>
      <td>${status}</td>
      <td>${dpips}</td>`;
    rowsEl.appendChild(tr);
  });
  k_total.textContent = String(items.length);
  k_win.textContent   = decided ? `${Math.round((wins/decided)*100)}%` : "—";
  k_pips.textContent  = `${Math.round(pipSum*10)/10}`;
  const best = Object.entries(bySym).sort((a,b)=> b[1].pips - a[1].pips)[0];
  k_best.textContent  = best ? `${best[0]} (+${Math.round(best[1].pips)})` : "—";
}
document.getElementById("refreshBtn")?.addEventListener("click", loadTableAndKPIs);

// Deriv WS
const DERIV_MAP = {
  BTCUSD:"cryBTCUSD", ETHUSD:"cryETHUSD",
  EURUSD:"frxEURUSD", GBPUSD:"frxGBPUSD", USDJPY:"frxUSDJPY",
  USDCHF:"frxUSDCHF", AUDUSD:"frxAUDUSD", USDCAD:"frxUSDCAD", NZDUSD:"frxNZDUSD"
};
const prevPx = Object.fromEntries(Object.keys(DERIV_MAP).map(k=>[k,null]));
let ws;
function setStatus(t){ derivStatus && (derivStatus.textContent = `Deriv: ${t}`); }
function render(sym, px){
  const root = elFor(sym); if(!root) return;
  const priceEl = ensurePriceEl(root);
  const old = prevPx[sym];
  root.classList.remove("up","down");
  if(old!=null){ if(px>old) root.classList.add("up"); else if(px<old) root.classList.add("down"); }
  priceEl.textContent = Number(px).toLocaleString(undefined,{maximumFractionDigits: sym.endsWith("JPY")?3:5});
  priceEl.classList.add("tick-blip"); setTimeout(()=> priceEl.classList.remove("tick-blip"), 220);
  prevPx[sym]=px;
}
function connectDeriv(){
  try{
    const app_id = localStorage.getItem("deriv_app_id") || "82105";
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(app_id)}`;
    ws = new WebSocket(url);
    setStatus("connecting");
    ws.onopen = () => {
      setStatus("live");
      Object.entries(DERIV_MAP).forEach(([ui, dsym])=>{
        if(elFor(ui)) ws.send(JSON.stringify({ ticks: dsym, subscribe: 1 }));
      });
    };
    ws.onmessage = (evt)=>{
      const data = JSON.parse(evt.data);
      const dsym = data?.tick?.symbol;
      const quote = data?.tick?.quote;
      if(!dsym || quote==null) return;
      const ui = Object.keys(DERIV_MAP).find(k => DERIV_MAP[k] === dsym);
      if(ui) render(ui, Number(quote));
    };
    ws.onclose = ()=> { setStatus("reconnecting…"); setTimeout(connectDeriv, 1500); };
    ws.onerror = ()=> { try{ ws.close(); }catch(_e){} };
  }catch(e){ setStatus("error"); setTimeout(connectDeriv, 2500); }
}
window.addEventListener("beforeunload", ()=> { try{ ws && ws.close(); }catch(_e){} });

(function(){
  function byData(name){ return document.querySelector(`.carousel[data-carousel="${name}"]`); }
  function scrollByOne(root, dir){
    if(!root) return;
    const w = root.getBoundingClientRect().width * 0.9;
    root.scrollTo({ left: root.scrollLeft + (dir>0 ? w : -w), behavior:"smooth" });
  }
  document.querySelectorAll(".car-btn.left").forEach(btn=>{
    btn.addEventListener("click", ()=> scrollByOne(byData(btn.dataset.target), -1));
  });
  document.querySelectorAll(".car-btn.right").forEach(btn=>{
    btn.addEventListener("click", ()=> scrollByOne(byData(btn.dataset.target), +1));
  });
  document.querySelectorAll(".carousel").forEach(car=>{
    let isDown=false, startX=0, sl=0;
    car.addEventListener("pointerdown",e=>{ isDown=true; startX=e.clientX; sl=car.scrollLeft; car.setPointerCapture(e.pointerId); });
    car.addEventListener("pointermove",e=>{ if(!isDown) return; car.scrollLeft = sl - (e.clientX - startX); });
    car.addEventListener("pointerup",()=>{ isDown=false; });
    car.addEventListener("pointercancel",()=>{ isDown=false; });
  });
})();

onAuthChange(u=>{
  if(!u){ location.href="./"; return; }
  loadTableAndKPIs();
  connectDeriv();
});
EOF

