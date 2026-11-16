// KOSTENDECKEL für die KI-Function: Tageszähler, die über alle Serverinstanzen hinweg gelten.
// Gezählt wird in der eigenen Realtime Database unter aiUsage/<SHA-256 von AI_LIMIT_SECRET>/<Tag>/... Das Geheimnis steht nur
// in den Vercel-Umgebungsvariablen und ist (wie der Plan-Code) Teil des Pfads; ohne es kommt niemand an die Zähler.
// Drei Grenzen je Tag (UTC): insgesamt, je IP, je Code. Später kommt die Nutzer-ID als weiteres "subject" dazu
// (kind "uid") und ersetzt den Code; an der Logik ändert sich dafür nichts.
import { createHash } from "node:crypto";

export const DEFAULT_LIMITS = { total: 300, ip: 60, code: 50 };

const toInt = (v, fallback) => {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Grenzwerte aus Umgebungsvariablen (AI_LIMIT_TOTAL, AI_LIMIT_IP, AI_LIMIT_CODE), sonst die Standardwerte
export const limitsFrom = (env = {}) => ({
  total: toInt(env.AI_LIMIT_TOTAL, DEFAULT_LIMITS.total),
  ip: toInt(env.AI_LIMIT_IP, DEFAULT_LIMITS.ip),
  code: toInt(env.AI_LIMIT_CODE, DEFAULT_LIMITS.code),
});

// Geheimnis gültig ab 16 Zeichen, beliebige Zeichen (Leerraum am Rand zählt nicht). Sonst gilt der Deckel als nicht eingerichtet.
const cleanSecret = (s) => String(s ?? "").trim();
export const validSecret = (s) => { const n = cleanSecret(s).length; return n >= 16 && n <= 512; };

// Pfadteil für die Datenbank: nicht das Geheimnis selbst, sondern sein SHA-256 (64 Hex-Zeichen). So taugt jedes
// Geheimnis als Pfad, auch mit Sonderzeichen, und es steht nirgends im Klartext in einer Adresse.
export const secretPath = (s) => createHash("sha256").update("aiUsage|" + cleanSecret(s)).digest("hex");

// Code wie in den Datenbankregeln: 6 bis 16 Zeichen A-Z, 0-9; alles andere zählt als "kein Code"
export const cleanCode = (c) => {
  const s = String(c ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(s) ? s : "";
};

export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// IPs und Codes stehen nie im Klartext in der Datenbank, nur als gekürzter Hash mit dem Geheimnis als Salz
export const hashId = (value, secret) =>
  createHash("sha256").update(String(secret) + "|" + String(value)).digest("hex").slice(0, 24);

const withTimeout = (ms) => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(ms) } : {});

// Prüft die Tagesgrenzen und zählt die Anfrage.
// subjects: [{kind:"ip"|"code"|..., id}] - Einträge ohne id oder ohne Grenze für ihre Art werden übersprungen.
// Rückgabe: {ok:true} | {ok:false, reason:"total"|<kind>} | {ok:true, skipped:"..."} (nicht eingerichtet oder Speicher gestört).
// Ist der Speicher nicht erreichbar, wird durchgelassen: echte Nutzer sollen nicht an einer Firebase-Störung hängen,
// die harte Kostengrenze bleibt die Budget-Sperre bei Google.
export async function checkAndCount({ dbUrl, secret, limits = DEFAULT_LIMITS, subjects = [], fetchImpl = fetch, now = Date.now } = {}) {
  if (!dbUrl || !validSecret(secret)) return { ok: true, skipped: "nicht eingerichtet" };
  const root = String(dbUrl).replace(/\/+$/, "") + "/aiUsage/" + secretPath(secret);
  const day = dayKey(now());
  const base = root + "/" + day;

  // Zähler dieser Anfrage: Pfad relativ zum Tag, Grenze, Grund bei Überschreitung
  const counters = [{ path: "total", max: limits.total, reason: "total" }];
  for (const s of subjects) {
    const max = limits[s?.kind];
    if (!s || !s.id || !Number.isFinite(max)) continue;
    counters.push({ path: s.kind + "/" + hashId(s.id, secret), max, reason: s.kind });
  }

  try {
    const values = await Promise.all(counters.map(async (c) => {
      const r = await fetchImpl(base + "/" + c.path + ".json", withTimeout(3000));
      if (!r.ok) throw new Error("Lesen " + r.status);
      const v = await r.json();
      return typeof v === "number" ? v : 0;
    }));
    for (let i = 0; i < counters.length; i++) {
      if (values[i] >= counters[i].max) return { ok: false, reason: counters[i].reason };
    }

    // Alle Zähler in einem Schreibvorgang erhöhen (Server-Inkrement: gleichzeitige Anfragen gehen nicht verloren)
    const patch = {};
    for (const c of counters) patch[c.path] = { ".sv": { increment: 1 } };
    const w = await fetchImpl(base + ".json", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      ...withTimeout(3000),
    });
    if (!w.ok) throw new Error("Schreiben " + w.status);

    // Erste Anfrage des Tages: ältere Tage wegräumen (best effort)
    if (values[0] === 0) await cleanup(root, day, fetchImpl);
    return { ok: true };
  } catch (e) {
    console.warn("Kostendeckel: Zählerspeicher nicht nutzbar, Anfrage wird ohne Tageszähler durchgelassen:", e?.message || e);
    return { ok: true, skipped: "Speicher gestört" };
  }
}

