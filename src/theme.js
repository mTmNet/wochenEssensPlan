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
  err:"var(--c-err)",
  star:"var(--c-star)",
  field:"var(--c-field)",          // Eingabefelder
  strong:"var(--c-strong)",        // kraeftiger Knopf
  onStrong:"var(--c-on-strong)",
  logo:"var(--c-logo)",
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

// Mikrolabel in Akzentfarbe (Ueberschrift einer Karte), mindestens 11 px
export const micro = {fontSize:"11px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"8px"};
// Mikrolabel gedaempft (Formularfelder)
export const microMuted = {...micro,color:C.muted,letterSpacing:"1px",display:"block",marginBottom:"4px"};
// Karte
export const card = {background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"12px"};
// Filter-Chip, an/aus (Tippflaeche mindestens 36 px hoch)
export const chip = (on)=>({padding:"9px 12px",minHeight:"36px",border:"1px solid "+(on?C.accent:C.border),background:on?C.abg:C.white,color:on?C.accent:C.muted,fontSize:"11px",fontWeight:on?"700":"400",cursor:"pointer",fontFamily:SF});
// Knoepfe: primary (Akzent), dark, ghost (Rahmen), danger; alle mindestens 40 px hoch
const base = {minHeight:"40px",padding:"11px 14px",fontSize:"11px",fontWeight:"700",letterSpacing:"1.5px",cursor:"pointer",fontFamily:SF,border:"none"};
export const btn = (kind)=>{
  if(kind==="primary") return {...base,background:C.accent,color:C.onAccent};
  if(kind==="dark") return {...base,background:C.strong,color:C.onStrong};
  if(kind==="danger") return {...base,background:"none",border:"1px solid "+C.err,color:C.err};
  if(kind==="ok") return {...base,background:C.ok,color:C.onAccent};
  return {...base,background:"none",border:"1px solid "+C.border,color:C.muted};
};
// Icon-Knopf (×, +) mit Tippflaeche 40 px
export const iconBtn = {minWidth:"40px",minHeight:"40px",background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"20px",lineHeight:1,padding:"6px 8px",fontFamily:SF,flexShrink:0};
// Eingabefeld
export const input = {width:"100%",border:"1px solid "+C.border,padding:"10px 12px",fontSize:"14px",fontFamily:SF,color:C.text,outline:"none",boxSizing:"border-box",background:C.field,minHeight:"40px"};
