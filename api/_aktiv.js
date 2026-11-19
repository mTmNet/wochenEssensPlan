// MESSUNG "zuletzt aktiv": je Gerät (anonyme Nutzer-ID) erster Tag, letzter Tag, Herkunft aus dem Einstiegslink und die Tage,
// an denen es die App benutzt hat. Daraus: täglich aktive Geräte und wie viele nach vier Wochen noch dabei sind.
// Kein Analyse-Dienst, keine Cookies. Die Nutzer-ID steht nicht im Klartext in der Datenbank, nur als gekürzter Hash mit Salz.
// Gespeichert wird wie beim Kostendeckel unter einem Pfad, den nur der Server kennt:
//   activity/<SHA-256 von AI_LIMIT_SECRET>/u/<Hash>        = { f: erster Tag, l: letzter Tag, s: Herkunft (optional) }
//   activity/<SHA-256 von AI_LIMIT_SECRET>/d/<Tag>/<Hash>  = 1
// Tage nach deutscher Zeit (Europe/Berlin), Format JJJJ-MM-TT.
import { createHash } from "node:crypto";
import { validSecret, hashId } from "./_limit.js";

const clean = (s) => String(s ?? "").trim();
export const activityPath = (secret) => createHash("sha256").update("activity|" + clean(secret)).digest("hex");
const userKey = (uid, secret) => hashId(uid, "aktiv|" + clean(secret));

export const berlinDay = (t = Date.now()) => {
  try { return new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); }
  catch { return new Date(t).toISOString().slice(0, 10); }
};
const DAY_MS = 86400000;
const toMs = (day) => Date.parse(day + "T12:00:00Z");
export const addDays = (day, n) => new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);
const isDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

// Herkunft aus dem Einstiegslink (?von=...): Kleinbuchstaben, Ziffern, Bindestrich, höchstens 24 Zeichen; sonst keine
export const cleanSource = (s) => {
  const v = clean(s).toLowerCase();
  return /^[a-z0-9-]{1,24}$/.test(v) ? v : "";
};

const withTimeout = (ms) => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(ms) } : {});
const base = (dbUrl, secret) => String(dbUrl).replace(/\/+$/, "") + "/activity/" + activityPath(secret);

// Gerät als "heute aktiv" eintragen. Herkunft zählt nur beim allerersten Eintrag.
// Rückgabe {ok:true, neu?:true} | {ok:false, grund}
export async function recordActive({ dbUrl, secret, uid, src = "", fetchImpl = fetch, now = Date.now } = {}) {
  if (!dbUrl || !validSecret(secret)) return { ok: false, grund: "nicht eingerichtet" };
  if (!uid) return { ok: false, grund: "keine Nutzer-ID" };
  const root = base(dbUrl, secret);
  const h = userKey(uid, secret);
  const day = berlinDay(now());
  try {
    const r = await fetchImpl(root + "/u/" + h + ".json", withTimeout(3000));
    if (!r.ok) return { ok: false, grund: "Lesen " + r.status };
    const rec = await r.json();
    if (rec && rec.l === day) return { ok: true };
    const patch = { ["d/" + day + "/" + h]: 1 };
    const neu = !rec || !isDay(rec.f);
    if (neu) {
      const s = cleanSource(src);
      patch["u/" + h] = s ? { f: day, l: day, s } : { f: day, l: day };
    } else {
      patch["u/" + h + "/l"] = day;
    }
    const w = await fetchImpl(root + ".json", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch), ...withTimeout(3000) });
    if (!w.ok) return { ok: false, grund: "Schreiben " + w.status };
    return neu ? { ok: true, neu: true } : { ok: true };
  } catch (e) {
    return { ok: false, grund: String(e?.message || e) };
  }
}

// Alles lesen, was die Auswertung braucht: alle Geräte und die Tage der letzten `days` Tage
export async function loadActivity({ dbUrl, secret, days = 35, fetchImpl = fetch, now = Date.now } = {}) {
  if (!dbUrl || !validSecret(secret)) throw new Error("AI_LIMIT_SECRET fehlt");
  const root = base(dbUrl, secret);
  const from = addDays(berlinDay(now()), -(days - 1));
  const [ru, rd] = await Promise.all([
    fetchImpl(root + "/u.json", withTimeout(8000)),
    fetchImpl(root + "/d.json?orderBy=" + encodeURIComponent('"$key"') + "&startAt=" + encodeURIComponent('"' + from + '"'), withTimeout(8000)),
  ]);
  if (!ru.ok || !rd.ok) throw new Error("Datenbank antwortet mit " + (ru.ok ? rd.status : ru.status));
  return { users: (await ru.json()) || {}, days: (await rd.json()) || {} };
}

