// EINKAUFSLISTE - Posten als Objekt <id> -> {text, checked, cat, src, key, order, addedAt, basic, forceBuy, slots} (reine Funktionen)
// src "plan" = aus "Einkaufsliste aus dem Plan", "manuell" = Handeingabe oder "+" am Rezept
// basic = Grundvorrat (Block "Vorrat prüfen"), forceBuy = trotzdem kaufen, slots = Plan-Zellen, aus denen der Posten per "+" kam
import { SHOP_ORDER, SHOP_CAT_ALIAS } from "../data.js";
import { shopCat, ingKey, parseIng, fmtIng, aggregateIngs, scaleIng, isBasicText } from "./ingredients.js";

// Firebase-sicherer Schluessel: Zeit (Basis 36) + Zufall, sortiert sich zeitlich
export const newShopId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

export const makeShopItem = (text, opts={}) => {
  const t=String(text||"").trim();
  const src=opts.src||"manuell";
  const item={ text:t, checked:!!opts.checked, cat:opts.cat||shopCat(t), src, key:ingKey(t), order:opts.order||0, addedAt:opts.now===undefined?Date.now():opts.now };
  // Grundvorrat nur bei Posten aus dem Plan kennzeichnen (von Hand eingetragenes Salz soll gekauft werden)
  const basic = opts.basic!==undefined ? !!opts.basic : (src==="plan" && isBasicText(t));
  if(basic) item.basic=true;
  if(opts.forceBuy) item.forceBuy=true;
  if(opts.slot) item.slots={[opts.slot]:true};
  return item;
};
// Abteilung eines Postens (alte Namen uebersetzen)
export const itemCat = (item) => { const c=(item&&item.cat)||shopCat(item&&item.text||""); return SHOP_CAT_ALIAS[c]||c; };
// Steht der Posten in der eigentlichen Liste? Grundvorrat nur, wenn ausdruecklich gewuenscht (forceBuy)
export const isListed = (item) => !!item && (!item.basic || !!item.forceBuy);
// Objekt -> sortierte Liste [{...item,id}] (nach order, dann Zeit); Eintraege ohne text (Waisen) werden ausgelassen
export const shoppingList = (shopping) => {
  const src = shopping&&typeof shopping==="object"&&!Array.isArray(shopping) ? shopping : {};
  return Object.keys(src).filter(id=>src[id]&&typeof src[id]==="object"&&src[id].text)
    .map(id=>({...src[id],id}))
    .sort((a,b)=>((a.order||0)-(b.order||0))||((a.addedAt||0)-(b.addedAt||0))||a.id.localeCompare(b.id));
};
// Ids von Waisen (Eintraege ohne text, z. B. {checked:true} auf einen geloeschten Posten)
export const orphanIds = (shopping) => {
  const src = shopping&&typeof shopping==="object"&&!Array.isArray(shopping) ? shopping : {};
  return Object.keys(src).filter(id=>!(src[id]&&typeof src[id]==="object"&&src[id].text));
};
export const nextOrder = (shopping) => shoppingList(shopping).reduce((m,x)=>Math.max(m,x.order||0),0)+1;
// Offene Posten der eigentlichen Liste (Grundvorrat zaehlt nicht)
export const uncheckedCount = (shopping) => shoppingList(shopping).filter(x=>isListed(x)&&!x.checked).length;
// Zellen (Altbestand), deren Zutaten schon per "+" in der Liste sind
export const addedSlotKeys = (shopping) => {
  const out={};
  shoppingList(shopping).forEach(it=>{ Object.keys(it.slots||{}).forEach(k=>{ out[k]=true; }); });
  return out;
};

