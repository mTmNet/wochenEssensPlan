// ZUTATEN - Parser, Formatierung, Zusammenfuehrung, Bon-Schluessel, Abteilung (reine Funktionen)
import { SHOP_CATS, SHOP_CAT_EXCEPTIONS, KEY_STOP, KEY_SYN, BASIC_END, BASIC_WORDS } from "../data.js";

// Zwei Formate: "Zucchini 750 g" (Name zuerst, eingebaute Rezepte)
//          und  "750 g Zucchini" (Menge zuerst, typisch fuer KI-Import)
export const UNIT_RE = "(?:g|kg|mg|ml|cl|dl|l|el|tl|st(?:k|ück|ueck)?\\.?|bund|prisen?|zehen?|dosen?|pck\\.?|packung(?:en)?|p(?:ä|ae)ckchen|scheiben?|becher|gl(?:a|ä)s(?:er)?|tassen?|msp\\.?|liter|gramm|kilo)";
const ING_PRE_RE = new RegExp("^([\\d]+(?:[.,][\\d]+)?|[½¼¾⅓⅔])\\s*("+UNIT_RE+")?\\s+(.+)$","i");
export const FRACTIONS = {"½":0.5,"¼":0.25,"¾":0.75,"⅓":1/3,"⅔":2/3};
export const parseIng = (t) => {
  const s=t.trim();
  // Format A: Menge zuerst ("750 g Zucchini", "2 Eier", "½ Bund Minze")
  let m=s.match(ING_PRE_RE);
  if(m){
    const amount=FRACTIONS[m[1]]!==undefined?FRACTIONS[m[1]]:parseFloat(m[1].replace(",","."));
    return {name:m[3].trim(),amount,unit:(m[2]||"").trim(),pre:true};
  }
  // Format B: Name zuerst ("Haferflocken 100g", "Eier 2 St.")
  m=s.match(/^(.*?)\s*([\d]+(?:[.,][\d]+)?)\s*(.*)$/);
  if(!m||!m[1].trim()) return {name:s,amount:null,unit:"",pre:false};
  return {name:m[1].trim(),amount:parseFloat(m[2].replace(",",".")),unit:m[3].trim(),pre:false};
};
export const fmtIng = (n,a,u,pre) => {
  if (a===null) return n;
  const d = Number.isInteger(a)?String(a):parseFloat(a.toFixed(1)).toString().replace(".",",");   // Dezimalkomma wie bei scaleIng
  if(pre) return u?d+" "+u+" "+n:d+" "+n;
  return u?n+" "+d+" "+u:n+" "+d;
};
// Gleiche Zutat (Name + Einheit) zusammenfuehren, Mengen addieren
export const aggregateIngs = (raw) => {
  const map=new Map(),order=[];
  raw.forEach(t=>{
    const p=parseIng(t);
    const k=p.name.toLowerCase()+"|||"+p.unit.toLowerCase();
    if(map.has(k)){const e=map.get(k);if(p.amount!==null&&e.amount!==null)e.amount+=p.amount;}
    else{map.set(k,{name:p.name,amount:p.amount,unit:p.unit,pre:p.pre});order.push(k);}
  });
  return order.map(k=>{const e=map.get(k);return fmtIng(e.name,e.amount,e.unit,e.pre);});
};

// MENGE SKALIEREN (Portionen-Stepper): Zahl in beiden Formaten umrechnen und sinnvoll runden:
// g/ml unter 100 in 5er-, sonst in 10er-Schritten; kg/l in 0,05; Stueck ganz (unter 1 halbe); EL/TL/Bund usw. in 0,5
const roundTo = (x, step) => Math.max(step, Math.round(x/step)*step);
const fmtNum = (x) => { const r=Math.round(x*100)/100; return Number.isInteger(r)?String(r):String(r).replace(".",","); };
export const scaleIng = (text, factor) => {
  const t=String(text||"").trim(), f=Number(factor);
  if(!t||!(f>0)||f===1) return t;
  const p=parseIng(t);
  if(p.amount===null||!(p.amount>0)||p.unit.includes("%")) return t;
  const u=fold(p.unit).replace(/\./g,"").trim();
  let a=p.amount*f;
  if(["g","ml","mg","gramm"].includes(u)) a=a<100?roundTo(a,5):roundTo(a,10);
  else if(["kg","l","liter","kilo","cl","dl"].includes(u)) a=roundTo(a,0.05);
  else if(["","st","stk","stueck"].includes(u)) a=a>=1?Math.max(1,Math.round(a)):roundTo(a,0.5);
  else a=roundTo(a,0.5);
  const d=fmtNum(a);
  if(p.pre) return p.unit?d+" "+p.unit+" "+p.name:d+" "+p.name;
  return p.unit?p.name+" "+d+" "+p.unit:p.name+" "+d;
};

