import { useState } from "react";
import { C, SF, btn } from "../theme.js";
import Modal from "../components/Modal.jsx";

// HILFE & FRAGEN - haeufige Fragen zum Aufklappen (Menue "⋯"); immer nur eine Antwort offen
export const HB_URL = "https://schlaueshaushaltsbuch.de";
const FRAGEN = [
  ["Was kann das schlaue Kochbuch?", "Es beantwortet jeden Tag die Frage „Was kochen wir heute?“ aus dem, was zu Hause da ist. „Heute“ zeigt Vorschläge, „Rezepte“ euer Kochbuch, „Vorrat“ was wahrscheinlich da ist und „Einkauf“ eure gemeinsame Einkaufsliste."],
  ["Wie fange ich an?", "Unter „Rezepte“ Gerichte aus der Rezept-Basis übernehmen oder eigene Rezepte hinzufügen. Dann den Vorrat füllen: Einkäufe auf der Einkaufsliste abhaken, die Speisekammer fotografieren oder etwas eintippen. Je voller der Vorrat, desto besser passen die Vorschläge."],
  ["Wie kocht meine Familie mit?", "Oben steht euer Code, ein Tipp darauf kopiert ihn. Wer ihn auf dem Startbildschirm unter „Beitreten“ eingibt, sieht dieselben Rezepte, dieselbe Einkaufsliste und denselben Vorrat. Gib den Code nur Menschen, die mitplanen sollen."],
  ["Woher weiß die App, was da ist?", "Aus abgehakten Einkäufen, Fotos der Speisekammer, Eingetipptem und, wenn verbunden, aus den Bons im schlauen Haushaltsbuch. Mit der Zeit verblasst ein Eintrag, weil Lebensmittel verbraucht werden oder verderben. ✓ heißt „ist noch da“, × heißt „aufgebraucht“, und „Wurde heute gekocht“ nimmt die Zutaten aus dem Vorrat. Mehr dazu unter „Vorrat“ → „So funktioniert der Vorrat“."],
  ["Wie kommt etwas auf die Einkaufsliste?", "Unter „Einkauf“ oben eintippen oder das Mikrofon gedrückt halten und sagen, was fehlt. Oder im Rezept „Auf die Einkaufsliste“ antippen: alles oder nur das, was laut Vorrat fehlt. Abgehaktes kommt in den Vorrat."],
  ["Was bringt das schlaue Haushaltsbuch?", "Dort fotografierst du deine Kassenbons, die KI trägt Händler, Betrag und jede Position ein. Ist es mit dem Kochbuch verbunden, landen die gekauften Lebensmittel von selbst im Vorrat, ohne Beträge. Zum Verbinden den Buch-Code aus dem Haushaltsbuch kopieren und hier unter „Vorrat“ → „Haushaltsbuch verbinden“ einfügen."],
  ["Was macht die KI?", "Sie liest Rezepte aus Text oder Foto, erkennt Lebensmittel auf einem Foto der Speisekammer, ordnet Namen vom Kassenbon den Zutaten zu findet unter „Nichts dabei? Frag die KI“ ein Gericht aus dem Vorrat und versteht, was du per Mikrofon in die Einkaufsliste oder im Vorrat-Netz sagst. Dein Name und dein Code gehen nicht mit. Alles andere funktioniert auch ohne KI."],
  ["Wie lege ich die App auf den Startbildschirm?", "iPhone: in Safari unten „Teilen“ antippen, dann „Zum Home-Bildschirm“. Android: im Chrome-Menü ⋮ „App installieren“ oder „Zum Startbildschirm hinzufügen“."],
  ["Neues Handy, oder alles löschen?", "Auf dem neuen Handy schlauesKochbuch.de öffnen, Namen eingeben und unter „Beitreten“ euren Code eingeben, dann ist alles wieder da. Löschen: Menü ⋯ → „Datenschutz & Daten“ → „Plan endgültig löschen“. Das löscht die Daten für alle Mitglieder."],
];

export default function Hilfe({onClose}){
  const [open,setOpen]=useState(0);   // Index der offenen Frage; -1 = alle zu
  const row={display:"flex",alignItems:"center",gap:"10px",width:"100%",minHeight:"44px",padding:"10px 0",background:"none",border:"none",textAlign:"left",cursor:"pointer",fontFamily:SF,fontSize:"14px",color:C.text};
  return(
    <Modal title="Hilfe & Fragen" onClose={onClose}>
      {FRAGEN.map(([q,a],i)=>(
        <div key={q} style={{borderBottom:"1px solid "+C.border}}>
          <button onClick={()=>setOpen(open===i?-1:i)} aria-expanded={open===i} style={row}>
            <span style={{flex:1,fontWeight:open===i?"700":"400"}}>{q}</span>
            <span aria-hidden="true" style={{color:C.accent,fontSize:"12px"}}>{open===i?"▲":"▼"}</span>
          </button>
          {open===i&&<div style={{fontSize:"14px",color:C.muted,lineHeight:"1.55",padding:"0 0 12px"}}>
            {a}
            {q.includes("Haushaltsbuch")&&<a href={HB_URL} target="_blank" rel="noopener" style={{display:"block",marginTop:"8px",color:C.accent,fontWeight:"700",textDecoration:"none"}}>schlauesHaushaltsbuch.de öffnen ↗</a>}
          </div>}
        </div>
      ))}
      <button onClick={onClose} style={{...btn("ghost"),width:"100%",marginTop:"12px",letterSpacing:"0.5px",borderRadius:"6px"}}>Schließen</button>
    </Modal>
  );
}
