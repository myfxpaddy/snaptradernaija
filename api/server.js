import express from "express";
import multer from "multer";
import cors from "cors";
import admin from "firebase-admin";

const app = express();

// CORS: allow local + GitHub Pages
app.use(cors({
  origin: [
    "http://127.0.0.1:8080",
    "http://localhost:8080",
    "https://myfxpaddy.github.io",
    "https://myfxpaddy.github.io/snaptradernaija"
  ]
}));

app.use(express.json({ limit: "1mb" }));

// Firebase Admin init from env (Fly secrets)
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
let FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
if (FIREBASE_PRIVATE_KEY?.includes("\\n")) FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY
    })
  });
}
const db = admin.apps.length ? admin.firestore() : null;

async function verifyAuth(req, res, next){
  try{
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer (.+)$/i);
    if(!m) return res.status(401).json({ error: "Missing token" });
    const decoded = await admin.auth().verifyIdToken(m[1]);
    req.uid = decoded.uid;
    next();
  }catch(e){
    return res.status(401).json({ error: "Invalid token" });
  }
}

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG or JPG allowed"), ok);
  }
});

app.get("/", (_req, res) => res.json({ ok: true }));

// Analyze + (optionally) save if logged in
app.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    // mock analysis (you'll wire LLM later)
    const symbol = (req.body?.symbol || "XAUUSD").toUpperCase();
    const entry = 2420.0, tp = 2425.5, sl = 2416.2, pipSize = 0.10;
    const pipsToTP = Math.round(((tp - entry) / pipSize) * 10) / 10;
    const pipsToSL = Math.round(((entry - sl) / pipSize) * 10) / 10;
    const rr = Number((pipsToTP / pipsToSL).toFixed(2));
    const payload = {
      symbol,
      direction: "BUY",
      score: 84,
      entry, tp, sl, pipSize,
      pipsToTP, pipsToSL, rr,
      notes: ["Bullish structure on M15 and H1","Clean retest 2419.8","No red-flag news in next 2h"],
      evidence: [{label:"Trend",value:"EMA stack up"},{label:"S/R",value:"2419.8 support held twice"}],
      ts: Date.now()
    };

    // If the client provided a valid token, save to Firestore
    try{
      const h = req.headers.authorization || "";
      const m = h.match(/^Bearer (.+)$/i);
      if(m && db){
        const decoded = await admin.auth().verifyIdToken(m[1]);
        const uid = decoded.uid;
        await db.collection("users").doc(uid).collection("analyses").add(payload);
      }
    }catch(_){ /* ignore if no auth */ }

    return res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e?.message || "Server error" });
  }
});

// List analyses for current user
app.get("/me/analyses", verifyAuth, async (req, res)=>{
  if(!db) return res.status(500).json({ error: "DB not configured" });
  const qs = await db.collection("users").doc(req.uid).collection("analyses").orderBy("ts","desc").limit(200).get();
  const items = qs.docs.map(d=>({ id:d.id, ...d.data() }));
  res.json({ items });
});

// Simple price router: BTC/ETH via CoinGecko; SPX/XAU via Twelve Data if key provided
const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY || "";
async function getPrices(symbols){
  const out={};
  const wants = symbols.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);

  // Crypto via CoinGecko
  const cgMap = { BTCUSD:"bitcoin", ETHUSD:"ethereum" };
  const cgIds = wants.filter(s=>cgMap[s]).map(s=>cgMap[s]);
  if(cgIds.length){
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds.join(",")}&vs_currencies=usd`;
    const r = await fetch(url); const j = await r.json();
    for(const [sym,id] of Object.entries(cgMap)){
      if(j[id]?.usd) out[sym] = { price: j[id].usd };
    }
  }

  // Twelve Data for XAUUSD, SPX
  const tdSyms = wants.filter(s=>["XAUUSD","SPX"].includes(s));
  if(tdSyms.length && TWELVE_KEY){
    const map = { XAUUSD:"XAU/USD", SPX:"SPX" };
    for(const s of tdSyms){
      const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(map[s])}&apikey=${TWELVE_KEY}`;
      const r = await fetch(url); const j = await r.json();
      if(j?.price) out[s] = { price: Number(j.price) };
    }
  }
  return out;
}

app.get("/prices", async (req, res)=>{
  try{
    const symbols = String(req.query.symbols||"BTCUSD,ETHUSD,SPX,XAUUSD");
    const data = await getPrices(symbols);
    res.json(data);
  }catch(e){ res.status(400).json({ error: e?.message || "Price error" }); }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log("API listening on http://localhost:" + PORT));
