import { getIdToken, onAuthChange } from "./auth.js";

/* ================== CONFIG ================== */
const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";

/* ================== KPI + TABLE ================== */
const rowsEl    = document.getElementById("rows");
const k_total   = document.getElementById("k_total");
const k_winrate = document.getElementById("k_winrate");
const k_pips    = document.getElementById("k_pips");
const k_best    = document.getElementById("k_best");

function statusFor(a, price){
  let status="OPEN", dpips=0;
  if(a.direction==="BUY"){
    if(price>=a.tp) status="WIN";
    else if(price<=a.sl) status="LOSS";
    dpips = (price - a.entry) / a.pipSize;
  }else if(a.direction==="SELL"){
    if(price<=a.tp) status="WIN";
    else if(price>=a.sl) status="LOSS";
    dpips = (a.entry - price) / a.pipSize;
  }
  return { status, dpips: Math.round(dpips*10)/10 };
}

async function loadAll(){
  const token = await getIdToken();
  if(!token){ location.href="./"; return; }

  // analyses
  const res  = await fetch(`${API_BASE}/me/analyses`, { headers: { Authorization: `Bearer ${token}` }});
  const items = (await res.json()).items || [];

  // backend prices (used for KPIs + SPX/XAU seed)
  const syms = Array.from(new Set(items.map(i=>i.symbol || "XAUUSD"))).join(",");
  let prices = {};
  try {
    const pRes = await fetch(`${API_BASE}/prices?symbols=${encodeURIComponent(syms)}`, { cache:"no-store" });
    prices = await pRes.json();
  } catch {}

  // table + KPIs
  rowsEl.innerHTML = "";
  let wins=0, finished=0, pipSum=0;
  const bySym = {};
  for (const a of items){
    const sym   = a.symbol || "XAUUSD";
    const price = prices[sym]?.price ?? a.entry;
    const {status, dpips} = statusFor(a, price);

    if(status==="WIN") wins++;
    if(status!=="OPEN") finished++;
    pipSum += dpips;

    bySym[sym] = bySym[sym] || {pips:0,count:0};
    bySym[sym].pips += dpips; bySym[sym].count++;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(a.ts).toLocaleString()}</td>
      <td>${sym}</td>
      <td>${a.direction}</td>
      <td>${a.score}</td>
      <td>${a.entry}</td>
      <td>${a.tp}</td>
      <td>${a.sl}</td>
      <td>${(a.rr||0).toFixed?.(2) ?? a.rr}</td>
      <td>${status}</td>
      <td>${dpips}</td>
    `;
    rowsEl.appendChild(tr);
  }

  k_total.textContent   = String(items.length);
  k_winrate.textContent = finished ? `${Math.round((wins/finished)*100)}%` : "—";
  k_pips.textContent    = `${Math.round(pipSum*10)/10}`;
  let best = Object.entries(bySym).sort((a,b)=>b[1].pips-a[1].pips)[0];
  k_best.textContent    = best ? `${best[0]} (+${Math.round(best[1].pips)})` : "—";

  // seed inline four-line tickers if present
  setInlineTicker("t_btc", prices.BTCUSD?.price);
  setInlineTicker("t_eth", prices.ETHUSD?.price);
  setInlineTicker("t_spx", prices.SPX?.price);
  setInlineTicker("t_xau", prices.XAUUSD?.price);

  // live feeds via Deriv
  startLiveFeeds();
}
function setInlineTicker(id, v){ const el=document.getElementById(id); if(el && v!=null) el.textContent=v; }

/* ================== LIVE TICKERS (Deriv) ================== */
const TILES = Object.fromEntries(
  ["BTCUSD","ETHUSD","SPX","XAUUSD","EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"]
    .map(k=>[k, document.querySelector(`[data-ticker="${k}"]`)])
);
const lastPx = Object.fromEntries(Object.keys(TILES).map(k=>[k,null]));

// UI → Deriv symbols
const MAP = {
  EURUSD:"frxEURUSD",
  GBPUSD:"frxGBPUSD",
  USDJPY:"frxUSDJPY",
  USDCHF:"frxUSDCHF",
  AUDUSD:"frxAUDUSD",
  USDCAD:"frxUSDCAD",
  NZDUSD:"frxNZDUSD",
  XAUUSD:"frxXAUUSD",
  BTCUSD:"cryBTCUSD",
  ETHUSD:"cryETHUSD",
  // SPX is tricky; Deriv’s USA500 OTC index stream:
  SPX:"OTC_USA500",
};
// reverse map
const RMAP = Object.fromEntries(Object.entries(MAP).map(([ui,der])=>[der,ui]));

function ensurePriceEl(root){
  if(!root) return null;
  return root.querySelector(".price, .px") ||
    (()=>{ const d=document.createElement("div"); d.className="px price"; root.appendChild(d); return d; })();
}
function fmt(sym, v){
  const fd = sym.endsWith("JPY") ? 3 : (sym==="BTCUSD"||sym==="ETHUSD" ? 2 : 5);
  return Number(v).toLocaleString(undefined,{ maximumFractionDigits: fd });
}
function paint(sym, px){
  const root = TILES[sym]; if(!root || !Number.isFinite(px)) return;
  const priceEl = ensurePriceEl(root);
  const prev = lastPx[sym];
  root.classList.remove("up","down");
  if(prev!=null){ if(px>prev) root.classList.add("up"); else if(px<prev) root.classList.add("down"); }
  priceEl.textContent = fmt(sym, px);
  priceEl.classList.add("tick-blip"); setTimeout(()=> priceEl.classList.remove("tick-blip"), 280);
  lastPx[sym] = px;
}

let dvWS; let wsAlive=false;
function startDerivWS(){
  try{ dvWS && dvWS.close(); }catch{}
  wsAlive=false;
  const appId = localStorage.getItem("deriv_app_id") || "82105"; // public test id
  const urls = [
    `wss://ws.derivws.com/websockets/v3?app_id=${appId}`,
    `wss://ws.binaryws.com/websockets/v3?app_id=${appId}`, // backup
  ];
  let which = 0;

  function open(){
    dvWS = new WebSocket(urls[which]);
    dvWS.onopen = ()=>{
      wsAlive=true;
      // subscribe to every symbol that exists on the page
      Object.entries(MAP).forEach(([ui,der])=>{
        if(!TILES[ui]) return; // don’t subscribe if no tile in DOM
        dvWS.send(JSON.stringify({ ticks: der, subscribe: 1 }));
      });
    };
    dvWS.onmessage = (ev)=>{
      const m = JSON.parse(ev.data);
      if(m.msg_type === "tick"){
        const dsym = m.tick?.symbol;
        const quote = parseFloat(m.tick?.quote);
        const ui = RMAP[dsym];
        if(ui) paint(ui, quote);
      }
    };
    dvWS.onerror = ()=>{ try{ dvWS.close(); }catch{} };
    dvWS.onclose = ()=>{
      wsAlive=false;
      // flip endpoint and retry
      which = (which+1) % urls.length;
      setTimeout(open, 2000);
    };
  }
  open();

  // lightweight safety net: if socket never comes up, fall back to REST polling
  setTimeout(()=>{ if(!wsAlive) startRestFallbacks(); }, 6000);
}

