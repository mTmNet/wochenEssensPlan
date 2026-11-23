import { useState } from "react";
import { C, SER, SF } from "../theme.js";
import { CAT_COLORS } from "../data.js";
import { recCat } from "../logic/recipes.js";
import { basisBild } from "../logic/basisBild.js";

// BILD ZUM GERICHT - eigenes Foto, sonst das mitgelieferte Bild der Rezept-Basis (Hinweis "KI-generiert"),
// sonst ruhige Platzhalterkachel (Rubrik-Farbe, Anfangsbuchstabe, Name).
export default function DishImage({name,rec,img,height=150,children,style,dim=false,compact=false,minimal=false}){
  const [loaded,setLoaded]=useState(false);
  const [failed,setFailed]=useState(false);
  const basis = !img && !failed ? basisBild(name) : "";
  const src = img || basis;
  const cat = recCat(rec);
  const color = CAT_COLORS[cat]||"#4A4A5A";
  const h = typeof height==="number" ? height+"px" : height;
  return(
    <div style={{position:"relative",height:h,background:color,overflow:"hidden",...style}}>
      {src
        ? <img key={src} src={src} alt={name} onLoad={()=>setLoaded(true)} onError={()=>{ if(!img) setFailed(true); setLoaded(true); }} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",opacity:loaded?(dim?0.75:1):0,transition:"opacity 0.4s"}} />
        : (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:compact?"flex-start":"center",justifyContent:"center",gap:"14px",padding:compact?"56px 20px 0":"0 20px",boxSizing:"border-box"}}>
            <div style={{width:"64px",height:"64px",borderRadius:"50%",border:"2px solid rgba(255,255,255,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:SER,fontSize:"34px",color:"rgba(255,255,255,0.9)",flexShrink:0}}>{String(name||"?").trim().charAt(0).toUpperCase()||"?"}</div>
            {!compact&&!minimal&&<div style={{minWidth:0}}>
              <div style={{fontFamily:SF,fontSize:"11px",fontWeight:"700",letterSpacing:"2px",textTransform:"uppercase",color:"rgba(255,255,255,0.55)",marginBottom:"4px"}}>{cat}</div>
              <div style={{fontFamily:SER,fontSize:"20px",color:"rgba(255,255,255,0.92)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
            </div>}
          </div>
        )}
      {basis&&<div style={{position:"absolute",top:"3px",left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.4)",color:"rgba(255,255,255,0.75)",fontSize:"9px",letterSpacing:"0.5px",padding:"1px 5px",borderRadius:"3px",fontFamily:SF,whiteSpace:"nowrap",pointerEvents:"none"}}>KI-generiert</div>}
      {children}
    </div>
  );
}