// Altbestand (Array) -> Objekt mit festen Ids ("alt000", "alt001" …), damit zwei gleichzeitige Migrationen dasselbe schreiben
export const migrateShopping = (arr, now) => {
  const ts=now===undefined?Date.now():now;
  const list=Array.isArray(arr)?arr:(arr&&typeof arr==="object"?Object.values(arr):[]);
  const out={};
  list.forEach((it,i)=>{
    if(!it||typeof it!=="object"||!it.text) return;
    const id="alt"+String(i).padStart(3,"0");
    out[id]=makeShopItem(it.text,{src:"plan",order:i+1,checked:!!it.checked,cat:it.cat,now:ts});
  });
  return out;
};
// Liefert [{cat, items:[{...item,id}]}] in Abteilungsreihenfolge; abgehakte Posten rutschen ans Ende ihrer Abteilung
export const groupShopping = (shopping) => {
  const groups={};
  const list = Array.isArray(shopping) ? shopping : shoppingList(shopping);
  list.forEach(item=>{
    const cat=itemCat(item);
    if(!groups[cat])groups[cat]=[];
    groups[cat].push(item);
  });
  Object.keys(groups).forEach(c=>{ groups[c]=[...groups[c].filter(i=>!i.checked),...groups[c].filter(i=>i.checked)]; });
  const known=SHOP_ORDER.filter(c=>groups[c]&&groups[c].length).map(c=>({cat:c,items:groups[c]}));
  const rest=Object.keys(groups).filter(c=>!SHOP_ORDER.includes(c)).map(c=>({cat:c,items:groups[c]}));
  return [...known,...rest];
};

// Zutaten zur Liste: gleiche Zutat (Name + Einheit) erhoeht die Menge, neue kommen hinten dazu.
// opts.slot merkt die Plan-Zelle am Posten ("+"-Sperre liegt damit im Plan, nicht nur im Geraet).
// Liefert {next, patch}: next = neues Objekt, patch = gezielte Pfade fuer writePlan
export const addIngredients = (shopping, ings, opts={}) => {
  const src=opts.src||"manuell", now=opts.now===undefined?Date.now():opts.now, slot=opts.slot||"";
  const list=shoppingList(shopping);
  const next={...(shopping||{})}, patch={};
  let order=nextOrder(shopping);
  const sig=(t)=>{ const p=parseIng(t); return p.name.toLowerCase()+"|||"+p.unit.toLowerCase(); };
  (ings||[]).forEach(text=>{
    const t=String(text||"").trim(); if(!t) return;
    const p=parseIng(t), k=sig(t);
    const hit=list.find(it=>sig(it.text)===k);
    if(hit){
      const q=parseIng(hit.text);
      if(p.amount!==null&&q.amount!==null){
        const nt=fmtIng(q.name,q.amount+p.amount,q.unit,q.pre);
        hit.text=nt; next[hit.id]={...next[hit.id],text:nt,key:ingKey(nt)};
        patch["shopping/"+hit.id+"/text"]=nt; patch["shopping/"+hit.id+"/key"]=next[hit.id].key;
      }
      if(slot&&!(hit.slots&&hit.slots[slot])){
        next[hit.id]={...next[hit.id],slots:{...(next[hit.id].slots||{}),[slot]:true}};
        patch["shopping/"+hit.id+"/slots/"+slot]=true;
      }
    }else{
      const id=newShopId(); const item=makeShopItem(t,{src,order:order++,now,slot});
      next[id]=item; patch["shopping/"+id]=item; list.push({...item,id});
    }
  });
  return {next,patch};
};

// Mengen eines Rezepts auf die Haushaltsgroesse umrechnen (Bauplan Abschnitt 9)
export const scaledIngredients = (rec, servings) => {
  const base=rec&&rec.servings>0?rec.servings:4, target=servings>0?servings:base;
  const f=target/base;
  return ((rec&&rec.ingredients)||[]).map(i=>scaleIng(i,f));
};