/* ===== REST fallbacks if WS is blocked ===== */
async function fallbackFX(){
  // ExchangeRate.host base=USD → derive pairs
  try{
    const r = await fetch("https://api.exchangerate.host/latest?base=USD", { cache:"no-store" });
    const j = await r.json(); const R = j?.rates||{};
    const inv = k => (R[k] ? 1/R[k] : null);
    const map = {
      EURUSD: inv("EUR"),
      GBPUSD: inv("GBP"),
      USDJPY: R["JPY"],
      USDCHF: R["CHF"],
      AUDUSD: inv("AUD"),
      USDCAD: R["CAD"],
      NZDUSD: inv("NZD")
    };
    Object.entries(map).forEach(([k,v])=> Number.isFinite(v) && paint(k,v));
    // XAUUSD from USD→XAU inversion
    const rx = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=XAU", { cache:"no-store" });
    const jx = await rx.json(); const ux = jx?.rates?.XAU;
    if(ux) paint("XAUUSD", 1/ux);
  }catch{}
}
async function fallbackCrypto(){
  try{
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd", { cache:"no-store" });
    const j = await r.json();
    if(j.bitcoin?.usd)  paint("BTCUSD", +j.bitcoin.usd);
    if(j.ethereum?.usd) paint("ETHUSD", +j.ethereum.usd);
  }catch{}
}
let restTimer;
function startRestFallbacks(){
  clearInterval(restTimer);
  const tick = async()=>{ await Promise.all([fallbackFX(), fallbackCrypto()]); };
  tick(); restTimer = setInterval(tick, 5000);
}

