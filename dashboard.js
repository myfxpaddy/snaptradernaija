import { getIdToken, onAuthChange } from "./auth.js";

const rowsEl = document.getElementById("rows");
const k_total = document.getElementById("k_total");
const k_winrate = document.getElementById("k_winrate");
const k_pips = document.getElementById("k_pips");
const k_best = document.getElementById("k_best");

const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";

function statusFor(a, price){
  // BUY wins if price >= TP; SELL wins if price <= SL
  let status="OPEN", dpips=0;
  if(a.direction==="BUY"){
    if(price>=a.tp) status="WIN";
    else if(price<=a.sl) status="LOSS";
    dpips = ((price - a.entry)/a.pipSize);
  }else if(a.direction==="SELL"){
    if(price<=a.tp) status="WIN";
    else if(price>=a.sl) status="LOSS";
    dpips = ((a.entry - price)/a.pipSize);
  }
  return {status, dpips: Math.round(dpips*10)/10};
}

async function loadAll(){
  const token = await getIdToken();
  if(!token){ location.href="./"; return; }

  const res = await fetch(`${API_BASE}/me/analyses`, { headers: { Authorization: `Bearer ${token}` }});
  const items = (await res.json()).items || [];

  // Get unique symbols
  const syms = Array.from(new Set(items.map(i=>i.symbol || "XAUUSD"))).join(",");
  const pRes = await fetch(`${API_BASE}/prices?symbols=${encodeURIComponent(syms)}`);
  const prices = await pRes.json();

  // Render table + compute KPIs
  rowsEl.innerHTML="";
  let wins=0, total=0, pipSum=0;
  const bySym = {};
  items.forEach(a=>{
    const sym = a.symbol || "XAUUSD";
    const price = prices[sym]?.price ?? a.entry;
    const {status, dpips} = statusFor(a, price);
    if(status==="WIN") wins++;
    if(status!=="OPEN") total++;
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
  });

  k_total.textContent = String(items.length);
  k_winrate.textContent = total ? `${Math.round((wins/total)*100)}%` : "—";
  k_pips.textContent = `${Math.round(pipSum*10)/10}`;
  let best = Object.entries(bySym).sort((a,b)=>b[1].pips-a[1].pips)[0];
  k_best.textContent = best ? `${best[0]} (+${Math.round(best[1].pips)})` : "—";

  // Live tickers
  document.getElementById("t_btc").textContent = prices.BTCUSD?.price ?? "—";
  document.getElementById("t_eth").textContent = prices.ETHUSD?.price ?? "—";
  document.getElementById("t_spx").textContent = prices.SPX?.price ?? "—";
  document.getElementById("t_xau").textContent = prices.XAUUSD?.price ?? "—";
}

document.getElementById("refreshBtn")?.addEventListener("click", loadAll);

// protect page
onAuthChange(u=>{
  if(!u){ location.href="./"; return; }
  loadAll();
});


/* Bigger dropzone behavior */
(function(){
  const drop = document.querySelector(".drop-visual");
  const file = document.getElementById("file");
  if(!drop || !file) return;
  ["dragenter","dragover"].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag-over"); }));
  ["dragleave","drop"].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag-over"); }));
  drop.addEventListener("drop", (e)=>{ const dt=e.dataTransfer; if(dt && dt.files && dt.files[0]){ file.files = dt.files; file.dispatchEvent(new Event("change")); }});
})();


