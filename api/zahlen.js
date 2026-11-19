// Vercel-Function: Zahlen für den Betreiber. /api/zahlen im Browser öffnen, Passwort eingeben.
// Das Passwort steht nur in der Vercel-Variable ZAHLEN_PASSWORT (mindestens 12 Zeichen). Ohne sie ist die Seite aus.
import { timingSafeEqual, createHash } from "node:crypto";
import { makeRateLimiter } from "./_shared.js";
import { loadActivity, computeStats, berlinDay, formHtml, statsHtml } from "./_aktiv.js";

const DB = "https://wochenessenplan-3d0e1-default-rtdb.europe-west1.firebasedatabase.app";
const APP = "Wochenplan";
const allow = makeRateLimiter({ max: 5, windowMs: 60000 }); // Passwort-Versuche je IP und Minute

const clientIp = (req) => {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unbekannt";
};
const same = (a, b) => timingSafeEqual(createHash("sha256").update(String(a)).digest(), createHash("sha256").update(String(b)).digest());
const formValue = (body, name) => {
  if (body && typeof body === "object") return String(body[name] ?? "");
  try { return new URLSearchParams(String(body || "")).get(name) || ""; } catch { return ""; }
};

const send = (res, status, html) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  return res.status(status).send(html);
};

export default async function handler(req, res) {
  const pw = String(process.env.ZAHLEN_PASSWORT || "").trim();
  if (pw.length < 12) return send(res, 503, formHtml(APP, "Die Seite ist noch nicht eingerichtet: In Vercel fehlt die Variable ZAHLEN_PASSWORT (mindestens 12 Zeichen)."));
  if (req.method === "GET") return send(res, 200, formHtml(APP));
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return send(res, 405, formHtml(APP, "Nur GET oder POST.")); }
  if (!allow(clientIp(req))) return send(res, 429, formHtml(APP, "Zu viele Versuche. Bitte eine Minute warten."));
  if (!same(formValue(req.body, "passwort").trim(), pw)) return send(res, 401, formHtml(APP, "Passwort falsch."));
  try {
    const data = await loadActivity({ dbUrl: process.env.AI_LIMIT_DB_URL || DB, secret: process.env.AI_LIMIT_SECRET });
    return send(res, 200, statsHtml(APP, computeStats(data, berlinDay())));
  } catch (e) {
    return send(res, 502, formHtml(APP, "Die Zahlen konnten nicht gelesen werden (" + (e?.message || e) + "). Ist der Regel-Knoten activity veröffentlicht?"));
  }
}
