import { useEffect, useRef, useState } from "react";
import { C, SF, column } from "../theme.js";
import { APP_VERSION } from "../data.js";
import PrivacyModal from "./Privacy.jsx";
import { getThemeMode, setThemeMode } from "../themeMode.js";
import Toast from "../components/Toast.jsx";

// RAHMEN der Hauptansicht: Kopf (Titel, Name, Code, Menue), Sync-Leiste, Tabs; Inhalt auf dem Desktop zentriert (max. 920 px)
export default function Shell({state,api,children}){
  const {toast,userName,code,codeCopied,fontZoom,syncOk,syncErr,lastSync,view,unchecked,picks}=state;
  const {copyCode,zoom,leavePlan,deletePlan,downloadPDF,setView,registerBackHandler}=api;
  const openPicks=(picks||[]).length;
  const [menuOpen,setMenuOpen]=useState(false);
  const [themeMode,setThemeModeState]=useState(getThemeMode);   // Design: system | light | dark
  const pickTheme=(m)=>{ setThemeMode(m); setThemeModeState(m); };
  const [infoOpen,setInfoOpen]=useState(false);   // Datenschutz & deine Daten
  const menuRef=useRef(null);
  // Zurueck-Taste und Tipp daneben schliessen das Menue
  useEffect(()=>{ if(!menuOpen) return; return registerBackHandler(()=>{ setMenuOpen(false); return true; }); },[menuOpen]);
  useEffect(()=>{
    if(!menuOpen) return;
    const h=(e)=>{ if(menuRef.current&&!menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[menuOpen]);
  const rowBtn={display:"flex",alignItems:"center",gap:"10px",width:"100%",minHeight:"44px",padding:"10px 14px",background:"none",border:"none",borderBottom:"1px solid "+C.border,color:C.text,fontSize:"13px",textAlign:"left",cursor:"pointer",fontFamily:SF};
  const zoomBtn={minWidth:"40px",minHeight:"36px",background:C.bg,border:"1px solid "+C.border,color:C.text,fontWeight:"700",cursor:"pointer",fontFamily:SF,fontSize:"13px"};
  return(
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:SF}}>
        <Toast text={toast} />
        {/* HEADER */}
        <div style={{background:C.head,borderBottom:"1px solid "+C.border}}>
          <div style={{...column,padding:"12px 16px",display:"flex",alignItems:"center",gap:"8px 10px"}}>
            <div style={{flex:"1 1 auto",minWidth:0}}>
              <div style={{color:C.logo,fontSize:"clamp(24px,7vw,34px)",fontWeight:"600",fontFamily:"'Dancing Script',cursive",lineHeight:1.05,marginBottom:"1px",whiteSpace:"nowrap"}}>Wochenplan</div>
              <div style={{color:C.headMuted,fontSize:"11px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userName}</div>
            </div>
            <button onClick={copyCode} aria-label="Plan-Code kopieren" style={{background:C.abg,border:"1px solid "+C.abgBorder,padding:"5px 10px",minHeight:"40px",textAlign:"center",cursor:"pointer",fontFamily:SF}}>
              <div style={{color:C.headMuted,fontSize:"11px",fontWeight:"700",letterSpacing:"1px",marginBottom:"1px"}}>{codeCopied?"KOPIERT":"CODE"}</div>
              <div style={{color:C.accent,fontSize:"14px",fontWeight:"700",letterSpacing:"2px"}}>{code}</div>
            </button>
            {/* MENUE */}
            <div ref={menuRef} style={{position:"relative",flexShrink:0}}>
              <button onClick={()=>setMenuOpen(o=>!o)} aria-label="Menü" aria-expanded={menuOpen} title="Menü" style={{minWidth:"44px",minHeight:"44px",background:C.headBtn,border:"1px solid "+C.headBtnBorder,color:C.headBtnText,fontSize:"22px",lineHeight:1,cursor:"pointer",fontFamily:SF}}>⋯</button>
              {menuOpen&&(
                <div role="menu" style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:1000,width:"260px",background:C.white,border:"1px solid "+C.border,boxShadow:"0 10px 30px rgba(0,0,0,0.5)"}}>
                  <div style={{...rowBtn,cursor:"default"}}>
                    <span style={{flex:1}}>Schrift</span>
                    <button onClick={()=>zoom(-0.1)} title="Schrift kleiner" aria-label="Schrift kleiner" disabled={fontZoom<=0.8} style={{...zoomBtn,opacity:fontZoom<=0.8?0.4:1}}>A−</button>
                    <span style={{fontSize:"11px",color:C.muted,minWidth:"34px",textAlign:"center"}}>{Math.round(fontZoom*100)} %</span>
                    <button onClick={()=>zoom(0.1)} title="Schrift größer" aria-label="Schrift größer" disabled={fontZoom>=1.4} style={{...zoomBtn,opacity:fontZoom>=1.4?0.4:1}}>A+</button>
                  </div>
                  <div style={{...rowBtn,cursor:"default",flexDirection:"column",alignItems:"stretch",gap:"6px"}}>
                    <span>Design</span>
                    <div role="group" aria-label="Design" style={{display:"flex",gap:"4px"}}>
                      {[["system","System"],["light","Hell"],["dark","Dunkel"]].map(([id,lab])=>(
                        <button key={id} onClick={()=>pickTheme(id)} aria-pressed={themeMode===id} style={{flex:1,minHeight:"36px",background:themeMode===id?C.abg:C.bg,border:"1px solid "+(themeMode===id?C.accent:C.border),color:themeMode===id?C.accent:C.text,fontWeight:themeMode===id?"700":"400",cursor:"pointer",fontFamily:SF,fontSize:"13px"}}>{lab}</button>
                      ))}
                    </div>
                  </div>
                  <button role="menuitem" onClick={()=>{setMenuOpen(false);setView("plan");}} style={rowBtn}>Plan · Vorgemerkt{openPicks?" ("+openPicks+")":""}</button>
                  <button role="menuitem" onClick={()=>{setMenuOpen(false);setInfoOpen(true);}} style={rowBtn}>Datenschutz & Daten</button>
                  <button role="menuitem" onClick={()=>{setMenuOpen(false);leavePlan();}} style={{...rowBtn,color:C.err}}>Plan verlassen</button>
                  <div style={{padding:"8px 14px",fontSize:"11px",color:C.subtle}}>Version {APP_VERSION}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {infoOpen&&<PrivacyModal onClose={()=>setInfoOpen(false)} onExport={downloadPDF} onDelete={deletePlan} hasRecipes={Object.keys(state.recipes||{}).length>0} />}
        {/* SYNC - schmal, bei Fehlern rot mit Text */}
        <div style={{background:syncOk?C.okBg:C.errBg,borderBottom:"1px solid "+(syncOk?C.okBorder:C.errBorder)}}>
          <div style={{...column,padding:"4px 16px",display:"flex",alignItems:"center",gap:"6px"}}>
            <div style={{width:"6px",height:"6px",borderRadius:"50%",background:syncOk?C.ok:C.err,flexShrink:0}} />
            <span style={{fontSize:"11px",color:syncOk?C.ok:C.err}}>{syncOk?(lastSync?"Sync "+new Date(lastSync).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):"Verbunden"):(syncErr||"Verbindungsfehler")}</span>
            <span style={{marginLeft:"auto",fontSize:"11px",color:C.subtle,flexShrink:0}}>alle 10 Sek.</span>
          </div>
        </div>

        {/* TABS */}
        <div style={{background:C.white,borderBottom:"1px solid "+C.border}}>
          <div style={{...column,display:"flex",padding:"0 6px",overflowX:"auto"}}>
            {[{id:"heute",label:"Heute"},{id:"vorrat",label:"Vorrat"},{id:"recipes",label:"Rezepte"},{id:"shopping",label:"Einkauf"+(unchecked>0?" ("+unchecked+")":"")},...(openPicks||view==="plan"?[{id:"plan",label:"Plan"+(openPicks?" ("+openPicks+")":"")}]:[])].map(t=>(
              <button key={t.id} onClick={()=>setView(t.id)} aria-current={view===t.id?"page":undefined} style={{flex:"1 0 auto",padding:"12px 9px",minHeight:"44px",border:"none",borderBottom:view===t.id?"2px solid "+C.accent:"2px solid transparent",color:view===t.id?C.accent:C.muted,fontWeight:view===t.id?"700":"400",fontSize:"13px",letterSpacing:"0.3px",whiteSpace:"nowrap",background:"none",cursor:"pointer",fontFamily:SF}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={column}>{children}</div>
      </div>
  );
}
