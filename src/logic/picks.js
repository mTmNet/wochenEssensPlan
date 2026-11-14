// VORMERKEN - Gerichte fuer einen Tag oder "demnaechst" (reine Funktionen).
// plans/<CODE>/picks/<id> = { key, day: "YYYY-MM-DD" | "", createdAt }; day "" = demnaechst (ohne Tag)
import { DAYFUL } from "../data.js";
import { todayISO, todayDay, shortDate } from "./weeks.js";
import { scaledIngredients, makeShopItem, newShopId } from "./shopping.js";
import { aggregateIngs } from "./ingredients.js";
import { dn } from "./recipes.js";

export const newPickId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const isISO = (s) => typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Objekt vom Server -> Liste [{id,key,day,createdAt}], sortiert: datierte nach Tag, dann demnaechst, je nach Anlagezeit
export const pickList = (obj) => {
  const src = obj&&typeof obj==="object"&&!Array.isArray(obj) ? obj : {};
  return Object.keys(src)
    .filter(id=>src[id]&&typeof src[id]==="object"&&typeof src[id].key==="string"&&src[id].key.trim())
    .map(id=>({id,key:src[id].key,day:isISO(src[id].day)?src[id].day:"",createdAt:Number(src[id].createdAt)||0}))
    .sort((a,b)=>{
      if(a.day&&b.day) return a.day<b.day?-1:a.day>b.day?1:(a.createdAt-b.createdAt);
      if(a.day!==b.day) return a.day?-1:1;          // datierte vor "demnaechst"
      return (a.createdAt-b.createdAt)||a.id.localeCompare(b.id);
    });
};
// ISO-Datum um n Tage verschieben
export const addDays = (iso, n) => { const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); const d=m?new Date(+m[1],+m[2]-1,+m[3],12):new Date(); d.setDate(d.getDate()+(n||0)); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
// Anzeige eines Tages: "Heute", "Morgen", "Mittwoch, 19.11.", vergangene Tage "Mo, 10.11. (vorbei)"
export const dayLabel = (iso, today) => {
  const t = today||todayISO();
  if(!iso) return "Demnächst";
  if(iso===t) return "Heute";
  if(iso===addDays(t,1)) return "Morgen";
  const name = DAYFUL[todayDay(iso)];
  if(iso<t) return name.slice(0,2)+", "+shortDate(iso)+" (vorbei)";
  return name+", "+shortDate(iso);
};
// Auswahl fuer den Dialog "Vormerken": Heute, Morgen, die naechsten 5 Tage, Demnaechst
export const dayChoices = (today) => {
  const t = today||todayISO();
  const out=[{day:t,label:"Heute"},{day:addDays(t,1),label:"Morgen"}];
  for(let i=2;i<=6;i++){ const d=addDays(t,i); out.push({day:d,label:DAYFUL[todayDay(d)].slice(0,2)+" "+shortDate(d)}); }
  out.push({day:"",label:"Demnächst"});
  return out;
};
// Gruppen fuer die Ansicht: [{day,label,items}] in Reihenfolge heute -> spaeter -> demnaechst; vergangene zuerst (zum Aufraeumen)
export const groupPicks = (list, today) => {
  const t = today||todayISO();
  const by={};
  list.forEach(p=>{ (by[p.day]=by[p.day]||[]).push(p); });
  const days=Object.keys(by).filter(d=>d).sort();
  const past=days.filter(d=>d<t), future=days.filter(d=>d>=t);
  const mk=(d)=>({day:d,label:dayLabel(d,t),items:by[d],past:!!d&&d<t});
  return [...past.map(mk),...future.map(mk),...(by[""]?[mk("")]:[])];
};
export const picksForDay = (list, day) => list.filter(p=>p.day===day);
// Einkaufsliste aus den vorgemerkten Gerichten (nicht vergangene): Zutaten skaliert und addiert; ohne Rezept "(Zutaten pruefen)"
export const pickItems = (list, recipes, now, opts={}) => {
  const ts=now===undefined?Date.now():now, t=opts.today||todayISO();
  const rawIngs=[], dishes=[];
  list.filter(p=>!p.day||p.day>=t).forEach(p=>{
    const rec=recipes&&recipes[p.key];
    if(rec&&rec.ingredients&&rec.ingredients.length) scaledIngredients(rec,opts.servings).forEach(i=>rawIngs.push(i));
    else dishes.push(dn(p.key)+" (Zutaten prüfen)");
  });
  const out={}; let order=1;
  aggregateIngs(rawIngs).forEach(x=>{ out[newShopId()+String(order).padStart(3,"0")]=makeShopItem(x,{src:"plan",order:order++,now:ts}); });
  [...new Set(dishes)].forEach(x=>{ out[newShopId()+String(order).padStart(3,"0")]=makeShopItem(x,{src:"plan",order:order++,cat:"Sonstiges",now:ts,basic:false}); });
  return out;
};
