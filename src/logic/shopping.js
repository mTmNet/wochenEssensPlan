// EINKAUFSLISTE - Posten als Objekt <id> -> {text, checked, cat, src, key, order, addedAt, basic, forceBuy, slots} (reine Funktionen)
// src "plan" = aus "Einkaufsliste aus dem Plan", "manuell" = Handeingabe oder "+" am Rezept
// basic = Grundvorrat (Block "Vorrat prüfen"), forceBuy = trotzdem kaufen, slots = Plan-Zellen, aus denen der Posten per "+" kam
import { DAYS, MEALS, SHOP_ORDER, SHOP_CAT_ALIAS } from "../data.js";
import { shopCat, ingKey, parseIng, fmtIng, aggregateIngs, scaleIng, isBasicText } from "./ingredients.js";
import { slotList } from "./weeks.js";
import { dn } from "./recipes.js";

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
// Plan-Zellen (wk|Tag|Slot|Gericht), deren Zutaten schon per "+" in der Liste sind
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

// Einkaufsliste aus einer Woche: Rezeptzutaten (skaliert auf servings) zusammengefuehrt, Gerichte ohne Rezept als "(Zutaten pruefen)"
export const planItems = (week, recipes, now, opts={}) => {
  const ts=now===undefined?Date.now():now;
  const rawIngs=[], dishes=[];
  DAYS.forEach(day=>MEALS.forEach(meal=>{
    slotList(week&&week[day]&&week[day].meals&&week[day].meals[meal]).forEach(dish=>{
      const rec=recipes&&recipes[dish];
      if(rec&&rec.ingredients&&rec.ingredients.length) scaledIngredients(rec,opts.servings).forEach(i=>rawIngs.push(i));
      else dishes.push(dn(dish)+" (Zutaten prüfen)");
    });
  }));
  const out={}; let order=1;
  aggregateIngs(rawIngs).forEach(t=>{ out[newShopId()+String(order).padStart(3,"0")]=makeShopItem(t,{src:"plan",order:order++,now:ts}); });
  [...new Set(dishes)].forEach(t=>{ out[newShopId()+String(order).padStart(3,"0")]=makeShopItem(t,{src:"plan",order:order++,cat:"Sonstiges",now:ts,basic:false}); });
  return out;
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

// Klartext zum Teilen (Abteilungen als Ueberschriften); nimmt ein Objekt oder eine fertige Liste
export const shoppingText = (shopping) => groupShopping(shopping).map(g=>g.cat.toUpperCase()+"\n"+g.items.map(i=>(i.checked?"[x] ":"[ ] ")+i.text).join("\n")).join("\n\n");
