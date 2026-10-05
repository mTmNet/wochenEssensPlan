// WOCHEN UND DATUM (reine Funktionen, ISO-8601-Wochen: Montag Wochenbeginn, Jahreswechsel korrekt)
import { DAYS, MEALS } from "../data.js";

const pad2 = (n) => String(n).padStart(2,"0");
const fmtISO = (d) => d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
// "YYYY-MM-DD" -> lokales Datum (12 Uhr, damit Sommerzeit nichts verschiebt); Date wird durchgereicht
const toDate = (v) => {
  if(v instanceof Date) return new Date(v.getFullYear(),v.getMonth(),v.getDate(),12);
  const m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3],12);
  const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);
};

export const todayISO = () => fmtISO(new Date());
// Index des heutigen Tags in DAYS (Mo=0 … So=6)
export const todayDay = (v) => { const d=toDate(v); return (d.getDay()+6)%7; };
// Kuerzel des heutigen Tags ("Mo" … "So")
export const todayDayKey = (v) => DAYS[todayDay(v)];
// Kurzes Datum fuer den Tageskopf: "6.10."
export const shortDate = (iso) => { const d=toDate(iso); return d.getDate()+"."+(d.getMonth()+1)+"."; };
// Tage seit einem ISO-Datum, nie negativ (Kochtag selbst = 0)
export const daysSince = (iso, now) => {
  if(!iso) return null;
  const a=toDate(iso), b=toDate(now===undefined?new Date():now);
  return Math.max(0,Math.round((b-a)/86400000));
};

// ISO-Wochenschluessel "YYYY-Www" zu einem Datum (Donnerstag der Woche bestimmt das Jahr)
export const isoWeekKey = (v) => {
  const d=toDate(v);
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=t.getUTCDay()||7;                      // Mo=1 … So=7
  t.setUTCDate(t.getUTCDate()+4-dayNum);              // Donnerstag derselben Woche
  const yearStart=Date.UTC(t.getUTCFullYear(),0,1);
  const week=Math.ceil(((t-yearStart)/86400000+1)/7);
  return t.getUTCFullYear()+"-W"+pad2(week);
};
// Montag der ISO-Woche (der 4. Januar liegt immer in Woche 1)
const mondayOf = (key) => {
  const m=String(key||"").match(/^(\d{4})-W(\d{2})$/);
  if(!m) return toDate(new Date());
  const jan4=new Date(+m[1],0,4,12);
  const mon=new Date(jan4); mon.setDate(jan4.getDate()-((jan4.getDay()+6)%7)+(+m[2]-1)*7);
  return mon;
};
// Die sieben ISO-Daten der Woche (Mo … So)
export const weekDates = (key) => {
  const mon=mondayOf(key);
  return DAYS.map((_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return fmtISO(d); });
};
// Wochenschluessel um n Wochen verschieben
export const shiftWeek = (key, n) => { const mon=mondayOf(key); mon.setDate(mon.getDate()+7*(n||0)); return isoWeekKey(mon); };
// Anzeige "KW 41 · 6.–12. Okt." (Monatswechsel: "28. Sep.–4. Okt.")
export const weekLabel = (key) => {
  const ds=weekDates(key); const a=toDate(ds[0]), b=toDate(ds[6]);
  const mon=(d)=>d.toLocaleDateString("de-DE",{month:"short"});
  const kw=parseInt(String(key).slice(-2),10);
  const range=a.getMonth()===b.getMonth()
    ? a.getDate()+".–"+b.getDate()+". "+mon(b)
    : a.getDate()+". "+mon(a)+"–"+b.getDate()+". "+mon(b);
  return "KW "+kw+" · "+range;
};
// Welcher Slot passt zur Uhrzeit: vor 11 Uhr Fruehstueck, 11–14 Uhr Mittag, danach Abend
export const mealSlotNow = (d) => { const h=(d||new Date()).getHours(); return h<11?"Fr":h<14?"Mi":"Ab"; };
// Slot-Reihenfolge fuer "Heute im Plan": aktueller Slot zuerst, dann die spaeteren, dann die schon vergangenen
export const slotOrderNow = (d) => {
  const main=MEALS.filter(m=>m!=="Zw"), i=Math.max(0,main.indexOf(mealSlotNow(d)));
  return [...main.slice(i),...main.slice(0,i),...MEALS.filter(m=>m==="Zw")];
};

// Leere Woche: pro Tag alle Slots leer (Array), kein Koch
export const emptyWeek = () => {
  const p={};
  DAYS.forEach(d=>{p[d]={meals:{},cook:""};MEALS.forEach(m=>{p[d].meals[m]=[];});});
  p.planId="";
  return p;
};
// Slotwert -> Array (Einzel-Strings und "" aus dem Altbestand, Firebase-Objekte mit Indexschluesseln)
export const slotList = (v) => {
  if(!v) return [];
  if(Array.isArray(v)) return v.filter(x=>typeof x==="string"&&x.trim());
  if(typeof v==="string") return v.trim()?[v]:[];
  if(typeof v==="object") return Object.keys(v).sort((a,b)=>a-b).map(k=>v[k]).filter(x=>typeof x==="string"&&x.trim());
  return [];
};
// Woche vom Server oder aus dem Altbestand in die feste Form bringen (fehlende Tage/Slots ergaenzen)
export const migrateWeek = (plan) => {
  const w=emptyWeek();
  if(!plan||typeof plan!=="object") return w;
  DAYS.forEach(d=>{
    const src=plan[d];
    if(!src||typeof src!=="object") return;
    const meals=src.meals&&typeof src.meals==="object"?src.meals:src;   // ganz alte Form: Tag = Slots direkt
    MEALS.forEach(m=>{ w[d].meals[m]=slotList(meals[m]); });
    w[d].cook=typeof src.cook==="string"?src.cook:"";
  });
  w.planId = typeof plan.planId==="string" ? plan.planId : "";   // Essensplan, aus dem die Woche stammt (leer = keiner)
  return w;
};
export const normalizeWeek = migrateWeek;
