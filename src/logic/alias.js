// NAMEN NORMIEREN - Kassenbon-Bezeichnungen ("Bio Strauchtomaten 500g") auf die Zutatennamen der Rezepte ("Tomaten") abbilden.
// Drei Quellen, in dieser Reihenfolge: Hand-Zuordnung > KI-Zuordnung (beide gespeichert unter stock/alias) > Regel (Mengen, Marken,
// Fuellwoerter weg, dann Abgleich mit dem Vokabular aus Kochbuch und Rezept-Basis). Ohne Treffer bleibt der bereinigte Name.
import { parseIng, normKey, tokMatch, isBasic, fold } from "./ingredients.js";
import { KEY_STOP, KEY_SYN } from "../data.js";

// Firebase-tauglicher Schluessel der Rohbezeichnung (stock/alias/<aliasKey>)
export const aliasKey = (raw) => (normKey(raw) || fold(raw).replace(/[^a-z0-9]+/g," ").trim()).replace(/\s+/g,"_").replace(/[.#$\[\]\/]/g,"").slice(0,120);

const BRANDS = new Set(["barilla","ja","gut","guenstig","rewe","edeka","aldi","lidl","penny","dm","netto","kaufland","milram","mueller","danone","oetker","knorr","maggi","iglo","bonduelle","hochland","kerrygold","alnatura","dennree","bioland","demeter","rapunzel","weihenstephan","landliebe","ehrmann","zott","bauer","meggle","ruegenwalder","wiesenhof","buitoni","de","cecco","birkel","seitenbacher","koelln","kelloggs","nestle","ferrero","milka","ritter","sport","haribo","bahlsen","leibniz","lorenz","funny","frisch","chio","pringles","coca","cola","pepsi","fanta","sprite","volvic","evian","gerolsteiner","vittel","kaercher","tchibo","dallmayr","jacobs","melitta","lavazza","teekanne","meissner","k","classic","premium","select","original","finest","deluxe","bestes","beste","gold","feinkost","feine","marke","pik","as"]);
const ABBR = new Set(["stk","st","pck","pkg","fl","btl","bt","gr","kart","ca","festk","mehlig","vorw","fk","mk","tk","hkl","kl","gr","xl","xxl","ltr","l","ml","g","kg","mg"]);
// Farbwoerter unterscheiden Sorten ("rote Zwiebeln", "weisse Schokolade"): fuer die Sorte bleiben sie, fuer den Rezeptabgleich nicht
const COLORS = new Set(["rot","rote","roter","rotes","gruen","gruene","gruener","gelb","gelbe","gelber","weiss","weisse","weisser","schwarz","schwarze","schwarzer"]);
// Bereinigte Bezeichnung: Klammern, Prozent, Mengen mit Einheit, "3er"/"10er", Marken, Kuerzel und Fuellwoerter weg; Schreibweise bleibt
// keepColors: Farbwoerter behalten (fuer die Pruefung, ob die Bezeichnung eine Sorte nennt)
export const cleanName = (raw, keepColors) => {
  let s = String(raw||"").replace(/\([^)]*\)/g," ").replace(/\d+(?:[.,]\d+)?\s*%/g," ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:er|x|g|kg|mg|ml|cl|dl|l|ltr|st|stk|stueck|stück|pck|pkg|fl|btl)\b\.?/gi," ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\b/g," ");
  const words = s.split(/[\s,;/+*]+/).map(w=>w.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß]+$/g,"")).filter(Boolean);
  const kept = words.filter(w=>{ const f=fold(w); return f.length>=2 && !BRANDS.has(f) && !ABBR.has(f) && (!KEY_STOP.has(f) || (keepColors && COLORS.has(f))); });
  const out = (kept.length?kept:words.filter(w=>fold(w).length>=2)).join(" ").trim();
  return out || String(raw||"").trim();
};

