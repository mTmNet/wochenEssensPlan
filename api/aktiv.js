// Vercel-Function: Das Gerät meldet einmal am Tag "heute aktiv" (Messung, siehe _aktiv.js).
// Nur mit gültigem Anmelde-Nachweis; die Nutzer-ID kommt aus dem geprüften Nachweis, nicht vom Gerät.
import { originAllowed, makeRateLimiter } from "./_shared.js";
import { bearer, verifyIdToken } from "./_token.js";
import { recordActive } from "./_aktiv.js";

const DB = "https://wochenessenplan-3d0e1-default-rtdb.europe-west1.firebasedatabase.app";
const PROJECT_ID = "wochenessenplan-3d0e1";
const allow = makeRateLimiter({ max: 30, windowMs: 60000 });

const clientIp = (req) => {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unbekannt";
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Nur POST erlaubt." }); }
  if (!originAllowed(req.headers)) return res.status(403).json({ error: "Anfrage von fremder Herkunft abgelehnt." });
  if (!allow(clientIp(req))) return res.status(429).json({ error: "Zu viele Anfragen." });
  const uid = await verifyIdToken(bearer(req.headers), PROJECT_ID);
  if (!uid) return res.status(401).json({ error: "Kein gültiger Anmelde-Nachweis." });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const r = await recordActive({ dbUrl: process.env.AI_LIMIT_DB_URL || DB, secret: process.env.AI_LIMIT_SECRET, uid, src: body.von });
  if (!r.ok) console.warn("Messung: nicht gespeichert:", r.grund);
  return res.status(200).json({ ok: r.ok });
}
