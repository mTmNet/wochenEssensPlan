// WAHRSCHEINLICHER BESTAND - keine Mengen, keine Zaehler: jede gekaufte Position "verblasst"
// mit einer Halbwertszeit je Unterkategorie. Rezeptzutaten werden ueber normierte Schluessel abgeglichen.
import { HALF_LIFE, HB_SKIP_SUB, HB_DAYS } from "../data.js";
import { fold, normKey, tokMatch, isBasic, parseIng } from "./ingredients.js";
import { daysSince } from "./weeks.js";
import { cookedCount } from "./recipes.js";
import { nameGroup } from "./foodIcon.js";

export { fold };

const HL_DEFAULT = 45;
export const halfLife = (sub) => { const s=fold(sub); for(const [k,d] of HALF_LIFE) if(s.includes(k)) return d; return HL_DEFAULT; };
// Gruppen fuer eigene Vorratspositionen (Hand/Foto); die Halbwertszeit kommt ueber halfLife() aus dem Gruppennamen
export const STOCK_GROUPS = ["Obst","Gemüse","Fleisch","Wurst","Fisch","Brot & Backwaren","Milchprodukte","Käse","Getränke","Süßes","Tiefkühl","Konserven","Trockenwaren","Sonstiges"];
export const guessGroup = (name) => {
  const n = fold(name);
  // Tiefkuehl und Dosen zuerst (TK-Brokkoli ist Tiefkuehl), dann die Emoji-Tabelle (Brokkoli -> Gemuese), dann grobe Stichwoerter
  if(/(^|[\s-])tk([\s-]|$)|tiefkuehl|gefroren|tiefgefr/.test(n)) return "Tiefkühl";
  if(/dose|konserve|passata|kokosmilch|eingelegt|im glas/.test(n)) return "Konserven";
  const viaEmoji = nameGroup(name); if(viaEmoji) return viaEmoji;
  const T = [["Konserven",["dose","passata","kokosmilch","konserve","mais","kichererbsen"]],["Tiefkühl",["tiefkuehl","tk ","gefroren","pizza"]],["Obst",["apfel","banane","birne","beere","orange","zitrone","trauben","mango","kiwi","pfirsich","melone","obst"]],["Gemüse",["tomate","paprika","gurke","salat","zwiebel","karotte","moehre","brokkoli","kartoffel","zucchini","spinat","lauch","kohl","pilz","champignon","aubergine","kuerbis","bohnen","erbsen","fenchel","sellerie","gemuese"]],["Fisch",["lachs","fisch","forelle","thunfisch","garnele","kabeljau"]],["Wurst",["wurst","schinken","salami","speck"]],["Fleisch",["hack","fleisch","haehnchen","huehnchen","pute","rind","schwein","lamm","steak"]],["Käse",["kaese","parmesan","mozzarella","feta","gouda","emmentaler"]],["Milchprodukte",["milch","joghurt","jogh","quark","sahne","butter","eier","ei ","skyr","frischkaese"]],["Brot & Backwaren",["brot","broetchen","toast","baguette","mehl","hefe"]],["Getränke",["saft","wasser","cola","limo","bier","wein","tee","kaffee"]],["Süßes",["schokolade","kekse","gummibaer","bonbon","suess","kuchen","honig","marmelade"]],["Trockenwaren",["pasta","spaghetti","nudel","reis","linsen","haferflocken","muesli","couscous","bulgur","quinoa","zucker","nuesse","mandeln"]]];
  for(const [g,keys] of T) if(keys.some(k=>n.includes(k))) return g;
  return "Sonstiges";
};
// Unter dieser Wahrscheinlichkeit gilt eine Sache als "nicht mehr da" (Vorratsliste und Einkauf blenden sie aus)
export const STOCK_MIN = 0.25;
// STUFEN in Worten statt Prozent (Anzeige in der Vorratsliste). Die Rechnung dahinter bleibt die Wahrscheinlichkeit p.
export const STOCK_LEVELS = [
  {min:0.85,label:"ist da",tone:"ok"},
  {min:0.7,label:"vermutlich da",tone:"ok"},
  {min:0.5,label:"eventuell da",tone:"warn"},
  {min:0,label:"eher nicht mehr da",tone:"muted"},
];
export const stockLevel = (p) => STOCK_LEVELS.find(l=>(Number(p)||0)>=l.min) || STOCK_LEVELS[STOCK_LEVELS.length-1];
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
// resolve (optional): Rohname -> {name, key} | null (kein Lebensmittel); ohne resolve gilt der normierte Rohname (src/logic/alias.js)
const resolved = (resolve, raw) => {
  if(!resolve) { const key=normKey(raw); return key?{name:raw,key}:undefined; }
  const r = resolve(raw); if(r===null) return null;
  return r&&r.key ? {name:r.name,key:r.key,src:r.src} : undefined;
};
// EINKAUF OHNE HAUSHALTSBUCH: Ein abgehakter Posten der Einkaufsliste gilt als heute gekauft (nur wenn kein Haushaltsbuch verbunden ist).
// Der Schluessel haengt am Posten (stock/items/ek_<Posten-Id>): zwei Geraete, die gleichzeitig abhaken, schreiben denselben Eintrag.
export const shopStockId = (shopId) => "ek_"+String(shopId||"").replace(/[.#$\[\]\/\s]/g,"");
// Liefert {name, sub, date, src:"einkauf", createdAt} oder null (kein Name, Grundvorrat wie Salz und Oel)
export const shopStockItem = (item, day, now) => {
  const name = parseIng(String((item&&item.text)||"")).name.replace(/\s+/g," ").trim().slice(0,80);
  const key = normKey(name);
  if(!name||!key||isBasic(key)) return null;
  return {name, sub:guessGroup(name), date:day, src:"einkauf", createdAt:now===undefined?Date.now():now};
};
// Rohbezeichnungen der Lebensmittel-Einkaeufe im Betrachtungsfenster (fuer die Namenszuordnung)
export const hbRawNames = (book,cat,now) => {
  const out = new Set(); if(!book||!book.entries||!cat) return [];
  const ts = now===undefined?Date.now():now;
  Object.values(book.entries).forEach(e=>{
    if(!e||e.category!==cat||!Array.isArray(e.items)) return;
    const age = (ts-new Date(e.date+"T12:00:00").getTime())/86400000;
    if(!(age>-2)||age>HB_DAYS) return;
    e.items.forEach(it=>{ if(!it||!(it.amount>0)||!it.name) return; const sub=fold(it.sub); if(HB_SKIP_SUB.some(k=>sub.includes(k))) return; if(isBasic(normKey(it.name))) return; out.add(String(it.name).trim()); });
  });
  return [...out];
};
export const hbStock = (book,cat,gone,learned,resolve) => {
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
      const r = resolved(resolve,it.name); if(!r) return;
      const key = r.key;
      if(!key||isBasic(key)) return;
      const hl = (learned&&learned[key]&&learned[key].hl)||halfLife(sub);
      const p = Math.pow(0.5,Math.max(0,age)/hl);
      const prev = map[key];
      // last = juengstes Einkaufsdatum (fuer die Vorratsliste im Reiter Heute)
      const last = prev&&prev.last>e.date?prev.last:e.date;
      const newest = !prev||last!==prev.last;
      const raws = prev?prev.raws:[]; if(!raws.includes(it.name)) raws.push(it.name);
      map[key] = {key,toks:key.split(" "),p:prev?1-(1-prev.p)*(1-p):p,name:r.name,sub:newest?(it.sub||""):prev.sub,last,hl:newest?hl:prev.hl,src:"hb",learnedN:learned&&learned[key]?learned[key].n:0,raws,unsorted:prev?prev.unsorted:r.src===""};
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
  let best = 0, src = "", left, skey = "";
  stock.forEach(s=>{ if(s.p>best&&toks.some(a=>s.toks.some(b=>tokMatch(a,b)))){ best=s.p; src=s.name; left=s.left; skey=s.key; } });
  return {name,basic:false,p:best,src,left,key:skey};
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

// LERNENDES VERBLASSEN: Wird ein Produkt erneut gekauft, war das alte bis dahin aufgebraucht. Der Abstand zwischen zwei Kaeufen
// (und das Alter beim Streichen mit x) ist ein Hinweis auf die echte Haltbarkeit: Halbwertszeit ~ Abstand/2.
// Gelernt wird je Produkt (Schluessel) aus bis zu einem Jahr Einkaeufen, die Gruppenzeit ist der Startwert mit Gewicht 2.
// Liefert {key: {hl, n, gaps}}; n = Anzahl Lernsignale. Ohne Signal kein Eintrag.
export const learnHalfLives = (book,cat,gone,now,resolve) => {
  const out = {};
  if(!book||!book.entries||!cat) return out;
  const ts = now===undefined?Date.now():now;
  const dates = {}, subs = {};
  Object.values(book.entries).forEach(e=>{
    if(!e||e.category!==cat||!Array.isArray(e.items)) return;
    const age = (ts-new Date(e.date+"T12:00:00").getTime())/86400000;
    if(!(age>-2)||age>365) return;
    e.items.forEach(it=>{
      if(!it||!(it.amount>0)) return;
      const sub = fold(it.sub);
      if(HB_SKIP_SUB.some(k=>sub.includes(k))) return;
      const r = resolved(resolve,it.name); if(!r) return;
      const key = r.key;
      if(!key||isBasic(key)) return;
      (dates[key]=dates[key]||new Set()).add(e.date);
      if(!subs[key]) subs[key]=it.sub||"";
    });
  });
  const g = gone||{};
  Object.keys(dates).forEach(key=>{
    const ds = [...dates[key]].sort();
    const prior = halfLife(subs[key]);
    const samples = [];
    for(let i=1;i<ds.length;i++){ const gap=(new Date(ds[i]+"T12:00:00")-new Date(ds[i-1]+"T12:00:00"))/86400000; if(gap>=1) samples.push(gap/2); }
    const gd = g[goneKey(key)];
    if(gd){ const before=ds.filter(d=>d<=gd); if(before.length){ const age=(new Date(gd+"T12:00:00")-new Date(before[before.length-1]+"T12:00:00"))/86400000; if(age>=1) samples.push(age/2); } }
    if(!samples.length) return;
    const hl = (2*prior + samples.reduce((a,b)=>a+b,0)) / (2+samples.length);
    out[key] = {hl:Math.min(90,Math.max(1,Math.round(hl*10)/10)),n:samples.length,prior};
  });
  return out;
};

// EIGENER VORRAT: items {id:{name,sub,date,src}} (Hand oder Foto) verblassen wie Haushaltsbuch-Kaeufe; perm {goneKey:{name,sub}} = Dauervorrat (immer da).
// buildStock fuehrt Haushaltsbuch, eigene Positionen und Dauervorrat zu EINER Liste zusammen (gleicher Schluessel = eine Zeile).
export const buildStock = ({book,cat,gone,items,perm,learned,now,resolve}={}) => {
  const ts = now===undefined?Date.now():now;
  const map = {};
  hbStock(book,cat,gone,learned,resolve).forEach(s=>{ map[s.key]={...s,srcs:["hb"],ownIds:[]}; });
  const g = gone||{};
  Object.keys(items||{}).forEach(id=>{
    const it=items[id]; if(!it||typeof it!=="object"||!it.name) return;
    const r=resolved(resolve,it.name); if(!r) return;
    const key=r.key; if(!key||isBasic(key)) return;
    const date=/^\d{4}-\d{2}-\d{2}$/.test(it.date)?it.date:new Date(ts).toISOString().slice(0,10);
    const gd=g[goneKey(key)]; if(gd&&date<=gd) return;
    const age=Math.max(0,(ts-new Date(date+"T12:00:00").getTime())/86400000);
    if(age>HB_DAYS) return;
    const hl=(learned&&learned[key]&&learned[key].hl)||halfLife(it.sub||guessGroup(it.name));
    const p=Math.pow(0.5,age/hl);
    const prev=map[key];
    if(prev){
      const raws=prev.raws||[]; if(!raws.includes(it.name)) raws.push(it.name);
      map[key]={...prev,p:1-(1-prev.p)*(1-p),last:date>prev.last?date:prev.last,hl:date>prev.last?hl:prev.hl,srcs:[...new Set([...prev.srcs,it.src||"hand"])],ownIds:[...prev.ownIds,id],raws};
    }else{
      map[key]={key,toks:key.split(" "),p,name:r.name,sub:it.sub||guessGroup(r.name),last:date,hl,src:it.src||"hand",srcs:[it.src||"hand"],ownIds:[id],learnedN:learned&&learned[key]?learned[key].n:0,raws:[it.name],unsorted:r.src===""};
    }
  });
  Object.keys(perm||{}).forEach(gk=>{
    const pm=perm[gk]; if(!pm||typeof pm!=="object"||!pm.name) return;
    const r=resolved(resolve,pm.name); if(!r) return;
    const key=r.key; if(!key||isBasic(key)) return;
    const prev=map[key];
    map[key]=prev?{...prev,permanent:true,p:1,permKey:gk}:{key,toks:key.split(" "),p:1,name:r.name,sub:pm.sub||guessGroup(r.name),last:"",hl:Infinity,src:"perm",srcs:["perm"],ownIds:[],permanent:true,learnedN:0,raws:[pm.name],permKey:gk};
  });
  return Object.values(map)
    .map(s=>{ if(s.permanent) return {...s,left:Infinity}; const age=Math.max(0,(ts-new Date(s.last+"T12:00:00").getTime())/86400000); return {...s,left:Math.max(0,Math.round(fadeDays(s.hl)-age))}; })
    .sort((a,b)=>(b.permanent?1:0)-(a.permanent?1:0)||b.p-a.p||a.name.localeCompare(b.name));
};
