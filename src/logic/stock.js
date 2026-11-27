// WAHRSCHEINLICHER BESTAND - keine Mengen, keine Zaehler: jede gekaufte Position "verblasst"
// mit einer Halbwertszeit je Unterkategorie. Rezeptzutaten werden ueber normierte Schluessel abgeglichen.
import { HALF_LIFE, HB_SKIP_SUB, HB_DAYS } from "../data.js";
import { fold, normKey, tokMatch, isBasic, parseIng } from "./ingredients.js";
import { daysSince } from "./weeks.js";
import { cookedCount } from "./recipes.js";
import { nameGroup } from "./foodIcon.js";
import { freshEntry, freshP, cookLeft, shelfOf } from "./shelf.js";

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
// STARTWERTE JE PRODUKT (src/logic/shelf.js): Verbrauchs-Halbwertszeit hl (Tabelle, sonst Gruppe) und Haltbarkeit s in Tagen (0 = keine).
// Die Haltbarkeit gilt nur fuer Frisches (Gruppenzeit bis 10 Tage), Dosen und Tiefkuehlware bleiben bei der Gruppe.
// base (optional): Grundzutat einer Sorte ("Schalotten" -> zwiebeln), falls die Sorte selbst nicht in der Tabelle steht
export const productStart = (key, sub, base) => {
  const gh = halfLife(sub);
  const e = freshEntry(key, gh) || (base ? freshEntry(base, gh) : null);
  return {hl:(e&&e.hl)||gh, s:e?e.s:0};
};
// Wahrscheinlichkeit nach age Tagen: verbraucht (Halbwertszeit) mal verdorben (Haltbarkeit)
export const stockP = (age, hl, s) => Math.pow(0.5, Math.max(0,age)/hl) * freshP(age, s);
// Tage ab Kauf, bis die Wahrscheinlichkeit unter STOCK_MIN faellt (hoechstens das Betrachtungsfenster)
export const goneDays = (hl, s) => {
  if(!(s>0)) return fadeDays(hl);
  for(let t=1;t<HB_DAYS;t++) if(stockP(t,hl,s)<STOCK_MIN) return t;
  return HB_DAYS;
};
// VERBRAUCH (plans/<code>/stock/used/<goneKey> = {d, f, at, from, via}): beim Kochen (via "koch") oder mit x (via "x") eingetragen.
// f = was davon noch da ist (0 = ganz verbraucht, 0.5 = etwa die Haelfte). Gilt fuer alle Kaeufe bis zu diesem Zeitpunkt,
// ein spaeterer Kauf (Datum nach d bzw. createdAt nach at) zaehlt wieder voll.
const isDay = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x||""));
export const usedFactor = (u, date, createdAt) => {
  if(!u||typeof u!=="object"||!isDay(u.d)) return 1;
  const before = (createdAt>0&&u.at>0) ? createdAt<=u.at : date<=u.d;
  if(!before) return 1;
  const f = Number(u.f);
  return f>0 ? Math.min(1,f) : 0;
};