// VOKABULAR aus Rezepten: [{key, name, toks, n}] - je normiertem Schluessel die haeufigste Schreibweise (ohne Mengen, Klammern, Zusatz nach Komma)
const surface = (text) => {
  let n = parseIng(String(text||"")).name.replace(/\([^)]*\)/g," ").split(",")[0].trim();
  n = n.replace(/^(?:etwas|einige|ein paar|frische[rs]?|frisch)\s+/i,"").trim();
  // Fuellwoerter (Farben, "frisch", "gehackt" …) auch aus der Schreibweise: "Rote Linsen" -> "Linsen", sonst bliebe der Zusatz im Namen
  const words = n.split(/\s+/).filter(Boolean);
  const kept = words.filter(w=>!KEY_STOP.has(fold(w).replace(/[^a-z]/g,"")));
  n = (kept.length?kept:words).join(" ");
  return n.charAt(0).toUpperCase()+n.slice(1);
};
export const vocabulary = (recipes, classics) => {
  const by = {};
  const add = (text) => {
    const name = surface(text); const key = normKey(name);
    if(!key || isBasic(key) || name.length>40) return;
    const e = by[key] || (by[key]={key,toks:key.split(" "),forms:{},n:0});
    e.forms[name]=(e.forms[name]||0)+1; e.n++;
  };
  Object.values(recipes||{}).forEach(r=>{ if(r&&Array.isArray(r.ingredients)) r.ingredients.forEach(add); });
  (classics||[]).forEach(c=>{ if(c&&Array.isArray(c.ingredients)) c.ingredients.forEach(add); });
  return Object.values(by).map(e=>{
    const name = Object.keys(e.forms).sort((a,b)=>e.forms[b]-e.forms[a]||a.length-b.length||a.localeCompare(b))[0];
    return {key:e.key,name,toks:e.toks,n:e.n};
  }).sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));
};

// REGEL: bereinigte Bezeichnung gegen das Vokabular; genauer Schluessel, sonst genau ein Eintrag, dessen Woerter alle in der Bezeichnung stecken
export const ruleMatch = (raw, vocab) => {
  const key = normKey(cleanName(raw)); if(!key) return null;
  const exact = (vocab||[]).find(v=>v.key===key); if(exact) return exact;
  const toks = key.split(" ");
  const cands = (vocab||[]).filter(v=>v.toks.every(t=>toks.some(r=>tokMatch(t,r))));
  if(!cands.length) return null;
  // Kandidaten, die alle Woerter der Bezeichnung abdecken, zuerst; dann der gebraeuchlichste (haeufigste) Name; dann der kuerzere
  const covers = (v) => toks.every(r=>v.toks.some(t=>tokMatch(t,r)));
  cands.sort((a,b)=>(covers(b)?1:0)-(covers(a)?1:0)||b.n-a.n||a.toks.length-b.toks.length);
  if(cands.length>1 && covers(cands[0])===covers(cands[1]) && cands[0].n===cands[1].n && cands[0].toks.length===cands[1].toks.length) return null;   // echt mehrdeutig
  return cands[0];
};

// SORTE: Schluessel einer Sorte - wie normKey, aber Farben bleiben ("rote zwiebeln" ist eine eigene Zeile neben "zwiebeln")
export const sortKey = (name) => {
  let s = fold(name).replace(/\([^)]*\)/g," ").replace(/[^a-z\s]/g," ");
  return s.split(/\s+/).filter(w=>w.length>=2&&(!KEY_STOP.has(w)||COLORS.has(w))).map(w=>KEY_SYN[w]||w).join(" ");
};
// Nennt die Bezeichnung mehr als die Grundzutat aus dem Vokabular (Sorte, Farbe, Zusammensetzung)? Dann soll die KI die Sorte bestimmen.
// "Strauchtomaten" -> Tomaten: ja; "Rote Zwiebeln" -> Zwiebeln: ja; "Möhren 1kg" -> Karotten: nein (nur andere Schreibweise ueber KEY_SYN)
const sameWordish = (a,b) => { if(a===b) return true; const [x,y]=a.length<=b.length?[a,b]:[b,a]; return x.length>=4&&y.startsWith(x)&&y.length-x.length<=2; };
export const namesSort = (raw, v) => {
  const words = fold(cleanName(raw,true)).replace(/[^a-z\s]/g," ").split(/\s+/).filter(w=>w.length>=2);
  const vw = fold(v.name).replace(/[^a-z\s]/g," ").split(/\s+/).filter(Boolean);
  return words.some(w=>!vw.some(x=>sameWordish(w,x)) && !(KEY_SYN[w] && v.toks.includes(KEY_SYN[w])));
};

