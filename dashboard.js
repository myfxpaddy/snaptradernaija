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

  // fetch past analyses
  const res  = await fetch(`${API_BASE}/me/analyses`, { headers: { Authorization: `Bearer ${token}` }});
  const items = (await res.json()).items || [];

  // ask backend for live prices for all unique symbols it knows
  const syms = Array.from(new Set(items.map(i=>i.symbol || "XAUUSD"))).join(",");
  let prices = {};
  try {
    const pRes = await fetch(`${API_BASE}/prices?symbols=${encodeURIComponent(syms)}`, { cache:"no-store" });
    prices = await pRes.json();
  } catch { prices = {}; }

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

  // seed the top-of-page 4-line tickers if present (non-blocking)
  setInlineTicker("t_btc", prices.BTCUSD?.price);
  setInlineTicker("t_eth", prices.ETHUSD?.price);
  setInlineTicker("t_spx", prices.SPX?.price);
  setInlineTicker("t_xau", prices.XAUUSD?.price);

  // kick live feeds
  startLiveFeeds();
}

function setInlineTicker(id, v){
  const el = document.getElementById(id);
  if(el && v!=null) el.textContent = v;
}

/* ================== LIVE TICKERS (ONE CONSOLIDATED IMPLEMENTATION) ================== */
const TILES = {
  // data-ticker="SYMBOL" elements on the page
  BTCUSD: document.querySelector('[data-ticker="BTCUSD"]'),
  ETHUSD: document.querySelector('[data-ticker="ETHUSD"]'),
  SPX   : document.querySelector('[data-ticker="SPX"]'),
  XAUUSD: document.querySelector('[data-ticker="XAUUSD"]'),

  // majors section
  EURUSD: document.querySelector('[data-ticker="EURUSD"]'),
  GBPUSD: document.querySelector('[data-ticker="GBPUSD"]'),
  USDJPY: document.querySelector('[data-ticker="USDJPY"]'),
  USDCHF: document.querySelector('[data-ticker="USDCHF"]'),
  AUDUSD: document.querySelector('[data-ticker="AUDUSD"]'),
  USDCAD: document.querySelector('[data-ticker="USDCAD"]'),
  NZDUSD: document.querySelector('[data-ticker="NZDUSD"]'),
};

const lastPx = Object.fromEntries(Object.keys(TILES).map(k=>[k,null]));
const fmtPx  = (sym, v) => Number(v).toLocaleString(undefined,{
  maximumFractionDigits: (sym.endsWith("JPY")?3: (sym==="BTCUSD"||sym==="ETHUSD")?2:5)
});

function ensurePriceEl(root){
  if(!root) return null;
  return root.querySelector(".price, .px") ||
    (()=>{ const d=document.createElement("div"); d.className="px price"; root.appendChild(d); return d; })();
}
function paint(sym, px){
  const root = TILES[sym]; if(!root || px==null || !Number.isFinite(px)) return;
  const priceEl = ensurePriceEl(root);
  const prev = lastPx[sym];

  root.classList.remove("up","down");
  if(prev!=null){
    if(px>prev) root.classList.add("up");
    else if(px<prev) root.classList.add("down");
  }
  priceEl.textContent = fmtPx(sym, px);
  priceEl.classList.add("tick-blip");
  setTimeout(()=> priceEl.classList.remove("tick-blip"), 300);

  lastPx[sym] = px;
}

/* ---- Crypto via Binance WS, fallback CoinGecko ---- */
let ws, wsLive=false, wsGuard;
function startBinanceWS(){
  try{ ws && ws.close(); }catch{}
  wsLive=false;
  const url = "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade";
  ws = new WebSocket(url);

  ws.onopen = ()=>{ wsLive=true; };
  ws.onmessage = (ev)=>{
    const d = JSON.parse(ev.data);
    const s = d?.data?.s, p = parseFloat(d?.data?.p);
    if(s==="BTCUSDT") paint("BTCUSD", p);
    if(s==="ETHUSDT") paint("ETHUSD", p);
  };
  ws.onerror = ()=>{ try{ ws.close(); }catch{}; wsLive=false; };
  ws.onclose = ()=>{ wsLive=false; setTimeout(startBinanceWS, 3000); };

  // if after 8s we still have no WS, use REST fallback regularly
  clearInterval(wsGuard);
  wsGuard = setInterval(()=>{ if(!wsLive){ pollCoinGecko(); } }, 8000);
}
async function pollCoinGecko(){
  try{
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd", { cache:"no-store" });
    const j = await r.json();
    if(j.bitcoin?.usd)  paint("BTCUSD", +j.bitcoin.usd);
    if(j.ethereum?.usd) paint("ETHUSD", +j.ethereum.usd);
  }catch{}
}

/* ---- Forex via FreeForexAPI, fallback ExchangeRate.host ---- */
const FX_LIST = ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"];

async function pollFreeForex(){
  const url = "https://www.freeforexapi.com/api/live?pairs="+FX_LIST.join(",");
  const r = await fetch(url, { cache:"no-store" });
  if(!r.ok) throw new Error("FFA fail");
  const j = await r.json();
  FX_LIST.forEach(s=>{
    const v = j?.rates?.[s]?.rate;
    if(Number.isFinite(v)) paint(s, v);
  });
}

async function pollERH(){
  const r = await fetch("https://api.exchangerate.host/latest?base=USD", { cache:"no-store" });
  const j = await r.json();
  const R = j?.rates || {};
  const inv = k => (R[k] ? 1 / R[k] : null);
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
  // also free XAUUSD fallback
  if(TILES.XAUUSD){
    // ERH returns USD->XAU (ounce per USD). Invert to get XAUUSD.
    const rx = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=XAU", { cache:"no-store" });
    const jx = await rx.json();
    const usdToXau = jx?.rates?.XAU;
    if(usdToXau) paint("XAUUSD", 1/usdToXau);
  }
}

async function pollFX(){
  try { await pollFreeForex(); }
  catch { try{ await pollERH(); } catch {} }
}

/* ---- Kick everything ---- */
let fxTimer;
function startLiveFeeds(){
  // crypto
  startBinanceWS();
  // fx (immediate + 5s)
  clearInterval(fxTimer);
  pollFX();
  fxTimer = setInterval(pollFX, 5000);
}

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

/* ================== UPLOADER UX (single implementation) ================== */
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

  // prevent browser from opening image in a new tab anywhere on page
  ["dragover","drop"].forEach(ev=> window.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, true));
})();

/* ================== AUTH GUARD ================== */
onAuthChange(u=>{
  if(!u){ location.href="./"; return; }
  loadAll();
});
document.getElementById("refreshBtn")?.addEventListener("click", loadAll);

