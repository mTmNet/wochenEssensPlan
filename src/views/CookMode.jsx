import { useEffect, useRef, useState } from "react";
import { C, SF, SER, column } from "../theme.js";
import { recName, stepMinutes } from "../logic/recipes.js";
import Toast from "../components/Toast.jsx";

// Signalton (ohne Datei) und Vibration, wenn ein Timer ablaeuft
const beep = () => {
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) return;
    const ctx=new Ctx(); const o=ctx.createOscillator(); const g=ctx.createGain();
    o.type="sine"; o.frequency.value=880; g.gain.value=0.2; o.connect(g); g.connect(ctx.destination);
    o.start(); [0.25,0.5].forEach(t=>{ g.gain.setValueAtTime(0.0001,ctx.currentTime+t-0.02); g.gain.setValueAtTime(0.2,ctx.currentTime+t); });
    o.stop(ctx.currentTime+0.75); setTimeout(()=>ctx.close().catch(()=>{}),1200);
  }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate([300,150,300]); }catch(e){}
};
const fmtTimer = (sec) => { const s=Math.max(0,Math.round(sec)); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); };
const fmtMin = (m) => m>=60 ? (m%60===0 ? (m/60)+" Std." : Math.floor(m/60)+" Std. "+Math.round(m%60)+" Min.") : (Number.isInteger(m)?m:m.toFixed(1).replace(".",","))+" Min.";

