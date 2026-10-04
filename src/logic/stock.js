// WAHRSCHEINLICHER BESTAND - keine Mengen, keine Zaehler: jede gekaufte Position "verblasst"
// mit einer Halbwertszeit je Unterkategorie. Rezeptzutaten werden ueber normierte Schluessel abgeglichen.
import { HALF_LIFE, HB_SKIP_SUB, HB_DAYS } from "../data.js";
import { fold, normKey, tokMatch, isBasic, parseIng } from "./ingredients.js";
import { daysSince } from "./weeks.js";
import { cookedCount } from "./recipes.js";

export { fold };

const HL_DEFAULT = 45;
const halfLife = (sub) => { const s=fold(sub); for(const [k,d] of HALF_LIFE) if(s.includes(k)) return d; return HL_DEFAULT; };
// Unter dieser Wahrscheinlichkeit gilt eine Sache als "nicht mehr da" (Vorratsliste und Einkauf blenden sie aus)
export const STOCK_MIN = 0.25;
// Nach so vielen Tagen faellt eine Sache unter STOCK_MIN (zwei Halbwertszeiten), hoechstens das Betrachtungsfenster
export const fadeDays = (hl) => Math.min(HB_DAYS, Math.round(hl*Math.log(STOCK_MIN)/Math.log(0.5)));
const HL_LABEL = {obst:"Obst",gemuese:"Gemüse",fleisch:"Fleisch",wurst:"Wurst",fisch:"Fisch",backwaren:"Backwaren",brot:"Brot",milch:"Milch",kaese:"Käse",getraenk:"Getränke",suess:"Süßes",tiefkuehl:"Tiefkühl"};
// Tabelle fuer den Hinweis unter der Vorratsliste: [{labels:["Fisch"],days:4}, ...] aufsteigend nach Tagen
export const fadeTable = () => {
  const by = {};
  HALF_LIFE.forEach(([k,hl])=>{ const d=fadeDays(hl); (by[d]=by[d]||[]).push(HL_LABEL[k]||k); });
  const dDef = fadeDays(HL_DEFAULT);
  (by[dDef]=by[dDef]||[]).push("übrige Vorräte");
  return Object.keys(by).map(Number).sort((a,b)=>a-b).map(d=>({labels:by[d],days:d}));
};
// Firebase-tauglicher Schluessel fuer die "nicht mehr da"-Markierung (plans/<code>/hb/gone/<goneKey>)
export const goneKey = (key) => String(key||"").replace(/\s+/g,"_").replace(/[.#$\[\]\/]/g,"");

// Liefert [{key,toks,p,name,sub,last,hl,left}] absteigend nach Wahrscheinlichkeit; Mehrfachkaeufe: p = 1 - Prod(1-p_i)
// gone: {goneKey: "YYYY-MM-DD"} - von Hand als "nicht mehr da" markiert; gilt, bis nach diesem Datum neu gekauft wurde
export const hbStock = (book,cat,gone) => {
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
      // last = juengstes Einkaufsdatum (fuer die Vorratsliste im Reiter Heute)
      const hl = halfLife(sub);
      const last = prev&&prev.last>e.date?prev.last:e.date;
      const newest = !prev||last!==prev.last;
      map[key] = {key,toks:key.split(" "),p:prev?1-(1-prev.p)*(1-p):p,name:prev&&prev.p>p?prev.name:it.name,sub:newest?(it.sub||""):prev.sub,last,hl:newest?hl:prev.hl};
    });
  });
  const g = gone||{};
  return Object.values(map)
    .filter(s=>{ const d=g[goneKey(s.key)]; return !d||s.last>d; })
    .map(s=>{ const age=Math.max(0,(now-new Date(s.last+"T12:00:00").getTime())/86400000); return {...s,left:Math.max(0,Math.round(fadeDays(s.hl)-age))}; })
    .sort((a,b)=>b.p-a.p);
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
// Lebensmittel-Rubrik des Buchs: "Lebensmittel" (auch als Teil des Namens), sonst die Rubrik mit den meisten Positionen
export const pickFoodCat = (bk) => {
  const cats = hbCats(bk);
  const hit = cats.find(c=>/lebensmittel|essen|nahrung/i.test(String(c)));
  if(hit) return hit;
  const count = {};
  Object.values((bk&&bk.entries)||{}).forEach(e=>{ if(e&&e.category) count[e.category]=(count[e.category]||0)+((Array.isArray(e.items)&&e.items.length)||1); });
  const best = Object.entries(count).sort((a,b)=>b[1]-a[1])[0];
  return best?best[0]:(cats[0]||"Lebensmittel");
};
// Rubriken des Buchs (gespeicherte Liste, sonst aus den Eintraegen)
export const hbCats = (bk) => {
  if(bk&&Array.isArray(bk.categories)&&bk.categories.length) return bk.categories;
  const s=new Set(Object.values((bk&&bk.entries)||{}).map(e=>e&&e.category).filter(Boolean));
  return s.size?[...s]:["Lebensmittel"];
};
