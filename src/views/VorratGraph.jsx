import { useEffect, useMemo, useRef, useState } from "react";
import { C, SF, SER, micro as label, btn, chip } from "../theme.js";
import { recName, recKey, normalizeRecipe } from "../logic/recipes.js";
import { graphNodes, clusterList, clusterCenters, createSim, clusterHull, boundsOf, recipeLinks, missingPositions, rankForSelection } from "../logic/graph.js";

// GRAPH DES VORRATS - Wolken je Gruppe, Produkte als Punkte (Groesse und Helligkeit = Wahrscheinlichkeit, Ring = Dauervorrat,
// roter Bogen = kippt bald). Rezept antippen: Karte in der Mitte, Kanten zu vorhandenen Zutaten, fehlende haengen grau darunter.
// Punkte antippen = Auswahl -> "Daraus kochen" (KI) und passende Rezepte. Schieben, Zoomen (Rad, zwei Finger), Wolke zuklappen.
const short=(s,n=14)=>{ const t=String(s||""); return t.length>n?t.slice(0,n-1)+"…":t; };
const CARD_W=184, CARD_H=58;
const K_MIN=0.4, K_MAX=4;

export default function VorratGraph({state,api,onPhoto,onList}){
  const {stock,recipes,classics,aiBusy,aiErr}=state;
  const {openRecipe,startCooking,adoptClassic,suggestRecipe}=api;
  const nodes=useMemo(()=>graphNodes(stock),[stock]);
  const clusters=useMemo(()=>clusterList(nodes),[nodes]);
  const centers=useMemo(()=>clusterCenters(clusters),[clusters]);
  const sig=nodes.map(n=>n.key+":"+n.group).join("|");
  const [pos,setPos]=useState({});                     // key -> {x,y} aus der Simulation
  const [tf,setTf]=useState({x:0,y:0,k:1});           // Schieben/Zoomen (in Einheiten des Sichtfensters)
  const [collapsed,setCollapsed]=useState(()=>new Set());
  const [selected,setSelected]=useState(()=>new Set());
  const [recipeKey,setRecipeKey]=useState("");
  const [busy,setBusy]=useState("");
  const svgRef=useRef(null), simRef=useRef(null), ptrs=useRef(new Map()), dragRef=useRef(false), pinchRef=useRef(null);

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

  // SIMULATION: neu aufbauen, wenn sich die Menge der Punkte aendert; laeuft ein paar Dutzend Bilder, dann Ruhe
  useEffect(()=>{
    if(!nodes.length){ simRef.current=null; setPos({}); return; }
    const sim=createSim(nodes,centers); simRef.current=sim;
    let raf=0, stop=false;
    const frame=()=>{
      if(stop) return;
      let e=0; for(let i=0;i<3;i++) e=sim.tick();
      const next={}; sim.nodes.forEach(n=>{ next[n.key]={x:n.x,y:n.y}; }); setPos(next);
      if(e>0.5&&sim.ticks<240) raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
    return ()=>{ stop=true; cancelAnimationFrame(raf); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sig]);
  // Auswahl und Rezept bereinigen, wenn Punkte verschwinden
  useEffect(()=>{ setSelected(s=>{ const n=new Set([...s].filter(k=>nodes.some(x=>x.key===k))); return n.size===s.size?s:n; }); },[sig]);   // eslint-disable-line react-hooks/exhaustive-deps

  const placed=nodes.map(n=>({...n,...(pos[n.key]||centers[n.group]||{x:0,y:0})}));
  const hulls=clusters.map(c=>({c,h:clusterHull(placed,c,centers[c.name]||{x:0,y:0})}));
  const isCollapsed=(name)=>collapsed.has(name);
  const anchorOf=(key)=>{ const n=placed.find(x=>x.key===key); if(!n) return null; if(isCollapsed(n.group)){ const hh=hulls.find(x=>x.c.name===n.group); return hh?{x:hh.h.x,y:hh.h.y,r:28}:null; } return n; };
  const miss=links?missingPositions(links.missing.length,0,0,CARD_H/2+96):[];
  const circles=[...hulls.map(x=>x.h),...(recipe?[{x:0,y:0,r:CARD_W/2+10},...miss.map(m=>({x:m.x,y:m.y,r:40}))]:[])];
  const vb=boundsOf(circles,28);

  // SCHIEBEN UND ZOOMEN (Zeiger: ein Finger schiebt, zwei zoomen; Mausrad zoomt um den Zeiger)
  const toWorld=(px,py)=>{ const r=svgRef.current.getBoundingClientRect(); const s=vb.w/r.width, s2=vb.h/r.height, sc=Math.max(s,s2); const ox=vb.x-(r.width*sc-vb.w)/2, oy=vb.y-(r.height*sc-vb.h)/2; return {x:(px-r.left)*sc+ox,y:(py-r.top)*sc+oy,sc}; };
  const zoomAt=(mx,my,factor)=>setTf(t=>{ const k=Math.max(K_MIN,Math.min(K_MAX,t.k*factor)); const wx=(mx-t.x)/t.k, wy=(my-t.y)/t.k; return {k,x:mx-wx*k,y:my-wy*k}; });
  const onDown=(e)=>{ ptrs.current.set(e.pointerId,{x:e.clientX,y:e.clientY}); dragRef.current=false; if(ptrs.current.size===2){ const [a,b]=[...ptrs.current.values()]; pinchRef.current=Math.hypot(a.x-b.x,a.y-b.y); } };
  const onMove=(e)=>{
    const prev=ptrs.current.get(e.pointerId); if(!prev) return;
    const cur={x:e.clientX,y:e.clientY}; ptrs.current.set(e.pointerId,cur);
    if(ptrs.current.size===1){
      const dx=cur.x-prev.x, dy=cur.y-prev.y;
      if(Math.abs(dx)+Math.abs(dy)>0){ if(Math.hypot(dx,dy)>3) dragRef.current=true; const {sc}=toWorld(cur.x,cur.y); setTf(t=>({...t,x:t.x+dx*sc,y:t.y+dy*sc})); }
    }else if(ptrs.current.size===2){
      const [a,b]=[...ptrs.current.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinchRef.current&&d>0){ const m=toWorld((a.x+b.x)/2,(a.y+b.y)/2); zoomAt(m.x,m.y,d/pinchRef.current); dragRef.current=true; }
      pinchRef.current=d;
    }
  };
  const onUp=(e)=>{ ptrs.current.delete(e.pointerId); if(ptrs.current.size<2) pinchRef.current=null; };
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
    <div style={{position:"relative",background:C.dark,border:"1px solid "+C.border,height:"min(62vh, 560px)",minHeight:"340px",overflow:"hidden"}}>
      <svg ref={svgRef} data-testid="vorrat-graph" viewBox={vb.x+" "+vb.y+" "+vb.w+" "+vb.h} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{display:"block",touchAction:"none",cursor:"grab",fontFamily:SF,userSelect:"none"}}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
        <defs>
          <radialGradient id="wolke"><stop offset="0%" stopColor={C.accent} stopOpacity="0.14" /><stop offset="100%" stopColor={C.accent} stopOpacity="0.03" /></radialGradient>
        </defs>
        <g transform={"translate("+tf.x+" "+tf.y+") scale("+tf.k+")"}>
          {/* Wolken */}
          {hulls.map(({c,h})=>{
            const col=isCollapsed(c.name);
            const r=col?26+4*Math.sqrt(c.n):h.r;
            return(
              <g key={c.name}>
                <circle cx={h.x} cy={h.y} r={r} fill={col?C.white:"url(#wolke)"} stroke={col?C.accent:C.border} strokeWidth={col?1.5:1} strokeDasharray={col?"":"3 4"} />
                <g role="button" aria-label={col?"Gruppe "+c.name+" aufklappen":"Gruppe "+c.name+" zuklappen"} onClick={tap(()=>toggleCluster(c.name))} style={{cursor:"pointer"}}>
                  {col
                    ? <><text x={h.x} y={h.y-2} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.text} letterSpacing="1">{short(c.name,16)}</text><text x={h.x} y={h.y+12} textAnchor="middle" fontSize="10" fill={C.muted}>{c.n} {c.n===1?"Produkt":"Produkte"} ▸</text><circle cx={h.x} cy={h.y} r={r} fill="transparent" /></>
                    : <><rect x={h.x-60} y={h.y-r-2} width="120" height="22" fill="transparent" /><text x={h.x} y={h.y-r+13} textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="2" fill={C.muted}>{c.name.toUpperCase()}</text></>}
                </g>
              </g>
            );
          })}
          {/* Kanten des Rezepts */}
          {links&&links.present.map(x=>{ const a=anchorOf(x.key); if(!a) return null; return <line key={"e"+x.key} data-edge="present" x1="0" y1="0" x2={a.x} y2={a.y} stroke={C.accent} strokeWidth={1.5+2.5*x.p} strokeOpacity="0.85" strokeLinecap="round" />; })}
          {links&&miss.map((m,i)=>(<g key={"m"+i} data-edge="missing"><line x1="0" y1="0" x2={m.x} y2={m.y} stroke={C.subtle} strokeWidth="1.2" strokeDasharray="4 4" /><circle cx={m.x} cy={m.y} r="9" fill={C.dark} stroke={C.subtle} strokeWidth="1.5" /><text x={m.x} y={m.y+22} textAnchor="middle" fontSize="10" fill={C.muted}>{short(links.missing[i].name)}</text></g>))}
          {/* Produkte */}
          {placed.filter(n=>!isCollapsed(n.group)).map(n=>{
            const isSel=selected.has(n.key), isLinked=linked.has(n.key), dim=recipe&&!isLinked;
            const circ=2*Math.PI*(n.r+3);
            return(
              <g key={n.key} role="button" aria-label={n.name+(isSel?" abwählen":" auswählen")} aria-pressed={isSel} transform={"translate("+n.x+" "+n.y+")"} onClick={tap(()=>toggleSel(n.key))} style={{cursor:"pointer",opacity:dim?0.22:1,transition:"opacity 0.3s"}}>
                {(isSel||isLinked)&&<circle r={n.r+6} fill="none" stroke={isSel?C.text:C.accent} strokeWidth="2" />}
                <circle r={n.r} fill={C.accent} fillOpacity={0.3+0.7*n.p} stroke={n.permanent?C.text:"none"} strokeWidth={n.permanent?2:0} />
                {n.expiring&&<circle r={n.r+3} fill="none" stroke={C.err} strokeWidth="2.5" strokeDasharray={(circ*0.62)+" "+circ} transform="rotate(-90)" strokeLinecap="round" />}
                <text y={n.r+13} textAnchor="middle" fontSize="11" fill={C.text} fillOpacity={0.5+0.5*n.p}>{short(n.name)}</text>
                <circle r={Math.max(n.r+8,16)} fill="transparent" />
              </g>
            );
          })}
          {/* Rezept in der Mitte */}
          {recipe&&(
            <g role="button" aria-label={"Rezept "+recipe.name+" öffnen"} onClick={tap(()=>open(recipe))} style={{cursor:"pointer"}}>
              <rect x={-CARD_W/2} y={-CARD_H/2} width={CARD_W} height={CARD_H} rx="6" fill={C.dark} stroke={C.accent} strokeWidth="2" />
              <text x="0" y="-6" textAnchor="middle" fontSize="15" fontFamily={SER} fill={C.text}>{short(recipe.name,22)}</text>
              <text x="0" y="14" textAnchor="middle" fontSize="10" letterSpacing="1" fill={C.accent}>{covText.toUpperCase()}</text>
            </g>
          )}
        </g>
      </svg>
      {/* Steuerung */}
      <div style={{position:"absolute",top:"8px",right:"8px",display:"flex",flexDirection:"column",gap:"4px"}}>
        {[["+","Vergrößern",()=>zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1.3)],["−","Verkleinern",()=>zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1/1.3)],["⊡","Einpassen",()=>setTf({x:0,y:0,k:1})]].map(([t,a,f])=>(
          <button key={a} onClick={f} aria-label={a} title={a} style={{width:"36px",height:"36px",background:"rgba(42,42,50,0.9)",border:"1px solid "+C.border,color:C.text,fontSize:"18px",cursor:"pointer",fontFamily:SF,padding:0}}>{t}</button>
        ))}
      </div>
      <div style={{position:"absolute",left:"10px",bottom:"8px",fontSize:"10px",color:C.subtle,letterSpacing:"0.5px",pointerEvents:"none"}}>groß und hell = wahrscheinlich da · Ring = Dauervorrat · roter Bogen = kippt bald</div>
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
