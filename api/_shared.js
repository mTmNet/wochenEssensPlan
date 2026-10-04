// Hilfsfunktionen für die KI-Function. Dateien mit führendem Unterstrich sind bei Vercel keine Functions.

// Erzeugungsparameter je Modus: Extraktion kaum kreativ, Vorschlag etwas freier. Unbekannt oder fehlend -> wie "extract".
export function pickGeneration(mode) {
  if (mode === "suggest") return { temperature: 0.3, maxOutputTokens: 4000 };
  return { temperature: 0.1, maxOutputTokens: 6000 };
}

// Erster Header-Wert, auch wenn Node ein Array liefert
const headerValue = (headers, name) => {
  if (!headers) return "";
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? String(v[0] || "") : String(v || "");
};

// Host (ohne Port) aus einer URL ziehen; leer, wenn nicht parsbar
const hostOf = (url) => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
};

const isLocal = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";

// Herkunftsprüfung: Origin- oder Referer-Host muss dem eigenen Host entsprechen oder lokal sein.
// Fehlen Origin UND Referer, wird abgelehnt (schützt vor direkten Aufrufen von fremden Servern).
export function originAllowed(headers) {
  const origin = headerValue(headers, "origin");
  const referer = headerValue(headers, "referer");
  if (!origin && !referer) return false;
  const own = headerValue(headers, "host").split(":")[0].toLowerCase();
  const source = origin || referer;
  const host = hostOf(source);
  if (!host) return false;
  return isLocal(host) || (own !== "" && host === own);
}

// Drossel je IP mit gleitendem Zeitfenster. `now` ist injizierbar (Tests).
export function makeRateLimiter({ max = 20, windowMs = 60000, now = Date.now } = {}) {
  const hits = new Map(); // ip -> Liste von Zeitstempeln
  return function allow(ip) {
    const t = now();
    const key = ip || "unbekannt";
    const recent = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
    // Alte Einträge anderer IPs gelegentlich aufräumen, damit die Map nicht wächst
    if (hits.size > 500) {
      for (const [k, list] of hits) {
        if (!list.some((ts) => t - ts < windowMs)) hits.delete(k);
      }
    }
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}

// Nachrichten (Rollen user/assistant, Inhalt Text oder Teile mit text/image) in das Format des KI-Dienstes umwandeln
export function toGeminiContents(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => {
    const role = msg.role === "assistant" ? "model" : "user";
    if (Array.isArray(msg.content)) {
      const parts = msg.content.map((part) => {
        if (part.type === "text") return { text: part.text };
        if (part.type === "image") {
          return {
            inlineData: {
              mimeType: part.source?.media_type || "image/jpeg",
              data: part.source?.data || "",
            },
          };
        }
        return { text: "" };
      });
      return { role, parts };
    }
    return { role, parts: [{ text: String(msg.content ?? "") }] };
  });
}

// Verständliche deutsche Meldung für Fehlerantworten des KI-Dienstes
export function readErrorText(status, text) {
  const raw = String(text || "");
  if (status === 401 || status === 403 || raw.includes("API_KEY_INVALID")) {
    return "Der Schlüssel für die KI ist ungültig oder nicht freigeschaltet. Bitte auf dem Server prüfen.";
  }
  if (status === 429) return "Das Kontingent der KI ist aufgebraucht. Bitte später erneut versuchen.";
  if (status === 503) return "Die KI ist gerade überlastet. Bitte in einer Minute erneut versuchen.";
  return "KI-Fehler (" + status + "): " + raw.slice(0, 300);
}
