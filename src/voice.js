// SPRACHEINGABE - Mikrofon-Knopf: gedrückt halten, sprechen, loslassen. Oder kurz tippen, sprechen und mit „Fertig“
// (oder erneutem Tippen) beenden. Gleiche Datei in Kochbuch und Haushaltsbuch.
// Die Aufnahme bleibt im Speicher des Browsers, bis sie (als Base64) an onAudio geht; danach ist sie weg.
// Das Mikrofon ist nur an, solange aufgenommen wird (höchstens maxMs), danach wird es sofort freigegeben.
// Keine Spracherkennung des Browsers: Die würde die Stimme an Apple bzw. Google außerhalb unserer KI-Schnittstelle schicken.
import { useEffect, useRef, useState } from "react";
import { pickAudioType, audioTypeOf } from "./logic/voice.js";

export const voiceSupported = () =>
  typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || "");

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onerror = () => reject(new Error("Aufnahme konnte nicht gelesen werden."));
  r.onload = () => { const s = String(r.result || ""); resolve(s.includes(",") ? s.split(",")[1] : ""); };
  r.readAsDataURL(blob);
});

// phase: "idle" | "starting" (Mikrofon wird geöffnet) | "rec" (Aufnahme läuft) | "busy" (KI arbeitet)
// latched: Aufnahme läuft nach kurzem Tippen weiter, bis „Fertig“ (finish) oder erneutes Tippen
// hint: kurzer Text für Fehler; onAudio({base64, mimeType}) darf werfen, dann steht die Meldung im hint
// beforeStart(): false = nicht aufnehmen (z. B. erst die Einwilligung zeigen)
export function useHoldToTalk({ onAudio, beforeStart, maxMs = 60000, minMs = 600, tapMs = 450 }) {
  const [phase, setPhase] = useState("idle");
  const [latched, setLatched] = useState(false);
  const [hint, setHint] = useState("");
  const s = useRef({ held: false, latched: false, rec: null, stream: null, timer: null, t0: 0, downAt: 0, opening: false, skipUp: false });
  const cb = useRef(onAudio); cb.current = onAudio;
  const busy = useRef(false);

  const release = () => {
    const st = s.current;
    clearTimeout(st.timer);
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    st.stream = null;
  };
  useEffect(() => () => { const st = s.current; st.held = false; if (st.rec && st.rec.state !== "inactive") { st.rec.onstop = null; st.rec.stop(); } release(); }, []);

  const latch = (on) => { s.current.latched = on; setLatched(on); };

  // Aufnahme beenden und auswerten
  const finish = () => {
    const st = s.current;
    st.held = false;
    latch(false);
    clearTimeout(st.timer);
    if (st.rec && st.rec.state !== "inactive") st.rec.stop();
  };

  const begin = async () => {
    const st = s.current;
    if (st.rec || st.opening || busy.current) return;
    if (beforeStart && beforeStart() === false) return;
    st.held = true;
    setHint("");
    if (!voiceSupported()) { st.held = false; setHint("Dieser Browser kann keine Sprache aufnehmen. Bitte eintippen."); return; }
    st.opening = true;
    setPhase("starting");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      st.opening = false; st.held = false; latch(false); setPhase("idle");
      const name = (e && e.name) || "";
      setHint(name === "NotAllowedError" || name === "SecurityError"
        ? "Das Mikrofon ist für diese Seite gesperrt. In den Einstellungen des Browsers erlauben, dann erneut versuchen."
        : "Kein Mikrofon verfügbar" + (name ? " (" + name + ")" : "") + ".");
      return;
    }
    st.opening = false;
    st.stream = stream;
    // Schon losgelassen (kurz getippt oder der Browser hat erst um Erlaubnis gefragt): weiter aufnehmen bis „Fertig“
    if (!st.held) latch(true);
    const type = pickAudioType((t) => window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(t));
    let rec;
    try { rec = new window.MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined); }
    catch (e) {
      try { rec = new window.MediaRecorder(stream); }
      catch (e2) { release(); st.held = false; latch(false); setPhase("idle"); setHint("Aufnahme nicht möglich in diesem Browser."); return; }
    }
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onerror = () => { setHint("Die Aufnahme wurde unterbrochen. Bitte erneut versuchen."); };
    rec.onstop = async () => {
      const dur = Date.now() - st.t0;
      st.rec = null;
      release();
      latch(false);
      const mimeType = audioTypeOf(rec.mimeType || (chunks[0] && chunks[0].type), type, isApple());
      const blob = new Blob(chunks, { type: mimeType });
      if (dur < minMs || !blob.size) { setPhase("idle"); setHint("Die Aufnahme war zu kurz. Mikrofon antippen, sprechen und dann „Fertig“ tippen."); return; }
      busy.current = true; setPhase("busy");
      try {
        const base64 = await blobToBase64(blob);
        await cb.current({ base64, mimeType });
      } catch (e) {
        setHint((e && e.message) || "Das hat nicht geklappt. Bitte erneut versuchen.");
      }
      busy.current = false; setPhase("idle");
    };
    st.rec = rec;
    st.t0 = Date.now();
    // Zeitscheiben: so liegen auch bei einem Abbruch Daten vor (manche Browser liefern sonst erst beim Stopp)
    try { rec.start(1000); } catch (e) { rec.start(); }
    setPhase("rec");
    try { navigator.vibrate && navigator.vibrate(20); } catch (e) { /* ohne Vibration */ }
    st.timer = setTimeout(finish, maxMs);
  };

  // Finger runter: läuft eine getippte Aufnahme, beendet das Tippen sie; sonst geht die Aufnahme los
  const down = () => {
    const st = s.current;
    if (st.latched && st.rec) { st.skipUp = true; finish(); return; }
    st.downAt = Date.now();
    begin();
  };
  // Finger hoch: nach langem Halten fertig; nach kurzem Tippen läuft die Aufnahme weiter (bis „Fertig“)
  const up = () => {
    const st = s.current;
    if (st.skipUp) { st.skipUp = false; return; }
    if (!st.held) return;
    st.held = false;
    if (!st.rec) return;                                   // Mikrofon geht noch auf: begin() schaltet auf „bis Fertig“
    if (Date.now() - st.downAt < tapMs) latch(true); else finish();
  };

  const bind = {
    onPointerDown: (e) => { if (e.button !== undefined && e.button !== 0) return; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* egal */ } down(); },
    onPointerUp: up,
    onPointerCancel: up,
    onKeyDown: (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); down(); } },
    onKeyUp: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); up(); } },
    onContextMenu: (e) => e.preventDefault(),
  };
  // Gegen Textauswahl und Lupe beim langen Drücken (iPhone)
  const noSelect = { touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" };
  return { phase, latched, hint, setHint, bind, noSelect, finish };
}
