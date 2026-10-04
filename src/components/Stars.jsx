import { C } from "../theme.js";

// STERNE-BEWERTUNG (1-5, nochmal tippen = zuruecksetzen); Tippflaeche 40 px, aria-label je Stern
export const Stars = ({value=0,onRate,size=24}) => (
  <div style={{display:"flex",gap:"2px"}} role="group" aria-label="Bewertung">
    {[1,2,3,4,5].map(i=>(
      <button key={i} type="button" onClick={()=>onRate&&onRate(i===value?0:i)} aria-label={i+(i===1?" Stern":" Sterne")+(i===value?" (nochmal tippen setzt zurück)":"")} aria-pressed={i<=value}
        style={{background:"none",border:"none",cursor:onRate?"pointer":"default",fontSize:size+"px",lineHeight:1,color:i<=value?C.star:C.subtle,padding:"4px",minWidth:"40px",minHeight:"40px"}}>
        {i<=value?"★":"☆"}
      </button>
    ))}
  </div>
);
export default Stars;
