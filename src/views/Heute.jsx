import { useState } from "react";
import { C, SF, SER, micro as label, chip, btn, input, iconBtn } from "../theme.js";
import { CUISINE_LIST, ML } from "../data.js";
import { recName, recCat, cookedLabel, cookedCount } from "../logic/recipes.js";
import { daysSince } from "../logic/weeks.js";
import { STOCK_MIN, fadeTable } from "../logic/stock.js";
import DishImage from "../components/DishImage.jsx";

// HEUTE - "Was kochen wir heute?": Heute im Plan, Vorschlaege aus dem Kochbuch (Haushaltsbuch, Bewertung, Kochhistorie),
// Rezept-Basis, bekanntes Gericht finden (KI)
export default function Heute({state,api}){
  const {stock,ranked,heuteCat,hbLink,hbLoading,hbErr,hbBook,images,recipes,todayPlan,aiBusy,aiErr,classicPicks,settings}=state;
  const {setHeuteCat,connectHb,reloadHb,disconnectHb,markGone,clearGone,openRecipe,setView,suggestRecipe,adoptClassic}=api;
  const [heuteMore,setHeuteMore]=useState(false);
  const [hbInput,setHbInput]=useState("");
  const [aiFast,setAiFast]=useState(false);
  const [aiKids,setAiKids]=useState(false);
  const [aiCuisine,setAiCuisine]=useState("Egal");
  const [adopting,setAdopting]=useState("");
  const [stockOpen,setStockOpen]=useState(false);   // Vorratsliste aus dem Haushaltsbuch auf-/zugeklappt
  const [classicsMore,setClassicsMore]=useState(false);
  const dn=(k)=>recName(recipes[k],k);
  const hasStock=stock.length>0;
  const visible=stock.filter(s=>s.p>=STOCK_MIN);          // was in der Vorratsliste steht
  const goneCount=hbLink&&hbLink.gone?Object.keys(hbLink.gone).length:0;
  const fades=fadeTable();
  const emptyBook=Object.keys(recipes).length===0;
  const shownClassics=emptyBook&&!classicsMore?classicPicks.slice(0,8):classicPicks;
  const pColor=(p)=>p>=0.6?C.ok:p>=0.25?C.accent:C.subtle;
  const meta=(r)=>{
    const parts=[];
    if(hasStock) parts.push(Math.round(r.cov*100)+" % wahrscheinlich da");
    if(cookedCount(recipes[r.name])) parts.push(cookedLabel(recipes[r.name]));
    return parts.join(" · ");
  };
  const top=ranked[0];
  const rest=ranked.slice(1,heuteMore?10:4);
  const tile={...btn("ghost"),minHeight:"44px",padding:"10px 6px",fontSize:"12px",letterSpacing:"1px",whiteSpace:"nowrap"};
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
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
          <span style={{width:"8px",height:"8px",borderRadius:"50%",background:hbErr?C.err:hasStock?C.ok:C.subtle,flexShrink:0}} />
          <span style={{...label,marginBottom:0}}>Haushaltsbuch</span>
        </div>
        <div style={{fontSize:"20px",fontWeight:"700",letterSpacing:"3px",color:C.text,marginBottom:"4px"}}>{hbLink.code}</div>
        <div style={{fontSize:"14px",color:hbErr?C.err:C.muted,lineHeight:"1.5"}}>
          {hbLoading?"Wird geladen…":hbErr?hbErr:hbBook?(hbLink.cat+" · "+visible.length+" wahrscheinlich da"):"verbunden"}
        </div>
        {/* Kacheln: Vorrat auf-/zuklappen, neu laden, trennen */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginTop:"12px"}}>
          <button onClick={()=>setStockOpen(v=>!v)} disabled={!hasStock} aria-expanded={stockOpen} style={{...tile,color:hasStock?C.accent:C.subtle,borderColor:stockOpen?C.accent:C.border,background:stockOpen?C.abg:"none"}}>VORRAT {stockOpen?"▴":"▾"}</button>
          <button onClick={()=>reloadHb()} disabled={hbLoading} style={{...tile,color:C.accent,opacity:hbLoading?0.5:1}}>↻ AKTUALISIEREN</button>
          <button onClick={disconnectHb} style={tile}>TRENNEN</button>
        </div>
        {/* Vorratsliste: worauf sich die Vorschlaege stuetzen; x = "ist nicht mehr da" */}
        {stockOpen&&hasStock&&(
          <div style={{border:"1px solid "+C.border,marginTop:"10px"}}>
            {visible.map((s,i)=>{
              const d=daysSince(s.last);
              const when=d===null?"":d===0?"heute gekauft":d===1?"gestern gekauft":"vor "+d+" Tagen gekauft";
              const left=s.left<=0?"läuft heute aus":s.left===1?"noch 1 Tag":"noch "+s.left+" Tage";
              return (
                <div key={s.key} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 4px 6px 12px",borderTop:i?"1px solid "+C.border:"none",minHeight:"48px",boxSizing:"border-box"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"15px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                    <div style={{fontSize:"12px",color:C.muted}}>{[when,left].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span style={{fontSize:"14px",fontWeight:"700",color:pColor(s.p),flexShrink:0,minWidth:"42px",textAlign:"right"}}>{Math.round(s.p*100)} %</span>
                  <button onClick={()=>markGone(s.key)} aria-label={s.name+" ist nicht mehr da"} title="Nicht mehr da – aus der Liste streichen" style={{...iconBtn,color:C.muted}}>×</button>
                </div>
              );
            })}
            <div style={{padding:"10px 12px",fontSize:"12px",color:C.subtle,borderTop:"1px solid "+C.border,lineHeight:"1.5"}}>
              <div style={{marginBottom:"4px"}}><span style={{color:C.muted,fontWeight:"700"}}>Verblasst nach:</span> {fades.map(f=>f.labels.join(", ")+" "+f.days+" Tage").join(" · ")}.</div>
              <div>Danach gilt eine Sache als aufgebraucht (unter {Math.round(STOCK_MIN*100)} %). Grundvorrat wie Salz, Öl und Mehl zählt immer als vorhanden. Quelle: Rubrik „{hbLink.cat}“ der letzten 90 Tage, nur lesend.</div>
              {goneCount>0&&<div style={{marginTop:"6px",display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>{goneCount===1?"1 Position von Hand gestrichen.":goneCount+" Positionen von Hand gestrichen."}</span><button onClick={clearGone} style={{background:"none",border:"none",color:C.accent,fontSize:"12px",cursor:"pointer",padding:"6px 4px",fontFamily:SF}}>wieder einblenden</button></div>}
            </div>
          </div>
        )}
      </div>
    )}
    </div>

    {/* Bester Vorschlag */}
    {!top?(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px",fontSize:"13px",color:C.muted,lineHeight:"1.5"}}>
        {heuteCat==="proven"
          ? "Noch nichts Bewährtes: bewährt ist, was mindestens einmal gekocht und mit 3 Sternen oder mehr bewertet wurde."
          : "Keine Rezepte in dieser Rubrik im Kochbuch. Übernimm unten ein Gericht aus der Rezept-Basis, importiere unter „Rezepte“ eigene – oder lass dir von der KI ein bekanntes Gericht nennen."}
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
              <div style={{fontFamily:SER,fontSize:"16px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dn(r.name)}</div>
              <div style={{fontSize:"12px",color:C.muted}}>{meta(r)||recCat(recipes[r.name])}</div>
            </div>
            {hasStock&&<div style={{fontSize:"14px",fontWeight:"700",color:pColor(r.cov),flexShrink:0}}>{Math.round(r.cov*100)} %</div>}
          </div>
        ))}
      </div>
    )}
    {ranked.length>4&&(
      <button onClick={()=>setHeuteMore(m=>!m)} style={{...btn("ghost"),width:"100%",letterSpacing:"2px",marginBottom:"18px"}}>{heuteMore?"WENIGER":"MEHR VORSCHLÄGE"}</button>
    )}
    {top&&<div style={{fontSize:"12px",color:C.subtle,margin:"-8px 2px 18px"}}>{hasStock?"Sortiert nach Wahrscheinlichkeit: oben steht, wofür am meisten da ist.":"Ohne Haushaltsbuch sortiert nach Bewertung und Abwechslung."}</div>}

    {/* AUS DER REZEPT-BASIS - Quelle 3: etablierte Gerichte, die noch nicht im Kochbuch sind; leeres Kochbuch: die ganze Basis */}
    {classicPicks.length>0&&(
      <div style={{background:C.white,border:"1px dashed "+C.border,padding:"14px",marginBottom:"14px"}}>
        <div style={label}>Aus der Rezept-Basis{emptyBook?" ("+classicPicks.length+")":""}</div>
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"8px"}}>
          {emptyBook
            ?"Euer Kochbuch ist noch leer – hier die ganze Rezept-Basis: etablierte Gerichte mit Herkunft, Portionen und Zeit"+(hasStock?", sortiert nach dem, was wahrscheinlich da ist":"")+". „Ins Kochbuch“ übernimmt ein Gericht."
            :"Etablierte Gerichte mit Herkunft, die noch nicht in eurem Kochbuch stehen"+(hasStock?" – sortiert nach dem, was wahrscheinlich da ist":"")+"."}
        </div>
        {shownClassics.map((p,i)=>(
          <div key={p.classic.name} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<shownClassics.length-1?"1px solid "+C.border:"none",minHeight:"48px"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:SER,fontSize:"16px",color:C.text}}>{p.classic.name}</div>
              <div style={{fontSize:"12px",color:C.muted}}>{[p.classic.origin,p.classic.minutes?p.classic.minutes+" Min.":""].filter(Boolean).join(" · ")}</div>
            </div>
            {hasStock&&<span style={{fontSize:"14px",fontWeight:"700",color:pColor(p.cov),flexShrink:0}}>{Math.round(p.cov*100)} %</span>}
            <button onClick={()=>doAdopt(p.classic)} disabled={adopting===p.classic.name} style={{...btn("ghost"),color:C.accent,padding:"8px 10px",flexShrink:0}}>{adopting===p.classic.name?"…":"INS KOCHBUCH"}</button>
          </div>
        ))}
        {emptyBook&&classicPicks.length>8&&(
          <button onClick={()=>setClassicsMore(m=>!m)} style={{...btn("ghost"),width:"100%",letterSpacing:"2px",marginTop:"10px"}}>{classicsMore?"WENIGER":"ALLE "+classicPicks.length+" ANZEIGEN"}</button>
        )}
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
