// NUTZER-ID PRÜFEN: Der Anmelde-Nachweis (ID-Token der anonymen Anmeldung) ist ein von Google signiertes JWT.
// Geprüft wird ohne zusätzliche Bibliothek: Signatur (RS256) gegen Googles öffentliche Schlüssel, Projekt, Aussteller, Ablauf.
// Ergebnis ist die Nutzer-ID oder "" (fehlt, falsch, abgelaufen, Schlüssel nicht abrufbar). Wirft nie.
import { createPublicKey, verify } from "node:crypto";

const KEYS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const SKEW_S = 300; // Ausstellzeit darf bis zu fünf Minuten in der Zukunft liegen (Uhren gehen auseinander)

let cache = { keys: null, until: 0, at: 0 }; // je Instanz; Google wechselt die Schlüssel etwa täglich und nennt die Gültigkeit in max-age

export const _resetKeyCache = () => { cache = { keys: null, until: 0, at: 0 }; };

const b64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const parsePart = (s) => { try { return JSON.parse(b64url(s).toString("utf8")); } catch { return null; } };

const withTimeout = (ms) => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(ms) } : {});

async function publicKeys(fetchImpl, now) {
  if (cache.keys && now < cache.until) return cache.keys;
  const r = await fetchImpl(KEYS_URL, withTimeout(3000));
  if (!r.ok) throw new Error("Schlüssel " + r.status);
  const d = await r.json();
  const keys = {};
  for (const k of (d && Array.isArray(d.keys)) ? d.keys : []) {
    if (k && k.kid && k.kty === "RSA") { try { keys[k.kid] = createPublicKey({ key: k, format: "jwk" }); } catch { /* unbrauchbarer Schlüssel */ } }
  }
  const cc = typeof r.headers?.get === "function" ? r.headers.get("cache-control") || "" : "";
  const m = /max-age=(\d+)/.exec(cc);
  cache = { keys, until: now + (m ? Math.min(parseInt(m[1], 10), 86400) : 3600) * 1000, at: now };
  return keys;
}

// Nachweis aus dem Kopf "Authorization: Bearer <Nachweis>"
export const bearer = (headers) => {
  const v = headers ? (headers.authorization ?? headers.Authorization) : "";
  const s = Array.isArray(v) ? String(v[0] || "") : String(v || "");
  const m = /^Bearer\s+(\S+)$/i.exec(s.trim());
  return m ? m[1] : "";
};

export async function verifyIdToken(token, projectId, { fetchImpl = fetch, now = Date.now } = {}) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || !projectId) return "";
    const head = parsePart(parts[0]);
    const body = parsePart(parts[1]);
    if (!head || !body || head.alg !== "RS256" || !head.kid) return "";
    const t = Math.floor(now() / 1000);
    if (body.aud !== projectId || body.iss !== "https://securetoken.google.com/" + projectId) return "";
    if (typeof body.sub !== "string" || !body.sub || body.sub.length > 128) return "";
    if (!(body.exp > t) || !(body.iat <= t + SKEW_S)) return "";
    let key = (await publicKeys(fetchImpl, now()))[head.kid];
    // Unbekannter Schlüssel: vielleicht gerade gewechselt. Höchstens einmal pro Minute neu holen (sonst ließe sich Google über uns fluten).
    if (!key && now() - cache.at > 60000) { cache.until = 0; key = (await publicKeys(fetchImpl, now()))[head.kid]; }
    if (!key) return "";
    const ok = verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, b64url(parts[2]));
    return ok ? body.sub : "";
  } catch {
    return "";
  }
}