// Supermarkt-Abteilung: erst ganze Woerter gegen die Ausnahmeliste (Komposita wie Kokosmilch), dann Stichwortsuche
export const shopCat = (text) => {
  const l = String(text||"").toLowerCase();
  const words = l.replace(/[^a-zäöüß\s-]/g," ").split(/[\s-]+/).filter(Boolean);
  for (const w of words) { if (SHOP_CAT_EXCEPTIONS[w]) return SHOP_CAT_EXCEPTIONS[w]; }
  for (const c of SHOP_CATS) {
    if (c.keys.some(k => l.includes(k))) return c.label;
  }
  return "Sonstiges";
};

// BON-ABGLEICH: Umlaute auflösen, Mengen/Stoppwoerter entfernen, Synonyme vereinheitlichen
export const fold = (t) => String(t||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss");
export const normKey = (t) => {
  let s = fold(t).replace(/\([^)]*\)/g," ").replace(/\d+(?:[.,]\d+)?\s*%/g," ");
  s = s.replace(new RegExp("\\b\\d+(?:[.,]\\d+)?\\s*"+UNIT_RE+"\\b","gi")," ");
  s = s.replace(/[^a-z\s]/g," ");
  return s.split(/\s+/).filter(w=>w.length>=2&&!KEY_STOP.has(w)).map(w=>KEY_SYN[w]||w).join(" ");
};
// Zwei Woerter passen: gleich, Plural/Bon-Kuerzel ("tomate"/"tomaten", "jogh"/"joghurt"),
// Kompositum-Kopf ("kirschtomaten"/"tomaten") oder lange gemeinsame Vorsilbe ("haehnchenbrust"/"haehnchenbrustfilet")
const TOK_NOMATCH = new Set(["lauch|knoblauch","lauch|schnittlauch"]);
export const tokMatch = (a,b) => {
  if(a===b) return true;
  const [s,l] = a.length<=b.length?[a,b]:[b,a];
  if(s.length<3||TOK_NOMATCH.has(s+"|"+l)) return false;
  if(l.startsWith(s)&&((s.length>=4&&l.length-s.length<=3)||s.length>=6)) return true;
  return s.length>=4&&l.endsWith(s);
};
// Basics gelten immer als vorhanden (alle Woerter der Zutat muessen Basics sein)
export const isBasic = (key) => { const t=key.split(" ").filter(Boolean); return t.length>0&&t.every(w=>BASIC_END.some(b=>w.endsWith(b))||w.includes("gewuerz")||BASIC_WORDS.has(w)); };
// Grundvorrat anhand des Zutatentexts ("Olivenöl 2 EL", "Salz und Pfeffer")
export const isBasicText = (text) => { const k=normKey(parseIng(String(text||"")).name); return !!k&&isBasic(k); };

// EINKAUFSSCHLUESSEL: normierter Name + Einheitenklasse (g/kg -> g, ml/l -> ml, St./leer -> st), dient dem Zusammenfuehren
export const unitClass = (u) => {
  const x=fold(u).replace(/\./g,"").trim();
  if(["g","kg","mg","gramm","kilo"].includes(x)) return "g";
  if(["ml","l","cl","dl","liter"].includes(x)) return "ml";
  if(["","st","stk","stueck"].includes(x)) return "st";
  return x;
};
export const ingKey = (text) => {
  const p=parseIng(String(text||""));
  const n=normKey(p.name)||fold(p.name).trim();
  return n+"|"+unitClass(p.unit.replace(/\([^)]*\)/g,"").trim());   // Zusatz in Klammern ("(Bio)") zaehlt nicht zur Einheit
};
