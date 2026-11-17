import { useEffect, useState } from "react";
import { C, SF, chip, btn } from "../theme.js";
import Modal from "./Modal.jsx";
import { dayChoices } from "../logic/picks.js";

// VORMERKEN - Tag waehlen (Heute, Morgen, die naechsten Tage, Demnaechst) und bestaetigen
export default function PickDay({name,today,onConfirm,onClose,registerBackHandler}){
  const [day,setDay]=useState(today);
  useEffect(()=>{ if(!registerBackHandler) return; return registerBackHandler(()=>{ onClose(); return true; }); },[]);
  const choices=dayChoices(today);
  return(
    <Modal title="Vormerken" micro={name} onClose={onClose}>
      <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"14px"}}>
        {choices.map(c=>(
          <button key={c.day||"soon"} onClick={()=>setDay(c.day)} aria-pressed={day===c.day} style={{...chip(day===c.day),flex:"1 1 30%",padding:"10px 8px",minHeight:"42px",textAlign:"center",fontSize:"13px"}}>{c.label}</button>
        ))}
      </div>
      <div style={{fontSize:"13px",color:C.subtle,lineHeight:"1.5",marginBottom:"12px"}}>Vorgemerktes erscheint in „Heute“ am gewählten Tag und im Reiter „Vorgemerkt“. Die Einkaufsliste lässt sich daraus erzeugen.</div>
      <div style={{display:"flex",gap:"8px"}}>
        <button onClick={()=>onConfirm(day)} style={{...btn("primary"),flex:2,letterSpacing:"0.5px",borderRadius:"6px"}}>Vormerken</button>
        <button onClick={onClose} style={{...btn("ghost"),flex:1,borderRadius:"6px"}}>Abbrechen</button>
      </div>
    </Modal>
  );
}
