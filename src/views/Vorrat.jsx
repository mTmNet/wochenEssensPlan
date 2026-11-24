import { useRef, useState } from "react";
import { C, SF, SER, micro as label, btn, input, iconBtn, chip, groupTint } from "../theme.js";
import { daysSince } from "../logic/weeks.js";
import { STOCK_MIN, STOCK_GROUPS, fadeTable, guessGroup, stockLevel } from "../logic/stock.js";
import { isBasicText } from "../logic/ingredients.js";
import { compressImageToBase64, kiErrText } from "../ai.js";
import VorratGraph from "./VorratGraph.jsx";
import { groupOf } from "../logic/graph.js";
import Modal from "../components/Modal.jsx";

// VORRAT - eine Liste aus drei Quellen: Haushaltsbuch (automatisch), Speisekammer-Foto (KI) und Hand.
// Ohne Haushaltsbuch kommen abgehakte Posten der Einkaufsliste dazu (Herkunft "Einkauf").
// Dauervorrat (Pin) verblasst nie; x entfernt eigene Positionen bzw. streicht Haushaltsbuch-Positionen; lernendes Verblassen je Produkt.
const TONE={ok:C.ok,warn:C.warn,muted:C.muted};
const SRC_LABEL={hb:"Haushaltsbuch",foto:"Foto",hand:"Hand",einkauf:"Einkauf",perm:"Dauervorrat"};
const sel={...input,width:"118px",flexShrink:0,padding:"6px",fontSize:"13px"};
// Umschalter Liste / Graph wird je Geraet gemerkt (reine Bequemlichkeit, kein Plan-Zustand)
const MODE_KEY="wp.vorratMode";
const loadMode=()=>{ try{ return localStorage.getItem(MODE_KEY)==="graph"?"graph":"list"; }catch(e){ return "list"; } };
const saveMode=(m)=>{ try{ localStorage.setItem(MODE_KEY,m); }catch(e){} };

