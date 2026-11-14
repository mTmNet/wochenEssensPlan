// GRAPH DES VORRATS - Produkte als Punkte in Wolken je Gruppe, Rezepte als Knoten mit Kanten zu ihren Zutaten.
// Reine Funktionen und eine kleine, deterministische Kraeftesimulation (kein Zufall: Startlagen aus einem Hash des Schluessels).
import { STOCK_GROUPS, STOCK_MIN, guessGroup, ingStatus } from "./stock.js";
import { fold } from "./ingredients.js";
import { hash01 } from "./suggest.js";

// Gruppe einer Vorratsposition: Gruppenname aus Hand/Foto, sonst Haushaltsbuch-Unterrubrik erkennen, sonst aus dem Namen raten
const SUB_HINTS = [["Obst",["obst","fruecht"]],["Gemüse",["gemuese","salat"]],["Fleisch",["fleisch","gefluegel"]],["Wurst",["wurst","aufschnitt"]],["Fisch",["fisch","meeresfr"]],["Brot & Backwaren",["brot","backwar","baeck"]],["Milchprodukte",["milch","molkerei","eier"]],["Käse",["kaese"]],["Getränke",["getraenk","trinken"]],["Süßes",["suess","schoko","snack"]],["Tiefkühl",["tiefkuehl","tk","gefr"]],["Konserven",["konserv","dose"]],["Trockenwaren",["trocken","nudel","reis","muesli"]]];
export const groupOf = (item) => {
  const sub = (item && item.sub) || "";
  if(STOCK_GROUPS.includes(sub)) return sub;
  const f = fold(sub);
  if(f){ for(const [g,keys] of SUB_HINTS) if(keys.some(k=>f.includes(k))) return g; }
  return guessGroup((item && item.name) || "");
};

// Radius eines Produktpunkts (Weltkoordinaten): klein bei geringer Wahrscheinlichkeit, gross bei hoher
export const nodeRadius = (p) => 7 + 9*Math.max(0,Math.min(1,p||0));
// Laeuft bald aus (roter Bogen): hoechstens 2 Tage, kein Dauervorrat
export const isExpiring = (s) => !s.permanent && Number.isFinite(s.left) && s.left<=2;

// Knoten aus dem Vorrat: sichtbar sind Dauervorrat und alles ab STOCK_MIN; Reihenfolge wie STOCK_GROUPS, Rest alphabetisch
export const graphNodes = (stock) => (stock||[])
  .filter(s=>s&&(s.permanent||s.p>=STOCK_MIN))
  .map(s=>({key:s.key,name:s.name,p:s.permanent?1:s.p,r:nodeRadius(s.permanent?1:s.p),group:groupOf(s),permanent:!!s.permanent,expiring:isExpiring(s),left:s.left,toks:s.toks}));

const groupOrder = (g) => { const i=STOCK_GROUPS.indexOf(g); return i<0?STOCK_GROUPS.length:i; };
// Wolken: [{name, keys:[...], n}] in fester Reihenfolge
export const clusterList = (nodes) => {
  const by={};
  nodes.forEach(n=>{ (by[n.group]=by[n.group]||[]).push(n.key); });
  return Object.keys(by).sort((a,b)=>groupOrder(a)-groupOrder(b)||a.localeCompare(b)).map(name=>({name,keys:by[name],n:by[name].length}));
};
// Platzbedarf einer Wolke (Radius) nach Anzahl der Punkte - Punkte brauchen Platz fuer ihre Beschriftung
export const clusterRadius = (n) => 40 + 32*Math.sqrt(Math.max(1,n));
// Mittelpunkte der Wolken auf einem Ring um die Mitte (die Mitte bleibt fuer das Rezept frei); eine Wolke liegt in der Mitte
export const clusterCenters = (clusters) => {
  const k=clusters.length;
  if(!k) return {};
  if(k===1) return {[clusters[0].name]:{x:0,y:0}};
  const radii=clusters.map(c=>clusterRadius(c.n));
  const need=radii.reduce((a,r)=>a+2*r+30,0);
  const R=Math.max(170, need/(2*Math.PI), Math.max(...radii)+120);
  const out={};
  // Winkel proportional zum Platzbedarf, damit grosse Wolken mehr Bogen bekommen
  let ang=-Math.PI/2;
  clusters.forEach((c,i)=>{
    const span=(2*radii[i]+30)/need*2*Math.PI;
    const a=ang+span/2;
    out[c.name]={x:Math.round(Math.cos(a)*R),y:Math.round(Math.sin(a)*R)};
    ang+=span;
  });
  return out;
};

