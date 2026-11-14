import { useEffect, useState } from "react";
import { C, SF, SER, micro as label, btn, input, iconBtn } from "../theme.js";
import { recName, sortRecipeKeys } from "../logic/recipes.js";
import { groupPicks } from "../logic/picks.js";
import Modal from "../components/Modal.jsx";
import PickDay from "../components/PickDay.jsx";

// VORGEMERKT - schlichte Tagesliste statt Wochenraster: Heute, Morgen, weitere Tage, Demnaechst.
// Erscheint als Reiter nur, wenn etwas vorgemerkt ist (oder ueber "Vormerken" an einem Rezept).
export default function Plan({state,api}){
  const {picks,recipes,today,unchecked}=state;
  const {openRecipe,removePick,movePick,addPick,buildShoppingFromPicks,registerBackHandler,showToast}=api;
  const [adding,setAdding]=useState(false);
  const [q,setQ]=useState("");
  const [chosen,setChosen]=useState(null);   // {key,name} -> PickDay
  useEffect(()=>{ if(!adding) return; return registerBackHandler(()=>{ setAdding(false); return true; }); },[adding]);
  const groups=groupPicks(picks,today);
  const qq=q.trim().toLowerCase();
  const candidates=sortRecipeKeys(recipes,"az").filter(k=>!qq||recName(recipes[k],k).toLowerCase().includes(qq)).slice(0,30);
  return(
  <div style={{padding:"12px",paddingBottom:"80px"}}>
    {chosen&&<PickDay name={chosen.name} today={today} registerBackHandler={registerBackHandler} onClose={()=>setChosen(null)} onConfirm={async(day)=>{ const c=chosen; setChosen(null); setAdding(false); await addPick(c.key,day); showToast("„"+c.name+"“ vorgemerkt."); }} />}
    {adding&&!chosen&&(
      <Modal title="Gericht vormerken" onClose={()=>setAdding(false)}>
        <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Rezept suchen…" aria-label="Rezept suchen" style={{...input,marginBottom:"8px"}} />
        <div style={{maxHeight:"50vh",overflowY:"auto",border:"1px solid "+C.border}}>
          {candidates.length===0&&<div style={{padding:"12px",fontSize:"13px",color:C.muted}}>Kein Rezept gefunden. Rezepte der Rezept-Basis zuerst im Reiter „Rezepte“ übernehmen.</div>}
          {candidates.map((k,i)=>(
            <button key={k} onClick={()=>setChosen({key:k,name:recName(recipes[k],k)})} style={{width:"100%",display:"block",textAlign:"left",padding:"11px 12px",minHeight:"44px",background:"none",border:"none",borderTop:i?"1px solid "+C.border:"none",color:C.text,fontSize:"15px",fontFamily:SER,cursor:"pointer"}}>{recName(recipes[k],k)}</button>
          ))}
        </div>
        <button onClick={()=>setAdding(false)} style={{...btn("ghost"),width:"100%",marginTop:"10px"}}>ABBRECHEN</button>
      </Modal>
    )}
    <div style={{display:"flex",alignItems:"flex-end",gap:"8px",margin:"4px 2px 12px"}}>
      <div style={{flex:1}}>
        <div style={{fontFamily:SER,fontSize:"26px",color:C.text,lineHeight:1.15}}>Vorgemerkt</div>
        <div style={{fontSize:"12px",color:C.muted,marginTop:"3px"}}>Was in den nächsten Tagen gekocht werden soll. Gekochtes verschwindet, sobald es im Rezept als „heute gekocht“ steht.</div>
      </div>
      <button onClick={()=>{setQ("");setAdding(true);}} style={{...btn("primary"),letterSpacing:"1.5px",flexShrink:0}}>+ VORMERKEN</button>
    </div>

    {picks.length===0&&(
      <div style={{background:C.white,border:"1px dashed "+C.border,padding:"20px",textAlign:"center",color:C.muted,fontSize:"14px",lineHeight:"1.6",marginBottom:"12px"}}>
        Noch nichts vorgemerkt. In „Heute“ bei einem Vorschlag auf „Vormerken“ tippen oder hier ein Rezept wählen.
      </div>
    )}

    {groups.map(g=>(
      <div key={g.day||"soon"} style={{marginBottom:"12px"}}>
        <div style={{...label,marginBottom:"6px",color:g.past?C.subtle:g.day===today?C.accent:C.muted}}>{g.label}</div>
        <div style={{background:C.white,border:"1px solid "+(g.day===today?C.accent:C.border)}}>
          {g.items.map((p,i)=>{
            const rec=recipes[p.key];
            return(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:"6px",padding:"6px 4px 6px 14px",minHeight:"52px",borderTop:i?"1px solid "+C.border:"none"}}>
                <button onClick={()=>rec&&openRecipe(p.key)} style={{flex:1,minWidth:0,background:"none",border:"none",textAlign:"left",cursor:rec?"pointer":"default",padding:"6px 0",fontFamily:SF}}>
                  <div style={{fontFamily:SER,fontSize:"17px",color:rec?C.text:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recName(rec,p.key)}</div>
                  <div style={{fontSize:"12px",color:C.muted}}>{rec?[rec.minutes>0?rec.minutes+" Min.":"",rec.cuisine].filter(Boolean).join(" · "):"Rezept nicht mehr im Kochbuch"}</div>
                </button>
                {g.day!==today&&<button onClick={()=>movePick(p.id,today)} title="Auf heute legen" style={{...btn("ghost"),padding:"8px 9px",color:C.accent,flexShrink:0}}>HEUTE</button>}
                <button onClick={()=>removePick(p.id)} aria-label="Entfernen" style={iconBtn}>×</button>
              </div>
            );
          })}
        </div>
      </div>
    ))}

    {picks.length>0&&(
      <div style={{marginTop:"6px"}}>
        <button onClick={buildShoppingFromPicks} style={{...btn("dark"),width:"100%",padding:"14px",fontSize:"12px",letterSpacing:"2px"}}>EINKAUFSLISTE AUS DEM VORGEMERKTEN{unchecked>0?" ("+unchecked+" offen)":""}</button>
        <div style={{fontSize:"11px",color:C.muted,textAlign:"center",marginTop:"8px",lineHeight:"1.5"}}>Führt die Zutaten aller vorgemerkten Gerichte mit der bestehenden Liste zusammen – Handeinträge und Haken bleiben.</div>
      </div>
    )}
  </div>
  );
}
