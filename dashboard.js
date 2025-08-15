import { getIdToken, onAuthChange } from "./auth.js";

/* =================== CONFIG =================== */
const API_BASE = localStorage.getItem("apiBase") || "http://localhost:8787";
/* Deriv app id must be set once in the browser console:
   localStorage.setItem('deriv_app_id','YOUR_APP_ID_NUMBER')
   And be sure myfxpaddy.github.io is authorized in the Deriv app. */

/* =================== KPIs + TABLE =================== */
const rowsEl = document.getElementById("rows");
const k_total = document.getElementById("k_total");
const k_winrate = document.getElementById("k_winrate");
const k_pips = document.getElementById("k_pips");
const k_best = document.getElementById("k_best");

function statusFor(a, price){
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

  const res = await fetch(`${API_BASE}/me/analyses`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const items = (await res.json()).items || [];

  // Prices for KPIs table (uses last known entry if live not available here)
  const syms = Array.from(new Set(items.map(i=>i.symbol || "XAUUSD"))).join(",");
  const pRes = await fetch(`${API_BASE}/prices?symbols=${encodeURIComponent(syms)}`);
  const prices = await pRes.json();

  rowsEl && (rowsEl.innerHTML = "");
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

    if(rowsEl){
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
  });

  k_total && (k_total.textContent = String(items.length));
  k_winrate && (k_winrate.textContent = total ? `${Math.round((wins/total)*100)}%` : "—");
  k_pips && (k_pips.textContent = `${Math.round(pipSum*10)/10}`);
  const best = Object.entries(bySym).sort((a,b)=>b[1].pips-a[1].pips)[0];
  k_best && (k_best.textContent = best ? `${best[0]} (+${Math.round(best[1].pips)})` : "—");
}

document.getElementById("refreshBtn")?.addEventListener("click", loadAll);
onAuthChange(u=>{ if(!u){ location.href="./"; return; } loadAll(); });

/* =================== UPLOADER UX =================== */
(function(){
  const drop = document.getElementById("dropVisual");
  const file = document.getElementById("file");
  if(!drop || !file) return;

  const openPicker = (e)=>{ e && e.preventDefault(); file.click(); };
  const browse = document.getElementById("browseBtn");
  browse && browse.addEventListener("click", openPicker);
  drop.addEventListener("click", (e)=>{ if(e.target.closest("button,a,label")) return; openPicker(e); });

  ["dragenter","dragover"].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag-over"); }));
  ["dragleave","drop"].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag-over"); }));
  drop.addEventListener("drop", (e)=>{ const dt=e.dataTransfer; if(dt && dt.files && dt.files[0]){ file.files = dt.files; file.dispatchEvent(new Event("change",{bubbles:true})); }});
  ["dragover","drop"].forEach(ev=> window.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, true));
})();

/* =================== LIVE TICKERS =================== */
/* ---- Crypto via Binance WS (no keys) ---- */
(function(){
  const prev = { BTCUSD:null, ETHUSD:null };
  function el(sym){ return document.querySelector(`[data-ticker="${sym}"]`); }
  function render(sym, px){
    const root = el(sym); if(!root) return;
    const priceEl = root.querySelector('.price') || root.querySelector('.px') || (()=>{const d=document.createElement('div'); d.className='px price'; root.appendChild(d); return d;})();
    const old = prev[sym];
    root.classList.remove('up','down');
    if(old!=null){ if(px>old) root.classList.add('up'); else if(px<old) root.classList.add('down'); }
    priceEl.textContent = Number(px).toLocaleString(undefined,{maximumFractionDigits:2});
    priceEl.classList.add('tick-blip'); setTimeout(()=> priceEl.classList.remove('tick-blip'), 200);
    prev[sym]=px;
  }
  function openWS(){
    try{
      const ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade');
      ws.onmessage = (evt)=>{ const d=JSON.parse(evt.data); const s=d?.data?.s; const p=parseFloat(d?.data?.p);
        if(!s || !Number.isFinite(p)) return;
        render(s==='BTCUSDT'?'BTCUSD': s==='ETHUSDT'?'ETHUSD': null, p);
      };
      ws.onclose = ()=> setTimeout(openWS, 1500);
      ws.onerror = ()=> { try{ ws.close(); }catch(_){} };
    }catch(e){ setTimeout(openWS, 2500); }
  }
  openWS();
})();

/* ---- FX via Deriv WS (needs localStorage.deriv_app_id) ---- */
(function(){
  const app_id = localStorage.getItem('deriv_app_id');
  if(!app_id){
    console.warn('[Deriv FX] Set localStorage.deriv_app_id to your App ID, and authorize myfxpaddy.github.io in the Deriv app.');
    return;
  }

  // Deriv symbols → your tile keys
  const symbols = [
    'frxEURUSD','frxGBPUSD','frxUSDJPY','frxUSDCHF','frxAUDUSD','frxUSDCAD','frxNZDUSD'
  ];
  const mapToTile = {
    frxEURUSD:'EURUSD', frxGBPUSD:'GBPUSD', frxUSDJPY:'USDJPY',
    frxUSDCHF:'USDCHF', frxAUDUSD:'AUDUSD', frxUSDCAD:'USDCAD', frxNZDUSD:'NZDUSD'
  };
  const prev = Object.fromEntries(Object.values(mapToTile).map(k=>[k,null]));

  function el(sym){ return document.querySelector(`[data-ticker="${sym}"]`); }
  function render(sym, px){
    const root = el(sym); if(!root) return;
    const priceEl = root.querySelector('.price') || root.querySelector('.px') || (()=>{const d=document.createElement('div'); d.className='px price'; root.appendChild(d); return d;})();
    const old = prev[sym];
    root.classList.remove('up','down');
    if(old!=null){ if(px>old) root.classList.add('up'); else if(px<old) root.classList.add('down'); }
    priceEl.textContent = Number(px).toLocaleString(undefined,{ maximumFractionDigits: sym.endsWith('JPY')?3:5 });
    priceEl.classList.add('tick-blip'); setTimeout(()=> priceEl.classList.remove('tick-blip'), 200);
    prev[sym]=px;
  }

  (function openWS(){
    try{
      const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(app_id)}`);
      ws.onopen = () => {
        console.log('[Deriv FX] WS open');
        symbols.forEach(sym => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));
      };
      ws.onmessage = (evt) => {
        try{
          const msg = JSON.parse(evt.data);
          if(msg.msg_type === 'tick' && msg.tick){
            const dSym = msg.tick.symbol;         // e.g. frxEURUSD
            const quote = Number(msg.tick.quote);
            const tile = mapToTile[dSym];
            if(tile && Number.isFinite(quote)) render(tile, quote);
          }else if(msg.error){
            console.warn('[Deriv FX] error:', msg.error);
          }
        }catch(_){}
      };
      ws.onclose = () => { console.warn('[Deriv FX] closed; retrying…'); setTimeout(openWS, 1500); };
      ws.onerror = () => { try{ ws.close(); }catch(_){} };
    }catch(e){ setTimeout(openWS, 2500); }
  })();
})();

