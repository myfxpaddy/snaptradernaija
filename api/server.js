import express from "express";
import multer from "multer";
import cors from "cors";

const app = express();
app.use(cors({ origin: true }));
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG or JPG allowed"), ok);
  }
});

app.get("/", (_req, res) => res.json({ ok: true }));

app.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const entry = 2420.0;
    const tp    = 2425.5;
    const sl    = 2416.2;
    const pipSize = 0.10;

    const pipsToTP = Math.round(((tp - entry) / pipSize) * 10) / 10;
    const pipsToSL = Math.round(((entry - sl) / pipSize) * 10) / 10;
    const rr = Number((pipsToTP / pipsToSL).toFixed(2));

    return res.json({
      direction: "BUY",
      score: 84,
      entry, tp, sl,
      pipSize,
      pipsToTP, pipsToSL,
      rr,
      notes: [
        "Bullish structure on M15 and H1",
        "Clean retest of intraday support (2419.8)",
        "No red-flag news in next 2h"
      ],
      evidence: [
        { label: "Trend", value: "EMA stack up" },
        { label: "S/R", value: "2419.8 support held twice" }
      ]
    });
  } catch (e) {
    console.error(e);
    const msg = e?.message || "Server error";
    res.status(400).json({ error: msg });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log("API listening on http://localhost:" + PORT));
