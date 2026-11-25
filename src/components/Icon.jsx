// LINIEN-SYMBOLE: schlicht, eine Strichstaerke, uebernehmen die Textfarbe des Knopfs (damit auch jede Akzentfarbe und das dunkle Design)
const PATHS = {
  mic:  <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  cam:  <><path d="M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.4"/></>,
};
export default function Icon({name,size=22}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{display:"block",flexShrink:0}}>{PATHS[name]}</svg>;
}