// AUFLOESEN: {name, key, src, toks?, base?, ask?, alt?, at?} oder null (kein Lebensmittel). src: "hand" | "ki" | "regel" | "" (ungeklaert, bereinigter Rohname)
// Neue Zuordnungen (v 2) nennen die Sorte als Namen ("Parmesan") und die Grundzutat fuer die Rezepte (base "Käse").
// key = Sorte (eigene Zeile, eigenes Lernen), toks = Woerter fuer den Rezeptabgleich, base = normierte Grundzutat,
// ask = Vorschlaege, wenn die KI unsicher war, alt = frueherer Schluessel (fuer Streichungen und Gelerntes von vor der Neusortierung).
// rough = Regeltreffer, bei dem die Bezeichnung eine Sorte nennt (geht noch an die KI)
export const resolveName = (raw, {alias, vocab}={}) => {
  const e = alias && alias[aliasKey(raw)];
  if(e && typeof e==="object" && typeof e.name==="string"){
    if(!e.name.trim()) return null;
    // Vokabular-Schreibweise; bei Sorten (v 2) nur, wenn auch die Farbe passt ("Rote Zwiebeln" bleibt)
    const v = (vocab||[]).find(x=>x.key===(e.v===2?sortKey(e.name):normKey(e.name)));
    const name = v ? v.name : e.name.trim();
    const src = e.src==="hand"?"hand":"ki";
    if(e.v!==2) return {name, key: normKey(name) || fold(name).trim(), src};
    const nk = normKey(name) || fold(name).trim();
    const out = {name, key: sortKey(name) || nk, src, toks: nk.split(" "), v:2};
    const bk = typeof e.base==="string" ? normKey(e.base) : "";
    if(bk && bk!==nk) out.base = bk;
    if(Array.isArray(e.ask) && e.ask.length && src==="ki") out.ask = e.ask.filter(x=>typeof x==="string"&&x.trim()).slice(0,3);
    if(typeof e.alt==="string" && e.alt && e.alt!==out.key){ out.alt = e.alt; out.at = Number(e.at)||0; }
    return out;
  }
  const v = ruleMatch(raw, vocab);
  if(v) return namesSort(raw,v) ? {name:v.name, key:v.key, src:"regel", rough:true} : {name:v.name, key:v.key, src:"regel"};
  const c = cleanName(raw);
  return {name:c, key: normKey(c) || normKey(raw) || fold(c).trim(), src:""};
};
// Rohbezeichnungen, die an die KI gehen: ohne Zuordnung, Regeltreffer mit Sorte und (resort) alte KI-Zuordnungen ohne Sorte
export const unmappedNames = (rawNames, ctx) => {
  const seen = new Set(); const out = [];
  (rawNames||[]).forEach(raw=>{
    const k=aliasKey(raw); if(!k||seen.has(k)) return; seen.add(k);
    const e = ctx && ctx.alias && ctx.alias[k];
    if(e && typeof e==="object" && typeof e.name==="string"){ if(ctx.resort && e.src==="ki" && e.v!==2 && e.name.trim()) out.push(raw); return; }
    const r=resolveName(raw,ctx); if(r&&(r.src===""||r.rough)) out.push(raw);
  });
  return out;
};
// LISTE "KEIN LEBENSMITTEL" VERBLASST: nur, was in den letzten days Tagen eingekauft (rawLast: {aliasKey: "YYYY-MM-DD"}) oder ausgeblendet wurde.
// Die Zuordnung selbst bleibt gespeichert, die Sache bleibt also ausgeblendet. Liefert [{key, label}]
export const recentHidden = (alias, rawLast, now, days=7) => {
  const ts = now===undefined?Date.now():now;
  const lim = ts - days*86400000;
  return Object.keys(alias||{}).map(k=>{
    const e = alias[k];
    if(!e||typeof e!=="object"||e.name!=="") return null;
    const d = rawLast && rawLast[k];
    const bought = d ? new Date(d+"T23:59:59").getTime() : 0;
    if(Math.max(bought, Number(e.at)||0) < lim) return null;
    return {key:k,label:(e.raw||k.replace(/_/g," "))};
  }).filter(Boolean);
};
// KI-Antwort pruefen: {"zuordnung":[{"roh":"…","name":"…"|null}]} -> {raw: name|""}; nur angefragte Namen, Vokabular-Schreibweise bevorzugt
export const parseAliasAnswer = (parsed, rawNames, vocab) => {
  const wanted = {}; (rawNames||[]).forEach(r=>{ wanted[fold(r).trim()]=r; });
  const out = {};
  const list = parsed && Array.isArray(parsed.zuordnung) ? parsed.zuordnung : [];
  list.forEach(z=>{
    if(!z||typeof z!=="object") return;
    const raw = wanted[fold(String(z.roh||"")).trim()]; if(!raw) return;
    if(z.name===null || z.name===undefined || String(z.name).trim()===""){ out[raw]=""; return; }
    let name = String(z.name).replace(/\s+/g," ").trim();
    if(name.length>40 || name.split(" ").length>3) return;
    const v = (vocab||[]).find(x=>x.key===normKey(name)); if(v) name=v.name;
    out[raw] = name.charAt(0).toUpperCase()+name.slice(1);
  });
  return out;
};

