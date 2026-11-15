import { useRef, useState } from "react";
import { C, SF, SER, micro as label, btn, input, iconBtn, chip } from "../theme.js";
import { daysSince } from "../logic/weeks.js";
import { STOCK_MIN, STOCK_GROUPS, fadeTable, guessGroup } from "../logic/stock.js";
import { isBasicText } from "../logic/ingredients.js";
import { compressImageToBase64, kiErrText } from "../ai.js";
import VorratGraph from "./VorratGraph.jsx";
import { foodIcon } from "../logic/foodIcon.js";
import { groupOf } from "../logic/graph.js";
import Modal from "../components/Modal.jsx";

// VORRAT - eine Liste aus drei Quellen: Haushaltsbuch (automatisch), Speisekammer-Foto (KI) und Hand.
// Dauervorrat (Pin) verblasst nie; x entfernt eigene Positionen bzw. streicht Haushaltsbuch-Positionen; lernendes Verblassen je Produkt.
const pColor=(p)=>p>=0.6?C.ok:p>=0.25?C.accent:C.subtle;
const SRC_LABEL={hb:"Haushaltsbuch",foto:"Foto",hand:"Hand",perm:"Dauervorrat"};
const sel={...input,width:"118px",flexShrink:0,padding:"8px 6px",minHeight:"40px",fontSize:"13px"};
// Umschalter Liste / Graph wird je Geraet gemerkt (reine Bequemlichkeit, kein Plan-Zustand)
const MODE_KEY="wp.vorratMode";
const loadMode=()=>{ try{ return localStorage.getItem(MODE_KEY)==="graph"?"graph":"list"; }catch(e){ return "list"; } };
const saveMode=(m)=>{ try{ localStorage.setItem(MODE_KEY,m); }catch(e){} };

