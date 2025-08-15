cat <<'EOF' > dashboard.js
console.log("dashboard.js v-deriv-2025-08-15/4");

import { getIdToken, onAuthChange, logout } from "./auth.js";

const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";
document.getElementById("logoutBtn")?.addEventListener("click", logout);

const rowsEl   = document.getElementById("rows");
const k_total  = document.getElementById("k_total");
const k_win    = document.getElementById("k_winrate");
const k_pips   = document.getElementById("k_pips");
const k_best   = document.getElementById("k_best");
const derivStatus = document.getElementById("derivStatus");

// ===== Table + KPIs (unchanged logic) =====
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
  let wins=0, dec=0, pipSum=0;
  const bySym = {};
  items.forEach(a=>{
    const {status, dpips} = statusFor(a, a.entry);
    if(status!=="OPEN") dec++; if(status==="WIN") wins++; pipSum+=dpips;
    bySym[a.symbol] = bySym[a.symbol] || {pips:0,count:0}; bySym[a.symbol].pips+=dpips; bySym[a.symbol].count++;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${new Date(a.ts).toLocaleString()}</td><td>${a.symbol}</td><td>${a.direction}</td><td>${a.score}</td>
                    <td>${a.entry}</td><td>${a.tp}</td><td>${a.sl}</td><td>${(a.rr||0).toFixed?.(2) ?? a.rr}</td><td>${status}</td><td>${dpips}</td>`;
    rowsEl.appendChild(tr);
  });
  k_total.textContent = String(items.length);
  k_win.textContent   = dec ? `${Math.round((wins/dec)*100)}%` : "—";
  k_pips.textContent  = `${Math.round(pipSum*10)/10}`;
  const best = Object.entries(bySym).sort((a,b)=> b[1].pips-a[1].pips)[0];
  k_best.textContent  = best ? `${best[0]} (+${Math.round(best[1].pips)})` : "—";
}
document.getElementById("refreshBtn")?.addEventListener("click", loadTableAndKPIs);

// ===== Deriv tickers (with verbose logs) =====
const DERIV_MAP = {
  BTCUSD:"cryBTCUSD", ETHUSD:"cryETHUSD",
  EURUSD:"frxEURUSD", GBPUSD:"frxGBPUSD", USDJPY:"frxUSDJPY",
  USDCHF:"frxUSDCHF", AUDUSD:"frxAUDUSD", USDCAD:"frxUSDCAD", NZDUSD:"frxNZDUSD"
};
const prevPx = Object.fromEntries(Object.keys(DERIV_MAP).map(k=>[k,null]));
let ws;
function setStatus(t){ if(derivStatus) derivStatus.textContent = `Deriv: ${t}`; console.log("[Deriv]", t); }
function elFor(sym){ return document.querySelector(`[data-ticker="${sym}"]`); }
function ensurePriceEl(root){
  if(!root) return null;
  return root.querySelector(".price") || root.querySelector(".px") ||
    (()=>{ const d=document.createElement("div"); d.className="px price"; root.appendChild(d); return d; })();
}
function render(sym, px){
  const root = elFor(sym); if(!root) return;
  const priceEl = ensurePriceEl(root);
  const old = prevPx[sym];
  root.classList.remove("up","down");
  if(old!=null){ if(px>old) root.classList.add("up"); else if(px<old) root.classList.add("down"); }
  priceEl.textContent = Number(px).toLocaleString(undefined,{maximumFractionDigits: sym.endsWith("JPY")?3:5});
  priceEl.classList.add("tick-blip"); setTimeout(()=> priceEl.classList.remove("tick-blip"), 220);
  prevPx[sym] = px;
}
function connectDeriv(){
  try{
    const app_id = localStorage.getItem("deriv_app_id") || "82105"; // ensure set once in Console
    // Either host works; keep official one:
    const url = `wss://ws.deriv.com/websockets/v3?app_id=${encodeURIComponent(app_id)}`;
    setStatus("connecting…"); ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus("live");
      const want = Object.entries(DERIV_MAP).filter(([ui]) => !!elFor(ui));
      want.forEach(([ui, dsym])=>{
        const msg = { ticks: dsym, subscribe: 1 };
        ws.send(JSON.stringify(msg));
        console.log("[Deriv] subscribe", ui, dsym);
      });
    };

    ws.onmessage = (evt)=>{
      const data = JSON.parse(evt.data);
      if(data?.error){ console.warn("[Deriv error]", data.error); setStatus("error"); return; }
      const dsym = data?.tick?.symbol; const q = data?.tick?.quote;
      if(!dsym || q==null) return;
      const ui = Object.keys(DERIV_MAP).find(k => DERIV_MAP[k] === dsym);
      if(ui){ render(ui, Number(q)); }
    };

    ws.onclose = (e)=>{ console.warn("[Deriv] closed", e.code, e.reason); setStatus("reconnecting…"); setTimeout(connectDeriv, 1500); };
    ws.onerror = (e)=>{ console.warn("[Deriv] error", e); try{ ws.close(); }catch(_){} };
  }catch(e){ console.warn("[Deriv] failed to open", e); setStatus("error"); setTimeout(connectDeriv, 2500); }
}
window.addEventListener("beforeunload", ()=> { try{ ws && ws.close(); }catch(_e){} });