function startLiveFeeds(){ startDerivWS(); }

/* ================== CAROUSEL CONTROLS ================== */
(function(){
  function byData(name){ return document.querySelector(`.carousel[data-carousel="${name}"]`); }
  function scrollByOne(root, dir){
    if(!root) return;
    const w = root.getBoundingClientRect().width * 0.9;
    root.scrollTo({ left: root.scrollLeft + (dir>0? w : -w), behavior:'smooth' });
  }
  document.querySelectorAll('.car-btn.left').forEach(btn=>{
    btn.addEventListener('click', ()=> scrollByOne(byData(btn.dataset.target), -1));
  });
  document.querySelectorAll('.car-btn.right').forEach(btn=>{
    btn.addEventListener('click', ()=> scrollByOne(byData(btn.dataset.target), +1));
  });

  // drag/swipe + gentle auto-scroll
  document.querySelectorAll('.carousel').forEach(car=>{
    let isDown=false, startX=0, sl=0, pause=false;
    car.addEventListener('pointerdown',e=>{ isDown=true; startX=e.clientX; sl=car.scrollLeft; car.setPointerCapture(e.pointerId); });
    car.addEventListener('pointermove',e=>{ if(!isDown) return; car.scrollLeft = sl - (e.clientX - startX); });
    car.addEventListener('pointerup',()=>{ isDown=false; });
    car.addEventListener('pointercancel',()=>{ isDown=false; });
    car.addEventListener('mouseenter',()=> pause=true);
    car.addEventListener('mouseleave',()=> pause=false);
    setInterval(()=>{ if(pause) return; const max=car.scrollWidth-car.clientWidth; const next=car.scrollLeft + car.clientWidth*0.9; car.scrollTo({ left: next>=max?0:next, behavior:'smooth' }); }, 3500);
  });
})();

/* ================== UPLOADER UX (single impl) ================== */
(function(){
  const drop   = document.getElementById("dropVisual");
  const file   = document.getElementById("file");
  const browse = document.getElementById("browseBtn");
  const openPicker = (e)=>{ e && e.preventDefault(); file && file.click(); };

  browse && browse.addEventListener("click", openPicker);
  drop   && drop.addEventListener("click", (e)=>{ if(e.target.closest("button,a,label")) return; openPicker(e); });

  ["dragenter","dragover"].forEach(ev=> drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag-over"); }));
  ["dragleave","drop"].forEach(ev=> drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag-over"); }));
  drop && drop.addEventListener("drop", e=>{
    e.preventDefault();
    const dt=e.dataTransfer; if(dt && dt.files && dt.files[0]){
      file.files = dt.files;
      file.dispatchEvent(new Event("change",{bubbles:true}));
    }
  });
  ["dragover","drop"].forEach(ev=> window.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, true));
})();

/* ================== AUTH GUARD ================== */
onAuthChange(u=>{
  if(!u){ location.href="./"; return; }
  loadAll();
});
document.getElementById("refreshBtn")?.addEventListener("click", loadAll);

