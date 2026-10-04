import { SF } from "../theme.js";

// KURZER HINWEIS unten (Zurueck-Taste, auf anderem Geraet geloescht, kopiert)
export default function Toast({text}){
  if(!text) return null;
  return(
    <div role="status" style={{position:"fixed",bottom:"20px",left:"50%",transform:"translateX(-50%)",zIndex:9999,maxWidth:"calc(100% - 32px)",background:"rgba(0,0,0,0.88)",color:"#fff",padding:"10px 18px",borderRadius:"6px",fontSize:"13px",letterSpacing:"0.3px",fontFamily:SF,boxShadow:"0 4px 16px rgba(0,0,0,0.4)",textAlign:"center"}}>
      {text}
    </div>
  );
}