// Liste aus dem Plan ZUSAMMENFUEHREN statt ersetzen (Bauplan Abschnitt 9):
// - Posten mit src "plan", deren key nicht mehr gebraucht wird, verschwinden (shopping/<id>: null)
// - gleicher key: Menge/Text neu, checked (und forceBuy) bleiben, Id bleibt
// - neue keys kommen hinten dazu
// - src "manuell" bleibt unangetastet; Ausnahme: Posten aus dem "+" einer Plan-Zelle (slots) mit gleichem key werden Plan-Posten
// Liefert {next, patch} wie addIngredients
export const mergeShopping = (shopping, items) => {
  const cur = shopping&&typeof shopping==="object"&&!Array.isArray(shopping) ? shopping : {};
  const next={...cur}, patch={};
  const oldPlan = Object.keys(cur).filter(id=>cur[id]&&typeof cur[id]==="object"&&cur[id].text&&cur[id].src==="plan");
  // Posten, die per "+" aus einer Plan-Zelle kamen (src manuell, slots), gelten bei gleichem key als Plan-Posten: kein Doppel, keine doppelte Menge
  const plusItems = Object.keys(cur).filter(id=>cur[id]&&typeof cur[id]==="object"&&cur[id].text&&cur[id].src==="manuell"&&cur[id].slots&&Object.keys(cur[id].slots).length);
  const byKey={};
  oldPlan.forEach(id=>{ const k=cur[id].key||ingKey(cur[id].text); if(byKey[k]===undefined) byKey[k]=id; });
  plusItems.forEach(id=>{ const k=cur[id].key||ingKey(cur[id].text); if(byKey[k]===undefined) byKey[k]=id; });
  const used=new Set();
  let order=nextOrder(cur);
  Object.keys(items||{}).sort((a,b)=>(items[a].order||0)-(items[b].order||0)).forEach(nid=>{
    const it=items[nid]; if(!it||!it.text) return;
    const k=it.key||ingKey(it.text);
    const oid=byKey[k];
    if(oid!==undefined&&!used.has(oid)){
      used.add(oid);
      const o=cur[oid], upd={};
      // Text nur neu setzen, wenn sich die Menge geaendert hat (gleicher key = gleiche Einheitenklasse; ein von Hand ergaenzter Zusatz wie "(Bio)" bleibt sonst)
      if(o.text!==it.text&&parseIng(o.text).amount!==parseIng(it.text).amount) upd.text=it.text;
      if(itemCat(o)!==it.cat) upd.cat=it.cat;
      if(o.key!==k) upd.key=k;
      if(!!o.basic!==!!it.basic) upd.basic=it.basic?true:null;
      if(o.src!=="plan") upd.src="plan";                    // uebernommener "+"-Posten wird zum Plan-Posten
      if(Object.keys(upd).length){
        next[oid]={...o,...upd}; if(upd.basic===null) delete next[oid].basic;
        Object.keys(upd).forEach(f=>{ patch["shopping/"+oid+"/"+f]=upd[f]; });
      }
    }else{
      const item={...it,order:order++};
      next[nid]=item; patch["shopping/"+nid]=item;
    }
  });
  oldPlan.forEach(id=>{ if(!used.has(id)){ delete next[id]; patch["shopping/"+id]=null; } });
  return {next,patch};
};

// "Einkaufsliste aus dem Vorgemerkten" legt nur Fehlendes auf die Liste: neue Posten, die laut Vorrat da sind (inStock(text)), fallen weg.
// Grundvorrat bleibt (Block "Vorrat pruefen"); was schon auf der Liste steht (gleicher key), bleibt ebenfalls, sonst wuerde mergeShopping es entfernen.
export const onlyNeeded = (items, shopping, inStock) => {
  const cur = shopping&&typeof shopping==="object"&&!Array.isArray(shopping) ? shopping : {};
  const have = new Set(Object.values(cur).filter(o=>o&&typeof o==="object"&&o.text).map(o=>o.key||ingKey(o.text)));
  const out={};
  Object.keys(items||{}).forEach(id=>{ const it=items[id]; if(!it||!it.text) return; if(it.basic||have.has(it.key||ingKey(it.text))||!inStock(it.text)) out[id]=it; });
  return out;
};

// Klartext zum Teilen (Abteilungen als Ueberschriften); nimmt ein Objekt oder eine fertige Liste
export const shoppingText = (shopping) => groupShopping(shopping).map(g=>g.cat.toUpperCase()+"\n"+g.items.map(i=>(i.checked?"[x] ":"[ ] ")+i.text).join("\n")).join("\n\n");

// MENGENAUSWAHL im Einkauf: Die Menge steht wie bei Rezept-Zutaten vorn im Text des Postens ("200 g Käse", "2 Käse"), kein eigenes Feld.
// Posten in Name und Menge trennen ("Zucchini 750 g" -> {name:"Zucchini", qty:"750 g"})
const qtyNum = (a) => { const r=Math.round(a*100)/100; return Number.isInteger(r)?String(r):String(r).replace(".",","); };
export const splitQty = (text) => {
  const t=String(text||"").trim();
  const p=parseIng(t);
  if(p.amount===null) return {name:t,qty:""};
  return {name:p.name,qty:qtyNum(p.amount)+(p.unit?" "+p.unit:"")};
};
// Name und Menge wieder zum Text des Postens zusammensetzen (Menge vorn)
export const joinQty = (name, qty) => { const n=String(name||"").trim(), q=String(qty||"").trim(); return q&&n?q+" "+n:n; };