// Kennzahlen (reine Funktion, getestet): heute, 7 Tage, 30-Tage-Verlauf, gesamt, 4-Wochen-Treue, nach Herkunft
export function computeStats({ users = {}, days = {} } = {}, today = berlinDay()) {
  const list = Object.values(users || {}).filter((u) => u && isDay(u.f) && isDay(u.l));
  const count = (day) => Object.keys((days && days[day]) || {}).length;
  const verlauf = [];
  for (let i = 0; i < 30; i++) {
    const day = addDays(today, -i);
    verlauf.push({ tag: day, aktiv: count(day), neu: list.filter((u) => u.f === day).length });
  }
  const woche = new Set();
  for (let i = 0; i < 7; i++) for (const h of Object.keys((days && days[addDays(today, -i)]) || {})) woche.add(h);

  // Treue: Geräte, deren erster Tag mindestens 28 Tage zurückliegt; "geblieben" = an Tag 28 oder später wieder benutzt
  const stichtag = addDays(today, -28);
  const treue = (arr) => {
    const kohorte = arr.filter((u) => u.f <= stichtag);
    const geblieben = kohorte.filter((u) => u.l >= addDays(u.f, 28)).length;
    return { kohorte: kohorte.length, geblieben, quote: kohorte.length ? Math.round((geblieben / kohorte.length) * 100) : null };
  };

  const quellen = {};
  for (const u of list) (quellen[u.s || ""] ||= []).push(u);
  const herkunft = Object.entries(quellen)
    .map(([s, arr]) => ({ herkunft: s, geraete: arr.length, ...treue(arr) }))
    .sort((a, b) => b.geraete - a.geraete);

  return { heute: count(today), woche: woche.size, gesamt: list.length, verlauf, treue: treue(list), herkunft, stand: today };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (day) => { const [y, m, d] = day.split("-"); return d + "." + m + "." + y; };
const STYLE = "body{font-family:system-ui,sans-serif;margin:0;padding:16px;max-width:640px;color:#1b2b2e;background:#f6f8f8}" +
  "h1{font-size:20px;margin:0 0 4px}p{line-height:1.45}.k{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}" +
  ".c{background:#fff;border-radius:10px;padding:12px}.c b{display:block;font-size:26px;color:#0f6b73}.c span{font-size:13px}" +
  "table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;margin:8px 0 16px}td,th{padding:6px 8px;text-align:left;font-size:14px;border-bottom:1px solid #e3e9ea}" +
  "th{font-weight:600}td.n{text-align:right}input,button{font-size:16px;padding:10px;border-radius:8px;border:1px solid #b9c8ca;width:100%;box-sizing:border-box;margin:6px 0}" +
  "button{background:#0f6b73;color:#fff;border:0}.e{color:#a12a2a}.m{color:#5b6b6e;font-size:13px}";
const page = (title, inner) => "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
  "<meta name=\"robots\" content=\"noindex\"><title>" + esc(title) + "</title><style>" + STYLE + "</style></head><body>" + inner + "</body></html>";

export function formHtml(app, fehler = "") {
  return page("Zahlen " + app, "<h1>Zahlen " + esc(app) + "</h1><p class=\"m\">Nur für den Betreiber.</p>" +
    (fehler ? "<p class=\"e\">" + esc(fehler) + "</p>" : "") +
    "<form method=\"post\"><input type=\"password\" name=\"passwort\" placeholder=\"Passwort\" autocomplete=\"current-password\" required><button>Zahlen zeigen</button></form>");
}

export function statsHtml(app, st) {
  const t = st.treue;
  const treueText = t.kohorte ? t.quote + " %" : "–";
  const treueHint = t.kohorte ? t.geblieben + " von " + t.kohorte + " Geräten" : "erst 4 Wochen nach dem ersten Gerät";
  const card = (zahl, text) => "<div class=\"c\"><b>" + esc(zahl) + "</b><span>" + esc(text) + "</span></div>";
  const rows = st.verlauf.map((v) => "<tr><td>" + fmt(v.tag) + "</td><td class=\"n\">" + v.aktiv + "</td><td class=\"n\">" + v.neu + "</td></tr>").join("");
  const quellen = st.herkunft.map((q) => "<tr><td>" + esc(q.herkunft || "ohne Link") + "</td><td class=\"n\">" + q.geraete + "</td><td class=\"n\">" +
    (q.kohorte ? q.quote + " % (" + q.geblieben + "/" + q.kohorte + ")" : "–") + "</td></tr>").join("");
  return page("Zahlen " + app,
    "<h1>Zahlen " + esc(app) + "</h1><p class=\"m\">Stand " + fmt(st.stand) + ". Gezählt werden Geräte, nicht Personen: Handy und Laptop derselben Person zählen doppelt.</p>" +
    "<div class=\"k\">" + card(st.heute, "heute aktiv") + card(st.woche, "aktiv in den letzten 7 Tagen") + card(st.gesamt, "Geräte insgesamt") +
    card(treueText, "nach 4 Wochen noch dabei (" + treueHint + ")") + "</div>" +
    "<p class=\"m\">„Nach 4 Wochen noch dabei“: Von allen Geräten, die vor mindestens 4 Wochen angefangen haben, der Anteil, der die App 28 Tage nach dem ersten Tag oder später wieder benutzt hat.</p>" +
    "<h2>Herkunft (Einstiegslink)</h2><table><tr><th>Link</th><th>Geräte</th><th>nach 4 Wochen</th></tr>" + (quellen || "<tr><td colspan=\"3\">noch keine</td></tr>") + "</table>" +
    "<h2>Letzte 30 Tage</h2><table><tr><th>Tag</th><th>aktiv</th><th>neu</th></tr>" + rows + "</table>");
}