// KOCHMODUS - ein Schritt pro Bildschirm, einklappbare Zutatenleiste, Wake Lock, Timer fuer erkannte Zeitangaben, "Fertig" oeffnet den Bewertungsdialog
export default function CookMode({state,api}){
  const {detailRecipe,cookStep,curRec,toast}=state;
  const {setCookMode,setCookStep,finishCook,showToast}=api;
  const steps=curRec.steps||[], ings=curRec.ingredients||[];
  const [showIngs,setShowIngs]=useState(false);
  const [timers,setTimers]=useState([]);          // [{id, step, total, end, label}]
  const tick=useRef(null);
  const [,setNow]=useState(0);

  // Display an lassen (Wake Lock), solange der Kochmodus offen ist
  useEffect(()=>{
    let lock=null, active=true;
    const request=async()=>{ try{ if(navigator.wakeLock&&active){ lock=await navigator.wakeLock.request("screen"); } }catch(e){} };
    request();
    const onVis=()=>{ if(document.visibilityState==="visible") request(); };
    document.addEventListener("visibilitychange",onVis);
    return()=>{ active=false; document.removeEventListener("visibilitychange",onVis); try{ lock&&lock.release(); }catch(e){} };
  },[]);
  // Timer-Uhr
  useEffect(()=>{
    if(!timers.length){ clearInterval(tick.current); return; }
    tick.current=setInterval(()=>{
      setNow(Date.now());
      setTimers(ts=>{ const due=ts.filter(t=>!t.done&&t.end<=Date.now()); if(due.length){ beep(); showToast&&showToast("Timer abgelaufen: "+due.map(t=>t.label).join(", "),4000); return ts.map(t=>due.includes(t)?{...t,done:true}:t); } return ts; });
    },500);
    return()=>clearInterval(tick.current);
  },[timers.length]);

  const minutesHere=stepMinutes(steps[cookStep]);
  const startTimer=(m)=>setTimers(ts=>[...ts,{id:Date.now()+Math.random(),step:cookStep,total:m*60,end:Date.now()+m*60000,label:fmtMin(m)+" (Schritt "+(cookStep+1)+")",done:false}]);
  const removeTimer=(id)=>setTimers(ts=>ts.filter(t=>t.id!==id));
  const navBtn={flex:1,padding:"14px",minHeight:"48px",border:"none",fontSize:"13px",letterSpacing:"1px",cursor:"pointer",fontFamily:SF};
  return(
      <div style={{minHeight:"100vh",background:C.dark,fontFamily:SF,display:"flex",flexDirection:"column"}}>
        <Toast text={toast} />
        <div style={{...column,display:"flex",flexDirection:"column",flex:1}}>
          <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:"12px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
            <button onClick={()=>setCookMode(false)} style={{background:"rgba(255,255,255,0.07)",border:"none",color:"rgba(255,255,255,0.7)",padding:"10px 14px",minHeight:"40px",fontSize:"12px",letterSpacing:"0.5px",cursor:"pointer",fontFamily:SF}}>ZURÜCK</button>
            <div style={{flex:1,fontFamily:SER,color:"#fff",fontSize:"18px",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recName(curRec,detailRecipe)}</div>
            <div style={{color:C.accent,fontSize:"12px",fontWeight:"700",letterSpacing:"1px"}}>{cookStep+1} / {steps.length}</div>
          </div>
          {/* ZUTATENLEISTE (einklappbar) */}
          <div style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
            <button onClick={()=>setShowIngs(v=>!v)} aria-expanded={showIngs} style={{width:"100%",display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",minHeight:"40px",background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:"11px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",fontFamily:SF,textAlign:"left"}}>
              <span style={{flex:1}}>ZUTATEN ({ings.length})</span><span style={{fontSize:"14px"}}>{showIngs?"▴":"▾"}</span>
            </button>
            {showIngs&&(
              <div style={{padding:"0 20px 12px",display:"flex",flexWrap:"wrap",gap:"6px"}}>
                {ings.map((ing,i)=><span key={i} style={{fontSize:"13px",color:"rgba(255,255,255,0.85)",background:"rgba(255,255,255,0.08)",padding:"6px 10px",borderRadius:"3px"}}>{ing}</span>)}
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:"4px",padding:"0 24px",marginTop:"16px"}}>
            {steps.map((_,i)=>(
              <button key={i} onClick={()=>setCookStep(i)} aria-label={"Schritt "+(i+1)} style={{height:"12px",flex:1,padding:0,border:"none",background:"transparent",cursor:"pointer"}}>
                <div style={{height:"2px",background:i<=cookStep?C.accent:"rgba(255,255,255,0.15)",transition:"background 0.3s"}} />
              </button>
            ))}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"36px 28px"}}>
            <div style={{fontSize:"64px",fontFamily:SER,color:C.accent,marginBottom:"24px",lineHeight:1}}>{cookStep+1}</div>
            <div style={{fontSize:"22px",color:"rgba(255,255,255,0.92)",fontFamily:SER,textAlign:"center",lineHeight:"1.7",maxWidth:"420px"}}>{steps[cookStep]}</div>
            {/* TIMER-KNOEPFE fuer erkannte Zeitangaben */}
            {minutesHere.length>0&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginTop:"24px",justifyContent:"center"}}>
                {minutesHere.map(m=>(
                  <button key={m} onClick={()=>startTimer(m)} style={{padding:"10px 14px",minHeight:"40px",border:"1px solid "+C.accent,background:"rgba(212,144,74,0.12)",color:C.accent,fontSize:"12px",fontWeight:"700",letterSpacing:"1px",cursor:"pointer",fontFamily:SF}}>⏱ {fmtMin(m)} starten</button>
                ))}
              </div>
            )}
          </div>
          {/* LAUFENDE TIMER */}
          {timers.length>0&&(
            <div style={{padding:"0 20px 8px",display:"flex",flexDirection:"column",gap:"6px"}}>
              {timers.map(t=>{
                const left=(t.end-Date.now())/1000;
                return(
                  <div key={t.id} role="timer" style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 12px",background:t.done?"rgba(76,175,125,0.18)":"rgba(255,255,255,0.06)",border:"1px solid "+(t.done?C.ok:"rgba(255,255,255,0.12)")}}>
                    <span style={{fontSize:"20px",fontWeight:"700",color:t.done?C.ok:"#fff",fontVariantNumeric:"tabular-nums",minWidth:"64px"}}>{t.done?"Fertig":fmtTimer(left)}</span>
                    <span style={{flex:1,fontSize:"12px",color:"rgba(255,255,255,0.7)"}}>{t.label}</span>
                    <button onClick={()=>removeTimer(t.id)} aria-label="Timer entfernen" style={{minWidth:"40px",minHeight:"40px",background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:"20px",cursor:"pointer"}}>×</button>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{padding:"20px",display:"flex",gap:"12px"}}>
            <button onClick={()=>setCookStep(s=>Math.max(0,s-1))} disabled={cookStep===0} style={{...navBtn,background:"rgba(255,255,255,0.07)",color:cookStep===0?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.75)",cursor:cookStep===0?"default":"pointer"}}>ZURÜCK</button>
            {cookStep<steps.length-1
              ?<button onClick={()=>setCookStep(s=>s+1)} style={{...navBtn,flex:2,background:C.accent,color:"#fff",fontWeight:"700"}}>WEITER</button>
              :<button onClick={finishCook} style={{...navBtn,flex:2,background:C.ok,color:"#fff",fontWeight:"700"}}>FERTIG</button>
            }
          </div>
        </div>
      </div>
  );
}
