import { useEffect, useMemo, useRef, useState } from "react";
import { C, SF, SER, micro as label, btn, chip, groupTint } from "../theme.js";
import { recName, recKey, normalizeRecipe } from "../logic/recipes.js";
import { graphNodes, netLayout, netDrag, isNetManual, recipeLinks, rankForSelection } from "../logic/graph.js";
import { goneKey } from "../logic/stock.js";
import { useHoldToTalk } from "../voice.js";
import Icon from "../components/Icon.jsx";

// NETZ DES VORRATS - je Gruppe ein Mittelpunkt (Kreis in der Farbe der Gruppe), die Produkte haengen als lockerer Haufen daran
// (kraeftig = wahrscheinlich da, Ring = Dauervorrat, roter Bogen = kippt bald). Keine Emojis, Farben wie am Wochenmarkt.
// Rezept antippen: Linien von der Mitte zu den vorhandenen Zutaten, Fehlendes steht in der Mitte. Punkte antippen = Auswahl -> "Daraus kochen" (KI).
// Schieben, Zoomen (Rad, zwei Finger), Gruppe per Mittelpunkt zuklappen. Punkte lassen sich um ihren Mittelpunkt verschieben (Lage im Plan).
const short=(s,n=14)=>{ const t=String(s||""); return t.length>n?t.slice(0,n-1)+"…":t; };
const K_MIN=0.4, K_MAX=4;

