import { useMemo, useState } from "react";
import { C, SF, SER, micro as label, chip, btn } from "../theme.js";
import { CUISINE_LIST, TAGS } from "../data.js";
import { recName, recCat, recKey, normalizeRecipe } from "../logic/recipes.js";
import { rankSuggestions } from "../logic/suggest.js";
import { picksForDay } from "../logic/picks.js";
import DishImage from "../components/DishImage.jsx";

// HEUTE - "Was kochen wir heute?": vorgemerkt fuer heute, bester Vorschlag mit Begruendung, Alternativen, Vorrat-Zeile, KI
const pColor=(p)=>p>=0.6?C.ok:p>=0.25?C.accent:C.subtle;
const fmtToday=()=>new Date().toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"});

export default function Heute({state,api}){
  const {stock,hbLink,hbBook,recipes,images,classics,picks,today,aiBusy,aiErr,household}=state;
  const {openRecipe,startCooking,setView,suggestRecipe,adoptClassic,removePick}=api;
  const [filters,setFilters]=useState({quick:false,kids:false});
  const [round,setRound]=useState(0);            // "Neue Vorschlaege": blaettert durch die Rangliste (Hauptkachel und Alternativen wechseln)
  const [selected,setSelected]=useState("");     // angetippte Alternative wird zur Hauptkachel
  const [more,setMore]=useState(false);
  const [aiOpen,setAiOpen]=useState(false);
  const [aiCuisine,setAiCuisine]=useState("Egal");
  const [busy,setBusy]=useState("");
  const hasStock=stock.length>0;
  const emptyBook=Object.keys(recipes).length===0;

  // Pool: eigenes Kochbuch + Rezept-Basis (nur was noch nicht im Kochbuch ist)
  const pool=useMemo(()=>{
    const own=Object.keys(recipes).map(k=>({key:k,rec:recipes[k],basis:false}));
    const base=classics.filter(c=>!recipes[recKey(c.name)]).map(c=>{ const k=recKey(c.name); return {key:k,rec:{...normalizeRecipe(k,c,0),basis:true},basis:true,classic:c}; });
    return [...own,...base];
  },[recipes,classics]);
  const ranked=useMemo(()=>rankSuggestions(pool,stock,{filters,today}),[pool,stock,filters,today]);
  // Fenster: "Neue Vorschlaege" springt um vier weiter (rundum); eine angetippte Alternative steht oben, die uebrigen folgen in Rangfolge
  const start=ranked.length?(round*4)%ranked.length:0;
  const order=[...ranked.slice(start),...ranked.slice(0,start)];
  const sel=selected?order.find(s=>s.key===selected):null;
  const top=sel||order[0];
  const rest=order.filter(s=>top&&s.key!==top.key).slice(0,more?9:3);
  const todayPicks=picksForDay(picks,today);
  const likely=stock.filter(s=>s.p>=0.25).length;

  // Eintrag der Rezept-Basis erst ins Kochbuch holen, dann handeln (ein Tipp genuegt)
  const ensureKey=async(s)=>{ if(!s.basis) return s.key; setBusy(s.key); const k=await adoptClassic(s.classic); setBusy(""); return k; };
  const open=async(s)=>{ const k=await ensureKey(s); if(k) openRecipe(k); };
  const cook=async(s)=>{ const k=await ensureKey(s); if(k) startCooking(k); };
  const toggle=(f)=>{ setFilters(v=>({...v,[f]:!v[f]})); setMore(false); setSelected(""); };
  const another=()=>{ setRound(r=>r+1); setSelected(""); setMore(false); };
  const meta=(s)=>[hasStock?Math.round(s.cov*100)+" % da":"",s.rec.minutes>0?s.rec.minutes+" Min.":"",s.rec.cuisine&&s.rec.cuisine!=="International"?s.rec.cuisine:recCat(s.rec)].filter(Boolean).join(" · ");
  const nameOf=(s)=>s.basis?s.classic.name:recName(s.rec,s.key);

  return(
  <div style={{padding:"12px",paddingBottom:"80px"}}>
    <div style={{margin:"4px 2px 12px"}}>
      <div style={{fontFamily:SER,fontSize:"26px",color:C.text,lineHeight:1.15}}>Was kochen wir heute?</div>
      <div style={{fontSize:"13px",color:C.muted,marginTop:"3px"}}>{fmtToday()}</div>
    </div>

    {/* VORGEMERKT FUER HEUTE */}
    {todayPicks.length>0&&(
      <div style={{background:C.white,border:"1px solid "+C.accent,padding:"12px 14px",marginBottom:"12px"}}>
        <div style={label}>Für heute vorgemerkt</div>
        {todayPicks.map((p,i)=>{
          const rec=recipes[p.key];
          return(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 0",borderTop:i?"1px solid "+C.border:"none",minHeight:"48px"}}>
              <button onClick={()=>rec&&openRecipe(p.key)} style={{flex:1,minWidth:0,background:"none",border:"none",textAlign:"left",cursor:rec?"pointer":"default",padding:"6px 0",fontFamily:SF}}>
                <div style={{fontFamily:SER,fontSize:"17px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recName(rec,p.key)}</div>
                <div style={{fontSize:"13px",color:C.muted}}>{[rec&&rec.minutes>0?rec.minutes+" Min.":"","Rezept öffnen – im Kochmodus oder im Rezept als „heute gekocht“ eintragen"].filter(Boolean).join(" · ")}</div>
              </button>
              <button onClick={()=>removePick(p.id)} aria-label="Vormerkung entfernen" style={{minWidth:"40px",minHeight:"40px",background:"none",border:"none",color:C.subtle,fontSize:"20px",cursor:"pointer",fontFamily:SF}}>×</button>
            </div>
          );
        })}
      </div>
    )}

    {/* FILTER + ANDERE VORSCHLAEGE */}
    <div style={{display:"flex",gap:"6px",marginBottom:"12px",alignItems:"center"}}>
      {TAGS.map(t=>{ const f=t.id==="schnell"?"quick":"kids"; return <button key={t.id} onClick={()=>toggle(f)} aria-pressed={filters[f]} style={chip(filters[f])}>{filters[f]?"✓ ":""}{t.label}</button>; })}
      <button onClick={another} title="Andere Vorschläge zeigen" style={{...chip(false),marginLeft:"auto",color:C.accent}}>↻ Neue Vorschläge</button>
    </div>

    {/* BESTER VORSCHLAG */}
    {!top?(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"18px",marginBottom:"12px",fontSize:"14px",color:C.muted,lineHeight:"1.6"}}>
        Nichts passt zu den Filtern. Nimm einen Filter weg oder lass dir von der KI ein bekanntes Gericht nennen.
      </div>
    ):(
      <div key={top.key} style={{background:C.white,border:"1px solid "+C.accent,marginBottom:"10px",animation:"heuteEin 0.45s ease-out"}}>
        {/* kurzes Einblenden bei jedem Wechsel der Hauptkachel, damit sichtbar ist, dass sich oben etwas getan hat */}
        <style>{"@keyframes heuteEin{from{opacity:0.25}to{opacity:1}}"}</style>
        <div onClick={()=>open(top)} role="button" style={{cursor:"pointer"}}>
          <DishImage name={nameOf(top)} rec={top.rec} img={images[top.key]} height={images[top.key]?190:96} minimal />
        </div>
        <div style={{padding:"14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}>
            <div style={{...label,marginBottom:0}}>{sel?(top.basis?"Deine Auswahl · aus der Rezept-Basis":"Deine Auswahl"):(top.basis?"Aus der Rezept-Basis":"Vorschlag")}</div>
            {top.rec.rating>0&&<span style={{color:C.star,fontSize:"13px"}}>{"★".repeat(top.rec.rating)}</span>}
          </div>
          <div onClick={()=>open(top)} role="button" style={{fontFamily:SER,fontSize:"24px",color:C.text,lineHeight:1.2,marginBottom:"4px",cursor:"pointer"}}>{nameOf(top)}</div>
          <div style={{fontSize:"13px",color:C.muted,marginBottom:top.reasons.length?"4px":"10px"}}>{meta(top)}</div>
          {top.reasons.length>0&&<div style={{fontSize:"13px",color:C.accent,marginBottom:"10px"}}>{top.reasons.join(" · ")}</div>}
          {hasStock&&top.core.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"12px"}}>
              {top.core.map((z,i)=>(
                <span key={i} title={z.src?("aus Vorrat: "+z.src):"nicht im Vorrat"} style={{fontSize:"13px",padding:"4px 9px",border:"1px solid "+pColor(z.p),color:pColor(z.p)}}>{z.name}</span>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:"6px"}}>
            <button onClick={()=>open(top)} disabled={busy===top.key} style={{...btn("primary"),flex:"1 1 50%",letterSpacing:"0.5px",borderRadius:"6px"}}>Zum Rezept</button>
            {(top.rec.steps||[]).length>0&&<button onClick={()=>cook(top)} disabled={busy===top.key} style={{...btn("dark"),flex:"1 1 50%",letterSpacing:"0.5px",borderRadius:"6px"}}>Kochmodus</button>}
          </div>
        </div>
      </div>
    )}

    {/* ALTERNATIVEN */}
    {rest.length>0&&(
      <div style={{background:C.white,border:"1px solid "+C.border,marginBottom:"8px"}}>
        {rest.map((s,i)=>(
          <button key={s.key} onClick={()=>{setSelected(s.key);window.scrollTo({top:0,behavior:"smooth"});}} title="Als Hauptvorschlag anzeigen" style={{width:"100%",display:"flex",alignItems:"center",gap:"8px",padding:"8px 14px",minHeight:"56px",borderBottom:i<rest.length-1?"1px solid "+C.border:"none",background:"none",border:"none",borderTop:"none",borderLeft:"none",borderRight:"none",cursor:"pointer",textAlign:"left",fontFamily:SF}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:SER,fontSize:"16px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nameOf(s)}{s.basis&&<span style={{fontSize:"12px",color:C.subtle,letterSpacing:"1px",marginLeft:"8px"}}>Basis</span>}</div>
              <div style={{fontSize:"13px",color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[meta(s),...s.reasons.slice(0,1)].filter(Boolean).join(" · ")}</div>
            </div>
            {hasStock&&<div style={{fontSize:"14px",fontWeight:"700",color:pColor(s.cov),flexShrink:0,minWidth:"42px",textAlign:"right"}}>{Math.round(s.cov*100)} %</div>}
            <span style={{color:C.subtle,fontSize:"16px"}} aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    )}
    {ranked.length>4&&(
      <button onClick={()=>setMore(m=>!m)} style={{...btn("ghost"),width:"100%",letterSpacing:"0.5px",marginBottom:"12px",borderRadius:"6px"}}>{more?"Weniger":"Mehr Vorschläge"}</button>
    )}
    {top&&<div style={{fontSize:"13px",color:C.subtle,margin:"-6px 2px 12px"}}>Alternative antippen zeigt sie als Hauptvorschlag mit ihren Zutaten.</div>}

    {/* VORRAT-ZEILE */}
    <button onClick={()=>setView("vorrat")} style={{width:"100%",display:"flex",alignItems:"center",gap:"10px",background:C.white,border:"1px solid "+C.border,padding:"12px 14px",minHeight:"52px",marginBottom:"12px",cursor:"pointer",fontFamily:SF,textAlign:"left",borderRadius:"6px"}}>
      <span style={{width:"8px",height:"8px",borderRadius:"50%",background:hasStock?C.ok:C.subtle,flexShrink:0}} />
      <span style={{flex:1,fontSize:"14px",color:C.text}}>
        {hbLink
          ? (hbBook?<>Vorrat: <b>{likely}</b> Lebensmittel wahrscheinlich da<span style={{color:C.muted}}> · Haushaltsbuch {hbLink.code}</span></>:"Vorrat wird geladen…")
          : hasStock
            ? <>Vorrat: <b>{likely}</b> Lebensmittel wahrscheinlich da<span style={{color:C.muted}}> · aus Einkaufsliste, Foto und Hand</span></>
            : <>Vorrat füllen<span style={{color:C.muted}}> · Einkäufe abhaken oder Haushaltsbuch verbinden, dann passen die Vorschläge zu dem, was da ist</span></>}
      </span>
      <span style={{color:C.accent,fontSize:"16px"}}>›</span>
    </button>
    {!hbLink&&!hasStock&&top&&!emptyBook&&<div style={{fontSize:"13px",color:C.subtle,margin:"-6px 2px 12px"}}>Ohne Vorrat sortiert nach Bewertung und Abwechslung.</div>}

    {/* KI - bekanntes Gericht finden */}
    <div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px"}}>
      <button onClick={()=>setAiOpen(v=>!v)} aria-expanded={aiOpen} style={{width:"100%",display:"flex",alignItems:"center",gap:"8px",background:"none",border:"none",padding:"4px 0",cursor:"pointer",fontFamily:SF,textAlign:"left",minHeight:"36px"}}>
        <span style={{...label,marginBottom:0,flex:1}}>Nichts dabei? Frag die KI</span>
        <span style={{color:C.accent,fontSize:"13px"}}>{aiOpen?"▴":"▾"}</span>
      </button>
      {aiOpen&&(
        <div style={{marginTop:"8px"}}>
          <div style={{fontSize:"12px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px"}}>Küche (optional)</div>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"12px"}}>
            {["Egal",...CUISINE_LIST].map(c=>(
              <button key={c} onClick={()=>setAiCuisine(c)} aria-pressed={aiCuisine===c} style={{...chip(aiCuisine===c),padding:"7px 10px",minHeight:"32px"}}>{c}</button>
            ))}
          </div>
          <button onClick={()=>suggestRecipe({fast:filters.quick,kids:filters.kids,cuisine:aiCuisine})} disabled={aiBusy} style={{...btn("primary"),width:"100%",padding:"13px",fontSize:"12px",letterSpacing:"0.5px",background:aiBusy?C.subtle:C.accent,cursor:aiBusy?"default":"pointer",borderRadius:"6px"}}>
            {aiBusy?"KI sucht…":"Bekanntes Gericht finden"}
          </button>
          <div style={{fontSize:"13px",color:C.subtle,marginTop:"6px",lineHeight:"1.4"}}>{hasStock?"Die KI nennt ein etabliertes Gericht, das zu deinem Vorrat passt. Die Filter oben gelten mit.":"Ohne Vorrat nennt die KI ein etabliertes Gericht nach deiner Auswahl – keine erfundenen Kombinationen."}</div>
          {aiErr&&<div style={{marginTop:"8px",fontSize:"13px",color:C.err}}>{aiErr}</div>}
        </div>
      )}
    </div>
  </div>
  );
}
