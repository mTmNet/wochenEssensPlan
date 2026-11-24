// SPRACHEINGABE - Knopf gedrückt halten, sprechen, loslassen. Gleiche Datei in Kochbuch und Haushaltsbuch.
// Die Aufnahme bleibt im Speicher des Browsers, bis sie (als Base64) an onAudio geht; danach ist sie weg.
// Das Mikrofon ist nur an, solange der Knopf gedrückt ist (höchstens maxMs), danach wird es sofort freigegeben.
// Keine Spracherkennung des Browsers: Die würde die Stimme an Apple bzw. Google außerhalb unserer KI-Schnittstelle schicken.
import { useEffect, useRef, useState } from "react";
import { pickAudioType } from "./logic/voice.js";

export const voiceSupported = () =>
  typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onerror = () => reject(new Error("Aufnahme konnte nicht gelesen werden."));
  r.onload = () => { const s = String(r.result || ""); resolve(s.includes(",") ? s.split(",")[1] : ""); };
  r.readAsDataURL(blob);
});

// phase: "idle" | "starting" (Mikrofon wird geöffnet) | "rec" (Aufnahme läuft) | "busy" (KI arbeitet)
// hint: kurzer Text für Fehler oder falsche Bedienung; onAudio({base64, mimeType}) darf werfen, dann steht die Meldung im hint
// beforeStart(): false = nicht aufnehmen (z. B. erst die Einwilligung zeigen)
export function useHoldToTalk({ onAudio, beforeStart, maxMs = 60000, minMs = 700 }) {
  const [phase, setPhase] = useState("idle");
  const [hint, setHint] = useState("");
  const s = useRef({ held: false, rec: null, stream: null, timer: null, t0: 0 });
  const cb = useRef(onAudio); cb.current = onAudio;
  const busy = useRef(false);

  const release = () => {
    const st = s.current;
    clearTimeout(st.timer);
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    st.stream = null;
  };
  useEffect(() => () => { s.current.held = false; if (s.current.rec && s.current.rec.state !== "inactive") { s.current.rec.onstop = null; s.current.rec.stop(); } release(); }, []);

  const stop = () => {
    const st = s.current;
    st.held = false;
    clearTimeout(st.timer);
    if (st.rec && st.rec.state !== "inactive") st.rec.stop();
  };

  const start = async () => {
    const st = s.current;
    if (st.held || st.rec || busy.current) return;
    if (beforeStart && beforeStart() === false) return;
    st.held = true;
    setHint("");
    if (!voiceSupported()) { st.held = false; setHint("Dieser Browser kann keine Sprache aufnehmen. Bitte eintippen."); return; }
    setPhase("starting");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      st.held = false; setPhase("idle");
      setHint(e && (e.name === "NotAllowedError" || e.name === "SecurityError")
        ? "Das Mikrofon ist für diese Seite gesperrt. In den Browser-Einstellungen erlauben, dann erneut versuchen."
        : "Kein Mikrofon gefunden.");
      return;
    }
    st.stream = stream;
    // Losgelassen, während das Mikrofon noch aufging (z. B. beim ersten Mal, wenn der Browser um Erlaubnis fragt)
    if (!st.held) { release(); setPhase("idle"); setHint("Jetzt den Knopf gedrückt halten, sprechen und dann loslassen."); return; }
    const type = pickAudioType((t) => window.MediaRecorder.isTypeSupported(t));
    let rec;
    try { rec = new window.MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined); }
    catch (e) { release(); st.held = false; setPhase("idle"); setHint("Aufnahme nicht möglich in diesem Browser."); return; }
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = async () => {
      const dur = Date.now() - st.t0;
      st.rec = null;
      release();
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
      if (dur < minMs || !blob.size) { setPhase("idle"); setHint("Zu kurz. Knopf gedrückt halten, sprechen, dann loslassen."); return; }
      busy.current = true; setPhase("busy");
      try {
        const base64 = await blobToBase64(blob);
        await cb.current({ base64, mimeType: blob.type });
      } catch (e) {
        setHint((e && e.message) || "Das hat nicht geklappt. Bitte erneut versuchen.");
      }
      busy.current = false; setPhase("idle");
    };
    st.rec = rec;
    st.t0 = Date.now();
    rec.start();
    setPhase("rec");
    try { navigator.vibrate && navigator.vibrate(20); } catch (e) { /* ohne Vibration */ }
    st.timer = setTimeout(stop, maxMs);
  };

  // Für den Knopf: Finger/Maus halten; Leertaste oder Enter halten geht auch. Lange drücken öffnet kein Kontextmenü.
  const bind = {
    onPointerDown: (e) => { if (e.button !== undefined && e.button !== 0) return; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* egal */ } start(); },
    onPointerUp: stop,
    onPointerCancel: stop,
    onKeyDown: (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } },
    onKeyUp: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); stop(); } },
    onContextMenu: (e) => e.preventDefault(),
  };
  // Gegen Textauswahl und Lupe beim langen Drücken (iPhone)
  const noSelect = { touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" };
  return { phase, hint, setHint, bind, noSelect };
}
