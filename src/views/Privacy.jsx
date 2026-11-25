import { C, SF, btn } from "../theme.js";
import { useState } from "react";
import Modal from "../components/Modal.jsx";
import Rechtstext from "../Rechtstext.jsx";

// DATENSCHUTZ & DATEN - Hinweistext; in der App mit Export (Kochbuch-PDF) und "Plan endgültig löschen", auf dem Start ohne
const PRIVACY = [
  ["Kurz gesagt", "Kein Konto, keine Werbung, keine Cookies, kein Tracking durch Dritte. Dein Gerät bekommt beim ersten Öffnen eine zufällige Nutzer-ID ohne Namen oder E-Mail-Adresse; nur eingetragene Mitglieder eines Plans sehen seine Daten."],
  ["Was gespeichert wird", "Plan-Code, Vornamen der Mitglieder, Wochenpläne, Einkaufsliste, Rezepte mit Bewertung, Notizen, Kochhistorie und eigene Rezeptfotos. Vom verknüpften Haushaltsbuch liest das Kochbuch nur einen Auszug der Lebensmittel-Einkäufe ohne Beträge."],
  ["Wo", "Bei Google (Firebase) im Rechenzentrum in Belgien, Rezeptfotos als Dateien im Dateispeicher. Der Code ist der Schlüssel zum Beitreten: nur an Menschen weitergeben, die mitplanen sollen."],
  ["KI-Funktionen", "Nur beim Rezeptimport (Text oder Foto), bei „Bekanntes Gericht finden“ und wenn du 🎤 gedrückt hältst (Einkaufsliste, Vorrat) gehen Text, Foto, Sprachaufnahme oder die Liste der vorhandenen Lebensmittel an eine KI-Schnittstelle von Google, auch außerhalb der EU. Sprachaufnahmen werden nicht gespeichert. Dein Name und dein Code gehen nicht mit."],
  ["Deine Rechte", "Das Kochbuch kannst du als PDF speichern. „Plan endgültig löschen“ entfernt alle Daten dieses Plans samt Fotos. Alles Weitere, auch Kontakt und Fristen, steht in der Datenschutzerklärung."],
];

export default function PrivacyModal({onClose,onExport,onDelete,hasRecipes}){
  const [text,setText]=useState(null);   // "datenschutz" | "impressum" | null
  const link={...btn("ghost"),flex:1,color:C.accent,borderColor:C.border,borderRadius:"6px"};
  return(
    <>
    <Modal title="Datenschutz & deine Daten" onClose={onClose}>
      {PRIVACY.map(([h,t])=>(
        <div key={h} style={{marginBottom:"10px"}}>
          <div style={{fontSize:"13px",fontWeight:"700",color:C.text,marginBottom:"2px"}}>{h}</div>
          <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.55"}}>{t}</div>
        </div>
      ))}
      <div style={{display:"flex",gap:"6px",marginTop:"6px"}}>
        <button onClick={()=>setText("datenschutz")} style={link}>Datenschutzerklärung</button>
        <button onClick={()=>setText("impressum")} style={link}>Impressum</button>
      </div>
      {onDelete&&(
        <div style={{display:"flex",gap:"6px",marginTop:"6px"}}>
          <button onClick={onExport} disabled={!hasRecipes} style={{...btn("ghost"),flex:1,color:C.accent,borderColor:C.accent,opacity:hasRecipes?1:0.4,borderRadius:"6px"}}>Kochbuch-PDF</button>
          <button onClick={onDelete} style={{...btn("danger"),flex:1,borderRadius:"6px"}}>Plan endgültig löschen</button>
        </div>
      )}
      <button onClick={onClose} style={{...btn("ghost"),width:"100%",marginTop:"8px",letterSpacing:"0.5px",borderRadius:"6px"}}>Schließen</button>
    </Modal>
    {text&&<Rechtstext art={text} onClose={()=>setText(null)} />}
    </>
  );
}
