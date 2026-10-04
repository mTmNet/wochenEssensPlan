import { C, SF, SER } from "../theme.js";

// MODAL - abgedunkelter Hintergrund, Tipp daneben schliesst; Inhalt scrollt bei Bedarf
export default function Modal({title,micro,onClose,children}){
  return(
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={title} style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:"420px",maxHeight:"90vh",overflowY:"auto",background:C.white,border:"1px solid "+C.border,padding:"20px",fontFamily:SF,boxSizing:"border-box"}}>
        {micro&&<div style={{fontSize:"11px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"6px"}}>{micro}</div>}
        {title&&<div style={{fontSize:"20px",fontFamily:SER,color:C.text,marginBottom:"14px"}}>{title}</div>}
        {children}
      </div>
    </div>
  );
}