// ===== Carousel controls =====
(function(){
  function byData(name){ return document.querySelector(`.carousel[data-carousel="\${name}"]`.replace(/\$\\{name}/,name)); }
  function scrollByOne(root, dir){ if(!root) return; const w = root.getBoundingClientRect().width * 0.9; root.scrollTo({ left: root.scrollLeft + (dir>0? w : -w), behavior:"smooth" }); }
  document.querySelectorAll(".car-btn.left").forEach(btn=> btn.addEventListener("click", ()=> scrollByOne(byData(btn.dataset.target), -1)));
  document.querySelectorAll(".car-btn.right").forEach(btn=> btn.addEventListener("click", ()=> scrollByOne(byData(btn.dataset.target), +1)));
  document.querySelectorAll(".carousel").forEach(car=>{
    let isDown=false, startX=0, sl=0;
    car.addEventListener("pointerdown",e=>{ isDown=true; startX=e.clientX; sl=car.scrollLeft; car.setPointerCapture(e.pointerId); });
    car.addEventListener("pointermove",e=>{ if(!isDown) return; car.scrollLeft = sl - (e.clientX - startX); });
    car.addEventListener("pointerup",()=>{ isDown=false; }); car.addEventListener("pointercancel",()=>{ isDown=false; });
  });
})();

// ===== Dropzone: click + drag -> fills hidden file input (home tool handles analyze) =====
(function(){
  const drop = document.getElementById("dropVisual");
  const file = document.getElementById("file");
  const browse = document.getElementById("browseBtn");
  function openPicker(e){ e && e.preventDefault(); file?.click(); }
  browse && browse.addEventListener("click", openPicker);
  drop   && drop.addEventListener("click", (e)=>{ if(e.target.closest("button,a,label")) return; openPicker(e); });
  ["dragenter","dragover"].forEach(ev=> drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag-over"); }));
  ["dragleave","drop"].forEach(ev=> drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag-over"); }));
  drop && drop.addEventListener("drop",(e)=>{ const dt=e.dataTransfer; if(dt && dt.files && dt.files[0]){ file.files=dt.files; file.dispatchEvent(new Event("change",{bubbles:true})); }});
  // Stop browser opening the file in a new tab
  ["dragover","drop"].forEach(ev=> window.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, true));
})();
 
// ===== Init =====
onAuthChange(u=>{
  if(!u){ location.href="./"; return; }
  loadTableAndKPIs();
  connectDeriv();
});
EOF

