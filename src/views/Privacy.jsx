import { C, SF, btn } from "../theme.js";
import Modal from "../components/Modal.jsx";

// DATENSCHUTZ & DATEN - Hinweistext; in der App mit Export (Kochbuch-PDF) und "Plan endgültig löschen", auf dem Start ohne
const PRIVACY = [
  ["Was das ist", "Ein privates Projekt für Familie und Freunde. Keine Konten, keine Werbung, kein Tracking, keine Cookies. Auf diesem Gerät merkt sich die App nur Code, Namen, Schriftgröße und den zuletzt gewählten Filter."],
  ["Was gespeichert wird", "Plan-Code, Namen der Mitglieder, Wochenpläne (wer kocht was), Einkaufsliste, Rezepte mit Bewertung, Notizen und Kochhistorie, eigene Rezeptfotos sowie der Code des verknüpften Haushaltsbuchs. Das Haushaltsbuch wird nur gelesen."],
  ["Wo", "Google Firebase Realtime Database, Rechenzentrum europe-west1 (Belgien). Verschlüsselt bei Übertragung und Speicherung; für Google und für jeden, der den Code kennt, lesbar. Der Code ist das Passwort – nur an Mitglieder weitergeben."],
  ["Hosting", "Vercel. Beim Aufruf entstehen technische Server-Protokolle mit IP-Adresse, die nach kurzer Zeit gelöscht werden."],
  ["KI-Funktionen", "Nur wenn du den Rezeptimport (Text oder Foto) oder „Bekanntes Gericht finden“ nutzt, gehen Text, Foto oder die Liste der wahrscheinlich vorhandenen Lebensmittel an die Google Gemini API, auch außerhalb der EU. Die App speichert das Foto nicht. KI-Symbolbilder werden bei pollinations.ai erzeugt (nur der Gerichtname wird gesendet) und lassen sich im Menü abschalten."],
  ["Deine Rechte", "Das Kochbuch kannst du als PDF speichern. Mit „Plan endgültig löschen“ entfernst du alle Daten dieses Plans inklusive Fotos bei Firebase. Fragen und Auskunft: über das Code-Repository des Betreibers."],
];

export default function PrivacyModal({onClose,onExport,onDelete,hasRecipes}){
  return(
    <Modal title="Datenschutz & deine Daten" onClose={onClose}>
      {PRIVACY.map(([h,t])=>(
        <div key={h} style={{marginBottom:"10px"}}>
          <div style={{fontSize:"13px",fontWeight:"700",color:C.text,marginBottom:"2px"}}>{h}</div>
          <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.55"}}>{t}</div>
        </div>
      ))}
      {onDelete&&(
        <div style={{display:"flex",gap:"6px",marginTop:"6px"}}>
          <button onClick={onExport} disabled={!hasRecipes} style={{...btn("ghost"),flex:1,color:C.accent,borderColor:C.accent,opacity:hasRecipes?1:0.4}}>KOCHBUCH-PDF</button>
          <button onClick={onDelete} style={{...btn("danger"),flex:1}}>PLAN ENDGÜLTIG LÖSCHEN</button>
        </div>
      )}
      <button onClick={onClose} style={{...btn("ghost"),width:"100%",marginTop:"8px",letterSpacing:"2px"}}>SCHLIESSEN</button>
    </Modal>
  );
}