async function cleanup(root, today, fetchImpl) {
  try {
    const r = await fetchImpl(root + ".json?shallow=true", withTimeout(3000));
    if (!r.ok) return;
    const days = Object.keys((await r.json()) || {}).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today);
    await Promise.all(days.slice(0, 20).map((d) => fetchImpl(root + "/" + d + ".json", { method: "DELETE", ...withTimeout(3000) })));
  } catch { /* Aufräumen ist nicht wichtig */ }
}

// PRÜFUNG für den Betreiber (GET auf die Function): sagt in einem Satz, ob der Deckel zählt, und wenn nicht, warum.
// Schreibt dazu einen Probezähler (prüft Regel und Server-Inkrement) und liest ihn zurück. Gibt weder Geheimnis noch Zählerstände preis.
export async function limitStatus({ dbUrl, secret, fetchImpl = fetch, now = Date.now } = {}) {
  if (!cleanSecret(secret)) return { aktiv: false, grund: "AI_LIMIT_SECRET ist in dieser Version nicht gesetzt. In Vercel für Production eintragen und danach neu deployen." };
  if (!validSecret(secret)) return { aktiv: false, grund: "AI_LIMIT_SECRET ist gesetzt, aber zu kurz: es braucht mindestens 16 Zeichen." };
  if (!dbUrl) return { aktiv: false, grund: "Keine Datenbank-Adresse für die Zähler." };
  const probe = String(dbUrl).replace(/\/+$/, "") + "/aiUsage/" + secretPath(secret) + "/" + dayKey(now()) + "/probe.json";
  try {
    const w = await fetchImpl(probe, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ".sv": { increment: 1 } }), ...withTimeout(3000) });
    if (w.status === 401 || w.status === 403) return { aktiv: false, grund: "Die Datenbank lehnt das Schreiben ab (" + w.status + "). Der Regel-Knoten aiUsage fehlt oder ist nicht veröffentlicht." };
    if (!w.ok) return { aktiv: false, grund: "Die Datenbank antwortet beim Schreiben mit Fehler " + w.status + "." };
    const r = await fetchImpl(probe, withTimeout(3000));
    if (!r.ok) return { aktiv: false, grund: "Die Datenbank antwortet beim Lesen mit Fehler " + r.status + "." };
    const v = await r.json();
    if (typeof v !== "number") return { aktiv: false, grund: "Der Probezähler wurde geschrieben, ist aber keine Zahl." };
    return { aktiv: true, grund: "Der Zählerspeicher ist erreichbar und zählt. In der Firebase Console steht der Probezähler unter aiUsage/<64 Zeichen>/" + dayKey(now()) + "/probe." };
  } catch (e) {
    return { aktiv: false, grund: "Die Datenbank ist nicht erreichbar: " + (e?.message || e) };
  }
}

// Deutsche Meldung zur ausgelösten Grenze; `manual` ist der Hinweis, was stattdessen geht
export function limitMessage(reason, manual = "") {
  const tail = manual ? " " + manual : "";
  if (reason === "total") return "Das Tageskontingent der KI ist für heute aufgebraucht. Bitte morgen erneut versuchen." + tail;
  if (reason === "ip") return "Von diesem Anschluss kamen heute sehr viele KI-Anfragen. Bitte morgen erneut versuchen." + tail;
  return "Für heute sind die KI-Anfragen aufgebraucht. Bitte morgen erneut versuchen." + tail;
}
