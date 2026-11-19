// MESSUNG "zuletzt aktiv": Das Gerät meldet höchstens einmal am Tag an /api/aktiv, dass die App benutzt wurde.
// Mit dabei nur der Anmelde-Nachweis (daraus liest der Server die Nutzer-ID) und, falls vorhanden, die Herkunft aus dem
// Einstiegslink (?von=standort, z. B. vom QR-Code eines Schilds). Kein Analyse-Dienst, keine Cookies.
// Auf dem Gerät liegen nur der Tag der letzten Meldung und die Herkunft.

const cleanSource = (s) => { const v = String(s ?? "").trim().toLowerCase(); return /^[a-z0-9-]{1,24}$/.test(v) ? v : ""; };
const localDay = (t) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const browserStorage = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } };

export function createActivity({ prefix, auth, fetchImpl, storage, now = Date.now, search } = {}) {
  const store = storage === undefined ? browserStorage() : storage;
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const DAY_KEY = prefix + "-aktiv-tag";
  const SRC_KEY = prefix + "-herkunft";
  const get = (k) => { try { return store ? store.getItem(k) || "" : ""; } catch (e) { return ""; } };
  const set = (k, v) => { try { if (store) store.setItem(k, v); } catch (e) { /* Speicher gesperrt: dann eben nicht gemerkt */ } };
  let busy = false, pauseUntil = 0; // nach einem Fehlschlag zehn Minuten Ruhe, nicht bei jedem 10-Sekunden-Abruf

  // Herkunft aus dem Einstiegslink merken. Die erste zählt; spätere Links überschreiben sie nicht.
  const capture = () => {
    let q = search;
    if (q === undefined) { try { q = typeof location !== "undefined" ? location.search : ""; } catch (e) { q = ""; } }
    let v = "";
    try { v = cleanSource(new URLSearchParams(q || "").get("von")); } catch (e) { v = ""; }
    if (v && !get(SRC_KEY)) set(SRC_KEY, v);
  };

  // Einmal am Tag melden. Klappt es nicht (offline, Anmeldung aus), versucht es der nächste Aufruf wieder. Wirft nie.
  const ping = async () => {
    if (busy || !auth || !auth.enabled) return false;
    const today = localDay(now());
    if (get(DAY_KEY) === today || now() < pauseUntil) return false;
    busy = true;
    let ok = false;
    try {
      const token = await auth.token();
      if (!token) return false;
      const src = get(SRC_KEY);
      const r = await doFetch("/api/aktiv", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(src ? { von: src } : {}),
      });
      if (!r || !r.ok) return false;
      set(DAY_KEY, today);
      ok = true;
      return true;
    } catch (e) {
      return false;
    } finally {
      busy = false;
      if (!ok) pauseUntil = now() + 600000;
    }
  };

  return { capture, ping };
}
