// DATEIABLAGE - Fotos und Belege liegen als Dateien in Cloud Storage for Firebase (Rechenzentrum in der EU),
// nicht mehr als Base64-Text in der Realtime Database. Speicher in der Datenbank kostet rund 200-mal mehr.
// Gleiche Datei in beiden Repos (Haushaltsbuch und Wochenplan); Änderungen bitte in beiden nachziehen.
//
// Zugriff: Nur angemeldete Geräte, und nur wer den geheimen Ordnernamen kennt. Der Ordnername (32 Zufallszeichen)
// steht im Buch bzw. Plan, den nur Mitglieder lesen dürfen. Die Speicher-Regeln können die Mitgliederliste der
// Datenbank nicht selbst prüfen; der geheime Ordner ersetzt diese Prüfung. Auflisten ist verboten, Überschreiben auch.
//
// Ohne Bucket, ohne Anmeldung oder solange der Speicher in Firebase nicht eingerichtet ist, meldet jeder Aufruf
// "aus" bzw. einen Fehler, und die App legt Dateien wie bisher in der Datenbank ab. Es geht also nichts verloren.

export const STORAGE_API = "https://firebasestorage.googleapis.com/v0/b/";
export const FILE_KEY_RE = /^[A-Za-z0-9]{32}$/;
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const PAUSE_MS = 5 * 60000;   // nach "Speicher nicht eingerichtet" fünf Minuten nicht erneut versuchen

export const randFileKey = (len = 32) => {
  const buf = new Uint32Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 4294967296);
  let s = ""; for (let i = 0; i < len; i++) s += KEY_ALPHABET[buf[i] % KEY_ALPHABET.length];
  return s;
};

export const base64ToBytes = (b64) => {
  const bin = atob(String(b64 || ""));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};
export const bytesToBase64 = (bytes) => {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
};
// "data:image/jpeg;base64,AAAA" -> { mime, bytes } oder null
export const parseDataUrl = (s) => {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.*)$/i.exec(String(s || ""));
  if (!m) return null;
  try { return { mime: m[1].toLowerCase(), bytes: base64ToBytes(m[2]) }; } catch (e) { return null; }
};
export const isDataUrl = (s) => /^data:/i.test(String(s || ""));

// Adresse eines Objekts und Rückweg vom Link zum Pfad (für Links mit Download-Token, z. B. Rezeptfotos)
export const objectUrl = (bucket, path) => STORAGE_API + bucket + "/o/" + encodeURIComponent(path);
export const tokenUrl = (bucket, path, token) => objectUrl(bucket, path) + "?alt=media&token=" + encodeURIComponent(token);
export const pathFromUrl = (url, bucket) => {
  const s = String(url || "");
  const pre = STORAGE_API + bucket + "/o/";
  if (!s.startsWith(pre)) return "";
  const rest = s.slice(pre.length).split("?")[0];
  try { return decodeURIComponent(rest); } catch (e) { return ""; }
};
export const isStorageUrl = (url, bucket) => !!pathFromUrl(url, bucket);

// auth: Objekt aus src/auth.js (enabled, token()); fetchImpl für Tests
export function createAblage({ bucket = "", auth, fetchImpl, now = Date.now } = {}) {
  const b = String(bucket || "").trim();
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  let pausedUntil = 0;
  const enabled = () => !!b && !!auth && !!auth.enabled;
  const ready = () => enabled() && now() >= pausedUntil;
  const headers = async (extra) => {
    const t = auth && await auth.token();
    return t ? { Authorization: "Firebase " + t, ...(extra || {}) } : null;
  };
  // 404 auf dem Bucket oder 412: Speicher in Firebase (noch) nicht eingerichtet -> eine Weile Ruhe
  const noteMissing = (status) => { if (status === 404 || status === 412) pausedUntil = now() + PAUSE_MS; };

  // Hochladen. Rückgabe {ok:true, size, token} | {ok:false, reason:"aus"|"regeln"|"fehlt"|"netz"|"groesse"}
  const upload = async (path, bytes, contentType) => {
    if (!ready()) return { ok: false, reason: "aus" };
    const h = await headers({ "Content-Type": contentType || "application/octet-stream" });
    if (!h) return { ok: false, reason: "aus" };
    try {
      const r = await doFetch(STORAGE_API + b + "/o?name=" + encodeURIComponent(path), { method: "POST", headers: h, body: bytes });
      if (!r.ok) {
        noteMissing(r.status);
        return { ok: false, reason: r.status === 403 || r.status === 401 ? "regeln" : (r.status === 404 || r.status === 412 ? "fehlt" : "netz") };
      }
      const d = await r.json().catch(() => null);
      const size = d ? parseInt(d.size, 10) : NaN;
      // Prüfung: Der Speicher bestätigt genau die Größe, die wir geschickt haben
      if (!(size === bytes.length)) return { ok: false, reason: "groesse" };
      const token = d && d.downloadTokens ? String(d.downloadTokens).split(",")[0] : "";
      return { ok: true, size, token };
    } catch (e) { return { ok: false, reason: "netz" }; }
  };

  // Angaben zu einem Objekt: {size, token} | null (gibt es nicht) | undefined (Fehler)
  const info = async (path) => {
    if (!enabled()) return undefined;
    const h = await headers();
    if (!h) return undefined;
    try {
      const r = await doFetch(objectUrl(b, path), { headers: h });
      if (r.status === 404) return null;
      if (!r.ok) return undefined;
      const d = await r.json().catch(() => null);
      if (!d) return undefined;
      return { size: parseInt(d.size, 10), token: d.downloadTokens ? String(d.downloadTokens).split(",")[0] : "" };
    } catch (e) { return undefined; }
  };

  // Laden: Uint8Array | null (gibt es nicht) | undefined (Fehler, Netz, Regeln)
  const download = async (path) => {
    if (!enabled()) return undefined;
    const h = await headers();
    if (!h) return undefined;
    try {
      const r = await doFetch(objectUrl(b, path) + "?alt=media", { headers: h });
      if (r.status === 404) return null;
      if (!r.ok) return undefined;
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) { return undefined; }
  };

  // Löschen: true auch dann, wenn die Datei schon fehlt
  const remove = async (path) => {
    if (!enabled() || !path) return false;
    const h = await headers();
    if (!h) return false;
    try { const r = await doFetch(objectUrl(b, path), { method: "DELETE", headers: h }); return r.ok || r.status === 404; }
    catch (e) { return false; }
  };

  // Hochladen, und wenn das Objekt schon da ist (z. B. hat ein anderes Gerät denselben Altbestand gerade umgezogen),
  // dessen Größe prüfen. So bekommt jede Datei genau einen festen Namen.
  const uploadOnce = async (path, bytes, contentType) => {
    const up = await upload(path, bytes, contentType);
    if (up.ok || up.reason !== "regeln") return up;
    const i = await info(path);
    if (i && i.size === bytes.length) return { ok: true, size: i.size, token: i.token, existed: true };
    return up;
  };

  return { bucket: b, enabled, ready, upload, uploadOnce, info, download, remove,
    url: (path, token) => tokenUrl(b, path, token), pathOf: (url) => pathFromUrl(url, b) };
}