export default function VorratGraph({state,api,onPhoto,onList}){
  const {stock,stockRaw,recipes,classics,aiBusy,aiErr}=state;
  const {openRecipe,startCooking,adoptClassic,suggestRecipe,setStockLayout,resetStockLayout}=api;
  const nodes=useMemo(()=>graphNodes(stock),[stock]);
  const sig=nodes.map(n=>n.key).join("|");
  const [tf,setTf]=useState({x:0,y:0,k:1});           // Schieben/Zoomen (in Einheiten des Sichtfensters)
  const [collapsed,setCollapsed]=useState(()=>new Set());
  const [selected,setSelected]=useState(()=>new Set());
  const [recipeKey,setRecipeKey]=useState("");
  const [busy,setBusy]=useState("");
  const [dragPos,setDragPos]=useState(null);           // {key,t,r} waehrend des Ziehens eines Punkts
  const svgRef=useRef(null), ptrs=useRef(new Map()), dragRef=useRef(false), pinchRef=useRef(null), nodeDrag=useRef(null);

  // Pool wie in "Heute": eigenes Kochbuch + Rezept-Basis
  const pool=useMemo(()=>{
    const own=Object.keys(recipes).map(k=>({key:k,rec:recipes[k],basis:false,name:recName(recipes[k],k)}));
    const base=(classics||[]).filter(c=>!recipes[recKey(c.name)]).map(c=>{ const k=recKey(c.name); return {key:k,rec:{...normalizeRecipe(k,c,0),basis:true},basis:true,classic:c,name:c.name}; });
    return [...own,...base];
  },[recipes,classics]);
  const ranked=useMemo(()=>rankForSelection(pool,stock,selected),[pool,stock,selected]);
  const recipe=recipeKey?pool.find(e=>e.key===recipeKey):null;
  const links=useMemo(()=>recipe?recipeLinks(recipe.rec,stock):null,[recipe,stock]);
  const linked=new Set(links?links.present.map(x=>x.key):[]);

  // Auswahl bereinigen, wenn Punkte verschwinden
  useEffect(()=>{ setSelected(s=>{ const n=new Set([...s].filter(k=>nodes.some(x=>x.key===k))); return n.size===s.size?s:n; }); },[sig]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Hand-Lagen aus dem Plan (stock/layout/<goneKey>), waehrend des Ziehens die lokale Lage
  const manual=useMemo(()=>{ const out={}; const raw=(stockRaw&&stockRaw.layout)||{}; nodes.forEach(n=>{ const e=raw[goneKey(n.key)]; if(isNetManual(e)) out[n.key]={t:e.t,r:e.r}; }); if(dragPos) out[dragPos.key]={t:dragPos.t,r:dragPos.r}; return out; },[nodes,stockRaw,dragPos]);
  const manualCount=Object.keys(manual).length-(dragPos&&!((stockRaw&&stockRaw.layout)||{})[goneKey(dragPos.key)]?1:0);
  const layout=useMemo(()=>netLayout(nodes,collapsed,manual),[nodes,collapsed,manual]);
  const {hubs,placed}=layout;
  const anchorOf=(key)=>{ const n=placed.find(x=>x.key===key); if(n) return n; const src=nodes.find(x=>x.key===key); const hub=src&&hubs.find(x=>x.name===src.group&&x.collapsed); return hub?{x:hub.x,y:hub.y}:null; };
  // Sichtfenster: waehrend des Ziehens eines Punkts bleibt es stehen
  const boxRef=useRef(layout.box); if(!dragPos) boxRef.current=layout.box;
  const bx=boxRef.current, vb={x:bx.x-10,y:bx.y-10,w:bx.w+44,h:bx.h+20};   // rechts Platz fuer die Knoepfe

  // SCHIEBEN UND ZOOMEN (Zeiger: ein Finger schiebt, zwei zoomen; Mausrad zoomt um den Zeiger)
  const toWorld=(px,py)=>{ const r=svgRef.current.getBoundingClientRect(); const s=vb.w/r.width, s2=vb.h/r.height, sc=Math.max(s,s2); const ox=vb.x-(r.width*sc-vb.w)/2, oy=vb.y-(r.height*sc-vb.h)/2; return {x:(px-r.left)*sc+ox,y:(py-r.top)*sc+oy,sc}; };
  const zoomAt=(mx,my,factor)=>setTf(t=>{ const k=Math.max(K_MIN,Math.min(K_MAX,t.k*factor)); const wx=(mx-t.x)/t.k, wy=(my-t.y)/t.k; return {k,x:mx-wx*k,y:my-wy*k}; });
  // Welt-Koordinaten (vor dem Schiebe-/Zoom-Transform) unter dem Zeiger
  const toGraph=(px,py)=>{ const w=toWorld(px,py); return {x:(w.x-tf.x)/tf.k,y:(w.y-tf.y)/tf.k}; };
  const onDown=(e)=>{ ptrs.current.set(e.pointerId,{x:e.clientX,y:e.clientY}); dragRef.current=false; if(ptrs.current.size===2){ const [a,b]=[...ptrs.current.values()]; pinchRef.current=Math.hypot(a.x-b.x,a.y-b.y); nodeDrag.current=null; setDragPos(null); } };
  // Punkt anfassen: ab ein paar Pixel Bewegung wird aus dem Tipp ein Verschieben (innerhalb des eigenen Stuecks)
  const onNodeDown=(n)=>(e)=>{ if(ptrs.current.size>0) return; nodeDrag.current={key:n.key,group:n.group,x0:e.clientX,y0:e.clientY,moved:false}; };
  const onMove=(e)=>{
    const prev=ptrs.current.get(e.pointerId); if(!prev) return;
    const cur={x:e.clientX,y:e.clientY}; ptrs.current.set(e.pointerId,cur);
    const nd=nodeDrag.current;
    if(nd&&ptrs.current.size===1){
      if(!nd.moved&&Math.hypot(cur.x-nd.x0,cur.y-nd.y0)<5) return;
      nd.moved=true; dragRef.current=true;
      const hub=hubs.find(x=>x.name===nd.group); if(!hub||hub.collapsed) return;
      const g=toGraph(cur.x,cur.y); const m=netDrag(hub,g.x,g.y);
      setDragPos({key:nd.key,t:m.t,r:m.r});
      return;
    }
    if(ptrs.current.size===1){
      const dx=cur.x-prev.x, dy=cur.y-prev.y;
      if(Math.abs(dx)+Math.abs(dy)>0){ if(Math.hypot(dx,dy)>3) dragRef.current=true; const {sc}=toWorld(cur.x,cur.y); setTf(t=>({...t,x:t.x+dx*sc,y:t.y+dy*sc})); }
    }else if(ptrs.current.size===2){
      const [a,b]=[...ptrs.current.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinchRef.current&&d>0){ const m=toWorld((a.x+b.x)/2,(a.y+b.y)/2); zoomAt(m.x,m.y,d/pinchRef.current); dragRef.current=true; }
      pinchRef.current=d;
    }
  };
  const onUp=(e)=>{
    ptrs.current.delete(e.pointerId); if(ptrs.current.size<2) pinchRef.current=null;
    const nd=nodeDrag.current; nodeDrag.current=null;
    if(nd&&nd.moved){ const dp=dragPos; setDragPos(null); if(dp&&dp.key===nd.key) setStockLayout(nd.key,{t:dp.t,r:dp.r}); }
  };
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    const wheel=(e)=>{ e.preventDefault(); const m=toWorld(e.clientX,e.clientY); zoomAt(m.x,m.y,Math.pow(1.0015,-e.deltaY)); };
    el.addEventListener("wheel",wheel,{passive:false});
    return ()=>el.removeEventListener("wheel",wheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[vb.x,vb.y,vb.w,vb.h]);
  const tap=(fn)=>(e)=>{ if(dragRef.current){ dragRef.current=false; return; } fn(e); };

  const toggleSel=(key)=>{ setRecipeKey(""); setSelected(s=>{ const n=new Set(s); if(n.has(key)) n.delete(key); else n.add(key); return n; }); };
  const toggleCluster=(name)=>setCollapsed(s=>{ const n=new Set(s); if(n.has(name)) n.delete(name); else n.add(name); return n; });
  const pickRecipe=(key)=>{ setRecipeKey(k=>k===key?"":key); };
  const ensureKey=async(e)=>{ if(!e.basis) return e.key; setBusy(e.key); const k=await adoptClassic(e.classic); setBusy(""); return k; };
  const open=async(e)=>{ const k=await ensureKey(e); if(k) openRecipe(k); };
  const cook=async(e)=>{ const k=await ensureKey(e); if(k) startCooking(k); };
  const selNames=[...selected].map(k=>{ const n=nodes.find(x=>x.key===k); return n?n.name:k; });
  const cookFrom=()=>suggestRecipe({ingredients:selNames});
  // SPRECHEN statt antippen: Mikrofon halten, sagen, was da ist -> die KI sucht daraus ein Gericht (mit der Auswahl, falls eine da ist)
  const [spoke,setSpoke]=useState(false);
  const voice=useHoldToTalk({onAudio:async(audio)=>{ setSpoke(true); await suggestRecipe({ingredients:selNames,audio}); }});
  const micBtn=(inNet)=>(
    <button {...voice.bind} disabled={aiBusy||voice.phase==="busy"} aria-label="Gedrückt halten und sagen, was da ist" style={{...btn(voice.phase==="rec"?"primary":"ghost"),...voice.noSelect,padding:"8px 12px",borderRadius:"6px",borderColor:C.accent,...(inNet?{minHeight:"44px",background:voice.phase==="rec"?C.accent:C.white,fontSize:"13px"}:{width:"100%",marginTop:"10px"}),display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
      {voice.phase==="rec"?(voice.latched?"● Fertig? Hier tippen":"● Ich höre zu…"):voice.phase==="starting"?"Mikrofon geht an…":(voice.phase==="busy"||aiBusy)&&spoke?"KI sucht…":<><Icon name="mic" size={18} />Halten und sagen, was da ist</>}
    </button>
  );
  const voiceNote=voice.phase==="rec"
    ?<div role="status" style={{fontSize:"13px",color:C.muted,lineHeight:"1.5"}}>Sag, was da ist, z. B. „Hähnchen, Paprika und Reis“, dann {voice.latched?"den Knopf noch einmal tippen":"loslassen"}. Die Aufnahme geht nur zur Erkennung an die KI und wird nicht gespeichert.</div>
    :voice.hint?<div role="status" style={{fontSize:"13px",color:C.err,lineHeight:"1.5"}}>{voice.hint}</div>
    :aiErr&&spoke?<div role="status" style={{fontSize:"13px",color:C.err,lineHeight:"1.5"}}>{aiErr}</div>:null;

  if(!nodes.length){
    return(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"28px 18px",textAlign:"center"}}>
        <div style={{fontFamily:SER,fontSize:"22px",color:C.text,marginBottom:"8px"}}>Noch keine Punkte im Netz.</div>
        <div style={{fontSize:"14px",color:C.muted,lineHeight:"1.6",marginBottom:"16px"}}>Das Netz zeigt, was wahrscheinlich da ist – je Gruppe ein Mittelpunkt mit ihren Lebensmitteln. Fotografiere die Speisekammer oder trag in der Liste etwas ein.</div>
        <div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={onPhoto} style={{...btn("primary"),letterSpacing:"0.5px",borderRadius:"6px",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"8px"}}><Icon name="cam" size={18} />Speisekammer fotografieren</button>
          <button onClick={onList} style={btn("ghost")}>Zur Liste</button>
        </div>
        {micBtn(false)}
        {voiceNote&&<div style={{marginTop:"8px"}}>{voiceNote}</div>}
      </div>
    );
  }
  const covText=links?links.present.length+" von "+(links.present.length+links.missing.length)+" Zutaten da":"";
  return(
  <div>
    {/* NETZ */}
    <div style={{position:"relative",background:C.white,border:"1px solid "+C.border,borderRadius:"8px 8px 0 0",height:"min(62vh, 560px)",minHeight:"340px",overflow:"hidden"}}>
      <svg ref={svgRef} data-testid="vorrat-graph" viewBox={vb.x+" "+vb.y+" "+vb.w+" "+vb.h} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{display:"block",touchAction:"none",cursor:"grab",fontFamily:SF,userSelect:"none"}}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
        <g transform={"translate("+tf.x+" "+tf.y+") scale("+tf.k+")"}>
          {/* feine Linien vom Mittelpunkt der Gruppe zu ihren Produkten */}
          {placed.map(n=><line key={"h"+n.key} data-edge="hub" x1={n.hx} y1={n.hy} x2={n.x} y2={n.y} stroke={groupTint(n.group)} strokeWidth="1.1" opacity={recipe?0.35:0.7} />)}
          {/* Linien des Rezepts: von der Mitte zu den vorhandenen Zutaten, leicht gebogen */}
          {links&&links.present.map(x=>{ const a=anchorOf(x.key); if(!a) return null; const mx=a.x/2+a.y*0.1, my=a.y/2-a.x*0.1; return <path key={"e"+x.key} data-edge="present" d={"M0 0 Q"+mx.toFixed(1)+" "+my.toFixed(1)+" "+a.x+" "+a.y} fill="none" stroke={C.accent} strokeWidth={1.2+1.2*x.p} strokeLinecap="round" />; })}
          {/* Mittelpunkte der Gruppen: Kreis in der Gruppenfarbe, Name darueber; antippen klappt die Gruppe zu */}
          {hubs.map(h=>{ const tint=groupTint(h.name); return(
            <g key={h.name} role="button" aria-label={h.collapsed?"Gruppe "+h.name+" aufklappen":"Gruppe "+h.name+" zuklappen"} transform={"translate("+h.x+" "+h.y+")"} onClick={tap(()=>toggleCluster(h.name))} style={{cursor:"pointer"}}>
              <circle r="13" fill={tint} opacity="0.22" />
              <circle r={h.collapsed?6:8} fill={h.collapsed?C.white:tint} stroke={tint} strokeWidth={h.collapsed?3:0} />
              <text y="-17" textAnchor="middle" fontSize="12" fontWeight="700" fill={C.text}>{h.name}<tspan fontWeight="400" fill={C.muted}>{" ("+h.n+")"+(h.collapsed?" ▸":"")}</tspan></text>
              <rect x="-40" y="-30" width="80" height="46" fill="transparent" />
            </g>
          ); })}
          {/* Produkte */}
          {placed.map(n=>{
            const isSel=selected.has(n.key), isLinked=linked.has(n.key), dim=recipe&&!isLinked, tint=groupTint(n.group);
            const circ=2*Math.PI*(n.r+3), strong=isSel||isLinked;
            return(
              <g key={n.key} role="button" aria-label={n.name+(isSel?" abwählen":" auswählen")} aria-pressed={isSel} data-manual={n.manual?"1":undefined} transform={"translate("+n.x+" "+n.y+")"} onPointerDown={onNodeDown(n)} onClick={tap(()=>toggleSel(n.key))} style={{cursor:"grab",opacity:dim?0.6:1,transition:dragPos&&dragPos.key===n.key?"none":"opacity 0.3s"}}>
                {isSel&&<circle r={n.r+6} fill="none" stroke={C.accent} strokeWidth="2" />}
                {n.permanent&&<circle data-ring="dauer" r={n.r+3} fill="none" stroke={tint} strokeWidth="1.5" />}
                <circle r={n.r} fill={tint} fillOpacity={0.4+0.6*n.p} />
                {n.expiring&&<circle r={n.r+3} fill="none" stroke={C.err} strokeWidth="2" strokeDasharray={(circ*0.62)+" "+circ} transform="rotate(-90)" strokeLinecap="round" />}
                <text y={n.r+12} textAnchor="middle" fontSize="11" fontWeight={strong?"700":"400"} fill={strong?C.text:C.muted}>{short(n.name,13)}</text>
                <circle r="17" fill="transparent" />
              </g>
            );
          })}
          {/* Mitte: das gewaehlte Rezept */}
          <g role={recipe?"button":undefined} aria-label={recipe?"Rezept "+recipe.name+" öffnen":undefined} data-testid="graph-center" onClick={recipe?tap(()=>open(recipe)):undefined} style={{cursor:recipe?"pointer":"default"}}>
            {recipe&&(
              <>
                <circle r="7" fill={C.white} stroke={C.accent} strokeWidth="3" />
                <text x="0" y="22" textAnchor="middle" fontSize="12" fontWeight="700" fill={C.accent} stroke={C.white} strokeWidth="3" paintOrder="stroke">{short(recipe.name,26)}</text>
                <text x="0" y="35" textAnchor="middle" fontSize="10" fill={links.missing.length?C.muted:C.ok} stroke={C.white} strokeWidth="3" paintOrder="stroke">{links.missing.length?short("fehlt: "+links.missing.map(m=>m.name).join(", "),30):"alles da"}</text>
                <rect x="-60" y="-12" width="120" height="52" fill="transparent" />
              </>
            )}
          </g>
        </g>
      </svg>
      {/* Steuerung */}
      {/* SPRECHEN: oben links im Netz, ohne Scrollen erreichbar; Hinweise darunter */}
      {!recipe&&!selected.size&&<div style={{position:"absolute",top:"8px",left:"8px",right:"60px",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:"6px",pointerEvents:"none"}}>
        <div style={{pointerEvents:"auto"}}>{micBtn(true)}</div>
        {voiceNote&&<div style={{pointerEvents:"auto",background:C.white,border:"1px solid "+C.border,borderRadius:"6px",padding:"8px 10px",maxWidth:"320px"}}>{voiceNote}</div>}
      </div>}
      <div style={{position:"absolute",top:"8px",right:"8px",display:"flex",flexDirection:"column",gap:"4px"}}>
        {[["+","Vergrößern",()=>zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1.3)],["−","Verkleinern",()=>zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1/1.3)],["⊡","Einpassen",()=>setTf({x:0,y:0,k:1})],...(manualCount>0?[["↺","Anordnung zurücksetzen",()=>resetStockLayout()]]:[])].map(([t,a,f])=>(
          <button key={a} onClick={f} aria-label={a} title={a} style={{width:"36px",height:"36px",background:C.white,border:"1px solid "+C.border,color:C.accent,fontSize:"18px",cursor:"pointer",fontFamily:SF,padding:0,borderRadius:"6px"}}>{t}</button>
        ))}
      </div>
      <div style={{position:"absolute",left:"10px",right:"52px",bottom:"6px",fontSize:"12px",color:C.muted,pointerEvents:"none",lineHeight:"1.35"}}>kräftig = wahrscheinlich da · Ring = Dauervorrat · roter Bogen = kippt bald</div>
    </div>

    {/* LEISTE: Rezept oder Auswahl */}
    <div style={{background:C.white,border:"1px solid "+C.border,borderTop:"none",borderRadius:"0 0 8px 8px",padding:"10px 12px",minHeight:"58px",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
      {recipe?(
        <>
          <div style={{flex:"1 1 160px",minWidth:0}}>
            <div style={{fontFamily:SER,fontSize:"17px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recipe.name}</div>
            <div style={{fontSize:"13px",color:C.muted}}>{covText}{links.missing.length?" · fehlt: "+links.missing.map(m=>m.name).join(", "):" · alles da"}{recipe.basis?" · Rezept-Basis":""}</div>
          </div>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={()=>open(recipe)} disabled={busy===recipe.key} style={{...btn("primary"),padding:"9px 12px",borderRadius:"6px"}}>{busy===recipe.key?"…":"Zum Rezept"}</button>
            <button onClick={()=>cook(recipe)} disabled={busy===recipe.key} style={{...btn("dark"),padding:"9px 12px",borderRadius:"6px"}}>Kochmodus</button>
            <button onClick={()=>setRecipeKey("")} aria-label="Rezept ausblenden" style={{...btn("ghost"),padding:"9px 12px",borderRadius:"6px"}}>×</button>
          </div>
        </>
      ):selected.size?(
        <>
          <div style={{flex:"1 1 160px",minWidth:0}}>
            <div style={{fontSize:"15px",color:C.text}}><b>{selected.size} ausgewählt</b></div>
            <div style={{fontSize:"13px",color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selNames.join(", ")}</div>
          </div>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={cookFrom} disabled={aiBusy} style={{...btn("primary"),padding:"9px 12px",background:aiBusy?C.subtle:C.accent,borderRadius:"6px"}}>{aiBusy?"KI sucht…":"Daraus kochen (KI)"}</button>
            <button onClick={()=>setSelected(new Set())} aria-label="Auswahl aufheben" style={{...btn("ghost"),padding:"9px 12px",borderRadius:"6px"}}>×</button>
          </div>
        </>
      ):(
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5"}}>Punkte antippen oder das Mikrofon halten und sagen, was da ist, und <b style={{color:C.text}}>daraus kochen</b> lassen – oder unten ein Rezept antippen, dann zeigt das Netz seine Zutaten. Punkte lassen sich verschieben, ein Tipp auf den Mittelpunkt klappt die Gruppe zu.</div>
      )}
      {aiErr&&!recipe&&selected.size>0&&<div style={{flexBasis:"100%",fontSize:"13px",color:C.err}}>{aiErr}</div>}
    </div>

    {/* REZEPTE ZUR AUSWAHL / NACH ABDECKUNG */}
    <div style={{marginTop:"12px"}}>
      <div style={{...label,marginBottom:"6px"}}>{selected.size?"Rezepte mit der Auswahl ("+ranked.length+")":"Rezepte nach Vorrat"}</div>
      {ranked.length===0&&<div style={{fontSize:"13px",color:C.muted,padding:"6px 2px"}}>Kein Rezept verwendet die Auswahl – „Daraus kochen“ fragt die KI nach einem bekannten Gericht.</div>}
      <div style={{display:"flex",gap:"6px",overflowX:"auto",paddingBottom:"6px",WebkitOverflowScrolling:"touch"}}>
        {ranked.slice(0,16).map(e=>{
          const on=e.key===recipeKey;
          const meta=selected.size?e.hits+" von "+e.of:Math.round(e.cov*100)+" %";
          return <button key={e.key} onClick={()=>pickRecipe(e.key)} aria-pressed={on} style={{...chip(on),flexShrink:0,padding:"8px 11px",fontSize:"13px",fontWeight:on?"700":"400",color:on?C.accent:C.text,display:"flex",gap:"6px",alignItems:"center"}}><span>{short(e.name,24)}</span><span style={{color:on?C.accent:C.muted,fontSize:"13px"}}>{meta}</span></button>;
        })}
      </div>
    </div>
  </div>
  );
}
