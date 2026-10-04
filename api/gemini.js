// Vercel-Function: leitet KI-Anfragen weiter, der Schlüssel bleibt auf dem Server
import { pickGeneration, originAllowed, makeRateLimiter, toGeminiContents, readErrorText } from "./_shared.js";

const MAX_BODY = 6 * 1024 * 1024; // 6 MB
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Drossel lebt je Instanz (kalter Start setzt sie zurück), nicht global
const allow = makeRateLimiter({ max: 20, windowMs: 60000 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clientIp = (req) => {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unbekannt";
};

export default async function handler(req, res) {
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
    const text = candidate?.content?.parts?.[0]?.text || "";

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
