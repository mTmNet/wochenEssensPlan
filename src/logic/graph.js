// GRAPH DES VORRATS - Produkte als Punkte in Wolken je Gruppe, Rezepte als Knoten mit Kanten zu ihren Zutaten.
// Reine Funktionen und eine kleine, deterministische Kraeftesimulation (kein Zufall: Startlagen aus einem Hash des Schluessels).
import { STOCK_GROUPS, STOCK_MIN, guessGroup, ingStatus } from "./stock.js";
import { fold } from "./ingredients.js";

// Gruppe einer Vorratsposition: Gruppenname aus Hand/Foto, sonst Haushaltsbuch-Unterrubrik erkennen, sonst aus dem Namen raten
const SUB_HINTS = [["Obst",["obst","fruecht"]],["Gemüse",["gemuese","salat"]],["Fleisch",["fleisch","gefluegel"]],["Wurst",["wurst","aufschnitt"]],["Fisch",["fisch","meeresfr"]],["Brot & Backwaren",["brot","backwar","baeck"]],["Milchprodukte",["milch","molkerei","eier"]],["Käse",["kaese"]],["Getränke",["getraenk","trinken"]],["Süßes",["suess","schoko","snack"]],["Tiefkühl",["tiefkuehl","tk","gefr"]],["Konserven",["konserv","dose"]],["Trockenwaren",["trocken","nudel","reis","muesli"]]];
// Reihenfolge: Gruppenname aus Hand/Foto -> aus dem Produktnamen (Brokkoli ist Gemuese, auch wenn die Buchrubrik "Obst & Gemuese" heisst)
// -> Buchrubrik erkennen -> Sonstiges
export const groupOf = (item) => {
  const sub = (item && item.sub) || "";
  if(STOCK_GROUPS.includes(sub)) return sub;
  const byName = guessGroup((item && item.name) || "");
  if(byName!=="Sonstiges") return byName;
  const f = fold(sub);
  if(f){ for(const [g,keys] of SUB_HINTS) if(keys.some(k=>f.includes(k))) return g; }
  return "Sonstiges";
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
// FARBAKZENT je Gruppe (leichter Hintergrund des Kuchenstuecks)
export const GROUP_COLORS = {"Obst":"#E8A33D","Gemüse":"#6DBB5A","Fleisch":"#D9534F","Wurst":"#D98FA3","Fisch":"#4F8FD9","Brot & Backwaren":"#C9A46A","Milchprodukte":"#8FC7E8","Käse":"#E8D44D","Getränke":"#4FC9B8","Süßes":"#B57BD9","Tiefkühl":"#7FD8F0","Konserven":"#A8927A","Trockenwaren":"#D4B483","Sonstiges":"#9A9898"};
export const groupColor = (name) => GROUP_COLORS[name] || GROUP_COLORS.Sonstiges;

// RADIALES LAYOUT: Rezeptkreis in der Mitte, drumherum je Gruppe ein Kuchenstueck (Winkel nach Anzahl, +1 Grundgewicht,
// damit kleine Gruppen Platz behalten). Die Punkte liegen auf Ringen im Stueck, die wahrscheinlichsten innen. Kein Zufall, keine Simulation.
export const R_CENTER = 80;            // Rezeptkreis
export const R_IN = 158;               // innerer Rand der Kuchenstuecke
const ROW = 66, ARC = 96;              // Abstand der Ringe / nebeneinander (Platz fuer die Beschriftung)
// manual = {key: {t, r}}: von Hand verschobene Punkte; t = Anteil im Stueck (0..1), r = Abstand von der Mitte. Sie bleiben, wo sie sind,
// die uebrigen Punkte fuellen die Ringe automatisch. rAuto = Aussenrand ohne Hand-Lagen (Grenze fuers Ziehen: eine halbe Reihe weiter).
export const radialLayout = (nodes, collapsed, manual, fixedKey) => {
  const col = collapsed instanceof Set ? collapsed : new Set(collapsed||[]);
  const man = manual||{};
  const clusters = clusterList(nodes);
  const weights = clusters.map(c=>col.has(c.name)?1.3:c.n+1);
  const total = weights.reduce((a,b)=>a+b,0)||1;
  const sectors=[], placed=[];
  let a=-Math.PI/2, rOut=R_IN+ROW, rMan=0;
  clusters.forEach((c,i)=>{
    const span=weights[i]/total*2*Math.PI;
    const sec={name:c.name,n:c.n,a0:a,a1:a+span,mid:a+span/2,color:groupColor(c.name),collapsed:col.has(c.name)};
    const all=nodes.filter(n=>n.group===c.name).sort((x,y)=>y.p-x.p||x.name.localeCompare(y.name));
    if(sec.collapsed){
      const r=R_IN+ROW*0.75; sec.x=Math.cos(sec.mid)*r; sec.y=Math.sin(sec.mid)*r; sec.r=24+4*Math.sqrt(c.n);
      rOut=Math.max(rOut,r+sec.r+24);
    }else{
      const members=all.filter(n=>!isManual(man[n.key]));
      all.filter(n=>isManual(man[n.key])).forEach(n=>{
        const m=man[n.key], t=Math.max(0,Math.min(1,m.t)), r=Math.max(R_IN+ROW*0.3,m.r), ang=sec.a0+span*t;
        placed.push({...n,x:Math.cos(ang)*r,y:Math.sin(ang)*r,ang,ring:-1,manual:true});
        rMan=Math.max(rMan,r+ROW*0.62);
      });
      let k=0, idx=0;
      while(idx<members.length){
        const r=R_IN+ROW*0.62+k*ROW;
        const m=Math.max(1,Math.min(members.length-idx,Math.floor(span*r/ARC)));
        for(let j=0;j<m;j++){ const n=members[idx++]; const ang=sec.a0+span*(j+0.5)/m; placed.push({...n,x:Math.cos(ang)*r,y:Math.sin(ang)*r,ang,ring:k}); }
        rOut=Math.max(rOut,r+ROW*0.62); k++;
      }
    }
    sectors.push(sec); a+=span;
  });
  const rAuto=Math.round(rOut), rMax=rAuto+ROW*0.5;
  relax(placed,sectors,fixedKey,rMax);
  const rAll=placed.reduce((m,n)=>Math.max(m,Math.hypot(n.x,n.y)+ROW*0.62),rOut);
  return {sectors,placed,rOut:Math.round(Math.max(rAll,rMan)),rAuto,rMax};
};
// ABSTOSSUNG (wie im Obsidian-Graph, nur ohne Dauerlauf): Punkte desselben Stuecks, die sich samt Beschriftung ueberlappen, schieben sich
// auseinander; der gerade gezogene Punkt (fixedKey) bleibt liegen, Hand-Lagen weichen halb so weit wie automatische. Jeder Punkt bleibt in
// seinem Stueck (Winkel mit Rand, Abstand zwischen innerem Rand und rMax). Fester Ablauf, kein Zufall.
const GAP = 22;
const relax = (placed, sectors, fixedKey, rMax) => {
  const secOf={}; sectors.forEach(s=>{ secOf[s.name]=s; });
  const w=(n)=>n.key===fixedKey?0:(n.manual?0.5:1);
  for(let it=0; it<40; it++){
    let moved=0;
    for(let i=0;i<placed.length;i++) for(let j=i+1;j<placed.length;j++){
      const a=placed[i], b=placed[j]; if(a.group!==b.group) continue;
      const wa=w(a), wb=w(b); if(!(wa+wb)) continue;
      let dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy);
      if(d<0.01){ dx=0.7; dy=0.7; d=Math.hypot(dx,dy); }
      const min=a.r+b.r+GAP; if(d>=min) continue;
      const push=(min-d)/(wa+wb), ux=dx/d, uy=dy/d;
      a.x-=ux*push*wa; a.y-=uy*push*wa; b.x+=ux*push*wb; b.y+=uy*push*wb; moved++;
    }
    if(!moved) break;
    placed.forEach(n=>{ if(n.key===fixedKey) return; const sec=secOf[n.group]; if(!sec) return; const m=dragToManual(sec,n.x,n.y,rMax); const ang=sec.a0+(sec.a1-sec.a0)*m.t; n.x=Math.cos(ang)*m.r; n.y=Math.sin(ang)*m.r; n.ang=ang; });
  }
};
const isManual = (m) => !!m && Number.isFinite(m.t) && Number.isFinite(m.r);
// Zielpunkt (x,y) beim Ziehen -> Hand-Lage {t,r} im eigenen Stueck, am Rand abgefangen (Rand bleibt Rand, nie ein anderes Stueck)
export const dragToManual = (sec, x, y, rMax) => {
  const span=sec.a1-sec.a0;
  let rel=((Math.atan2(y,x)-sec.a0)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  if(rel>span) rel = (rel-span < 2*Math.PI-rel) ? span : 0;        // ausserhalb: naechste Kante
  const t=Math.max(0.06,Math.min(0.94,span>0?rel/span:0.5));
  const r=Math.max(R_IN+ROW*0.3,Math.min(rMax||Infinity,Math.hypot(x,y)));
  return {t:Math.round(t*1000)/1000,r:Math.round(r)};
};
// SVG-Pfad eines Kuchenstuecks (Ringsegment) von r0 bis r1 zwischen den Winkeln a0 und a1; ein einziges Stueck = voller Ring
export const sectorPath = (a0, a1, r0, r1) => {
  const span=a1-a0;
  const P=(r,a)=>Math.cos(a)*r+" "+Math.sin(a)*r;
  if(span>=2*Math.PI-1e-6) return "M "+(r1)+" 0 A "+r1+" "+r1+" 0 1 1 "+(-r1)+" 0 A "+r1+" "+r1+" 0 1 1 "+r1+" 0 Z M "+(r0)+" 0 A "+r0+" "+r0+" 0 1 0 "+(-r0)+" 0 A "+r0+" "+r0+" 0 1 0 "+r0+" 0 Z";
  const big=span>Math.PI?1:0;
  return "M "+P(r0,a0)+" L "+P(r1,a0)+" A "+r1+" "+r1+" 0 "+big+" 1 "+P(r1,a1)+" L "+P(r0,a1)+" A "+r0+" "+r0+" 0 "+big+" 0 "+P(r0,a0)+" Z";
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

// NETZ: je Gruppe ein Mittelpunkt, die Produkte sammeln sich als lockerer Haufen darum (feine Linie zum Mittelpunkt).
// Die Mittelpunkte ruecken hochkant um die Mitte zusammen, grosse Gruppen bekommen mehr Platz. Die Mitte bleibt frei
// fuer das gewaehlte Rezept. Fester Ablauf ohne Zufall: Startlagen aus der Reihenfolge, danach schieben sich ueberlappende Punkte
// (samt Beschriftung, deshalb breiter als hoch) auseinander.
// manual = {key: {t, r}}: von Hand verschobene Punkte; t = Richtung um den eigenen Mittelpunkt (0..1 = voller Kreis), r = Abstand dazu.
// Lagen aus dem frueheren Kuchen-Graph (r ab 178, dort Abstand von der Mitte) gelten nicht und werden uebergangen.
export const NET_R_MIN = 16, NET_R_MAX = 120;
export const isNetManual = (m) => !!m && Number.isFinite(m.t) && Number.isFinite(m.r) && m.r<=NET_R_MAX+10;
export const netNodeRadius = (p) => 4 + 5*Math.max(0,Math.min(1,p||0));
export const netLayout = (nodes, collapsed, manual) => {
  const col = collapsed instanceof Set ? collapsed : new Set(collapsed||[]);
  const man = manual||{};
  const clusters = clusterList(nodes);
  // Platzbedarf je Gruppe als liegendes Oval (Beschriftungen sind breiter als hoch)
  const ax = clusters.map(c=>col.has(c.name)?50:42+25*Math.sqrt(c.n)), ay = clusters.map(c=>col.has(c.name)?30:30+17*Math.sqrt(c.n));
  const sum = ax.reduce((a,b)=>a+b,0)||1;
  const R = Math.max(90, sum/Math.PI*0.8);
  // 1. Mittelpunkte: Start auf einem hochkant gestellten Oval, dann ruecken sie zusammen, bis sich die Ovale gerade nicht ueberlappen
  const H=[]; let a=-2.2;
  clusters.forEach((c,i)=>{ const span=ax[i]/sum*2*Math.PI, mid=a+span/2; H.push({x:Math.cos(mid)*R*0.7,y:Math.sin(mid)*R*1.4,ax:ax[i],ay:ay[i]}); a+=span; });
  for(let it=0; it<400; it++){
    H.forEach(h=>{ h.x-=h.x*0.03; h.y-=h.y*0.008; });
    for(let i=0;i<H.length;i++){
      const p=H[i];
      { const sx=p.ax+34, sy=p.ay+26; let dx=p.x, dy=p.y; if(!dx&&!dy) dy=-1; const d=Math.sqrt(dx*dx/(sx*sx)+dy*dy/(sy*sy)); if(d<1){ const m=(1-d)/d; p.x+=dx*m; p.y+=dy*m; } }
      for(let j=i+1;j<H.length;j++){
        const q=H[j], sx=p.ax+q.ax, sy=p.ay+q.ay; let dx=q.x-p.x, dy=q.y-p.y; if(!dx&&!dy){ dx=0.5; dy=0.5; }
        const d=Math.sqrt(dx*dx/(sx*sx)+dy*dy/(sy*sy)); if(d>=1) continue;
        const m=(1-d)/d/2; p.x-=dx*m; p.y-=dy*m; q.x+=dx*m; q.y+=dy*m;
      }
    }
  }
  const hubs=[], N=[];
  clusters.forEach((c,i)=>{
    const hub={name:c.name,n:c.n,x:Math.round(H[i].x*10)/10,y:Math.round(H[i].y*10)/10,color:groupColor(c.name),collapsed:col.has(c.name)};
    hubs.push(hub); N.push({fix:true,hub:true,x:hub.x,y:hub.y-14});          // Platzhalter samt Name ueber dem Kreis
  });
  N.push({fix:true,mid:true,x:0,y:0});
  const placed=[];
  hubs.forEach(hub=>{
    if(hub.collapsed) return;
    nodes.filter(n=>n.group===hub.name).sort((x,y)=>y.p-x.p||x.name.localeCompare(y.name)).forEach((n,i)=>{
      const m=man[n.key], r=netNodeRadius(n.p), lw=Math.max(2*r+8,Math.min(13,String(n.name).length)*5.8+4);   // Breite samt Beschriftung
      if(isNetManual(m)){
        const ang=m.t*2*Math.PI, d=Math.max(NET_R_MIN,Math.min(NET_R_MAX,m.r));
        const e={...n,r,lw,x:hub.x+Math.cos(ang)*d,y:hub.y+Math.sin(ang)*d,hx:hub.x,hy:hub.y,manual:true,fix:true};
        placed.push(e); N.push(e);
      }else{
        const ang=i*2.4, d=26+6*Math.sqrt(i);
        const e={...n,r,lw,x:hub.x+Math.cos(ang)*d,y:hub.y+Math.sin(ang)*d*0.8,hx:hub.x,hy:hub.y};
        placed.push(e); N.push(e);
      }
    });
  });
  for(let it=0; it<500; it++){
    N.forEach(n=>{ if(n.fix) return; n.x+=(n.hx-n.x)*0.05; n.y+=(n.hy-n.y)*0.05; });
    for(let i=0;i<N.length;i++) for(let j=i+1;j<N.length;j++){
      const p=N[i], q=N[j]; if(p.fix&&q.fix) continue;
      let dx=q.x-p.x, dy=q.y-p.y; if(!dx&&!dy){ dx=0.5; dy=0.5; }
      const big=p.mid||q.mid, hubp=p.hub||q.hub, sx=big?78:hubp?46+(p.lw||q.lw||60)/2:(p.lw+q.lw)/2+6, sy=big?42:hubp?34:30;
      const d=Math.sqrt(dx*dx/(sx*sx)+dy*dy/(sy*sy)); if(d>=1) continue;
      const m=(1-d)/d;
      if(p.fix){ q.x+=dx*m; q.y+=dy*m; } else if(q.fix){ p.x-=dx*m; p.y-=dy*m; } else { p.x-=dx*m/2; p.y-=dy*m/2; q.x+=dx*m/2; q.y+=dy*m/2; }
    }
  }
  placed.forEach(n=>{ n.x=Math.round(n.x*10)/10; n.y=Math.round(n.y*10)/10; delete n.fix; delete n.lw; });
  let x0=-60,x1=60,y0=-40,y1=40;
  hubs.forEach(h=>{ x0=Math.min(x0,h.x-46); x1=Math.max(x1,h.x+46); y0=Math.min(y0,h.y-30); y1=Math.max(y1,h.y+22); });
  placed.forEach(n=>{ x0=Math.min(x0,n.x-34); x1=Math.max(x1,n.x+34); y0=Math.min(y0,n.y-n.r-6); y1=Math.max(y1,n.y+n.r+18); });
  return {hubs,placed,box:{x:Math.floor(x0),y:Math.floor(y0),w:Math.ceil(x1-x0),h:Math.ceil(y1-y0)}};
};
// Zielpunkt (x,y) beim Ziehen -> Hand-Lage {t,r} um den eigenen Mittelpunkt, Abstand begrenzt
export const netDrag = (hub, x, y) => {
  const dx=x-hub.x, dy=y-hub.y;
  const t=((Math.atan2(dy,dx)/(2*Math.PI))%1+1)%1;
  const r=Math.max(NET_R_MIN,Math.min(NET_R_MAX,Math.hypot(dx,dy)));
  return {t:Math.round(t*1000)/1000,r:Math.round(r)};
};
