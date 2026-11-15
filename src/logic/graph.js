// GRAPH DES VORRATS - Produkte als Punkte in Wolken je Gruppe, Rezepte als Knoten mit Kanten zu ihren Zutaten.
// Reine Funktionen und eine kleine, deterministische Kraeftesimulation (kein Zufall: Startlagen aus einem Hash des Schluessels).
import { STOCK_GROUPS, STOCK_MIN, guessGroup, ingStatus } from "./stock.js";
import { fold } from "./ingredients.js";

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
// FARBAKZENT je Gruppe (leichter Hintergrund des Kuchenstuecks)
export const GROUP_COLORS = {"Obst":"#E8A33D","Gemüse":"#6DBB5A","Fleisch":"#D9534F","Wurst":"#D98FA3","Fisch":"#4F8FD9","Brot & Backwaren":"#C9A46A","Milchprodukte":"#8FC7E8","Käse":"#E8D44D","Getränke":"#4FC9B8","Süßes":"#B57BD9","Tiefkühl":"#7FD8F0","Konserven":"#A8927A","Trockenwaren":"#D4B483","Sonstiges":"#9A9898"};
export const groupColor = (name) => GROUP_COLORS[name] || GROUP_COLORS.Sonstiges;

// RADIALES LAYOUT: Rezeptkreis in der Mitte, drumherum je Gruppe ein Kuchenstueck (Winkel nach Anzahl, +1 Grundgewicht,
// damit kleine Gruppen Platz behalten). Die Punkte liegen auf Ringen im Stueck, die wahrscheinlichsten innen. Kein Zufall, keine Simulation.
export const R_CENTER = 80;            // Rezeptkreis
export const R_IN = 158;               // innerer Rand der Kuchenstuecke
const ROW = 66, ARC = 96;              // Abstand der Ringe / nebeneinander (Platz fuer die Beschriftung)
export const radialLayout = (nodes, collapsed) => {
  const col = collapsed instanceof Set ? collapsed : new Set(collapsed||[]);
  const clusters = clusterList(nodes);
  const weights = clusters.map(c=>col.has(c.name)?1.3:c.n+1);
  const total = weights.reduce((a,b)=>a+b,0)||1;
  const sectors=[], placed=[];
  let a=-Math.PI/2, rOut=R_IN+ROW;
  clusters.forEach((c,i)=>{
    const span=weights[i]/total*2*Math.PI;
    const sec={name:c.name,n:c.n,a0:a,a1:a+span,mid:a+span/2,color:groupColor(c.name),collapsed:col.has(c.name)};
    const members=nodes.filter(n=>n.group===c.name).sort((x,y)=>y.p-x.p||x.name.localeCompare(y.name));
    if(sec.collapsed){
      const r=R_IN+ROW*0.75; sec.x=Math.cos(sec.mid)*r; sec.y=Math.sin(sec.mid)*r; sec.r=24+4*Math.sqrt(c.n);
      rOut=Math.max(rOut,r+sec.r+24);
    }else{
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
  return {sectors,placed,rOut:Math.round(rOut)};
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