// SIMULATION: Zustand {nodes:[{key,x,y,vx,vy,r,group}], centers:{group:{x,y}}}; tick() bewegt einen Schritt und liefert die Restbewegung
export const createSim = (nodes, centers) => {
  const list=nodes.map(n=>{
    const c=centers[n.group]||{x:0,y:0};
    const a=hash01(n.key+"a")*2*Math.PI, d=8+hash01(n.key+"d")*clusterRadius(1);
    return {...n,x:c.x+Math.cos(a)*d,y:c.y+Math.sin(a)*d,vx:0,vy:0};
  });
  const sim={nodes:list,centers,ticks:0};
  sim.tick=()=>{
    const ns=sim.nodes; let energy=0;
    for(let i=0;i<ns.length;i++){
      const a=ns[i], c=centers[a.group]||{x:0,y:0};
      a.vx+=(c.x-a.x)*0.06; a.vy+=(c.y-a.y)*0.06;             // Zug zur Wolkenmitte
      for(let j=i+1;j<ns.length;j++){
        const b=ns[j];
        let dx=b.x-a.x, dy=b.y-a.y; let d=Math.hypot(dx,dy);
        if(d<0.01){ dx=hash01(a.key+b.key)-0.5; dy=0.5-hash01(b.key+a.key); d=Math.hypot(dx,dy); }
        const same=a.group===b.group;
        // Beschriftungen sind breit und haengen unter dem Punkt: seitlich zaehlt der Abstand nur halb, so ruecken Nachbarn eher nebeneinander als uebereinander
        const de=Math.hypot(dx*0.5,dy);
        const min=a.r+b.r+(same?26:46);                          // Abstand inkl. Beschriftung; fremde Wolken halten mehr Abstand
        if(de<min){ const f=(min-de)/d*0.5; a.vx-=dx*f; a.vy-=dy*f; b.vx+=dx*f; b.vy+=dy*f; }
      }
    }
    ns.forEach(n=>{ n.vx*=0.55; n.vy*=0.55; n.x+=n.vx; n.y+=n.vy; energy+=Math.abs(n.vx)+Math.abs(n.vy); });
    sim.ticks++;
    return energy;
  };
  return sim;
};
// Simulation bis zur Ruhe laufen lassen (fuer Tests und den ersten Aufbau)
export const settle = (sim, maxTicks=200) => { let e=Infinity; while(sim.ticks<maxTicks&&e>0.5){ e=sim.tick(); } return sim; };

// Huelle einer Wolke: Kreis um die Mitte ihrer Punkte, Radius bis zum fernsten Punkt plus Rand
export const clusterHull = (nodes, cluster, center) => {
  const pts=nodes.filter(n=>n.group===cluster.name);
  if(!pts.length) return {x:center.x,y:center.y,r:clusterRadius(1)};
  const cx=pts.reduce((a,n)=>a+n.x,0)/pts.length, cy=pts.reduce((a,n)=>a+n.y,0)/pts.length;
  const r=pts.reduce((m,n)=>Math.max(m,Math.hypot(n.x-cx,n.y-cy)+n.r),0)+30;
  return {x:cx,y:cy,r:Math.max(r,clusterRadius(1))};
};
// Sichtfenster um alle Kreise mit Rand
export const boundsOf = (circles, pad=24) => {
  if(!circles.length) return {x:-200,y:-200,w:400,h:400};
  const x0=Math.min(...circles.map(c=>c.x-c.r))-pad, y0=Math.min(...circles.map(c=>c.y-c.r))-pad;
  const x1=Math.max(...circles.map(c=>c.x+c.r))+pad, y1=Math.max(...circles.map(c=>c.y+c.r))+pad;
  return {x:x0,y:y0,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0)};
};

// REZEPT IM GRAPH: Zutaten -> vorhandene Knoten (Kanten) und fehlende Zutaten (graue, hohle Kreise am Rezept)
export const recipeLinks = (rec, stock) => {
  const present=[], missing=[], seen=new Set();
  ((rec&&rec.ingredients)||[]).forEach(ing=>{
    const st=ingStatus(ing,stock||[]); if(!st||st.basic) return;
    if(st.p>=STOCK_MIN&&st.key){ if(!seen.has(st.key)){ seen.add(st.key); present.push({key:st.key,name:st.name,p:st.p}); } }
    else if(!seen.has("miss:"+fold(st.name))){ seen.add("miss:"+fold(st.name)); missing.push({name:st.name,p:st.p}); }
  });
  const total=present.length+missing.length;
  return {present,missing,cov:total?present.reduce((a,x)=>a+x.p,0)/total:0};
};
// Lage der fehlenden Zutaten: Faecher unter dem Rezeptknoten
export const missingPositions = (n, cx, cy, radius=110) => {
  const out=[];
  for(let i=0;i<n;i++){ const t=n===1?0.5:i/(n-1); const a=Math.PI*0.25+t*Math.PI*0.5; out.push({x:cx+Math.cos(a)*radius,y:cy+Math.sin(a)*radius}); }
  return out;
};

// REZEPTE ZUR AUSWAHL: pool [{key,rec,basis,...}] nach Treffern mit den gewaehlten Knoten (selected = Set von stock-keys) sortieren.
// Ohne Auswahl zaehlt die Abdeckung; mit Auswahl zuerst, wer die meisten gewaehlten Produkte verwendet. Liefert [{...entry, hits, of, cov}]
export const rankForSelection = (pool, stock, selected) => {
  const sel=selected instanceof Set?selected:new Set(selected||[]);
  return (pool||[]).map(e=>{
    const links=recipeLinks(e.rec,stock);
    const hits=links.present.filter(x=>sel.has(x.key)).length;
    return {...e,hits,of:sel.size,cov:links.cov,present:links.present.length,total:links.present.length+links.missing.length};
  }).filter(e=>sel.size===0||e.hits>0)
    .sort((a,b)=>b.hits-a.hits||b.cov-a.cov||(b.rec.rating||0)-(a.rec.rating||0)||String(a.key).localeCompare(String(b.key)));
};
