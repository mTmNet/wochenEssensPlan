import { useEffect, useMemo, useRef, useState } from "react";
import { C, SF, SER, micro as label, btn, chip } from "../theme.js";
import { recName, recKey, normalizeRecipe } from "../logic/recipes.js";
import { graphNodes, radialLayout, sectorPath, dragToManual, recipeLinks, rankForSelection, R_CENTER, R_IN } from "../logic/graph.js";
import { goneKey } from "../logic/stock.js";
import { foodIcon } from "../logic/foodIcon.js";

// GRAPH DES VORRATS - Rezeptkreis in der Mitte, drumherum je Gruppe ein Kuchenstueck (Groesse nach Anzahl, leichter Farbakzent),
// Produkte als Punkte darin (gross und hell = wahrscheinlich da, Ring = Dauervorrat, roter Bogen = kippt bald).
// Rezept antippen: Kanten vom Kreis zu vorhandenen Zutaten, Fehlendes steht im Kreis. Punkte antippen = Auswahl -> "Daraus kochen" (KI).
// Schieben, Zoomen (Rad, zwei Finger), Kuchenstueck per Gruppenname zuklappen. Punkte lassen sich im eigenen Stueck verschieben (Lage im Plan).
const short=(s,n=14)=>{ const t=String(s||""); return t.length>n?t.slice(0,n-1)+"…":t; };
const K_MIN=0.4, K_MAX=4;
// Zwei Zeilen fuer den Rezeptnamen im Kreis
const wrap2=(name,n=16)=>{ const w=String(name||"").split(" "); const a=[],b=[]; w.forEach(x=>{ if(!b.length&&(a.join(" ")+" "+x).trim().length<=n) a.push(x); else b.push(x); }); return [a.join(" "),short(b.join(" "),n)].filter(Boolean); };

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
  const manual=useMemo(()=>{ const out={}; const raw=(stockRaw&&stockRaw.layout)||{}; nodes.forEach(n=>{ const e=raw[goneKey(n.key)]; if(e&&Number.isFinite(e.t)&&Number.isFinite(e.r)) out[n.key]={t:e.t,r:e.r}; }); if(dragPos) out[dragPos.key]={t:dragPos.t,r:dragPos.r}; return out; },[nodes,stockRaw,dragPos]);
  const manualCount=Object.keys(manual).length-(dragPos&&!((stockRaw&&stockRaw.layout)||{})[goneKey(dragPos.key)]?1:0);
  const layout=useMemo(()=>radialLayout(nodes,collapsed,manual,dragPos?dragPos.key:""),[nodes,collapsed,manual,dragPos]);
  const {sectors,placed,rOut,rMax}=layout;
  const isCollapsed=(name)=>collapsed.has(name);
  const anchorOf=(key)=>{ const n=placed.find(x=>x.key===key); if(n) return n; const src=nodes.find(x=>x.key===key); const sec=src&&sectors.find(x=>x.name===src.group&&x.collapsed); return sec?{x:sec.x,y:sec.y,ang:sec.mid}:null; };
  const vbR=rOut+36+12;                                 // Band mit den Gruppennamen plus Rand
  const vb={x:-vbR,y:-vbR,w:2*vbR,h:2*vbR};

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
      const sec=sectors.find(x=>x.name===nd.group); if(!sec||sec.collapsed) return;
      const g=toGraph(cur.x,cur.y); const m=dragToManual(sec,g.x,g.y,rMax);
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
  },[vbR]);
  const tap=(fn)=>(e)=>{ if(dragRef.current){ dragRef.current=false; return; } fn(e); };

  const toggleSel=(key)=>{ setRecipeKey(""); setSelected(s=>{ const n=new Set(s); if(n.has(key)) n.delete(key); else n.add(key); return n; }); };
  const toggleCluster=(name)=>setCollapsed(s=>{ const n=new Set(s); if(n.has(name)) n.delete(name); else n.add(name); return n; });
  const pickRecipe=(key)=>{ setRecipeKey(k=>k===key?"":key); };
  const ensureKey=async(e)=>{ if(!e.basis) return e.key; setBusy(e.key); const k=await adoptClassic(e.classic); setBusy(""); return k; };
  const open=async(e)=>{ const k=await ensureKey(e); if(k) openRecipe(k); };
  const cook=async(e)=>{ const k=await ensureKey(e); if(k) startCooking(k); };
  const selNames=[...selected].map(k=>{ const n=nodes.find(x=>x.key===k); return n?n.name:k; });
  const cookFrom=()=>suggestRecipe({ingredients:selNames});

  if(!nodes.length){
    return(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"28px 18px",textAlign:"center"}}>
        <div style={{fontFamily:SER,fontSize:"22px",color:C.text,marginBottom:"8px"}}>Noch keine Punkte im Graph.</div>
        <div style={{fontSize:"14px",color:C.muted,lineHeight:"1.6",marginBottom:"16px"}}>Der Graph zeigt, was wahrscheinlich da ist – als Wolken je Gruppe. Fotografiere die Speisekammer oder trag in der Liste etwas ein.</div>
        <div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={onPhoto} style={{...btn("primary"),letterSpacing:"1.5px"}}>📷 SPEISEKAMMER FOTOGRAFIEREN</button>
          <button onClick={onList} style={btn("ghost")}>ZUR LISTE</button>
        </div>
      </div>
    );
  }
  const covText=links?links.present.length+" von "+(links.present.length+links.missing.length)+" Zutaten da":"";
  return(
  <div>
    {/* GRAPH */}
    <div data-theme="dark" style={{position:"relative",background:C.dark,border:"1px solid "+C.border,height:"min(62vh, 560px)",minHeight:"340px",overflow:"hidden"}}>
      <svg ref={svgRef} data-testid="vorrat-graph" viewBox={vb.x+" "+vb.y+" "+vb.w+" "+vb.h} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{display:"block",touchAction:"none",cursor:"grab",fontFamily:SF,userSelect:"none"}}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
        <g transform={"translate("+tf.x+" "+tf.y+") scale("+tf.k+")"}>
          {/* Kuchenstuecke */}
          {sectors.map(sec=>{
            // Gruppenname als Band am Aussenrand, tangential gedreht; in der unteren Haelfte umgedreht, damit er lesbar bleibt
            const deg=sec.mid*180/Math.PI, below=Math.sin(sec.mid)>0;
            const lx=Math.cos(sec.mid)*(rOut+18), ly=Math.sin(sec.mid)*(rOut+18);
            const rot=deg+(below?-90:90);
            const span=sec.a1-sec.a0, maxChars=Math.max(4,Math.floor(span*(rOut+18)/8.6));
            return(
              <g key={sec.name}>
                <path d={sectorPath(sec.a0,sec.a1,R_IN-14,rOut+36)} fill={sec.color} fillOpacity={sec.collapsed?0.05:0.11} stroke={C.dark} strokeWidth="3" />
                <path d={sectorPath(sec.a0,sec.a1,rOut,rOut+36)} fill={sec.color} fillOpacity="0.14" stroke="none" />
                <g role="button" aria-label={sec.collapsed?"Gruppe "+sec.name+" aufklappen":"Gruppe "+sec.name+" zuklappen"} onClick={tap(()=>toggleCluster(sec.name))} style={{cursor:"pointer"}}>
                  {sec.collapsed
                    ? <><circle cx={sec.x} cy={sec.y} r={sec.r} fill={C.white} stroke={sec.color} strokeWidth="1.5" /><text x={sec.x} y={sec.y-2} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.text}>{short(sec.name,16)}</text><text x={sec.x} y={sec.y+12} textAnchor="middle" fontSize="10" fill={C.muted}>{sec.n} {sec.n===1?"Produkt":"Produkte"} ▸</text></>
                    : null}
                  <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" transform={"rotate("+rot+" "+lx+" "+ly+")"} fontSize="13" fontWeight="700" letterSpacing="1.5" fill={sec.color}>{short(sec.name.toUpperCase()+(sec.collapsed?"":" ("+sec.n+")"),maxChars)}</text>
                  <path d={sectorPath(sec.a0,sec.a1,rOut,rOut+36)} fill="transparent" />
                </g>
              </g>
            );
          })}
          {/* Kanten des Rezepts: vom Rand des Rezeptkreises zu den Zutaten */}
          {links&&links.present.map(x=>{ const a=anchorOf(x.key); if(!a) return null; const ang=a.ang!==undefined?a.ang:Math.atan2(a.y,a.x); return <line key={"e"+x.key} data-edge="present" x1={Math.cos(ang)*R_CENTER} y1={Math.sin(ang)*R_CENTER} x2={a.x} y2={a.y} stroke={C.accent} strokeWidth={1.5+2.5*x.p} strokeOpacity="0.9" strokeLinecap="round" />; })}
          {/* Produkte */}
          {placed.map(n=>{
            const isSel=selected.has(n.key), isLinked=linked.has(n.key), dim=recipe&&!isLinked;
            const circ=2*Math.PI*(n.r+3), icon=foodIcon(n.name,n.group);
            return(
              <g key={n.key} role="button" aria-label={n.name+(isSel?" abwählen":" auswählen")} aria-pressed={isSel} data-manual={n.manual?"1":undefined} transform={"translate("+n.x+" "+n.y+")"} onPointerDown={onNodeDown(n)} onClick={tap(()=>toggleSel(n.key))} style={{cursor:"grab",opacity:dim?0.25:1,transition:dragPos&&dragPos.key===n.key?"none":"opacity 0.3s"}}>
                {(isSel||isLinked)&&<circle r={n.r+7} fill="none" stroke={isSel?C.text:C.accent} strokeWidth="2" />}
                <circle r={n.r} fill={C.accent} fillOpacity={0.25+0.55*n.p} stroke={n.permanent?C.text:"none"} strokeWidth={n.permanent?2:0} />
                {n.expiring&&<circle r={n.r+3} fill="none" stroke={C.err} strokeWidth="2.5" strokeDasharray={(circ*0.62)+" "+circ} transform="rotate(-90)" strokeLinecap="round" />}
                {icon?<text y="0.5" textAnchor="middle" dominantBaseline="central" fontSize={Math.round(n.r*1.5)} opacity={0.7+0.3*n.p} style={{pointerEvents:"none"}}>{icon}</text>
                     :<text y="0.5" textAnchor="middle" dominantBaseline="central" fontSize={Math.round(n.r*1.1)} fontFamily={SER} fill={C.dark} style={{pointerEvents:"none"}}>{String(n.name).charAt(0).toUpperCase()}</text>}
                <text y={n.r+13} textAnchor="middle" fontSize="11" fill={C.text} fillOpacity={0.55+0.45*n.p}>{short(n.name)}</text>
                <circle r={Math.max(n.r+8,18)} fill="transparent" />
              </g>
            );
          })}
          {/* Rezeptkreis in der Mitte */}
          <g role={recipe?"button":undefined} aria-label={recipe?"Rezept "+recipe.name+" öffnen":undefined} data-testid="graph-center" onClick={recipe?tap(()=>open(recipe)):undefined} style={{cursor:recipe?"pointer":"default"}}>
            <circle r={R_CENTER} fill={C.dark} stroke={recipe?C.accent:C.border} strokeWidth={recipe?2.5:1.5} />
            {recipe?(
              <>
                {wrap2(recipe.name).map((t,i,arr)=><text key={i} x="0" y={(arr.length===2?-16:-6)+i*19} textAnchor="middle" fontSize="15" fontFamily={SER} fill={C.text}>{t}</text>)}
                <text x="0" y="18" textAnchor="middle" fontSize="9.5" letterSpacing="1" fill={C.accent}>{covText.toUpperCase()}</text>
                {links.missing.length>0&&<text x="0" y="34" textAnchor="middle" fontSize="9.5" fill={C.muted}>{short("fehlt: "+links.missing.map(m=>m.name).join(", "),26)}</text>}
                {links.missing.length===0&&<text x="0" y="34" textAnchor="middle" fontSize="9.5" fill={C.ok}>alles da</text>}
                <text x="0" y="56" textAnchor="middle" fontSize="9" letterSpacing="1.5" fill={C.subtle}>ÖFFNEN ›</text>
              </>
            ):selected.size?(
              <>
                <text x="0" y="-4" textAnchor="middle" fontSize="22" fontFamily={SER} fill={C.text}>{selected.size}</text>
                <text x="0" y="16" textAnchor="middle" fontSize="10" letterSpacing="1" fill={C.accent}>AUSGEWÄHLT</text>
              </>
            ):(
              <>
                <text x="0" y="-4" textAnchor="middle" fontSize="22" fontFamily={SER} fill={C.text}>{nodes.length}</text>
                <text x="0" y="16" textAnchor="middle" fontSize="10" letterSpacing="1" fill={C.muted}>PRODUKTE</text>
                <text x="0" y="34" textAnchor="middle" fontSize="9" fill={C.subtle}>Rezept unten antippen</text>
              </>
            )}
          </g>
        </g>
      </svg>
      {/* Steuerung */}
      <div style={{position:"absolute",top:"8px",right:"8px",display:"flex",flexDirection:"column",gap:"4px"}}>
        {[["+","Vergrößern",()=>zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1.3)],["−","Verkleinern",()=>zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1/1.3)],["⊡","Einpassen",()=>setTf({x:0,y:0,k:1})],...(manualCount>0?[["↺","Anordnung zurücksetzen",()=>resetStockLayout()]]:[])].map(([t,a,f])=>(
          <button key={a} onClick={f} aria-label={a} title={a} style={{width:"36px",height:"36px",background:"rgba(42,42,50,0.9)",border:"1px solid "+C.border,color:C.text,fontSize:"18px",cursor:"pointer",fontFamily:SF,padding:0}}>{t}</button>
        ))}
      </div>
      <div style={{position:"absolute",left:"10px",bottom:"8px",fontSize:"10px",color:C.subtle,letterSpacing:"0.5px",pointerEvents:"none"}}>groß und hell = wahrscheinlich da · Ring = Dauervorrat · roter Bogen = kippt bald · Stück = Gruppe · Punkte lassen sich im Stück verschieben</div>
    </div>

    {/* LEISTE: Rezept oder Auswahl */}
    <div style={{background:C.white,border:"1px solid "+C.border,borderTop:"none",padding:"10px 12px",minHeight:"58px",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
      {recipe?(
        <>
          <div style={{flex:"1 1 160px",minWidth:0}}>
            <div style={{fontFamily:SER,fontSize:"17px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recipe.name}</div>
            <div style={{fontSize:"12px",color:C.muted}}>{covText}{links.missing.length?" · fehlt: "+links.missing.map(m=>m.name).join(", "):" · alles da"}{recipe.basis?" · Rezept-Basis":""}</div>
          </div>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={()=>open(recipe)} disabled={busy===recipe.key} style={{...btn("primary"),padding:"9px 12px"}}>{busy===recipe.key?"…":"ZUM REZEPT"}</button>
            <button onClick={()=>cook(recipe)} disabled={busy===recipe.key} style={{...btn("dark"),padding:"9px 12px"}}>KOCHMODUS</button>
            <button onClick={()=>setRecipeKey("")} aria-label="Rezept ausblenden" style={{...btn("ghost"),padding:"9px 12px"}}>×</button>
          </div>
        </>
      ):selected.size?(
        <>
          <div style={{flex:"1 1 160px",minWidth:0}}>
            <div style={{fontSize:"15px",color:C.text}}><b>{selected.size} ausgewählt</b></div>
            <div style={{fontSize:"12px",color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selNames.join(", ")}</div>
          </div>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={cookFrom} disabled={aiBusy} style={{...btn("primary"),padding:"9px 12px",background:aiBusy?C.subtle:C.accent}}>{aiBusy?"KI SUCHT…":"DARAUS KOCHEN (KI)"}</button>
            <button onClick={()=>setSelected(new Set())} aria-label="Auswahl aufheben" style={{...btn("ghost"),padding:"9px 12px"}}>×</button>
          </div>
        </>
      ):(
        <div style={{fontSize:"12px",color:C.muted,lineHeight:"1.5"}}>Punkte antippen und <b style={{color:C.text}}>daraus kochen</b> lassen – oder unten ein Rezept antippen, dann zeigt der Graph seine Zutaten. Gruppenname antippen klappt die Wolke zu.</div>
      )}
      {aiErr&&!recipe&&selected.size>0&&<div style={{flexBasis:"100%",fontSize:"12px",color:C.err}}>{aiErr}</div>}
    </div>

    {/* REZEPTE ZUR AUSWAHL / NACH ABDECKUNG */}
    <div style={{marginTop:"12px"}}>
      <div style={{...label,marginBottom:"6px"}}>{selected.size?"Rezepte mit der Auswahl ("+ranked.length+")":"Rezepte nach Vorrat"}</div>
      {ranked.length===0&&<div style={{fontSize:"13px",color:C.muted,padding:"6px 2px"}}>Kein Rezept verwendet die Auswahl – „Daraus kochen“ fragt die KI nach einem bekannten Gericht.</div>}
      <div style={{display:"flex",gap:"6px",overflowX:"auto",paddingBottom:"6px",WebkitOverflowScrolling:"touch"}}>
        {ranked.slice(0,16).map(e=>{
          const on=e.key===recipeKey;
          const meta=selected.size?e.hits+" von "+e.of:Math.round(e.cov*100)+" %";
          return <button key={e.key} onClick={()=>pickRecipe(e.key)} aria-pressed={on} style={{...chip(on),flexShrink:0,padding:"8px 11px",fontSize:"12px",fontWeight:on?"700":"400",color:on?C.accent:C.text,display:"flex",gap:"6px",alignItems:"center"}}><span>{short(e.name,24)}</span><span style={{color:on?C.accent:C.muted,fontSize:"11px"}}>{meta}</span></button>;
        })}
      </div>
    </div>
  </div>
  );
}