// Einheiten zur Auswahl; "" = Stück (nur die Zahl). many = Mehrzahl, nums = Zahlen zum Antippen
const NUMS_ST=["1","2","3","4","5","6","8","10","12"];
export const QTY_UNITS = {
  "":        {label:"Stück",   nums:NUMS_ST},
  "g":       {label:"g",       nums:["100","150","200","250","300","400","500","750"]},
  "kg":      {label:"kg",      nums:["0,5","1","1,5","2","2,5","3","5"]},
  "ml":      {label:"ml",      nums:["100","200","250","330","500","750"]},
  "l":       {label:"Liter",     nums:["0,5","1","1,5","2","3","6"]},
  "Packung": {label:"Packung", many:"Packungen", nums:NUMS_ST},
  "Dose":    {label:"Dose",    many:"Dosen",     nums:NUMS_ST},
  "Glas":    {label:"Glas",    many:"Gläser",    nums:NUMS_ST},
  "Becher":  {label:"Becher",  nums:NUMS_ST},
  "Bund":    {label:"Bund",    nums:NUMS_ST},
  "Scheiben":{label:"Scheiben",nums:NUMS_ST},
};
// Welche Einheiten zu welcher Abteilung passen (Stück steht immer vorn)
const QTY_BY_CAT = {
  "Obst & Gemüse":["g","kg","Bund","Packung"],
  "Kräuter & Frisches":["Bund","Packung"],
  "Fleisch & Fisch":["g","kg","Packung","Scheiben"],
  "Milch & Käse":["g","Packung","Scheiben","Becher","l"],
  "Kühlregal":["g","Packung","Becher"],
  "Tiefkühl":["g","kg","Packung"],
  "Backwaren":["g","kg","Packung","Scheiben"],
  "Trockenwaren":["g","kg","Packung"],
  "Konserven & Gläser":["Dose","Glas","g","ml"],
  "Gewürze & Öle":["g","ml","l","Glas","Packung"],
  "Getränke":["l","ml","Packung"],
  "Sonstiges":["g","kg","ml","l","Packung"],
};
export const qtyUnits = (name) => { const c=shopCat(name); const cat=SHOP_CAT_ALIAS[c]||c; return ["",...(QTY_BY_CAT[cat]||QTY_BY_CAT.Sonstiges)]; };
// Menge lesen: {num, unit} mit unit als Schluessel aus QTY_UNITS; null, wenn die Menge freier Text ist ("Bio", "2 große")
const UNIT_READ = {"":"","st":"","stk":"","stueck":"","g":"g","gramm":"g","kg":"kg","kilo":"kg","ml":"ml","l":"l","liter":"l","pck":"Packung","packung":"Packung","packungen":"Packung","dose":"Dose","dosen":"Dose","glas":"Glas","glaeser":"Glas","becher":"Becher","bund":"Bund","scheibe":"Scheiben","scheiben":"Scheiben"};
const foldU = (u) => String(u||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/\./g,"").trim();
export const readQty = (qty) => {
  const m=String(qty||"").trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if(!m) return null;
  const unit=UNIT_READ[foldU(m[2])];
  return unit===undefined?null:{num:m[1].replace(".",","),unit};
};
const fmtQty = (num, unit) => { const u=QTY_UNITS[unit]; const word=unit===""?"":(u.many&&num!=="1"?u.many:unit); return word?num+" "+word:num; };
// Tipp auf eine Zahl: Einheit bleibt. Tipp auf eine Einheit: Zahl bleibt, wenn sie zur Einheit passt, sonst der uebliche Startwert
export const applyQty = (qty, chip) => {
  const cur=readQty(qty)||{num:"",unit:""};
  if(chip.num!==undefined) return fmtQty(chip.num,cur.unit);
  const unit=chip.unit, nums=QTY_UNITS[unit].nums;
  const fits = cur.num && (nums.includes(cur.num) || (QTY_UNITS[cur.unit].nums===nums));
  const start = {g:"200",ml:"500"}[unit]||"1";
  return fmtQty(fits?cur.num:start,unit);
};