export default function Vorrat({state,api}){
  const {stock,stockRaw,hbLink,hbLoading,hbErr,hbBook,learned,vocab,unmapped,aliasBusy,aliasErr}=state;
  const {connectHb,reloadHb,disconnectHb,clearGone,addStockItem,addStockItems,refreshStock,setPermanent,removeStock,scanPantry,showToast,setAlias,clearAlias,mapNamesAI}=api;
  const [addOpen,setAddOpen]=useState(false);   // Bereich "Hinzufügen" aufgeklappt
  const [help,setHelp]=useState(false);         // Abschnitt "So funktioniert der Vorrat" aufgeklappt
  const [menu,setMenu]=useState("");            // Schluessel der Zeile mit offenem Menue "⋯"
  const [rename,setRename]=useState(null);      // {item, value} - Dialog "Name zuordnen"
  const [hbInput,setHbInput]=useState("");
  const [name,setName]=useState("");
  const [group,setGroup]=useState("");
  const [scan,setScan]=useState(null);          // {busy, err, items:[{name,sub,on}]}
  const [mode,setModeRaw]=useState(loadMode);   // "list" | "graph"
  const setMode=(m)=>{ setModeRaw(m); saveMode(m); };
  const fileRef=useRef(null);
  const perm=stock.filter(s=>s.permanent);
  const visible=stock.filter(s=>!s.permanent&&s.p>=STOCK_MIN);
  const goneCount=hbLink&&hbLink.gone?Object.keys(hbLink.gone).length:0;
  const learnedCount=Object.keys(learned||{}).length;
  // Zuordnungen "kein Lebensmittel" (Name leer) - zum Wiedereinblenden; aeltere Eintraege ohne Rohname zeigen den Schluessel
  const hidden=Object.keys((stockRaw&&stockRaw.alias)||{}).map(k=>{ const e=stockRaw.alias[k]; return e&&typeof e==="object"&&e.name===""?{key:k,label:(e.raw||k.replace(/_/g," "))}:null; }).filter(Boolean);
  const fades=fadeTable();
  const doConnect=async()=>{ if(await connectHb(hbInput)) setHbInput(""); };
  const doAdd=()=>{ const n=name.trim(); if(!n) return; addStockItem(n,group||guessGroup(n)); setName(""); setGroup(""); showToast("„"+n+"“ im Vorrat."); };
  const onFile=async(e)=>{
    const f=e.target.files[0]; if(e.target) e.target.value=""; if(!f) return;
    setScan({busy:true,err:"",items:[]});
    try{
      const c=await compressImageToBase64(f,{maxEdge:1600,quality:0.82});
      if(c.previewUrl) URL.revokeObjectURL(c.previewUrl);
      const items=await scanPantry({base64:c.base64,mimeType:c.mimeType||"image/jpeg"});
      setScan({busy:false,err:items.length?"":"Auf dem Foto wurden keine Lebensmittel erkannt.",items:items.map(it=>({...it,on:true}))});
    }catch(err){ const m=(err&&err.message)||"Unbekannter Fehler"; setScan({busy:false,err:kiErrText(m)||("Fehler: "+m),items:[]}); }
  };
  const takeScan=()=>{ const list=scan.items.filter(it=>it.on&&it.name.trim()); if(!list.length){ setScan(null); return; } addStockItems(list.map(it=>({name:it.name.trim(),sub:it.sub,src:"foto"}))); const basics=list.filter(it=>isBasicText(it.name)).length; showToast(list.length+" Lebensmittel aus dem Foto übernommen."+(basics?" "+basics+" davon Grundvorrat (immer da).":"")); setScan(null); };
  const tile={...btn("ghost"),minHeight:"40px",padding:"8px 6px",fontSize:"13px",whiteSpace:"nowrap"};
  const row=(s,i)=>{
    const d=s.last?daysSince(s.last):null;
    const when=s.permanent?"immer da":d===null?"":d===0?"heute":d===1?"gestern":"vor "+d+" Tagen";
    const left=s.permanent?"":s.left<=0?"läuft heute aus":s.left===1?"noch 1 Tag":"noch "+s.left+" Tage";
    const src=(s.srcs||[]).filter(x=>x!=="perm").map(x=>SRC_LABEL[x]||x).join(" + ");
    const lrn=s.learnedN?"gelernt aus "+s.learnedN+(s.learnedN===1?" Kauf":" Käufen"):"";
    const rawsOther=(s.raws||[]).filter(r=>r.trim().toLowerCase()!==s.name.trim().toLowerCase());
    const aus=rawsOther.length?"aus: "+rawsOther.slice(0,3).join(", ")+(rawsOther.length>3?" …":""):"";
    const raws=s.raws&&s.raws.length?s.raws:[s.name];
    const open=menu===s.key;
    const mBtn={...btn("ghost"),flex:"1 1 120px",minHeight:"40px",padding:"8px 6px",fontSize:"12px",letterSpacing:"0.5px"};
    const grp=groupOf(s), lv=stockLevel(s.p);
    // Herkunft steht erst im aufgeklappten Bereich, damit die Zeile ruhig bleibt
    const info=[!s.permanent&&when?"zuletzt "+when:"",src,lrn,aus].filter(Boolean).join(" · ");
    return(
      <div key={s.key} style={{borderTop:i?"1px solid "+C.border:"none",boxShadow:"inset 4px 0 0 "+groupTint(grp)}}>
      <div style={{display:"flex",alignItems:"center",gap:"4px",padding:"4px 2px 4px 14px",minHeight:"44px",boxSizing:"border-box"}}>
        <div style={{flex:1,minWidth:0}}>
          <button onClick={()=>setRename({item:s,value:s.name})} title="Name zuordnen" aria-label={s.name+": Name zuordnen"} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:SF,fontSize:"15px",lineHeight:1.25,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</button>
          <div style={{fontSize:"13px",color:C.muted,lineHeight:1.25,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[grp,s.permanent?"immer da":left].filter(Boolean).join(" · ")}{s.unsorted&&<span style={{color:C.accent}}> · nicht einsortiert</span>}</div>
        </div>
        {!s.permanent&&<span data-level={lv.label} style={{fontSize:"13px",fontWeight:"700",color:TONE[lv.tone],flexShrink:0,textAlign:"right",whiteSpace:"nowrap"}}>{lv.label}</span>}
        {!s.permanent&&lv.min>=0.85&&<span aria-hidden="true" style={{minWidth:"34px",flexShrink:0}}/>}
        {!s.permanent&&lv.min<0.85&&<button onClick={()=>{ refreshStock(s); showToast("„"+s.name+"“ ist wieder frisch da."); }} aria-label={s.name+" auffrischen: ist noch da"} title="Ist noch da – Verblassen beginnt neu" style={{...iconBtn,color:C.ok,fontSize:"18px",minWidth:"34px",padding:"6px 4px"}}>✓</button>}
        <button onClick={()=>{ removeStock(s); setMenu(""); showToast(s.permanent?"„"+s.name+"“ aus dem Dauervorrat genommen.":"„"+s.name+"“ gestrichen, gilt als aufgebraucht."); }} aria-label={s.name+": aufgebraucht, streichen"} title="Aufgebraucht – aus der Liste streichen" style={{...iconBtn,color:C.muted,minWidth:"34px",padding:"6px 4px"}}>×</button>
        <button onClick={()=>setMenu(open?"":s.key)} aria-label={s.name+": weitere Aktionen"} aria-expanded={open} title="Weitere Aktionen" style={{...iconBtn,color:open?C.accent:C.muted,fontSize:"18px",minWidth:"34px",padding:"6px 4px"}}>⋯</button>
      </div>
      {open&&info&&<div style={{padding:"0 14px 8px",fontSize:"13px",color:C.muted,lineHeight:"1.4"}}>{info}</div>}
      {open&&(
        <div style={{display:"flex",gap:"6px",flexWrap:"wrap",padding:"0 14px 10px"}}>
          <button onClick={()=>{ setMenu(""); setRename({item:s,value:s.unsorted?"":s.name}); }} style={{...mBtn,color:C.accent,borderRadius:"6px"}}>Einsortieren</button>
          <button onClick={()=>{ setMenu(""); setAlias(raws,""); showToast("„"+s.name+"“ als „kein Lebensmittel“ ausgeblendet."); }} style={mBtn}>Kein Lebensmittel</button>
          <button onClick={()=>{ setMenu(""); setPermanent(s,!s.permanent); showToast(s.permanent?"„"+s.name+"“ ist kein Dauervorrat mehr.":"„"+s.name+"“ ist jetzt Dauervorrat."); }} style={mBtn}>{s.permanent?"Dauervorrat aufheben":"★ Dauervorrat"}</button>
        </div>
      )}
      </div>
    );
  };
  const scanBox=scan&&!scan.busy?(
        <div style={{border:"1px solid "+C.accent,marginTop:"4px"}}>
          <div style={{padding:"8px 12px",fontSize:"13px",color:C.muted,borderBottom:"1px solid "+C.border,lineHeight:"1.5"}}>{scan.err||"Erkannt auf dem Foto – Namen und Gruppe anpassen, Haken weg, was nicht stimmt."}</div>
          {scan.items.map((it,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 12px",borderBottom:"1px solid "+C.border,minHeight:"44px"}}>
              <input type="checkbox" checked={it.on} onChange={e=>setScan(sc=>({...sc,items:sc.items.map((x,j)=>j===i?{...x,on:e.target.checked}:x)}))} aria-label={it.name+" übernehmen"} style={{width:"20px",height:"20px",accentColor:C.accent,borderRadius:"6px"}} />
              <div style={{flex:1,minWidth:0}}>
                <input value={it.name} onChange={e=>setScan(sc=>({...sc,items:sc.items.map((x,j)=>j===i?{...x,name:e.target.value}:x)}))} aria-label={"Name für "+it.name} style={{width:"100%",boxSizing:"border-box",background:"transparent",border:"none",borderBottom:"1px dashed "+C.border,padding:"6px 0",fontSize:"15px",color:it.on?C.text:C.subtle,fontFamily:SF,outline:"none",borderRadius:"6px"}} />
                {isBasicText(it.name)&&<div style={{fontSize:"13px",color:C.subtle,marginTop:"2px"}}>Grundvorrat, zählt immer als da, steht nicht in der Liste</div>}
              </div>
              <select value={it.sub} onChange={e=>setScan(sc=>({...sc,items:sc.items.map((x,j)=>j===i?{...x,sub:e.target.value}:x)}))} aria-label={"Gruppe für "+it.name} style={{...sel,padding:"6px 8px",minHeight:"34px",fontSize:"13px",borderRadius:"6px"}}>
                {STOCK_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          ))}
          <div style={{display:"flex",gap:"6px",padding:"8px 12px"}}>
            {scan.items.length>0&&<button onClick={takeScan} style={{...btn("primary"),flex:2,letterSpacing:"0.5px",borderRadius:"6px"}}>{scan.items.filter(x=>x.on).length} Übernehmen</button>}
            <button onClick={()=>setScan(null)} style={{...btn("ghost"),flex:1,borderRadius:"6px"}}>Verwerfen</button>
          </div>
        </div>
  ):null;
  return(
  <div style={{padding:"12px",paddingBottom:"80px"}}>
    <div style={{margin:"4px 2px 12px",display:"flex",alignItems:"flex-end",gap:"10px"}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:SER,fontSize:"26px",color:C.text,lineHeight:1.15}}>Vorrat</div>
        <div style={{fontSize:"13px",color:C.muted,marginTop:"3px"}}>{mode==="graph"?"Dein Vorrat als Netz – je Gruppe ein Mittelpunkt, Rezept in der Mitte.":hbLink?"Was wahrscheinlich da ist – aus Haushaltsbuch, Foto und Hand.":"Was wahrscheinlich da ist – aus Einkaufsliste, Foto und Hand."}</div>
      </div>
      <div role="group" aria-label="Ansicht" style={{display:"flex",border:"1px solid "+C.border,flexShrink:0}}>
        {[["list","Liste"],["graph","Netz"]].map(([m,t])=>(
          <button key={m} onClick={()=>setMode(m)} aria-pressed={mode===m} style={{...chip(mode===m),border:"none",minHeight:"36px",padding:"8px 12px",letterSpacing:"1px",fontWeight:"700"}}>{t}</button>
        ))}
      </div>
    </div>

    {/* GRAPH (Umschalter) - Foto und Scan-Pruefung bleiben erreichbar */}
    {mode==="graph"&&<input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none",borderRadius:"6px"}} onChange={onFile} />}
    {mode==="graph"&&scan&&(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"12px"}}>
        <div style={label}>Speisekammer-Foto</div>
        {scan.busy?<div style={{fontSize:"13px",color:C.muted,padding:"8px 0"}}>Die KI schaut sich das Foto an…</div>:scanBox}
      </div>
    )}
    {mode==="graph"&&<VorratGraph state={state} api={api} onPhoto={()=>fileRef.current&&fileRef.current.click()} onList={()=>setMode("list")} />}

    {/* HINZUFUEGEN: Hand + Foto; eingeklappt, bis man es braucht (offen, solange ein Foto ausgewertet wird) */}
    {mode==="list"&&!(addOpen||scan)&&(
      <button onClick={()=>setAddOpen(true)} aria-expanded="false" style={{...btn("ghost"),width:"100%",marginBottom:"12px"}}>+ Hinzufügen (eintippen oder Foto)</button>
    )}
    {mode==="list"&&(addOpen||scan)&&<div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"12px"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:"4px"}}>
        <div style={{...label,marginBottom:0,flex:1}}>Hinzufügen</div>
        {!scan&&<button onClick={()=>setAddOpen(false)} aria-label="Hinzufügen schließen" style={iconBtn}>×</button>}
      </div>
      <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doAdd();}} placeholder="Lebensmittel, z. B. Linsen" aria-label="Lebensmittel" style={{...input,flex:1,width:"auto",minWidth:0}} />
        <select value={group} onChange={e=>setGroup(e.target.value)} aria-label="Gruppe" style={sel}>
          <option value="">{name.trim()?"auto: "+guessGroup(name):"Gruppe (auto)"}</option>
          {STOCK_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={doAdd} disabled={!name.trim()} aria-label="Hinzufügen" style={{...btn("dark"),minWidth:"48px",fontSize:"20px",padding:"6px 14px",opacity:name.trim()?1:0.5,borderRadius:"6px"}}>+</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none",borderRadius:"6px"}} onChange={onFile} />
      {!scan&&<button onClick={()=>fileRef.current&&fileRef.current.click()} style={{...btn("ghost"),width:"100%",color:C.accent,letterSpacing:"0.5px",borderRadius:"6px"}}>📷 Speisekammer fotografieren</button>}
      {scan&&scan.busy&&<div style={{fontSize:"13px",color:C.muted,padding:"8px 0"}}>Die KI schaut sich das Foto an…</div>}
      {scan&&!scan.busy&&scanBox}
      <div style={{fontSize:"13px",color:C.subtle,marginTop:"8px",lineHeight:"1.4"}}>Das Foto geht nur zur Erkennung an die KI und wird nicht gespeichert. Erkannte Lebensmittel gelten ab heute als gekauft.</div>
    </div>}

    {/* HAUSHALTSBUCH */}
    {mode==="list"&&(!hbLink?(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"12px"}}>
        <div style={label}>Haushaltsbuch verbinden</div>
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>Mit dem Code eures Haushaltsbuchs kommen die Lebensmittel-Einkäufe automatisch in den Vorrat. Es wird nur gelesen, nie etwas geändert. Ohne Haushaltsbuch füllt sich der Vorrat aus der Einkaufsliste: Abgehaktes gilt als gekauft.</div>
        <div style={{display:"flex",gap:"6px"}}>
          <input value={hbInput} onChange={e=>setHbInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")doConnect();}} placeholder="BUCH-CODE" aria-label="Buch-Code" style={{...input,flex:1,width:"auto",letterSpacing:"0.5px"}} />
          <button onClick={doConnect} disabled={hbLoading||!hbInput.trim()} style={{...btn("primary"),letterSpacing:"0.5px",opacity:hbLoading||!hbInput.trim()?0.5:1,borderRadius:"6px"}}>{hbLoading?"…":"Verbinden"}</button>
        </div>
        {hbErr&&<div style={{marginTop:"8px",fontSize:"13px",color:C.err}}>{hbErr}</div>}
      </div>
    ):(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"12px",display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
        <span style={{width:"8px",height:"8px",borderRadius:"50%",background:hbErr?C.err:hbBook?C.ok:C.subtle,flexShrink:0}} />
        <div style={{flex:"1 1 160px",minWidth:0}}>
          <div style={{fontSize:"15px",color:C.text}}>Haushaltsbuch{hbLink.code?<> <b style={{letterSpacing:"0.5px"}}>{hbLink.code}</b></>:null}</div>
          <div style={{fontSize:"13px",color:hbErr?C.err:C.muted}}>{hbLoading?"Wird geladen…":hbErr?hbErr:hbBook?(hbLink.cat+(learnedCount?" · Verblassen gelernt für "+learnedCount+(learnedCount===1?" Produkt":" Produkte"):"")):"verbunden"}</div>
          {aliasBusy&&<div style={{fontSize:"13px",color:C.accent}}>KI ordnet Produktnamen zu…</div>}
          {!aliasBusy&&aliasErr&&<div style={{fontSize:"13px",color:C.err}}>{aliasErr}</div>}
          {!aliasBusy&&!aliasErr&&unmapped.length>0&&<div style={{fontSize:"13px",color:C.muted,display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>{unmapped.length===1?"1 Name ungeklärt":unmapped.length+" Namen ungeklärt"}</span><button onClick={()=>mapNamesAI(unmapped)} style={{background:"none",border:"none",color:C.accent,fontSize:"12px",cursor:"pointer",padding:"6px 4px",fontFamily:SF,fontWeight:"700",letterSpacing:"1px"}}>Mit KI zuordnen</button></div>}
        </div>
        <div style={{display:"flex",gap:"6px"}}>
          <button onClick={()=>reloadHb()} disabled={hbLoading} style={{...tile,color:C.accent,opacity:hbLoading?0.5:1,borderRadius:"6px"}}>↻</button>
          <button onClick={disconnectHb} style={tile}>Trennen</button>
        </div>
      </div>
    ))}

    {/* DAUERVORRAT */}
    {mode==="list"&&perm.length>0&&(
      <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:"8px",overflow:"hidden",marginBottom:"12px"}}>
        <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border}}><span style={{...label,marginBottom:0}}>Dauervorrat ({perm.length})</span></div>
        {perm.map(row)}
      </div>
    )}

    {/* WAHRSCHEINLICH DA */}
    {mode==="list"&&<div style={{background:C.white,border:"1px solid "+C.border,borderRadius:"8px",overflow:"hidden",marginBottom:"12px"}}>
      <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border}}><span style={{...label,marginBottom:0}}>Wahrscheinlich da ({visible.length})</span></div>
      {visible.length===0&&<div style={{padding:"14px",fontSize:"14px",color:C.muted,lineHeight:"1.5"}}>Noch nichts im Vorrat. Einkäufe in der Einkaufsliste abhaken, Haushaltsbuch verbinden, Speisekammer fotografieren oder oben etwas eintragen.</div>}
      {visible.map(row)}
      {(goneCount>0||hidden.length>0)&&<div style={{padding:"8px 14px",fontSize:"13px",color:C.muted,borderTop:"1px solid "+C.border,lineHeight:"1.5"}}>
        {goneCount>0&&<div style={{marginTop:"6px",display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>{goneCount===1?"1 Position gestrichen.":goneCount+" Positionen gestrichen."}</span><button onClick={clearGone} style={{background:"none",border:"none",color:C.accent,fontSize:"13px",cursor:"pointer",padding:"6px 4px",fontFamily:SF}}>wieder einblenden</button></div>}
        {hidden.length>0&&<div style={{marginTop:"6px",display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>Als „kein Lebensmittel“ ausgeblendet:</span>{hidden.map(h=>(<button key={h.key} onClick={()=>{ clearAlias([],[h.key]); showToast("„"+h.label+"“ wieder eingeblendet."); }} aria-label={h.label+" wieder einblenden"} style={{background:"none",border:"1px solid "+C.border,color:C.accent,fontSize:"13px",cursor:"pointer",padding:"5px 8px",fontFamily:SF,borderRadius:"6px"}}>{h.label} ×</button>))}</div>}
      </div>}
    </div>}

    {/* ERKLAERUNG - eigener Abschnitt, zugeklappt, in gut lesbarer Groesse */}
    {mode==="list"&&<div style={{background:C.white,border:"1px solid "+C.border,borderRadius:"8px",marginBottom:"12px",overflow:"hidden"}}>
      <button onClick={()=>setHelp(h=>!h)} aria-expanded={help} style={{display:"flex",alignItems:"center",gap:"10px",width:"100%",minHeight:"44px",padding:"6px 14px",background:"none",border:"none",textAlign:"left",cursor:"pointer",fontFamily:SF}}>
        <span style={{flex:1,minWidth:0}}><span style={{display:"block",fontSize:"15px",color:C.text}}>So funktioniert der Vorrat</span><span style={{display:"block",fontSize:"13px",color:C.muted}}>Haltbarkeit, Stufen und Dauervorrat erklärt</span></span>
        <span aria-hidden="true" style={{color:C.accent,fontSize:"14px"}}>{help?"▴":"▾"}</span>
      </button>
      {help&&<div style={{padding:"4px 14px 12px",fontSize:"14px",color:C.muted,lineHeight:"1.5"}}>
        <div style={{marginBottom:"6px"}}><span style={{color:C.text,fontWeight:"700"}}>Verblasst nach:</span> {fades.map(f=>f.labels.join(", ")+" "+f.days+" Tage").join(" · ")}.</div>
        <div style={{marginBottom:"6px"}}>Rechts steht, wie sicher etwas noch da ist: „ist da“, „vermutlich da“, „eventuell da“, „eher nicht mehr da“. Danach gilt es als aufgebraucht und verschwindet aus der Liste.</div>
        <div style={{marginBottom:"6px"}}>Die Tage sind Startwerte. Wird ein Produkt erneut gekauft oder mit × gestrichen, lernt die App daraus seine echte Haltbarkeit. ✓ heißt „ist noch da“ und lässt das Verblassen neu beginnen; der Haken erscheint erst, wenn ein Produkt nicht mehr sicher da ist. × heißt „aufgebraucht“. Unter ⋯ stehen die Herkunft sowie „Einsortieren“ (zum Beispiel Cocktailtomaten zu Tomaten), „Kein Lebensmittel“ und „Dauervorrat“ (verblasst nie). Grundvorrat wie Salz, Öl und Mehl zählt immer als vorhanden.</div>
        <div>Namen werden auf die Zutaten deiner Rezepte gebracht („Bio Strauchtomaten 500g“ → „Tomaten“): erst nach Regeln, Unklares ordnet die KI zu. Über ⋯ und „Einsortieren“ lässt sich eine Zuordnung ändern.</div>
      </div>}
    </div>}

    {/* NAME ZUORDNEN */}
    {rename&&(
      <Modal title="Einsortieren" micro="Vorrat" onClose={()=>setRename(null)}>
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>
          {(rename.item.raws||[]).length?<>Auf dem Kassenbon: <b style={{color:C.text}}>{(rename.item.raws||[]).join(", ")}</b>. </>:null}
          Zu welcher Zutat aus deinen Rezepten gehört das? Gleiche Namen werden zu einer Zeile. Die Zuordnung gilt ab jetzt für alle Teilnehmer.
        </div>
        <input value={rename.value} onChange={e=>setRename(r=>({...r,value:e.target.value}))} list="vokabular" placeholder="Zutatenname, z. B. Tomaten" aria-label="Zutatenname" autoFocus style={{...input,marginBottom:"10px"}} />
        <datalist id="vokabular">{(vocab||[]).slice(0,300).map(v=><option key={v.key} value={v.name} />)}</datalist>
        <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
          <button onClick={()=>{ const n=rename.value.trim(); if(!n) return; setAlias(rename.item.raws&&rename.item.raws.length?rename.item.raws:[rename.item.name],n); showToast("Zugeordnet: "+n); setRename(null); }} disabled={!rename.value.trim()} style={{...btn("primary"),flex:"1 1 120px",opacity:rename.value.trim()?1:0.5,borderRadius:"6px"}}>Speichern</button>
          <button onClick={()=>{ setAlias(rename.item.raws&&rename.item.raws.length?rename.item.raws:[rename.item.name],""); showToast("Als „kein Lebensmittel“ ausgeblendet."); setRename(null); }} style={{...btn("ghost"),flex:"1 1 120px",borderRadius:"6px"}}>Kein Lebensmittel</button>
        </div>
        <div style={{display:"flex",gap:"6px",marginTop:"6px"}}>
          <button onClick={()=>{ clearAlias(rename.item.raws&&rename.item.raws.length?rename.item.raws:[rename.item.name]); setRename(null); }} style={{...btn("ghost"),flex:1,borderRadius:"6px"}}>Zurücksetzen</button>
          <button onClick={()=>setRename(null)} style={{...btn("ghost"),flex:1,borderRadius:"6px"}}>Abbrechen</button>
        </div>
      </Modal>
    )}
  </div>
  );
}
