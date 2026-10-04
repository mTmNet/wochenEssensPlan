import { C, SF, SER } from "../theme.js";

// STARTBILDSCHIRM - Name eingeben, neuen Plan starten oder mit Code beitreten (nur bestehende Plaene)
export default function Join({state,api}){
  const {nameInput,joinInput,myCode,nameHint,joinErr,joinOffer,joinBusy}=state.joinState;
  const {setNameInput,setJoinInput,startPlan,joinPlan,createWithCode}=api;
  const canJoin=joinInput.length>=6&&!!nameInput.trim()&&!joinBusy;
  return(
      <div style={{minHeight:"100vh",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:SF}}>
        <div style={{width:"100%",maxWidth:"380px"}}>
          <div style={{textAlign:"center",marginBottom:"24px"}}>
            <div style={{color:C.accent,fontSize:"14px",fontWeight:"700",letterSpacing:"3px",textTransform:"uppercase",marginBottom:"16px"}}>Wochenplan</div>
            <div style={{color:"#fff",fontSize:"40px",fontFamily:SER,marginBottom:"4px",lineHeight:"1.1"}}>Gemeinsam kochen.</div>
            <div style={{color:"rgba(255,255,255,0.45)",fontSize:"26px",fontFamily:"'Dancing Script', 'Segoe Script', cursive",marginBottom:"8px"}}>by Mero</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:"13px"}}>Planen - Einkaufen - Genießen</div>
          </div>
          <div style={{marginBottom:"24px",textAlign:"center"}}>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"13px",lineHeight:"1.6"}}>Nie wieder der fragende Blick in den leeren Kühlschrank:</div>
            <div style={{color:C.accent,fontStyle:"italic",fontSize:"13px",lineHeight:"1.6"}}>"Was kochen wir heute?"</div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <label htmlFor="join-name" style={{color:"rgba(255,255,255,0.5)",fontSize:"11px",fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Dein Name</label>
            <input id="join-name" value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="z.B. Anna" style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,0.06)",border:"1px solid "+(nameHint&&!nameInput.trim()?C.err:"rgba(255,255,255,0.1)"),color:"#fff",fontSize:"15px",outline:"none",boxSizing:"border-box",fontFamily:SF}} />
            {nameHint&&!nameInput.trim()&&<div style={{color:C.err,fontSize:"12px",marginTop:"6px"}}>Bitte zuerst deinen Namen eingeben.</div>}
          </div>
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:"16px",marginBottom:"10px"}}>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:"11px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"4px"}}>NEUEN PLAN ERSTELLEN</div>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:"11px",marginBottom:"12px"}}>Teile den Code mit deiner Familie.</div>
            <div style={{background:"rgba(193,125,60,0.1)",border:"1px solid rgba(193,125,60,0.3)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
              <span style={{color:"rgba(255,255,255,0.4)",fontSize:"11px",letterSpacing:"1px"}}>CODE</span>
              <span style={{color:C.accent,fontSize:"20px",fontWeight:"700",letterSpacing:"6px"}}>{myCode}</span>
            </div>
            <button onClick={startPlan} disabled={joinBusy} style={{width:"100%",padding:"12px",minHeight:"44px",background:nameInput.trim()?C.accent:"#2d2d2d",border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:nameInput.trim()?"pointer":"default",fontFamily:SF}}>{joinBusy?"…":"PLAN STARTEN"}</button>
          </div>
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",padding:"16px"}}>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:"11px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"4px"}}>BEITRETEN</div>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:"11px",marginBottom:"10px"}}>Code eingeben, den du erhalten hast.</div>
            <input aria-label="Plan-Code" value={joinInput} onChange={e=>setJoinInput(e.target.value.toUpperCase().replace(/[\s-]/g,""))} onKeyDown={e=>{if(e.key==="Enter"&&canJoin)joinPlan();}} placeholder="CODE" maxLength={16} style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",fontSize:"20px",fontWeight:"700",letterSpacing:"4px",outline:"none",boxSizing:"border-box",textAlign:"center",marginBottom:"10px",fontFamily:SF}} />
            <button onClick={joinPlan} disabled={joinBusy} style={{width:"100%",padding:"12px",minHeight:"44px",background:canJoin?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.02)",border:"none",color:canJoin?"#fff":"rgba(255,255,255,0.3)",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:canJoin?"pointer":"default",fontFamily:SF}}>BEITRETEN</button>
            {joinErr&&(
              <div style={{marginTop:"10px"}}>
                <div style={{color:C.err,fontSize:"12px",lineHeight:"1.5"}}>{joinErr}</div>
                {joinOffer&&(
                  <button onClick={createWithCode} disabled={joinBusy} style={{width:"100%",marginTop:"8px",padding:"11px",minHeight:"44px",background:"none",border:"1px solid "+C.accent,color:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"1.5px",cursor:"pointer",fontFamily:SF}}>NEUEN PLAN MIT DIESEM CODE ANLEGEN</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
