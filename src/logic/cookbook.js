// KOCHBUCH ALS DATEI - Export und Import aller (oder einzelner) Rezepte (mit Bewertung, Notizen, Kochdaten, Fotos) als JSON, um Plaene zu wechseln.
// Reine Funktionen: exportCookbook baut das Objekt, parseCookbook prueft eine Datei, planImport entscheidet je Rezept (neu / ersetzen / ueberspringen).
import { APP_VERSION } from "../data.js";
import { normalizeRecipe, normalizeRecipes, recKey, recName, isGhostRecipe } from "./recipes.js";

export const COOKBOOK_FORMAT = "wochenplan-kochbuch";
const MAX_IMAGE = 1500000;                       // wie beim Hochladen (Data-URL)
const isImage = (v) => typeof v==="string" && /^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(v) && v.length<=MAX_IMAGE;

export const exportCookbook = (recipes, images, opts={}) => {
  const now = opts.now===undefined ? Date.now() : opts.now;
  const recs = normalizeRecipes(recipes, now);
  const imgs = {};
  Object.keys(images||{}).forEach(k=>{ if(recs[k] && isImage(images[k])) imgs[k]=images[k]; });
  return { format:COOKBOOK_FORMAT, version:1, app:APP_VERSION, exportedAt:new Date(now).toISOString(), count:Object.keys(recs).length, recipes:recs, images:imgs };
};
const dayStamp = (now) => { const d=new Date(now===undefined?Date.now():now); const p=(n)=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()); };
export const cookbookFileName = (now) => "wochenplan-kochbuch-"+dayStamp(now)+".json";
// Einzelnes Rezept: gleiche Datei wie das ganze Kochbuch, nur mit einem Rezept; laesst sich ueber "Aus Datei laden" wieder einlesen
const slug = (name) => String(name||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,50).replace(/-+$/,"");
export const recipeFileName = (name, now) => "rezept-"+(slug(name)||"ohne-namen")+"-"+dayStamp(now)+".json";

// Datei pruefen: liefert {recipes, images, exportedAt, count} oder wirft einen verstaendlichen Fehler
export const parseCookbook = (text, now) => {
  let data;
  try { data = JSON.parse(String(text||"")); } catch(e){ throw new Error("Die Datei ist kein lesbares JSON."); }
  if(!data||typeof data!=="object"||Array.isArray(data)) throw new Error("Die Datei enthält kein Kochbuch.");
  const src = data.recipes && typeof data.recipes==="object" ? data.recipes : (data.format===undefined && Object.values(data).some(v=>v&&typeof v==="object"&&(v.ingredients||v.steps)) ? data : null);
  if(!src) throw new Error("Die Datei enthält keine Rezepte.");
  if(data.format!==undefined && data.format!==COOKBOOK_FORMAT) throw new Error("Unbekanntes Dateiformat: "+String(data.format).slice(0,40));
  const recipes = {};
  Object.keys(src).forEach(k=>{
    const raw = src[k]; if(!raw||typeof raw!=="object"||Array.isArray(raw)||isGhostRecipe(raw)) return;
    const hasBody = (Array.isArray(raw.ingredients)&&raw.ingredients.length) || (Array.isArray(raw.steps)&&raw.steps.length);
    if(!hasBody) return;                                              // nur Name ohne Zutaten und Schritte: nicht importieren
    const key = recKey(raw.name || k); if(!key) return;             // Schluessel aus dem Namen (Firebase-tauglich), nicht aus der Datei
    recipes[key] = normalizeRecipe(key, {...raw, name: raw.name || recName(raw,k)}, now);
  });
  if(!Object.keys(recipes).length) throw new Error("In der Datei steht kein vollständiges Rezept.");
  const images = {};
  const imgSrc = data.images && typeof data.images==="object" ? data.images : {};
  Object.keys(imgSrc).forEach(k=>{ const key=recKey(k); if(recipes[key] && isImage(imgSrc[k])) images[key]=imgSrc[k]; });
  return { recipes, images, exportedAt: typeof data.exportedAt==="string" ? data.exportedAt : "", count:Object.keys(recipes).length };
};

// Import planen: mode "skip" = vorhandene behalten, "replace" = vorhandene durch die Datei ersetzen (Bewertung, Notizen, Kochdaten aus der Datei)
export const planImport = (existing, incoming, mode="skip") => {
  const out = { recipes:{}, images:{}, added:[], replaced:[], skipped:[] };
  const ex = existing||{};
  Object.keys(incoming.recipes||{}).forEach(key=>{
    const rec = incoming.recipes[key];
    if(ex[key]){
      if(mode!=="replace"){ out.skipped.push(key); return; }
      out.recipes[key] = {...rec, createdAt: ex[key].createdAt || rec.createdAt, updatedAt: Date.now()};
      out.replaced.push(key);
    }else{
      out.recipes[key] = rec; out.added.push(key);
    }
    if(incoming.images && incoming.images[key]) out.images[key] = incoming.images[key];
  });
  return out;
};