// Firebase-tauglicher Schluessel fuer die "nicht mehr da"-Markierung (plans/<code>/hb/gone/<goneKey>)
export const goneKey = (key) => String(key||"").replace(/\s+/g,"_").replace(/[.#$\[\]\/]/g,"");

// Liefert [{key,toks,p,name,sub,last,hl,left}] absteigend nach Wahrscheinlichkeit; Mehrfachkaeufe: p = 1 - Prod(1-p_i)
// gone: {goneKey: "YYYY-MM-DD"} - von Hand als "nicht mehr da" markiert; gilt, bis nach diesem Datum neu gekauft wurde
// resolve (optional): Rohname -> {name, key} | null (kein Lebensmittel); ohne resolve gilt der normierte Rohname (src/logic/alias.js)
const resolved = (resolve, raw) => {
  if(!resolve) { const key=normKey(raw); return key?{name:raw,key}:undefined; }
  const r = resolve(raw); if(r===null) return null;
  return r&&r.key ? r : undefined;
};
// Woerter fuer den Rezeptabgleich (Sorte ohne Farbe) und die Grundzutat einer Sorte
const matchToks = (r) => r.toks || r.key.split(" ");
const baseToks = (r) => r.base ? r.base.split(" ") : undefined;
// Nach einer Neusortierung (Tomaten -> Cocktailtomaten) gelten Streichen und Kochen vom alten Schluessel weiter, wenn sie aelter sind
const altGone = (g, r) => { if(!r.alt) return undefined; const d=g[goneKey(r.alt)]; return d&&(!r.at||new Date(d+"T12:00:00").getTime()<=r.at+86400000)?d:undefined; };
const altUsed = (u, r) => { if(!r.alt) return undefined; const e=u[goneKey(r.alt)]; return e&&(!r.at||!(e.at>r.at))?e:undefined; };
const learnedOf = (learned, r) => (learned&&(learned[r.key]||(r.alt&&learned[r.alt])))||null;
// Spaeteres Datum gewinnt (zwei Streichungen fuer dieselbe Zeile)
const laterDay = (a,b) => !a?b:!b?a:(a>b?a:b);
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
export const hbStock = (book,cat,gone,learned,resolve,used) => {
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
      const start = productStart(key,it.sub,r.base);
      const lr = learnedOf(learned,r);
      const hl = (lr&&lr.hl)||start.hl;
      const uf = usedFactor(used&&used[goneKey(key)], e.date) * usedFactor(used&&altUsed(used,r), e.date);
      if(!uf) return;
      const p = stockP(age,hl,start.s)*uf;
      const prev = map[key];
      // last = juengstes Einkaufsdatum (fuer die Vorratsliste im Reiter Heute)
      const last = prev&&prev.last>e.date?prev.last:e.date;
      const newest = !prev||last!==prev.last;
      const raws = prev?prev.raws:[]; if(!raws.includes(it.name)) raws.push(it.name);
      const ask = (prev&&prev.ask)||r.ask;
      map[key] = {key,toks:matchToks(r),...(r.base?{base:r.base,btoks:baseToks(r)}:{}),...(ask?{ask}:{}),p:prev?1-(1-prev.p)*(1-p):p,name:r.name,sub:newest?(it.sub||""):prev.sub,last,hl:newest?hl:prev.hl,shelf:newest?start.s:prev.shelf,src:"hb",learnedN:lr?lr.n:0,raws,unsorted:prev?prev.unsorted:r.src==="",gd:laterDay(prev&&prev.gd,altGone(gone||{},r))};
    });
  });
  const g = gone||{};
  return Object.values(map)
    .filter(s=>{ const d=laterDay(g[goneKey(s.key)],s.gd); return !d||s.last>d; })
    .map(({gd,...s})=>{ const age=Math.max(0,(now-new Date(s.last+"T12:00:00").getTime())/86400000); return {...s,left:Math.max(0,Math.round(goneDays(s.hl,s.shelf)-age))}; })
    .sort((a,b)=>b.p-a.p);
};
// Die Rezeptzutat ist so allgemein wie die Grundzutat einer Sorte: jedes Rezeptwort gleich oder Mehrzahl, keine Zusammensetzung
const baseWord = (a,b) => { if(a===b) return true; const [x,y]=a.length<=b.length?[a,b]:[b,a]; return x.length>=4&&y.startsWith(x)&&y.length-x.length<=2; };
const baseFits = (toks, s) => !!(s.btoks&&s.btoks.length&&toks.every(a=>s.btoks.some(b=>baseWord(a,b))));
// Status einer Rezeptzutat: {name, basic, p, src}
export const ingStatus = (ing,stock) => {
  const name = parseIng(ing).name;
  const key = normKey(name);
  if(!key) return null;
  if(isBasic(key)) return {name,basic:true,p:1,src:""};
  const toks = key.split(" ");
  let best = 0, src = "", left, skey = "";
  // Sorte passt direkt ("Cocktailtomaten" fuer "Tomaten") oder ueber ihre Grundzutat ("Schalotten" fuer "Zwiebeln", nicht fuer "Bergkäse")
  stock.forEach(s=>{ if(s.p>best&&(toks.some(a=>s.toks.some(b=>tokMatch(a,b)))||baseFits(toks,s))){ best=s.p; src=s.name; left=s.left; skey=s.key; } });
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
// (oder bis zum Streichen mit x bzw. bis zum Kochen, das es ganz verbraucht hat) ist ein Hinweis auf den echten Verbrauch: Halbwertszeit ~ Abstand/2.
// Kaeufe kommen aus dem Haushaltsbuch und, ohne Buch, aus der abgehakten Einkaufsliste (stock/items mit src "einkauf").
// Ein "ist noch da" (src "check") nach dem letzten Kauf zaehlt als "hielt mindestens so lange" (zensierter Messpunkt): Es verlaengert,
// ohne ein Ende zu behaupten. Gelernt wird je Produkt aus bis zu einem Jahr; der Startwert (Tabelle oder Gruppe) zaehlt wie zwei Enden.
// Liefert {key: {hl, n, prior}}; n = Anzahl Lernsignale. Ohne Signal kein Eintrag.
const dayDiff = (a,b) => (new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000;
export const learnHalfLives = (book,cat,gone,now,resolve,{items,used}={}) => {
  const out = {};
  const ts = now===undefined?Date.now():now;
  const dates = {}, subs = {}, checks = {}, bases = {};
  const inYear = (date) => { const age=(ts-new Date(date+"T12:00:00").getTime())/86400000; return age>-2&&age<=365; };
  const buy = (key,date,sub) => { (dates[key]=dates[key]||new Set()).add(date); if(!subs[key]&&sub) subs[key]=sub; };
  if(book&&book.entries&&cat) Object.values(book.entries).forEach(e=>{
    if(!e||e.category!==cat||!Array.isArray(e.items)||!inYear(e.date)) return;
    e.items.forEach(it=>{
      if(!it||!(it.amount>0)) return;
      const sub = fold(it.sub);
      if(HB_SKIP_SUB.some(k=>sub.includes(k))) return;
      const r = resolved(resolve,it.name); if(!r) return;
      const key = r.key;
      if(!key||isBasic(key)) return;
      if(r.base) bases[key]=r.base;
      buy(key,e.date,it.sub||"");
    });
  });
  Object.values(items||{}).forEach(it=>{
    if(!it||typeof it!=="object"||!it.name||!isDay(it.date)||!inYear(it.date)) return;
    if(it.src!=="einkauf"&&it.src!=="check") return;
    const r = resolved(resolve,it.name); if(!r) return;
    const key = r.key; if(!key||isBasic(key)) return;
    if(r.base) bases[key]=r.base;
    if(it.src==="einkauf") buy(key,it.date,it.sub||guessGroup(it.name));
    else if(!checks[key]||it.date>checks[key]) checks[key]=it.date;
  });
  const g = gone||{}, u = used||{};
  // Verbrauch mit x bei eigenen Positionen loescht den Einkauf; das Kaufdatum steht deshalb im Verbrauch (from)
  Object.keys(u).forEach(gk=>{ const e=u[gk]; if(e&&isDay(e.from)&&inYear(e.from)){ const key=gk.replace(/_/g," "); if(!isBasic(key)) buy(key,e.from,e.sub||""); } });
  Object.keys(dates).forEach(key=>{
    const ds = [...dates[key]].sort();
    const prior = productStart(key,subs[key]||guessGroup(key),bases[key]).hl;
    const ends = [];
    const gd = g[goneKey(key)]; if(isDay(gd)) ends.push(gd);
    const ue = u[goneKey(key)]; if(ue&&isDay(ue.d)&&Number(ue.f||0)===0) ends.push(ue.d);
    let exp = 0, ev = 0, cens = 0;
    for(let i=0;i<ds.length;i++){
      const from = ds[i], next = ds[i+1];
      const end = ends.filter(x=>x>=from&&(!next||x<next)).sort()[0];
      const stop = end||next;
      if(stop){ const a=dayDiff(from,stop); if(a>=1){ exp+=a; ev++; } continue; }
      const c = checks[key];
      if(c&&c>from){ const a=dayDiff(from,c); if(a>=1){ exp+=a; cens++; } }
    }
    if(!ev&&!cens) return;
    const hl = (2*prior + exp/2) / (2+ev);
    out[key] = {hl:Math.min(90,Math.max(1,Math.round(hl*10)/10)),n:ev+cens,prior};
  });
  return out;
};

// EIGENER VORRAT: items {id:{name,sub,date,src}} (Hand oder Foto) verblassen wie Haushaltsbuch-Kaeufe; perm {goneKey:{name,sub}} = Dauervorrat (immer da).
// buildStock fuehrt Haushaltsbuch, eigene Positionen und Dauervorrat zu EINER Liste zusammen (gleicher Schluessel = eine Zeile).
export const buildStock = ({book,cat,gone,items,perm,learned,now,resolve,used}={}) => {
  const ts = now===undefined?Date.now():now;
  const map = {};
  hbStock(book,cat,gone,learned,resolve,used).forEach(s=>{ map[s.key]={...s,srcs:["hb"],ownIds:[]}; });
  const g = gone||{};
  Object.keys(items||{}).forEach(id=>{
    const it=items[id]; if(!it||typeof it!=="object"||!it.name) return;
    const r=resolved(resolve,it.name); if(!r) return;
    const key=r.key; if(!key||isBasic(key)) return;
    const date=/^\d{4}-\d{2}-\d{2}$/.test(it.date)?it.date:new Date(ts).toISOString().slice(0,10);
    const gd=laterDay(g[goneKey(key)],altGone(g,r)); if(gd&&date<=gd) return;
    const age=Math.max(0,(ts-new Date(date+"T12:00:00").getTime())/86400000);
    if(age>HB_DAYS) return;
    const start=productStart(key,it.sub||guessGroup(it.name),r.base);
    const lr=learnedOf(learned,r);
    const hl=(lr&&lr.hl)||start.hl;
    const uf=usedFactor(used&&used[goneKey(key)],date,it.createdAt)*usedFactor(used&&altUsed(used,r),date,it.createdAt);
    if(!uf) return;
    const p=stockP(age,hl,start.s)*uf;
    const prev=map[key];
    if(prev){
      const raws=prev.raws||[]; if(!raws.includes(it.name)) raws.push(it.name);
      map[key]={...prev,p:1-(1-prev.p)*(1-p),last:date>prev.last?date:prev.last,hl:date>prev.last?hl:prev.hl,shelf:date>prev.last?start.s:prev.shelf,srcs:[...new Set([...prev.srcs,it.src||"hand"])],ownIds:[...prev.ownIds,id],raws};
    }else{
      map[key]={key,toks:matchToks(r),...(r.base?{base:r.base,btoks:baseToks(r)}:{}),...(r.ask?{ask:r.ask}:{}),p,name:r.name,sub:it.sub||guessGroup(r.name),last:date,hl,shelf:start.s,src:it.src||"hand",srcs:[it.src||"hand"],ownIds:[id],learnedN:lr?lr.n:0,raws:[it.name],unsorted:r.src===""};
    }
  });
  Object.keys(perm||{}).forEach(gk=>{
    const pm=perm[gk]; if(!pm||typeof pm!=="object"||!pm.name) return;
    const r=resolved(resolve,pm.name); if(!r) return;
    const key=r.key; if(!key||isBasic(key)) return;
    const prev=map[key];
    map[key]=prev?{...prev,permanent:true,p:1,permKey:gk}:{key,toks:matchToks(r),...(r.base?{base:r.base,btoks:baseToks(r)}:{}),p:1,name:r.name,sub:pm.sub||guessGroup(r.name),last:"",hl:Infinity,src:"perm",srcs:["perm"],ownIds:[],permanent:true,learnedN:0,raws:[pm.name],permKey:gk};
  });
  return Object.values(map)
    .map(s=>{ if(s.permanent) return {...s,left:Infinity}; const age=Math.max(0,(ts-new Date(s.last+"T12:00:00").getTime())/86400000); return {...s,left:Math.max(0,Math.round(goneDays(s.hl,s.shelf)-age))}; })
    .sort((a,b)=>(b.permanent?1:0)-(a.permanent?1:0)||b.p-a.p||a.name.localeCompare(b.name));
};

// KOCHEN VERBRAUCHT: Was ein gekochtes Rezept aus dem Vorrat nimmt. Grundvorrat (Salz, Oel, Mehl ...) steht gar nicht im Vorrat,
// Dauervorrat (Stern) bleibt unberuehrt. Frisches wie Hack, Fisch oder Salat gilt danach als aufgebraucht, Kaese, Milch, Butter,
// Zwiebeln usw. sind noch etwa zur Haelfte da (cookLeft in shelf.js). Abgezogen wird nur bei eindeutigem Treffer: gleiches Wort
// oder Mehrzahl, keine Zusammensetzung ("Tomaten" nimmt nicht die "Dosentomaten").
// Liefert {entries:{goneKey: {d, f, at, from, sub, via:"koch"}}, prev:{goneKey: alter Eintrag | null}, names:[{name, f}]}
const cookWord = (a,b) => {
  if(a===b) return true;
  const [s,l] = a.length<=b.length?[a,b]:[b,a];
  return s.length>=4&&l.startsWith(s)&&(l.length-s.length<=3||s.length>=8);
};
export const cookUse = (ingredients, stock, used, day, now) => {
  const entries = {}, prev = {}, names = [], u = used||{};
  const at = now===undefined?Date.now():now;
  (ingredients||[]).forEach(ing=>{
    const key = normKey(parseIng(String(ing||"")).name);
    if(!key||isBasic(key)) return;
    const toks = key.split(" ");
    const live = (stock||[]).filter(s=>s&&!s.permanent&&s.p>=STOCK_MIN);
    const hits = live.filter(s=>s.toks.some(b=>toks.some(a=>cookWord(a,b))));
    let hit = hits.length===1?hits[0]:hits.find(s=>s.key===key);
    // Sonst ueber die Grundzutat ("Zwiebeln" nimmt die Schalotten); bei mehreren Sorten die, die am sichersten da ist
    if(!hit&&!hits.length){ const bh=live.filter(s=>baseFits(toks,s)&&!Object.keys(entries).includes(goneKey(s.key))).sort((a,b)=>b.p-a.p); hit=bh[0]; }
    if(!hit) return;
    const gk = goneKey(hit.key); if(!gk||entries[gk]) return;
    const left = cookLeft(shelfOf(hit.key)||!hit.base?hit.key:hit.base,hit.sub);
    const old = u[gk];
    // Wurde seit dem letzten Abzug nicht neu gekauft, wird weiter abgezogen (zweimal halb = ein Viertel)
    const still = old&&isDay(old.d)&&!(hit.last>old.d);
    const f = still ? Math.round((Number(old.f)||0)*left*100)/100 : left;
    entries[gk] = {d:day,f,at,from:hit.last||day,sub:hit.sub||"",via:"koch"};
    prev[gk] = old&&typeof old==="object"?old:null;
    names.push({name:hit.name,f});
  });
  return {entries,prev,names};
};
// x in der Vorratsliste als Verbrauch merken (fuer das Lernen auch ohne Haushaltsbuch)
export const goneUse = (item, day, now) => ({d:day,f:0,at:now===undefined?Date.now():now,from:item.last||day,sub:item.sub||"",via:"x"});
// Verbrauchseintraege, die aelter als das Betrachtungsfenster sind, koennen weg (liefert die Schluessel)
export const staleUsed = (used, now) => {
  const ts = now===undefined?Date.now():now;
  return Object.keys(used||{}).filter(gk=>{ const e=used[gk]; return !e||!isDay(e.d)||(ts-new Date(e.d+"T12:00:00").getTime())/86400000>HB_DAYS; });
};
