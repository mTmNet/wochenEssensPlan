// WAHRSCHEINLICHER BESTAND - keine Mengen, keine Zaehler: jede gekaufte Position "verblasst"
// mit einer Halbwertszeit je Unterkategorie. Rezeptzutaten werden ueber normierte Schluessel abgeglichen.
import { HALF_LIFE, HB_SKIP_SUB, HB_DAYS } from "../data.js";
import { fold, normKey, tokMatch, isBasic, parseIng } from "./ingredients.js";
import { daysSince } from "./weeks.js";
import { cookedCount } from "./recipes.js";

export { fold };

const halfLife = (sub) => { const s=fold(sub); for(const [k,d] of HALF_LIFE) if(s.includes(k)) return d; return 45; };

// Liefert [{key,toks,p,name,sub}] absteigend nach Wahrscheinlichkeit; Mehrfachkaeufe: p = 1 - Prod(1-p_i)
export const hbStock = (book,cat) => {
  const map = {};
  if(!book||!book.entries||!cat) return [];
  const now = Date.now();
  Object.values(book.entries).forEach(e=>{
    if(!e||e.category!==cat||!Array.isArray(e.items)) return;
    const age = (now-new Date(e.date+"T12:00:00").getTime())/86400000;
    if(!(age>-2)||age>HB_DAYS) return;
    e.items.forEach(it=>{
      if(!it||!(it.amount>0)) return;
      const sub = fold(it.sub);
      if(HB_SKIP_SUB.some(k=>sub.includes(k))) return;
      const key = normKey(it.name);
      if(!key||isBasic(key)) return;
      const p = Math.pow(0.5,Math.max(0,age)/halfLife(sub));
      const prev = map[key];
      map[key] = {key,toks:key.split(" "),p:prev?1-(1-prev.p)*(1-p):p,name:prev&&prev.p>p?prev.name:it.name,sub:it.sub||""};
    });
  });
  return Object.values(map).sort((a,b)=>b.p-a.p);
};
// Status einer Rezeptzutat: {name, basic, p, src}
export const ingStatus = (ing,stock) => {
  const name = parseIng(ing).name;
  const key = normKey(name);
  if(!key) return null;
  if(isBasic(key)) return {name,basic:true,p:1,src:""};
  const toks = key.split(" ");
  let best = 0, src = "";
  stock.forEach(s=>{ if(s.p>best&&toks.some(a=>s.toks.some(b=>tokMatch(a,b)))){ best=s.p; src=s.name; } });
  return {name,basic:false,p:best,src};
};
// Punktzahl (Bauplan Abschnitt 7): Abdeckung*100 + Bewertung*4 + min(gekocht,5)*3 - 25 wenn in den letzten 7 Tagen gekocht.
// Ohne Haushaltsbuch (leerer stock) ist die Abdeckung 0.
export const scoreRecipe = (rec,stock,now) => {
  const st = (rec.ingredients||[]).map(i=>ingStatus(i,stock||[])).filter(Boolean);
  const core = st.filter(x=>!x.basic);
  const cov = (stock&&stock.length&&core.length) ? core.reduce((a,x)=>a+x.p,0)/core.length : 0;
  const ds = daysSince(rec.lastCooked,now);
  const recent = ds!==null&&ds<7;
  const times = cookedCount(rec);
  return {st,core,cov,recent,ds,times,score:cov*100+(rec.rating||0)*4+Math.min(times,5)*3-(recent?25:0)};
};
// Rubriken des Buchs (gespeicherte Liste, sonst aus den Eintraegen)
export const hbCats = (bk) => {
  if(bk&&Array.isArray(bk.categories)&&bk.categories.length) return bk.categories;
  const s=new Set(Object.values((bk&&bk.entries)||{}).map(e=>e&&e.category).filter(Boolean));
  return s.size?[...s]:["Lebensmittel"];
};
