import { getIdToken, onAuthChange } from "./auth.js";

const API_BASE   = localStorage.getItem("apiBase") || "http://localhost:8787";
const rowsEl     = document.getElementById("rows");
const k_total    = document.getElementById("k_total");
const k_winrate  = document.getElementById("k_winrate");
const k_pips     = document.getElementById("k_pips");
const k_best     = document.getElementById("k_best");

/* ---------- helpers ---------- */
function statusFor(a, price){
  let status = "OPEN", dpips = 0;
  if(a.direction === "BUY"){
    if(price >= a.tp) status = "WIN";
    else if(price <= a.sl) status = "LOSS";
    dpips = (price - a.entry) / a.pipSize;
  }else if(a.direction === "SELL"){
    if(price <= a.tp) status = "WIN";
    else if(price >= a.sl) status = "LOSS";
    dpips = (a.entry - price) / a.pipSize;
  }
  return { status, dpips: Math.round(dpips*10)/10 };
}

/* ---------- load saved analyses + KPIs ---------- */
async function loadAll(){
  const token = await getIdToken();
  if(!token){ location.href = "./"; return; }

  const r  = await fetch(`${API_BASE}/me/analyses`, { headers:{ Authorization:`Bearer ${token}` }});
  const js = await r.json();
  const items = js.items || [];

  const syms = Array.from(new Set(items.map(i => i.symbol || "XAUUSD"))).join(",");
  const pRes = await fetch(`${API_BASE}/prices?symbols=${encodeURIComponent(syms)}`);
  const prices = await pRes.json();

  rowsEl && (rowsEl.innerHTML = "");
  let wins=0,total=0,pipSum=0;
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
        <td>${dpips}</td>`;
      rowsEl.appendChild(tr);
    }
  });

  if(k_total)   k_total.textContent   = String(items.length);
  if(k_winrate) k_winrate.textContent = total ? `${Math.round((wins/total)*100)}%` : "—";
  if(k_pips)    k_pips.textContent    = `${Math.round(pipSum*10)/10}`;
  if(k_best){
    const best = Object.entries(bySym).sort((a,b)=>b[1].pips-a[1].pips)[0];
    k_best.textContent = best ? `${best[0]} (+${Math.round(best[1].pips)})` : "—";
  }
}

/* ---------- Deriv WS (BTCUSD/ETHUSD) ---------- */
(function derivFeed(){
  const prev = { BTCUSD:null, ETHUSD:null };
  const els  = {
    BTCUSD: document.querySelector('[data-ticker="BTCUSD"]'),
    ETHUSD: document.querySelector('[data-ticker="ETHUSD"]')
  };
  function render(sym, px){
    const root = els[sym]; if(!root) return;
    const priceEl = root.querySelector('.price') || root.querySelector('.px') ||
      (()=>{ const d=document.createElement('div'); d.className='px price'; root.appendChild(d); return d;})();
    const old = prev[sym];
    root.classList.remove('up','down');
    if(old!=null){ if(px>old) root.classList.add('up'); else if(px<old) root.classList.add('down'); }
    priceEl.textContent = Number(px).toLocaleString(undefined,{maximumFractionDigits:2});
    priceEl.classList.add('tick-blip'); setTimeout(()=> priceEl.classList.remove('tick-blip'), 220);
    prev[sym] = px;
  }

  const appId = Number(localStorage.getItem('deriv_app_id') || 0);
  if(!appId){
    console.warn('[Deriv] No app_id set. Run: localStorage.setItem("deriv_app_id","YOUR_APP_ID")');
    return;
  }
  const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  ws.onopen = ()=>{
    ws.send(JSON.stringify({ ticks:'BTCUSD', subscribe:1 }));
    ws.send(JSON.stringify({ ticks:'ETHUSD', subscribe:1 }));
  };
  ws.onmessage = (ev)=>{
    try{
      const m = JSON.parse(ev.data);
      if(m.error){ console.warn('[Deriv error]', m.error); return; }
      if(m.msg_type === 'tick' && m.tick && m.tick.symbol && m.tick.quote){
        const s = m.tick.symbol; // e.g., BTCUSD
        if(s === 'BTCUSD' || s === 'ETHUSD') render(s, Number(m.tick.quote));
      }
    }catch(_e){}
  };
  ws.onclose = ()=> setTimeout(derivFeed, 1500);
  ws.onerror = ()=> { try{ ws.close(); }catch(_e){} };
})();

/* ---------- Forex majors (FreeForexAPI -> fallback ExchangeRate.host) ---------- */
(function fxFeed(){
  const pairs = ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD'];
  const prev  = Object.fromEntries(pairs.map(p=>[p,null]));
  const els   = Object.fromEntries(pairs.map(p=>[p, document.querySelector(`[data-ticker="${p}"]`)]));

  function render(sym, px){
    const root = els[sym]; if(!root) return;
    const priceEl = root.querySelector('.price') || root.querySelector('.px') ||
      (()=>{ const d=document.createElement('div'); d.className='px price'; root.appendChild(d); return d;})();
    const old = prev[sym];
    root.classList.remove('up','down');
    if(old!=null){ if(px>old) root.classList.add('up'); else if(px<old) root.classList.add('down'); }
    priceEl.textContent = Number(px).toLocaleString(undefined,{maximumFractionDigits: sym.endsWith('JPY')?3:5});
    priceEl.classList.add('tick-blip'); setTimeout(()=> priceEl.classList.remove('tick-blip'), 220);
    prev[sym] = px;
  }

  async function pollFreeForex(){
    const r = await fetch(`https://www.freeforexapi.com/api/live?pairs=${pairs.join(',')}`, {cache:'no-store'});
    if(!r.ok) throw new Error('freeforex not ok');
    const j = await r.json();
    const rates = j?.rates || {};
    pairs.forEach(k=>{ const v = rates[k]?.rate; if(Number.isFinite(v)) render(k,v); });
  }
  async function pollERH(){
    const resp = await fetch('https://api.exchangerate.host/latest?base=USD', {cache:'no-store'});
    const j = await resp.json();
    const R = j?.rates || {};
    const map = {
      EURUSD: 1/(R.EUR ? 1/R.EUR : NaN),
      GBPUSD: 1/(R.GBP ? 1/R.GBP : NaN),
      USDJPY: R.JPY, USDCHF: R.CHF, USDCAD: R.CAD,
      AUDUSD: 1/(R.AUD ? 1/R.AUD : NaN),
      NZDUSD: 1/(R.NZD ? 1/R.NZD : NaN)
    };
    Object.entries(map).forEach(([k,v])=> Number.isFinite(v) && render(k,v));
  }
  async function tick(){ try{ await pollFreeForex(); }catch(_){ try{ await pollERH(); }catch(__){} } }
  tick(); setInterval(tick, 5000);
})();

/* ---------- Uploader UX (big dropzone) ---------- */
(function uploaderUX(){
  const drop   = document.getElementById("dropVisual");
  const file   = document.getElementById("file");
  const browse = document.getElementById("browseBtn");
  function openPicker(e){ e && e.preventDefault(); if(file) file.click(); }
  browse && browse.addEventListener("click", openPicker);
  drop   && drop.addEventListener("click", (e)=>{ if(e.target.closest("button,a,label")) return; openPicker(e); });
  ["dragenter","dragover"].forEach(ev=> drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag-over"); }));
  ["dragleave","drop"].forEach(ev=>   drop && drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag-over"); }));
  drop && drop.addEventListener("drop",(e)=>{ const dt=e.dataTransfer; if(dt && dt.files && dt.files[0]){ file.files=dt.files; file.dispatchEvent(new Event("change",{bubbles:true})); }});
  ["dragover","drop"].forEach(ev=> window.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, true));
})();

/* ---------- protect page ---------- */
document.getElementById("refreshBtn")?.addEventListener("click", loadAll);
onAuthChange(u=>{ if(!u){ location.href="./"; return; } loadAll(); });

