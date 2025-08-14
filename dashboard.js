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
