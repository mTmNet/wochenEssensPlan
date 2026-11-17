// ANONYME ANMELDUNG - jedes Gerät bekommt im Hintergrund eine eigene Nutzer-ID, ohne Konto, E-Mail oder Passwort.
// Läuft wie der Datenbankzugriff über einfache Web-Aufrufe, ohne zusätzliche Bibliothek.
// Auf dem Gerät liegen nur Nutzer-ID und Erneuerungs-Schlüssel; der kurzlebige Nachweis (gültig 1 Stunde) bleibt im Arbeitsspeicher.
// Ohne Web-Schlüssel (apiKey leer) ist die Anmeldung aus und die App läuft wie bisher ohne Nachweis.

export const AUTH_KEY = "wochenplan-auth-v1";
const SIGNUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=";
const REFRESH_URL = "https://securetoken.googleapis.com/v1/token?key=";
const AUTH_TIMEOUT_MS = 8000;
const RETRY_PAUSE_MS = 30000;   // nach einem Fehlschlag nicht bei jedem 10-Sekunden-Abruf erneut anklopfen
const EARLY_MS = 120000;        // Nachweis zwei Minuten vor Ablauf erneuern
// Antworten, nach denen die gespeicherte Anmeldung endgültig unbrauchbar ist (dann neu anmelden)
const DEAD = /TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED|INVALID_REFRESH_TOKEN|MISSING_REFRESH_TOKEN|INVALID_GRANT_TYPE/;

const browserStorage = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } };

export function createAuth({ apiKey = "", fetchImpl, storage, now = Date.now } = {}) {
  const key = String(apiKey || "").trim();
  const store = storage === undefined ? browserStorage() : storage;
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  let uid = "", refreshToken = "", idToken = "", exp = 0;
  let pending = null, pauseUntil = 0;

  try {
    const raw = store && store.getItem(AUTH_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s.uid === "string" && typeof s.refreshToken === "string") { uid = s.uid; refreshToken = s.refreshToken; }
  } catch (e) { /* kaputter Eintrag: neu anmelden */ }

  const save = () => { try { if (store) store.setItem(AUTH_KEY, JSON.stringify({ uid, refreshToken })); } catch (e) { /* Speicher gesperrt: Anmeldung gilt bis zum Schließen */ } };
  const call = async (url, init) => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), AUTH_TIMEOUT_MS) : null;
    try { return await doFetch(url, ctl ? { ...init, signal: ctl.signal } : init); }
    finally { if (timer) clearTimeout(timer); }
  };
  const seconds = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 3600; };

  // true = erneuert, false = Anmeldung endgültig ungültig, null = gerade nicht möglich (Netz, Störung)
  const refresh = async () => {
    try {
      const r = await call(REFRESH_URL + key, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refreshToken),
      });
      if (r.ok) {
        const d = await r.json();
        if (!d || !d.id_token) return null;
        idToken = d.id_token; exp = now() + seconds(d.expires_in) * 1000;
        if (d.refresh_token) refreshToken = d.refresh_token;
        if (d.user_id) uid = d.user_id;
        save();
        return true;
      }
      const text = await r.text().catch(() => "");
      return r.status === 400 && DEAD.test(text) ? false : null;
    } catch (e) { return null; }
  };

  const signUp = async () => {
    try {
      const r = await call(SIGNUP_URL + key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
      if (!r.ok) return false;
      const d = await r.json();
      if (!d || !d.idToken || !d.refreshToken || !d.localId) return false;
      uid = d.localId; refreshToken = d.refreshToken; idToken = d.idToken; exp = now() + seconds(d.expiresIn) * 1000;
      save();
      return true;
    } catch (e) { return false; }
  };

  const fresh = () => !!idToken && exp - now() > EARLY_MS;

  // Gültiger Nachweis oder "" (Anmeldung aus, gerade nicht möglich oder gestört). Wirft nie.
  const token = async () => {
    if (!key) return "";
    if (fresh()) return idToken;
    if (now() < pauseUntil) return "";
    if (!pending) {
      pending = (async () => {
        let ok = false;
        if (refreshToken) {
          const r = await refresh();
          if (r === true) ok = true;
          else if (r === false) { uid = ""; refreshToken = ""; idToken = ""; exp = 0; ok = await signUp(); }
        } else {
          ok = await signUp();
        }
        if (!ok) pauseUntil = now() + RETRY_PAUSE_MS;
      })().finally(() => { pending = null; });
    }
    await pending;
    return fresh() ? idToken : "";
  };

  return {
    enabled: !!key,
    token,
    uid: () => uid,
    // Die Datenbank hat den Nachweis abgelehnt: beim nächsten Aufruf einen neuen holen
    invalidate: () => { idToken = ""; exp = 0; },
  };
}

const withToken = (url, t) => t ? url + (url.includes("?") ? "&" : "?") + "auth=" + encodeURIComponent(t) : url;

// Datenbank-Aufruf mit Nachweis. Lehnt die Datenbank ihn ab (401), einmal mit frischem Nachweis wiederholen;
// gibt es keinen, geht die Anfrage ohne hinaus (Übergang: funktioniert, solange die Regeln das erlauben).
export async function authedFetch(auth, doFetch, url, init, ms) {
  const t = auth ? await auth.token() : "";
  const r = await doFetch(withToken(url, t), init, ms);
  if (!t || r.status !== 401) return r;
  // 401 kommt auch, wenn die Regeln den Zugriff verbieten ("Permission denied"); dann hilft kein neuer Nachweis
  let why = "";
  try { why = await r.clone().text(); } catch (e) { /* Antwort nicht lesbar: wie abgelaufen behandeln */ }
  if (/permission denied/i.test(why)) return r;
  auth.invalidate();
  const t2 = await auth.token();
  return doFetch(withToken(url, t2), init, ms);
}
