// DESIGN (Farben, Schriften, kleine Style-Helfer fuer die Ansichten)
// Die Farbwerte stehen als CSS-Variablen in index.html (hell unter :root, dunkel unter [data-theme="dark"]).
// Hier nur die Namen, damit der Umschalter die Werte an einer Stelle tauscht.
export const C = {
  bg:"var(--c-bg)",
  white:"var(--c-white)",          // Kartenflaeche
  border:"var(--c-border)",
  text:"var(--c-text)",
  muted:"var(--c-muted)",
  subtle:"var(--c-subtle)",
  accent:"var(--c-accent)",
  abg:"var(--c-abg)",              // zarte Akzentflaeche
  abgBorder:"var(--c-abg-border)",
  onAccent:"var(--c-on-accent)",   // Schrift auf Akzent- oder Gruenflaeche
  dark:"var(--c-dark)",            // Grund hinter dem Inhalt (Startbildschirm, Kochmodus)
  ok:"var(--c-ok)",
  warn:"var(--c-warn)",            // unsicher (zwischen ok und grau)
  err:"var(--c-err)",
  star:"var(--c-star)",
  field:"var(--c-field)",          // Eingabefelder
  strong:"var(--c-strong)",        // zweiter Knopf neben dem Hauptknopf: zarte Akzentflaeche
  onStrong:"var(--c-on-strong)",
  logo:"var(--c-logo)",
  logoLine:"var(--c-logo-line)",   // feine dunkle Linie um den Schriftzug
  head:"var(--c-head)",            // Kopfzeile
  headMuted:"var(--c-head-muted)",
  headBtn:"var(--c-head-btn)",
  headBtnBorder:"var(--c-head-btn-border)",
  headBtnText:"var(--c-head-btn-text)",
  okBg:"var(--c-ok-bg)", okBorder:"var(--c-ok-border)",
  errBg:"var(--c-err-bg)", errBorder:"var(--c-err-border)",
  shade:"var(--c-shade)",          // dunkler Verlauf unter Rezeptfotos, in beiden Designs dunkel
};
export const SF = "system-ui,-apple-system,Helvetica Neue,Arial,sans-serif";
export const SER = "Georgia,'Times New Roman',serif";
// Inhaltsspalte auf dem Desktop: zentriert, hoechstens 920 px
export const MAXW = 920;
export const column = {maxWidth:MAXW+"px",margin:"0 auto",width:"100%",boxSizing:"border-box"};

// Ecken: Schaltflaechen und Felder 6 px, Karten 8 px
export const RB = "6px";
export const RC = "8px";
// Mikrolabel (Ueberschrift einer Karte): grau, weil es Information ist; Akzentfarbe bleibt dem Antippbaren vorbehalten
export const micro = {fontSize:"12px",fontWeight:"700",letterSpacing:"1px",color:C.muted,textTransform:"uppercase",marginBottom:"8px"};
// Mikrolabel gedaempft (Formularfelder)
export const microMuted = {...micro,display:"block",marginBottom:"4px"};
// Karte
export const card = {background:C.white,border:"1px solid "+C.border,borderRadius:RC,padding:"12px",marginBottom:"10px"};
// Filter-Chip, an/aus (Tippflaeche mindestens 42 px hoch)
export const chip = (on)=>({padding:"9px 12px",minHeight:"42px",border:"1px solid "+(on?C.accent:C.border),borderRadius:RB,background:on?C.abg:C.white,color:on?C.accent:C.text,fontSize:"13px",fontWeight:on?"700":"400",cursor:"pointer",fontFamily:SF});
// Knoepfe: primary (Akzentflaeche), dark (zarte Akzentflaeche), ghost (Rahmen), danger, ok; alle mindestens 48 px hoch
const base = {minHeight:"48px",padding:"12px 14px",fontSize:"13px",fontWeight:"700",letterSpacing:"0.5px",cursor:"pointer",fontFamily:SF,border:"none",borderRadius:RB};
export const btn = (kind)=>{
  if(kind==="primary") return {...base,background:C.accent,color:C.onAccent};
  if(kind==="dark") return {...base,background:C.strong,color:C.onStrong};
  if(kind==="danger") return {...base,background:"none",border:"1px solid "+C.err,color:C.err};
  if(kind==="ok") return {...base,background:C.ok,color:C.onAccent};
  return {...base,background:"none",border:"1px solid "+C.border,color:C.accent};
};
// Icon-Knopf (×, +) mit Tippflaeche 36 px
export const iconBtn = {minWidth:"36px",minHeight:"36px",background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"20px",lineHeight:1,padding:"4px 8px",fontFamily:SF,flexShrink:0};
// Eingabefeld
export const input = {width:"100%",minWidth:0,border:"1px solid "+C.border,borderRadius:RB,padding:"8px 12px",fontSize:"14px",fontFamily:SF,color:C.text,outline:"none",boxSizing:"border-box",background:C.field,minHeight:"36px"};

// FARBKANTE je Vorratsgruppe: gedeckte Farben wie am Marktstand, in beiden Designs gleich
export const GROUP_TINT = {"Obst":"#D08A2E","Gemüse":"#5F9148","Fleisch":"#B4594E","Wurst":"#C27F8E","Fisch":"#5B86B5","Brot & Backwaren":"#B8935A","Milchprodukte":"#89A9C4","Käse":"#D9A441","Getränke":"#4FA59A","Süßes":"#96648E","Tiefkühl":"#5E8F8C","Konserven":"#C8663F","Trockenwaren":"#A9824F","Sonstiges":"#8A8A8A"};
export const groupTint = (name) => GROUP_TINT[name] || GROUP_TINT.Sonstiges;