export default function Vorrat({state,api}){
  const {stock,stockRaw,hbLink,hbLoading,hbErr,hbBook,learned,vocab,unmapped,aliasBusy,aliasErr}=state;
  const {connectHb,reloadHb,disconnectHb,clearGone,addStockItem,addStockItems,refreshStock,setPermanent,removeStock,scanPantry,showToast,setAlias,clearAlias,mapNamesAI}=api;
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
  const tile={...btn("ghost"),minHeight:"44px",padding:"10px 6px",fontSize:"12px",letterSpacing:"1px",whiteSpace:"nowrap"};
  const row=(s,i)=>{
    const d=s.last?daysSince(s.last):null;
    const when=s.permanent?"immer da":d===null?"":d===0?"heute":d===1?"gestern":"vor "+d+" Tagen";
    const left=s.permanent?"":s.left<=0?"läuft heute aus":s.left===1?"noch 1 Tag":"noch "+s.left+" Tage";
    const src=(s.srcs||[]).filter(x=>x!=="perm").map(x=>SRC_LABEL[x]||x).join(" + ");
    const lrn=s.learnedN?"gelernt aus "+s.learnedN+(s.learnedN===1?" Kauf":" Käufen"):"";
    const rawsOther=(s.raws||[]).filter(r=>r.trim().toLowerCase()!==s.name.trim().toLowerCase());
    const aus=rawsOther.length?"aus: "+rawsOther.slice(0,3).join(", ")+(rawsOther.length>3?" …":""):"";
    return(
      <div key={s.key} style={{display:"flex",alignItems:"center",gap:"6px",padding:"8px 2px 8px 14px",borderTop:i?"1px solid "+C.border:"none",minHeight:"56px",boxSizing:"border-box"}}>
        <div style={{flex:1,minWidth:0}}>
          <button onClick={()=>setRename({item:s,value:s.name})} title="Name zuordnen" aria-label={s.name+": Name zuordnen"} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:SF,fontSize:"17px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(()=>{ const ic=foodIcon(s.name,groupOf(s)); return ic?<span aria-hidden="true" style={{marginRight:"8px"}}>{ic}</span>:null; })()}{s.name}</button>
          <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.4"}}>{[s.sub,when,left,src,lrn,aus].filter(Boolean).join(" · ")}</div>
        </div>
        {!s.permanent&&<span style={{fontSize:"16px",fontWeight:"700",color:pColor(s.p),flexShrink:0,minWidth:"46px",textAlign:"right"}}>{Math.round(s.p*100)} %</span>}
        {!s.permanent&&<button onClick={()=>{ refreshStock(s); showToast("„"+s.name+"“ ist wieder frisch da."); }} aria-label={s.name+" auffrischen: ist noch da"} title="Ist noch da – Verblassen beginnt neu" style={{...iconBtn,color:s.p>=0.99?C.subtle:C.ok,fontSize:"18px",minWidth:"36px",padding:"6px 4px"}}>✓</button>}
        <button onClick={()=>setPermanent(s,!s.permanent)} aria-label={s.permanent?s.name+": Dauervorrat aufheben":s.name+" als Dauervorrat"} aria-pressed={!!s.permanent} title={s.permanent?"Dauervorrat aufheben":"Dauervorrat: ist immer da"} style={{...iconBtn,color:s.permanent?C.accent:C.subtle,fontSize:"18px",minWidth:"36px",padding:"6px 4px"}}>{s.permanent?"★":"☆"}</button>
        <button onClick={()=>removeStock(s)} aria-label={s.name+" entfernen"} title={s.srcs&&s.srcs.includes("hb")?"Nicht mehr da – aus der Liste streichen":"Entfernen"} style={{...iconBtn,color:C.muted,minWidth:"36px",padding:"6px 4px"}}>×</button>
      </div>
    );
  };
  const scanBox=scan&&!scan.busy?(
        <div style={{border:"1px solid "+C.accent,marginTop:"4px"}}>
          <div style={{padding:"8px 12px",fontSize:"12px",color:C.muted,borderBottom:"1px solid "+C.border,lineHeight:"1.5"}}>{scan.err||"Erkannt auf dem Foto – Namen und Gruppe anpassen, Haken weg, was nicht stimmt."}</div>
          {scan.items.map((it,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 12px",borderBottom:"1px solid "+C.border,minHeight:"44px"}}>
              <input type="checkbox" checked={it.on} onChange={e=>setScan(sc=>({...sc,items:sc.items.map((x,j)=>j===i?{...x,on:e.target.checked}:x)}))} aria-label={it.name+" übernehmen"} style={{width:"20px",height:"20px",accentColor:C.accent}} />
              <div style={{flex:1,minWidth:0}}>
                <input value={it.name} onChange={e=>setScan(sc=>({...sc,items:sc.items.map((x,j)=>j===i?{...x,name:e.target.value}:x)}))} aria-label={"Name für "+it.name} style={{width:"100%",boxSizing:"border-box",background:"transparent",border:"none",borderBottom:"1px dashed "+C.border,padding:"6px 0",fontSize:"15px",color:it.on?C.text:C.subtle,fontFamily:SF,outline:"none"}} />
                {isBasicText(it.name)&&<div style={{fontSize:"11px",color:C.subtle,marginTop:"2px"}}>Grundvorrat, zählt immer als da, steht nicht in der Liste</div>}
              </div>
              <select value={it.sub} onChange={e=>setScan(sc=>({...sc,items:sc.items.map((x,j)=>j===i?{...x,sub:e.target.value}:x)}))} aria-label={"Gruppe für "+it.name} style={{...sel,padding:"6px 8px",minHeight:"34px",fontSize:"12px"}}>
                {STOCK_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          ))}
          <div style={{display:"flex",gap:"6px",padding:"8px 12px"}}>
            {scan.items.length>0&&<button onClick={takeScan} style={{...btn("primary"),flex:2,letterSpacing:"1.5px"}}>{scan.items.filter(x=>x.on).length} ÜBERNEHMEN</button>}
            <button onClick={()=>setScan(null)} style={{...btn("ghost"),flex:1}}>VERWERFEN</button>
          </div>
        </div>
  ):null;
  return(
  <div style={{padding:"12px",paddingBottom:"80px"}}>
    <div style={{margin:"4px 2px 12px",display:"flex",alignItems:"flex-end",gap:"10px"}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:SER,fontSize:"26px",color:C.text,lineHeight:1.15}}>Vorrat</div>
        <div style={{fontSize:"13px",color:C.muted,marginTop:"3px"}}>{mode==="graph"?"Dein Vorrat im Kreis – Rezept in der Mitte, Gruppen als Stücke.":"Was wahrscheinlich da ist – aus Haushaltsbuch, Foto und Hand."}</div>
      </div>
      <div role="group" aria-label="Ansicht" style={{display:"flex",border:"1px solid "+C.border,flexShrink:0}}>
        {[["list","Liste"],["graph","Graph"]].map(([m,t])=>(
          <button key={m} onClick={()=>setMode(m)} aria-pressed={mode===m} style={{...chip(mode===m),border:"none",minHeight:"36px",padding:"8px 12px",letterSpacing:"1px",fontWeight:"700"}}>{t}</button>
        ))}
      </div>
    </div>

    {/* GRAPH (Umschalter) - Foto und Scan-Pruefung bleiben erreichbar */}
    {mode==="graph"&&<input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={onFile} />}
    {mode==="graph"&&scan&&(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"12px"}}>
        <div style={label}>Speisekammer-Foto</div>
        {scan.busy?<div style={{fontSize:"13px",color:C.muted,padding:"8px 0"}}>Die KI schaut sich das Foto an…</div>:scanBox}
      </div>
    )}
    {mode==="graph"&&<VorratGraph state={state} api={api} onPhoto={()=>fileRef.current&&fileRef.current.click()} onList={()=>setMode("list")} />}

    {/* HINZUFUEGEN: Hand + Foto */}
    {mode==="list"&&<div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"12px"}}>
      <div style={label}>Hinzufügen</div>
      <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doAdd();}} placeholder="Lebensmittel, z. B. Linsen" aria-label="Lebensmittel" style={{...input,flex:1,width:"auto",minWidth:0}} />
        <select value={group} onChange={e=>setGroup(e.target.value)} aria-label="Gruppe" style={sel}>
          <option value="">{name.trim()?"auto: "+guessGroup(name):"Gruppe (auto)"}</option>
          {STOCK_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={doAdd} disabled={!name.trim()} aria-label="Hinzufügen" style={{...btn("dark"),minWidth:"48px",fontSize:"20px",padding:"6px 14px",opacity:name.trim()?1:0.5}}>+</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={onFile} />
      {!scan&&<button onClick={()=>fileRef.current&&fileRef.current.click()} style={{...btn("ghost"),width:"100%",color:C.accent,letterSpacing:"1.5px"}}>📷 SPEISEKAMMER FOTOGRAFIEREN</button>}
      {scan&&scan.busy&&<div style={{fontSize:"13px",color:C.muted,padding:"8px 0"}}>Die KI schaut sich das Foto an…</div>}
      {scan&&!scan.busy&&scanBox}
      <div style={{fontSize:"11px",color:C.subtle,marginTop:"8px",lineHeight:"1.4"}}>Das Foto geht nur zur Erkennung an die KI und wird nicht gespeichert. Erkannte Lebensmittel gelten ab heute als gekauft.</div>
    </div>}

    {/* HAUSHALTSBUCH */}
    {mode==="list"&&(!hbLink?(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"12px"}}>
        <div style={label}>Haushaltsbuch verbinden</div>
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>Mit dem Code eures Haushaltsbuchs kommen die Lebensmittel-Einkäufe automatisch in den Vorrat. Es wird nur gelesen, nie etwas geändert.</div>
        <div style={{display:"flex",gap:"6px"}}>
          <input value={hbInput} onChange={e=>setHbInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")doConnect();}} placeholder="BUCH-CODE" aria-label="Buch-Code" style={{...input,flex:1,width:"auto",letterSpacing:"2px"}} />
          <button onClick={doConnect} disabled={hbLoading||!hbInput.trim()} style={{...btn("primary"),letterSpacing:"2px",opacity:hbLoading||!hbInput.trim()?0.5:1}}>{hbLoading?"…":"VERBINDEN"}</button>
        </div>
        {hbErr&&<div style={{marginTop:"8px",fontSize:"12px",color:C.err}}>{hbErr}</div>}
      </div>
    ):(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"12px",display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
        <span style={{width:"8px",height:"8px",borderRadius:"50%",background:hbErr?C.err:hbBook?C.ok:C.subtle,flexShrink:0}} />
        <div style={{flex:"1 1 160px",minWidth:0}}>
          <div style={{fontSize:"15px",color:C.text}}>Haushaltsbuch <b style={{letterSpacing:"2px"}}>{hbLink.code}</b></div>
          <div style={{fontSize:"13px",color:hbErr?C.err:C.muted}}>{hbLoading?"Wird geladen…":hbErr?hbErr:hbBook?(hbLink.cat+(learnedCount?" · Verblassen gelernt für "+learnedCount+(learnedCount===1?" Produkt":" Produkte"):"")):"verbunden"}</div>
          {aliasBusy&&<div style={{fontSize:"12px",color:C.accent}}>KI ordnet Produktnamen zu…</div>}
          {!aliasBusy&&aliasErr&&<div style={{fontSize:"12px",color:C.err}}>{aliasErr}</div>}
          {!aliasBusy&&!aliasErr&&unmapped.length>0&&<div style={{fontSize:"12px",color:C.muted,display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>{unmapped.length===1?"1 Name ungeklärt":unmapped.length+" Namen ungeklärt"}</span><button onClick={()=>mapNamesAI(unmapped)} style={{background:"none",border:"none",color:C.accent,fontSize:"12px",cursor:"pointer",padding:"6px 4px",fontFamily:SF,fontWeight:"700",letterSpacing:"1px"}}>MIT KI ZUORDNEN</button></div>}
        </div>
        <div style={{display:"flex",gap:"6px"}}>
          <button onClick={()=>reloadHb()} disabled={hbLoading} style={{...tile,color:C.accent,opacity:hbLoading?0.5:1}}>↻</button>
          <button onClick={disconnectHb} style={tile}>TRENNEN</button>
        </div>
      </div>
    ))}

    {/* DAUERVORRAT */}
    {mode==="list"&&perm.length>0&&(
      <div style={{background:C.white,border:"1px solid "+C.border,marginBottom:"12px"}}>
        <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border}}><span style={{...label,marginBottom:0}}>Dauervorrat ({perm.length})</span></div>
        {perm.map(row)}
      </div>
    )}

    {/* WAHRSCHEINLICH DA */}
    {mode==="list"&&<div style={{background:C.white,border:"1px solid "+C.border,marginBottom:"12px"}}>
      <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border}}><span style={{...label,marginBottom:0}}>Wahrscheinlich da ({visible.length})</span></div>
      {visible.length===0&&<div style={{padding:"14px",fontSize:"14px",color:C.muted,lineHeight:"1.5"}}>Noch nichts im Vorrat. Haushaltsbuch verbinden, Speisekammer fotografieren oder oben etwas eintragen.</div>}
      {visible.map(row)}
      <div style={{padding:"10px 14px",fontSize:"13px",color:C.subtle,borderTop:"1px solid "+C.border,lineHeight:"1.5"}}>
        <div style={{marginBottom:"4px"}}><span style={{color:C.muted,fontWeight:"700"}}>Verblasst nach:</span> {fades.map(f=>f.labels.join(", ")+" "+f.days+" Tage").join(" · ")}.</div>
        <div>Das sind Startwerte. Wird ein Produkt erneut gekauft oder mit × gestrichen, lernt die App daraus seine echte Haltbarkeit („gelernt aus … Käufen“). Unter {Math.round(STOCK_MIN*100)} % gilt eine Sache als aufgebraucht. ✓ heißt „ist noch da“ und lässt das Verblassen neu beginnen. ★ Dauervorrat verblasst nie. Grundvorrat wie Salz, Öl und Mehl zählt immer als vorhanden.</div>
        {goneCount>0&&<div style={{marginTop:"6px",display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>{goneCount===1?"1 Position gestrichen.":goneCount+" Positionen gestrichen."}</span><button onClick={clearGone} style={{background:"none",border:"none",color:C.accent,fontSize:"13px",cursor:"pointer",padding:"6px 4px",fontFamily:SF}}>wieder einblenden</button></div>}
        {hidden.length>0&&<div style={{marginTop:"6px",display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>Als „kein Lebensmittel“ ausgeblendet:</span>{hidden.map(h=>(<button key={h.key} onClick={()=>{ clearAlias([],[h.key]); showToast("„"+h.label+"“ wieder eingeblendet."); }} aria-label={h.label+" wieder einblenden"} style={{background:"none",border:"1px solid "+C.border,color:C.accent,fontSize:"12px",cursor:"pointer",padding:"5px 8px",fontFamily:SF}}>{h.label} ×</button>))}</div>}
        <div style={{marginTop:"6px"}}>Namen werden auf die Zutaten deiner Rezepte gebracht („Bio Strauchtomaten 500g“ → „Tomaten“): erst nach Regeln, Unklares ordnet die KI zu. Name antippen, um eine Zuordnung zu ändern.</div>
      </div>
    </div>}

    {/* NAME ZUORDNEN */}
    {rename&&(
      <Modal title="Name zuordnen" micro="Vorrat" onClose={()=>setRename(null)}>
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>
          {(rename.item.raws||[]).length?<>Auf dem Kassenbon: <b style={{color:C.text}}>{(rename.item.raws||[]).join(", ")}</b>. </>:null}
          Wie heißt das Produkt in deinen Rezepten? Die Zuordnung gilt ab jetzt für alle Teilnehmer.
        </div>
        <input value={rename.value} onChange={e=>setRename(r=>({...r,value:e.target.value}))} list="vokabular" placeholder="Zutatenname, z. B. Tomaten" aria-label="Zutatenname" autoFocus style={{...input,marginBottom:"10px"}} />
        <datalist id="vokabular">{(vocab||[]).slice(0,300).map(v=><option key={v.key} value={v.name} />)}</datalist>
        <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
          <button onClick={()=>{ const n=rename.value.trim(); if(!n) return; setAlias(rename.item.raws&&rename.item.raws.length?rename.item.raws:[rename.item.name],n); showToast("Zugeordnet: "+n); setRename(null); }} disabled={!rename.value.trim()} style={{...btn("primary"),flex:"1 1 120px",opacity:rename.value.trim()?1:0.5}}>SPEICHERN</button>
          <button onClick={()=>{ setAlias(rename.item.raws&&rename.item.raws.length?rename.item.raws:[rename.item.name],""); showToast("Als „kein Lebensmittel“ ausgeblendet."); setRename(null); }} style={{...btn("ghost"),flex:"1 1 120px"}}>KEIN LEBENSMITTEL</button>
        </div>
        <div style={{display:"flex",gap:"6px",marginTop:"6px"}}>
          <button onClick={()=>{ clearAlias(rename.item.raws&&rename.item.raws.length?rename.item.raws:[rename.item.name]); setRename(null); }} style={{...btn("ghost"),flex:1}}>ZURÜCKSETZEN</button>
          <button onClick={()=>setRename(null)} style={{...btn("ghost"),flex:1}}>ABBRECHEN</button>
        </div>
      </Modal>
    )}
  </div>
  );
}