// KI-Antwort mit Sorte pruefen: {"zuordnung":[{"roh","name","grund","frage":[…]}]} -> {raw: {name, base, ask} | ""}
// name = Sorte ("Parmesan"), base = Grundzutat ("Käse", Vokabular-Schreibweise), ask = bis zu drei Vorschlaege, wenn unklar
const tidy = (x, vocab, keyOf) => {
  let n = String(x||"").replace(/\s+/g," ").trim();
  if(!n || n.length>40 || n.split(" ").length>3) return "";
  const v = (vocab||[]).find(y=>y.key===(keyOf||normKey)(n)); if(v) n=v.name;
  return n.charAt(0).toUpperCase()+n.slice(1);
};
export const parseSortAnswer = (parsed, rawNames, vocab) => {
  const wanted = {}; (rawNames||[]).forEach(r=>{ wanted[fold(r).trim()]=r; });
  const out = {};
  const list = parsed && Array.isArray(parsed.zuordnung) ? parsed.zuordnung : [];
  list.forEach(z=>{
    if(!z||typeof z!=="object") return;
    const raw = wanted[fold(String(z.roh||"")).trim()]; if(!raw) return;
    if(z.name===null || z.name===undefined || String(z.name).trim()===""){ out[raw]=""; return; }
    const name = tidy(z.name, vocab, sortKey); if(!name) return;
    const e = {name};
    const base = tidy(z.grund, vocab);
    if(base && normKey(base)!==normKey(name)) e.base = base;
    const ask = (Array.isArray(z.frage)?z.frage:[]).map(x=>tidy(x,vocab,sortKey)).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0,3);
    if(ask.length>=2) e.ask = ask;
    out[raw] = e;
  });
  return out;
};
