// NAMEN NORMIEREN - Kassenbon-Bezeichnungen ("Bio Strauchtomaten 500g") auf die Zutatennamen der Rezepte ("Tomaten") abbilden.
// Drei Quellen, in dieser Reihenfolge: Hand-Zuordnung > KI-Zuordnung (beide gespeichert unter stock/alias) > Regel (Mengen, Marken,
// Fuellwoerter weg, dann Abgleich mit dem Vokabular aus Kochbuch und Rezept-Basis). Ohne Treffer bleibt der bereinigte Name.
import { parseIng, normKey, tokMatch, isBasic, fold } from "./ingredients.js";
import { KEY_STOP } from "../data.js";

// Firebase-tauglicher Schluessel der Rohbezeichnung (stock/alias/<aliasKey>)
export const aliasKey = (raw) => (normKey(raw) || fold(raw).replace(/[^a-z0-9]+/g," ").trim()).replace(/\s+/g,"_").replace(/[.#$\[\]\/]/g,"").slice(0,120);

const BRANDS = new Set(["barilla","ja","gut","guenstig","rewe","edeka","aldi","lidl","penny","dm","netto","kaufland","milram","mueller","danone","oetker","knorr","maggi","iglo","bonduelle","hochland","kerrygold","alnatura","dennree","bioland","demeter","rapunzel","weihenstephan","landliebe","ehrmann","zott","bauer","meggle","ruegenwalder","wiesenhof","buitoni","de","cecco","birkel","seitenbacher","koelln","kelloggs","nestle","ferrero","milka","ritter","sport","haribo","bahlsen","leibniz","lorenz","funny","frisch","chio","pringles","coca","cola","pepsi","fanta","sprite","volvic","evian","gerolsteiner","vittel","kaercher","tchibo","dallmayr","jacobs","melitta","lavazza","teekanne","meissner","k","classic","premium","select","original","finest","deluxe","bestes","beste","gold","feinkost","feine","marke","pik","as"]);
const ABBR = new Set(["stk","st","pck","pkg","fl","btl","bt","gr","kart","ca","festk","mehlig","vorw","fk","mk","tk","hkl","kl","gr","xl","xxl","ltr","l","ml","g","kg","mg"]);
// Bereinigte Bezeichnung: Klammern, Prozent, Mengen mit Einheit, "3er"/"10er", Marken, Kuerzel und Fuellwoerter weg; Schreibweise bleibt
export const cleanName = (raw) => {
  let s = String(raw||"").replace(/\([^)]*\)/g," ").replace(/\d+(?:[.,]\d+)?\s*%/g," ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:er|x|g|kg|mg|ml|cl|dl|l|ltr|st|stk|stueck|stück|pck|pkg|fl|btl)\b\.?/gi," ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\b/g," ");
  const words = s.split(/[\s,;/+*]+/).map(w=>w.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß]+$/g,"")).filter(Boolean);
  const kept = words.filter(w=>{ const f=fold(w); return f.length>=2 && !BRANDS.has(f) && !ABBR.has(f) && !KEY_STOP.has(f); });
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

// AUFLOESEN: {name, key, src} oder null (kein Lebensmittel). src: "hand" | "ki" | "regel" | "" (ungeklaert, bereinigter Rohname)
export const resolveName = (raw, {alias, vocab}={}) => {
  const e = alias && alias[aliasKey(raw)];
  if(e && typeof e==="object" && typeof e.name==="string"){
    if(!e.name.trim()) return null;
    const v = (vocab||[]).find(x=>x.key===normKey(e.name));
    const name = v ? v.name : e.name.trim();
    return {name, key: normKey(name) || fold(name).trim(), src: e.src==="hand"?"hand":"ki"};
  }
  const v = ruleMatch(raw, vocab);
  if(v) return {name:v.name, key:v.key, src:"regel"};
  const c = cleanName(raw);
  return {name:c, key: normKey(c) || normKey(raw) || fold(c).trim(), src:""};
};
// Rohbezeichnungen ohne Hand-, KI- oder Regelzuordnung (die gehen gebuendelt an die KI)
export const unmappedNames = (rawNames, ctx) => {
  const seen = new Set(); const out = [];
  (rawNames||[]).forEach(raw=>{ const k=aliasKey(raw); if(!k||seen.has(k)) return; seen.add(k); const r=resolveName(raw,ctx); if(r&&r.src==="") out.push(raw); });
  return out;
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