/* --- Uploader UX: clickable + global DnD --- */
(function(){
  const drop = document.getElementById("dropVisual");
  const file = document.getElementById("file");
  const browse = document.getElementById("browseBtn");

  // Open picker from the button or clicking anywhere in the drop area
  function openPicker(e){ e && e.preventDefault(); if (file) file.click(); }
  browse && browse.addEventListener("click", openPicker);
  drop   && drop.addEventListener("click", (e)=> {
    // avoid triggering when clicking on buttons/links inside the area
    const t = e.target; if (t.closest("button") || t.closest("a")) return;
    openPicker(e);
  });

  // Highlight on drag
  ["dragenter","dragover"].forEach(ev=> drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag-over"); }));
  ["dragleave","drop"].forEach(ev=> drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag-over"); }));

  // Accept drop
  drop && drop.addEventListener("drop", (e)=>{
    e.preventDefault();
    const dt=e.dataTransfer; if(dt && dt.files && dt.files[0]){
      file.files = dt.files;
      file.dispatchEvent(new Event("change", {bubbles:true}));
    }
  });

  // Prevent the browser from opening the image when dropped anywhere else
  ["dragover","drop"].forEach(ev=> document.addEventListener(ev, e=>{ e.preventDefault(); }));
})();


/* --- Uploader UX: clickable (label-for) + global DnD prevent --- */
(function(){
  const drop = document.getElementById("dropVisual");
  const file = document.getElementById("file");
  if (drop){
    ["dragenter","dragover"].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag-over"); }));
    ["dragleave","drop"].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag-over"); }));
    drop.addEventListener("drop",(e)=>{ e.preventDefault(); const dt=e.dataTransfer; if(dt&&dt.files&&dt.files[0]){ file.files=dt.files; file.dispatchEvent(new Event("change",{bubbles:true})); }});
  }
  // Prevent open-in-new-tab when dropping anywhere on the page
  ["dragover","drop"].forEach(ev=> window.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, true));
})();


/* (replaced by hardened sections) */
   - Crypto (BTC/ETH): Binance WebSocket (true realtime)
   - SPX & XAUUSD   : REST polling (Twelve Data), if api key present
================================================= */

(function(){
  const els = {
    BTCUSD: document.querySelector('[data-ticker="BTCUSD"]'),
    ETHUSD: document.querySelector('[data-ticker="ETHUSD"]'),
    SPX   : document.querySelector('[data-ticker="SPX"]'),
    XAUUSD: document.querySelector('[data-ticker="XAUUSD"]')
  };

  // Utility to render one ticker
  function render(el, px, prev){
    if(!el) return;
    const priceEl = el.querySelector('.price');
    const root = el;
    const dir = (prev==null) ? '' : (px > prev ? 'up' : px < prev ? 'down' : '');
    root.classList.remove('up','down');
    if(dir) root.classList.add(dir);
    if(priceEl){
      priceEl.textContent = (px!=null) ? Number(px).toLocaleString(undefined,{maximumFractionDigits:2}) : '—';
      priceEl.classList.add('tick-blip'); setTimeout(()=> priceEl.classList.remove('tick-blip'), 200);
    }
    return px;
  }

  // --------- Crypto via Binance WS (no key needed) ----------
  // map: DOM key -> Binance stream symbol
  const binance = [
    { key:'BTCUSD', stream:'btcusdt' },
    { key:'ETHUSD', stream:'ethusdt' }
  ];
  const prev = { BTCUSD:null, ETHUSD:null, SPX:null, XAUUSD:null };

  function openBinance(){
    try{
      const streams = binance.map(b=> `${b.stream}@trade`).join('/');
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      ws.onmessage = (evt)=>{
        const data = JSON.parse(evt.data);
        const s = data?.data?.s;     // e.g. BTCUSDT
        const p = data?.data?.p;     // last price as string
        if(!s || !p) return;
        const key = (s==='BTCUSDT')?'BTCUSD':(s==='ETHUSDT')?'ETHUSD':null;
        if(!key) return;
        prev[key] = render(els[key], parseFloat(p), prev[key]);
      };
      ws.onclose = ()=> setTimeout(openBinance, 1500); // simple auto-reconnect
      ws.onerror = ()=> { try{ ws.close(); }catch(e){} };
    }catch(e){ console.warn('Binance WS failed', e); }
  }
  openBinance();

  // --------- SPX & XAU via polling (Twelve Data) ----------
  // Put your key in localStorage once: localStorage.setItem('tw_key','YOUR_KEY')
  const TW_KEY = localStorage.getItem('tw_key') || null;
  const TW_BASE = 'https://api.twelvedata.com/price';

  async function fetchPrice(symbol){
    if(!TW_KEY) return null;
    try{
      const url = `${TW_BASE}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(TW_KEY)}`;
      const r = await fetch(url, { cache:'no-store' });
      const j = await r.json();
      const px = parseFloat(j?.price);
      return Number.isFinite(px) ? px : null;
    }catch(e){ return null; }
  }

  async function poll(){
    if(els.SPX){
      const px = await fetchPrice('^GSPC'); // S&P 500 index (may be delayed)
      if(px!=null) prev.SPX = render(els.SPX, px, prev.SPX);
    }
    if(els.XAUUSD){
      const px = await fetchPrice('XAU/USD'); // Gold spot (provider-dependent)
      if(px!=null) prev.XAUUSD = render(els.XAUUSD, px, prev.XAUUSD);
    }
  }
  // poll immediately then every 45s (free-tier safe)
  poll();
  setInterval(poll, 45000);
})();


/* ========= FreeForexAPI polling (majors) ========= */
(function(){
  const pairs = ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"];
  const els = Object.fromkeys ? Object.fromkeys(pairs) : pairs.reduce((o,k)=> (o[k]=document.querySelector(`[data-ticker="${k}"]`), o), {});
  let prev = {};
  function render(sym, px){
    const el = els[sym]; if(!el) return;
    const priceEl = el.querySelector('.price') || (function(){ const sp = document.createElement('span'); sp.className='price'; el.appendChild(sp); return sp; })();
    const old = prev[sym];
    el.classList.remove('up','down');
    if(old!=null){
      if(px>old) el.classList.add('up');
      else if(px<old) el.classList.add('down');
    }
    priceEl.textContent = Number(px).toLocaleString(undefined, {maximumFractionDigits: 5});
    priceEl.classList.add('tick-blip'); setTimeout(()=> priceEl.classList.remove('tick-blip'), 200);
    prev[sym] = px;
  }
  async function poll(){
    try{
      const url = `https://www.freeforexapi.com/api/live?pairs=${pairs.join(",")}`;
      const r = await fetch(url, { cache:"no-store" });
      const j = await r.json();
      // shape: { rates: { EURUSD:{rate:1.0, ...}, ...}, code:200 }
      const rates = j && j.rates ? j.rates : {};
      pairs.forEach(sym=>{
        const rate = rates[sym] && rates[sym].rate;
        if(Number.isFinite(rate)) render(sym, rate);
      });
    }catch(e){ /* ignore, try again */ }
  }
  poll();
  setInterval(poll, 5000); // 5s free polling
})();


/* ========= Binance WS (BTC/ETH) hardened ========= */
(function(){
  const map = { BTCUSD:"btcusdt", ETHUSD:"ethusdt" };
  const els = {
    BTCUSD: document.querySelector('[data-ticker="BTCUSD"]'),
    ETHUSD: document.querySelector('[data-ticker="ETHUSD"]')
  };
  let prev = { BTCUSD:null, ETHUSD:null };

  function ensurePriceEl(el){
    if(!el) return null;
    return el.querySelector('.price') || (()=>{ const s=document.createElement('span'); s.className='price'; el.appendChild(s); return s; })();
  }
  function render(key, px){
    const root = els[key]; if(!root) return;
    const priceEl = ensurePriceEl(root);
    const old = prev[key];
    root.classList.remove('up','down');
    if(old!=null){
      if(px>old) root.classList.add('up'); else if(px<old) root.classList.add('down');
    }
    priceEl.textContent = Number(px).toLocaleString(undefined,{maximumFractionDigits:2});
    priceEl.classList.add('tick-blip'); setTimeout(()=> priceEl.classList.remove('tick-blip'), 200);
    prev[key] = px;
  }

  function openWS(){
    try{
      const streams = Object.values(map).map(s=>`${s}@trade`).join('/');
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      ws.onmessage = (evt)=>{
        const data = JSON.parse(evt.data);
        const s = data?.data?.s;  // e.g., BTCUSDT
        const p = parseFloat(data?.data?.p);
        if(!s || !Number.isFinite(p)) return;
        const key = s==="BTCUSDT" ? "BTCUSD" : s==="ETHUSDT" ? "ETHUSD" : null;
        if(key) render(key, p);
      };
      ws.onclose = ()=> setTimeout(openWS, 1500);
      ws.onerror = ()=> { try{ ws.close(); }catch(_e){} };
    }catch(e){ setTimeout(openWS, 2500); }
  }
  openWS();
})();
