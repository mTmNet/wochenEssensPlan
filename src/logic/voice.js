// SPRACHEINGABE - reine Hilfen ohne Browser-Zugriff (getestet in tests/voice.test.mjs).
// Aufgenommen wird im Browser (src/voice.js); die Aufnahme geht nur zur Erkennung an die KI und wird nirgends gespeichert.

// Tonformat für die Aufnahme: das erste, das der Browser kann. Android/Chrome nimmt webm, iPhone/Safari mp4.
export const AUDIO_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
export const pickAudioType = (isSupported) => {
  for (const t of AUDIO_CANDIDATES) {
    try { if (isSupported(t)) return t; } catch (e) { /* älterer Browser: weiter probieren */ }
  }
  return "";
};

// Posten aus der KI-Antwort {items:[...]}: Text kürzen, Leeres und Doppeltes (gleich geschrieben) weglassen, höchstens 40
export const spokenItems = (parsed) => {
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : []);
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const t = String((it && typeof it === "object" ? it.text || it.name : it) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 40) break;
  }
  return out;
};

// Kurzer Hinweis nach dem Übernehmen: "3 Posten auf der Liste: Milch, Zwiebeln, Butter"
export const addedText = (items, max = 4) => {
  const n = items.length;
  const shown = items.slice(0, max).join(", ") + (n > max ? " …" : "");
  return (n === 1 ? "1 Posten" : n + " Posten") + " auf der Liste: " + shown;
};
