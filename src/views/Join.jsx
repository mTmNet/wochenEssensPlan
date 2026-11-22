import { useState } from "react";
import { C, SF, SER, RB, RC } from "../theme.js";

// STARTBILDSCHIRM - Name eingeben, neuen Plan starten oder mit Code beitreten (nur bestehende Plaene)
import PrivacyModal from "./Privacy.jsx";

export default function Join({state,api}){
  const [infoOpen,setInfoOpen]=useState(false);
  const {nameInput,joinInput,myCode,nameHint,joinErr,joinOffer,joinBusy}=state.joinState;
  const {setNameInput,setJoinInput,startPlan,joinPlan,createWithCode}=api;
  const canJoin=joinInput.length>=6&&!!nameInput.trim()&&!joinBusy;
  return(
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:SF}}>
        <div style={{width:"100%",maxWidth:"380px"}}>
          <div style={{textAlign:"center",marginBottom:"24px"}}>
            <div style={{color:C.logo,fontSize:"44px",fontWeight:"700",fontFamily:"'Dancing Script',cursive",lineHeight:1.1,WebkitTextStroke:"0.7px "+C.logoLine,paintOrder:"stroke fill",marginBottom:"14px"}}>Wochenplan</div>
            <div style={{color:C.text,fontSize:"34px",fontFamily:SER,marginBottom:"4px",lineHeight:"1.1"}}>Gemeinsam kochen.</div>
            <div style={{color:C.muted,fontSize:"24px",fontFamily:"'Dancing Script', 'Segoe Script', cursive",marginBottom:"8px"}}>by Mero</div>
            <div style={{color:C.muted,fontSize:"13px"}}>Planen - Einkaufen - Genießen</div>
          </div>
          <div style={{marginBottom:"24px",textAlign:"center"}}>
            <div style={{color:C.muted,fontSize:"13px",lineHeight:"1.6"}}>Nie wieder der fragende Blick in den leeren Kühlschrank:</div>
            <div style={{color:C.text,fontStyle:"italic",fontSize:"13px",lineHeight:"1.6"}}>"Was kochen wir heute?"</div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <label htmlFor="join-name" style={{color:C.muted,fontSize:"12px",fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Dein Name</label>
            <input id="join-name" value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="z.B. Anna" style={{width:"100%",padding:"11px 14px",background:C.field,border:"1px solid "+(nameHint&&!nameInput.trim()?C.err:C.border),borderRadius:RB,color:C.text,fontSize:"16px",outline:"none",boxSizing:"border-box",fontFamily:SF}} />
            {nameHint&&!nameInput.trim()&&<div style={{color:C.err,fontSize:"13px",marginTop:"6px"}}>Bitte zuerst deinen Namen eingeben.</div>}
          </div>
          <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:RC,padding:"14px",marginBottom:"10px"}}>
            <div style={{color:C.text,fontSize:"15px",fontWeight:"700",marginBottom:"2px"}}>Neuen Plan erstellen</div>
            <div style={{color:C.muted,fontSize:"13px",marginBottom:"12px"}}>Teile den Code mit deiner Familie.</div>
            <div style={{background:C.abg,border:"1px solid "+C.abgBorder,borderRadius:RB,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
              <span style={{color:C.muted,fontSize:"12px",letterSpacing:"1px"}}>CODE</span>
              <span style={{color:C.accent,fontSize:"20px",fontWeight:"700",letterSpacing:"6px"}}>{myCode}</span>
            </div>
            <button onClick={startPlan} disabled={joinBusy} style={{width:"100%",padding:"11px",minHeight:"56px",background:nameInput.trim()?C.accent:C.border,border:"none",borderRadius:RB,color:nameInput.trim()?C.onAccent:C.muted,fontSize:"14px",fontWeight:"700",cursor:nameInput.trim()?"pointer":"default",fontFamily:SF}}>{joinBusy?"…":"Plan starten"}</button>
          </div>
          <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:RC,padding:"14px"}}>
            <div style={{color:C.text,fontSize:"15px",fontWeight:"700",marginBottom:"2px"}}>Beitreten</div>
            <div style={{color:C.muted,fontSize:"13px",marginBottom:"10px"}}>Code eingeben, den du erhalten hast.</div>
            <input aria-label="Plan-Code" value={joinInput} onChange={e=>setJoinInput(e.target.value.toUpperCase().replace(/[\s-]/g,""))} onKeyDown={e=>{if(e.key==="Enter"&&canJoin)joinPlan();}} placeholder="CODE" maxLength={16} style={{width:"100%",padding:"9px 14px",background:C.field,border:"1px solid "+C.border,borderRadius:RB,color:C.text,fontSize:"20px",fontWeight:"700",letterSpacing:"4px",outline:"none",boxSizing:"border-box",textAlign:"center",marginBottom:"10px",fontFamily:SF}} />
            <button onClick={joinPlan} disabled={joinBusy} style={{width:"100%",padding:"11px",minHeight:"56px",background:canJoin?C.strong:"transparent",border:"1px solid "+(canJoin?C.strong:C.border),borderRadius:RB,color:canJoin?C.onStrong:C.muted,fontSize:"14px",fontWeight:"700",cursor:canJoin?"pointer":"default",fontFamily:SF}}>Beitreten</button>
            {joinErr&&(
              <div style={{marginTop:"10px"}}>
                <div style={{color:C.err,fontSize:"13px",lineHeight:"1.5"}}>{joinErr}</div>
                {joinOffer&&(
                  <button onClick={createWithCode} disabled={joinBusy} style={{width:"100%",marginTop:"8px",padding:"11px",minHeight:"56px",background:"none",border:"1px solid "+C.accent,borderRadius:RB,color:C.accent,fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:SF}}>Neuen Plan mit diesem Code anlegen</button>
                )}
              </div>
            )}
          </div>
          <button onClick={()=>setInfoOpen(true)} style={{display:"block",margin:"14px auto 0",background:"none",border:"none",color:C.accent,fontSize:"13px",cursor:"pointer",fontFamily:SF,padding:"8px",minHeight:"40px"}}>Datenschutz</button>
        </div>
        {infoOpen&&<PrivacyModal onClose={()=>setInfoOpen(false)} />}
      </div>
  );
}
