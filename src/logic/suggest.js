// VORSCHLAEGE fuer "Was kochen wir heute?" (reine Funktionen).
// Grundsatz: Inspiration statt Wiederholung. Es zaehlt, was wahrscheinlich da ist, was bald verdirbt und was lange nicht dran war.
// Keine Belohnung fuer "oft gekocht"; die Kochhistorie bremst nur frisch Gekochtes. Taeglich wechselnde Streuung bei Gleichstand.
import { ingStatus, STOCK_MIN } from "./stock.js";
import { daysSince, todayISO } from "./weeks.js";
import { cookedCount, recCat, isKids, isQuick } from "./recipes.js";

// Kleiner deterministischer Hash (0..1) aus Text - gleicher Tag, gleiche Reihenfolge; "Andere Vorschlaege" aendert den seed
export const hash01 = (s) => { let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return ((h>>>0)%10000)/10000; };

const URGENT_DAYS = 2;
export const suggestScore = (rec, stock, opts={}) => {
  const today = opts.today||todayISO(), seed = opts.seed||0, key = opts.key||rec.name||"";
  const hasStock = !!(stock&&stock.length);
  const st = (rec.ingredients||[]).map(i=>ingStatus(i,stock||[])).filter(Boolean);
  const core = st.filter(x=>!x.basic);
  const cov = hasStock&&core.length ? core.reduce((a,x)=>a+x.p,0)/core.length : 0;
  const used = core.filter(x=>x.p>=0.6);
  const urgent = core.filter(x=>x.p>=STOCK_MIN&&typeof x.left==="number"&&x.left<=URGENT_DAYS);
  const ds = daysSince(rec.lastCooked, today);
  const recency = ds===null ? 0 : ds<7 ? 45 : ds<14 ? 30 : ds<30 ? 12 : 0;
  const times = cookedCount(rec);
  // Streuung: ohne "Andere" klein (Gleichstaende rotieren taeglich), mit "Andere" gross (echte Durchmischung)
  const jitter = (seed ? 25 : 8) * hash01(key+"|"+today+"|"+seed);
  const score = cov*100 + Math.min(30, urgent.length*12) + (rec.rating||0)*3 - recency + jitter;
  const reasons = [];
  if(used.length) reasons.push("verwendet "+used.slice(0,3).map(x=>x.src||x.name).join(", "));
  if(urgent.length) reasons.push(urgent[0].src+" hält noch "+(urgent[0].left<=0?"heute":urgent[0].left===1?"1 Tag":urgent[0].left+" Tage"));
  if(ds!==null&&ds>=30) reasons.push("lange nicht gekocht");
  if(ds===null&&times===0&&!rec.basis) reasons.push("noch nie gekocht");
  return {cov,core,st,urgent,used,ds,times,recency,score,reasons};
};

// Grundfilter: keine Beilagen/Sossen; Fruehstueck nur vormittags
export const suggestable = (rec, cat, hour) => {
  const c = cat||recCat(rec);
  if(c==="Beilagen & Salate"||c==="Soßen & Dips") return false;
  const h = hour===undefined ? new Date().getHours() : hour;
  if(c==="Frühstück"&&h>=11) return false;
  return true;
};

// Rangliste ueber Kochbuch und Rezept-Basis. pool = [{key, rec, basis}]; filters = {quick, kids}
export const rankSuggestions = (pool, stock, opts={}) => {
  const f = opts.filters||{};
  return pool
    .filter(p=>suggestable(p.rec, recCat(p.rec), opts.hour))
    .filter(p=>(!f.quick||isQuick(p.rec))&&(!f.kids||isKids(p.rec)))
    .map(p=>({...p,...suggestScore(p.rec,stock,{today:opts.today,seed:opts.seed,key:p.key})}))
    .sort((a,b)=>(b.score-a.score)||a.key.localeCompare(b.key));
};
