// Vercel-Function: leitet KI-Anfragen weiter, der Schlüssel bleibt auf dem Server
import { pickGeneration, originAllowed, makeRateLimiter, toGeminiContents, readErrorText } from "./_shared.js";
import { checkAndCount, limitStatus, limitsFrom, cleanCode, limitMessage } from "./_limit.js";

const MAX_BODY = 6 * 1024 * 1024; // 6 MB
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Drossel lebt je Instanz (kalter Start setzt sie zurück), nicht global
const allow = makeRateLimiter({ max: 20, windowMs: 60000 });

// Kostendeckel: Tageszähler in der eigenen Datenbank (siehe _limit.js). Aktiv, sobald AI_LIMIT_SECRET gesetzt ist.
const LIMIT_DB = "https://wochenessenplan-3d0e1-default-rtdb.europe-west1.firebasedatabase.app";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clientIp = (req) => {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unbekannt";
};

export default async function handler(req, res) {
  // Prüfseite für den Betreiber: /api/gemini im Browser öffnen zeigt, ob der Kostendeckel zählt (ruft die KI nicht auf)
  if (req.method === "GET") {
    if (!allow(clientIp(req))) return res.status(429).json({ error: "Zu viele Anfragen, bitte eine Minute warten." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ kostendeckel: await limitStatus({ dbUrl: process.env.AI_LIMIT_DB_URL || LIMIT_DB, secret: process.env.AI_LIMIT_SECRET }), region: process.env.VERCEL_REGION || "" }); // region: wo die Function läuft (soll fra1 sein, siehe vercel.json)
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST erlaubt." });
  }

  if (!originAllowed(req.headers)) {
    return res.status(403).json({ error: "Anfrage von fremder Herkunft abgelehnt." });
  }

  if (!allow(clientIp(req))) {
    return res.status(429).json({ error: "Zu viele Anfragen, bitte eine Minute warten." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const payload = req.body && typeof req.body === "object" ? req.body : {};
  if (JSON.stringify(payload).length > MAX_BODY) {
    return res.status(413).json({ error: "Anfrage zu groß (mehr als 6 MB). Bitte ein kleineres Bild nutzen." });
  }

  const { system, messages, mode } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Es fehlen Nachrichten (messages)." });
  }

  // Tagesgrenzen über alle Instanzen: insgesamt, je IP, je Plan-Code (später je Nutzer-ID)
  const limit = await checkAndCount({
    dbUrl: process.env.AI_LIMIT_DB_URL || LIMIT_DB,
    secret: process.env.AI_LIMIT_SECRET,
    limits: limitsFrom(process.env),
    subjects: [{ kind: "ip", id: clientIp(req) }, { kind: "code", id: cleanCode(payload.code) }],
  });
  if (!limit.ok) {
    return res.status(429).json({ error: limitMessage(limit.reason) });
  }

  const body = {
    contents: toGeminiContents(messages),
    generationConfig: pickGeneration(mode),
  };
  if (system) body.systemInstruction = { parts: [{ text: String(system) }] };

  try {
    // Bei Überlastung (503) bis zu dreimal versuchen
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch(ENDPOINT + "?key=" + apiKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status !== 503 || attempt === 3) break;
      await sleep(3000);
    }

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: readErrorText(response.status, errText) });
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    // Text kann auf mehrere parts verteilt sein (z. B. nach einem thought-Teil): alle Textteile zusammennehmen
    const text = (candidate?.content?.parts || []).filter((p) => p && typeof p.text === "string" && !p.thought).map((p) => p.text).join("") || "";
    if (text && candidate?.finishReason === "MAX_TOKENS") {
      return res.status(422).json({ error: "Die Antwort der KI wurde abgeschnitten (MAX_TOKENS). Bitte erneut versuchen, mit weniger Zutaten in der Auswahl." });
    }

    if (!text) {
      const reason = candidate?.finishReason || "UNKNOWN";
      if (reason === "RECITATION") {
        return res.status(422).json({ error: "Dieses Rezept ist urheberrechtlich geschützt — die KI darf es nicht reproduzieren. Bitte das Rezept manuell eintippen und den Text-Import nutzen." });
      }
      return res.status(422).json({ error: `Die KI hat keine Antwort geliefert (finishReason: ${reason}). Bitte ein anderes Bild versuchen.` });
    }

    // Antwortformat bleibt {text}, damit der Client unverändert weiterläuft
    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: "Fehler: " + error.message });
  }
}
