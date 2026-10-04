import { useState } from "react";
import { C, SF, SER, micro as label, chip, btn, input } from "../theme.js";
import { CUISINE_LIST, ML } from "../data.js";
import { recName, recCat, cookedLabel, cookedCount } from "../logic/recipes.js";
import { hbCats } from "../logic/stock.js";
import DishImage from "../components/DishImage.jsx";

// HEUTE - "Was kochen wir heute?": Heute im Plan, Vorschlaege aus dem Kochbuch (Haushaltsbuch, Bewertung, Kochhistorie),
// Klassiker-Basis, bekanntes Gericht finden (KI)
export default function Heute({state,api}){
  const {stock,ranked,heuteCat,hbLink,hbLoading,hbErr,hbBook,images,recipes,todayPlan,aiBusy,aiErr,classicPicks,settings}=state;
  const {setHeuteCat,connectHb,setHbCat,reloadHb,disconnectHb,openRecipe,setView,suggestRecipe,adoptClassic}=api;
  const [heuteMore,setHeuteMore]=useState(false);
  const [hbInput,setHbInput]=useState("");
  const [aiFast,setAiFast]=useState(false);
  const [aiKids,setAiKids]=useState(false);
  const [aiCuisine,setAiCuisine]=useState("Egal");
  const [adopting,setAdopting]=useState("");
  const dn=(k)=>recName(recipes[k],k);
  const hasStock=stock.length>0;
  const pColor=(p)=>p>=0.6?C.ok:p>=0.25?C.accent:C.subtle;
  const meta=(r)=>{
    const parts=[];
    if(hasStock) parts.push(Math.round(r.cov*100)+" % wahrscheinlich da");
    if(cookedCount(recipes[r.name])) parts.push(cookedLabel(recipes[r.name]));
    return parts.join(" · ");
  };
  const top=ranked[0];
  const rest=ranked.slice(1,heuteMore?10:4);
  const linkBtn={background:"none",border:"none",color:C.accent,fontSize:"12px",cursor:"pointer",padding:"10px 8px",minHeight:"40px",fontFamily:SF};
  const doConnect=async()=>{ if(await connectHb(hbInput)) setHbInput(""); };
  const doAdopt=async(c)=>{ setAdopting(c.name); await adoptClassic(c); setAdopting(""); };
  return(
  <div style={{padding:"12px",paddingBottom:"80px"}}>
    <div style={{fontFamily:SER,fontSize:"24px",color:C.text,margin:"4px 2px 12px"}}>Was kochen wir heute?</div>

    {/* HEUTE IM PLAN - Quelle 1: Slots des heutigen Tages, aktueller Slot zuerst */}
    <div style={{background:C.white,border:"1px solid "+(todayPlan.length?C.accent:C.border),padding:"14px",marginBottom:"14px"}}>
      <div style={label}>Heute im Plan</div>
      {todayPlan.length===0?(
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <span style={{flex:1,fontSize:"13px",color:C.muted,lineHeight:"1.5"}}>Für heute ist nichts geplant.</span>
          <button onClick={()=>setView("plan")} style={{...btn("ghost"),color:C.accent}}>ZUM WOCHENPLAN</button>
        </div>
      ):todayPlan.map((e,i)=>{
        const hasR=!!recipes[e.key];
        return(
          <div key={e.meal+"|"+e.key} onClick={hasR?()=>openRecipe(e.key):undefined} role={hasR?"button":undefined} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",minHeight:"44px",boxSizing:"border-box",borderBottom:i<todayPlan.length-1?"1px solid "+C.border:"none",cursor:hasR?"pointer":"default"}}>
            <span style={{width:"84px",flexShrink:0,fontSize:"11px",fontWeight:"700",color:i===0?C.accent:C.muted,letterSpacing:"0.5px",textTransform:"uppercase"}}>{ML[e.meal]}</span>
            <span style={{flex:1,minWidth:0,fontFamily:SER,fontSize:"16px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dn(e.key)}</span>
            {hasR&&<span style={{color:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"0.5px",flexShrink:0}}>REZEPT ›</span>}
          </div>
        );
      })}
    </div>

    {/* Kategorie-Filter */}
    <div style={{display:"flex",gap:"6px",marginBottom:"12px",flexWrap:"wrap"}}>
      {[{id:"all",label:"Alle Gerichte"},{id:"proven",label:"Bewährt"},{id:"Hauptgericht",label:"Hauptgericht"},{id:"Schnelle Küche",label:"Schnell"},{id:"Kinderessen",label:"Kinderessen"},{id:"Frühstück",label:"Frühstück"}].map(f=>(
        <button key={f.id} onClick={()=>{setHeuteCat(f.id);setHeuteMore(false);}} aria-pressed={heuteCat===f.id} style={chip(heuteCat===f.id)}>{f.label}</button>
      ))}
    </div>

    {/* Haushaltsbuch */}
    <div id="haushaltsbuch">
    {!hbLink?(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"14px"}}>
        <div style={label}>Haushaltsbuch verbinden</div>
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>Mit dem Code eures Haushaltsbuchs werden die Lebensmittel-Einkäufe berücksichtigt – frische Sachen verblassen nach ein paar Tagen, Vorräte nach Wochen. Es wird nur gelesen, nie etwas geändert.</div>
        <div style={{display:"flex",gap:"6px"}}>
          <input value={hbInput} onChange={e=>setHbInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")doConnect();}} placeholder="BUCH-CODE" aria-label="Buch-Code" style={{...input,flex:1,width:"auto",letterSpacing:"2px"}} />
          <button onClick={doConnect} disabled={hbLoading||!hbInput.trim()} style={{...btn("primary"),letterSpacing:"2px",opacity:hbLoading||!hbInput.trim()?0.5:1}}>{hbLoading?"…":"VERBINDEN"}</button>
        </div>
        {hbErr&&<div style={{marginTop:"8px",fontSize:"12px",color:C.err}}>{hbErr}</div>}
      </div>
    ):(
      <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:"4px 6px",fontSize:"12px",color:C.muted,marginBottom:"12px",padding:"0 2px"}}>
        <span style={{width:"6px",height:"6px",borderRadius:"50%",background:hbErr?C.err:hasStock?C.ok:C.subtle,flexShrink:0}} />
        <span style={{flex:"1 1 auto"}}>{hbLoading?"Haushaltsbuch wird geladen…":hbErr?hbErr:hbBook?("Haushaltsbuch: "+stock.filter(s=>s.p>=0.25).length+" Lebensmittel wahrscheinlich da"):"Haushaltsbuch verbunden"}</span>
        {hbBook&&(
          <select value={hbLink.cat} onChange={e=>setHbCat(e.target.value)} title="Rubrik der Lebensmittel-Einkäufe" aria-label="Rubrik der Lebensmittel-Einkäufe" style={{border:"1px solid "+C.border,background:C.white,color:C.muted,fontSize:"12px",padding:"8px 6px",minHeight:"40px",fontFamily:SF,outline:"none"}}>
            {hbCats(hbBook).map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button onClick={()=>reloadHb()} disabled={hbLoading} style={linkBtn}>aktualisieren</button>
        <button onClick={disconnectHb} style={{...linkBtn,color:C.muted}}>trennen</button>
      </div>
    )}
    </div>

    {/* Bester Vorschlag */}
    {!top?(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px",fontSize:"13px",color:C.muted,lineHeight:"1.5"}}>
        {heuteCat==="proven"
          ? "Noch nichts Bewährtes: bewährt ist, was mindestens einmal gekocht und mit 3 Sternen oder mehr bewertet wurde."
          : "Keine Rezepte in dieser Rubrik im Kochbuch. Übernimm unten einen Klassiker, importiere unter „Rezepte“ eigene – oder lass dir von der KI ein bekanntes Gericht nennen."}
      </div>
    ):(
      <div onClick={()=>openRecipe(top.name)} role="button" style={{background:C.white,border:"1px solid "+C.accent,marginBottom:"10px",cursor:"pointer"}}>
        <DishImage name={dn(top.name)} rec={recipes[top.name]} img={images[top.name]} aiImages={settings.aiImages} height={150} />
        <div style={{padding:"14px"}}>
          <div style={{...label,marginBottom:"4px"}}>Vorschlag aus dem Kochbuch</div>
          <div style={{fontFamily:SER,fontSize:"22px",color:C.text,lineHeight:1.2,marginBottom:"4px"}}>{dn(top.name)}</div>
          <div style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px",color:C.muted,marginBottom:"10px",flexWrap:"wrap"}}>
            {(recipes[top.name].rating||0)>0&&<span style={{color:C.star}}>{"★".repeat(recipes[top.name].rating)}</span>}
            <span>{meta(top)||recCat(recipes[top.name])}</span>
          </div>
          {hasStock&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
              {top.core.map((z,i)=>(
                <span key={i} title={z.src?("aus Einkauf: "+z.src):"nicht in den Einkäufen"} style={{fontSize:"11px",padding:"3px 8px",border:"1px solid "+pColor(z.p),color:pColor(z.p)}}>{z.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    )}

    {/* Weitere Vorschlaege */}
    {rest.length>0&&(
      <div style={{background:C.white,border:"1px solid "+C.border,marginBottom:"8px"}}>
        {rest.map((r,i)=>(
          <div key={r.name} onClick={()=>openRecipe(r.name)} role="button" style={{display:"flex",alignItems:"center",gap:"10px",padding:"11px 14px",minHeight:"48px",borderBottom:i<rest.length-1?"1px solid "+C.border:"none",cursor:"pointer"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:SER,fontSize:"15px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dn(r.name)}</div>
              <div style={{fontSize:"11px",color:C.muted}}>{meta(r)||recCat(recipes[r.name])}</div>
            </div>
            {hasStock&&<div style={{fontSize:"13px",fontWeight:"700",color:pColor(r.cov),flexShrink:0}}>{Math.round(r.cov*100)} %</div>}
          </div>
        ))}
      </div>
    )}
    {ranked.length>4&&(
      <button onClick={()=>setHeuteMore(m=>!m)} style={{...btn("ghost"),width:"100%",letterSpacing:"2px",marginBottom:"18px"}}>{heuteMore?"WENIGER":"MEHR VORSCHLÄGE"}</button>
    )}
    {!hbLink&&top&&<div style={{fontSize:"11px",color:C.subtle,margin:"-8px 2px 18px"}}>Ohne Haushaltsbuch sortiert nach Bewertung und Abwechslung.</div>}

    {/* AUS DER KLASSIKER-BASIS - Quelle 3: etablierte Gerichte, die noch nicht im Kochbuch sind */}
    {classicPicks.length>0&&(
      <div style={{background:C.white,border:"1px dashed "+C.border,padding:"14px",marginBottom:"14px"}}>
        <div style={label}>Aus der Klassiker-Basis</div>
        <div style={{fontSize:"12px",color:C.muted,lineHeight:"1.5",marginBottom:"8px"}}>Etablierte Gerichte mit Herkunft, die noch nicht in eurem Kochbuch stehen{hasStock?" – sortiert nach dem, was wahrscheinlich da ist":""}.</div>
        {classicPicks.map((p,i)=>(
          <div key={p.classic.name} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<classicPicks.length-1?"1px solid "+C.border:"none",minHeight:"48px"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:SER,fontSize:"15px",color:C.text}}>{p.classic.name}</div>
              <div style={{fontSize:"11px",color:C.muted}}>{[p.classic.origin,p.classic.minutes?p.classic.minutes+" Min.":"",hasStock?Math.round(p.cov*100)+" % da":""].filter(Boolean).join(" · ")}</div>
            </div>
            <button onClick={()=>doAdopt(p.classic)} disabled={adopting===p.classic.name} style={{...btn("ghost"),color:C.accent,padding:"8px 10px",flexShrink:0}}>{adopting===p.classic.name?"…":"INS KOCHBUCH"}</button>
          </div>
        ))}
      </div>
    )}

    {/* KI - Quelle 4: bekanntes Gericht finden */}
    <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px"}}>
      <div style={label}>Nichts dabei? Frag die KI</div>
      <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
        <button onClick={()=>setAiFast(v=>!v)} aria-pressed={aiFast} style={{...chip(aiFast),flex:1,padding:"10px"}}>{aiFast?"✓ ":""}Schnell</button>
        <button onClick={()=>setAiKids(v=>!v)} aria-pressed={aiKids} style={{...chip(aiKids),flex:1,padding:"10px"}}>{aiKids?"✓ ":""}Kinderessen</button>
      </div>
      <div style={{fontSize:"11px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px"}}>Küche (optional)</div>
      <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"12px"}}>
        {["Egal",...CUISINE_LIST.filter(c=>c!=="Schnell")].map(c=>(
          <button key={c} onClick={()=>setAiCuisine(c)} aria-pressed={aiCuisine===c} style={{...chip(aiCuisine===c),padding:"7px 10px",minHeight:"32px"}}>{c}</button>
        ))}
      </div>
      <button onClick={()=>suggestRecipe({fast:aiFast,kids:aiKids,cuisine:aiCuisine})} disabled={aiBusy} style={{...btn("primary"),width:"100%",padding:"13px",fontSize:"12px",letterSpacing:"2px",background:aiBusy?C.subtle:C.accent,cursor:aiBusy?"default":"pointer"}}>
        {aiBusy?"KI SUCHT…":"BEKANNTES GERICHT FINDEN"}
      </button>
      <div style={{fontSize:"11px",color:C.subtle,marginTop:"6px",lineHeight:"1.4"}}>{hasStock?"Die KI nennt ein etabliertes Gericht, das zu den wahrscheinlich vorhandenen Lebensmitteln passt.":"Ohne Einkaufsdaten nennt die KI ein etabliertes Gericht nach deiner Auswahl – keine erfundenen Kombinationen."}</div>
      {aiErr&&<div style={{marginTop:"8px",fontSize:"12px",color:C.err}}>{aiErr}</div>}
    </div>
  </div>
  );
}
