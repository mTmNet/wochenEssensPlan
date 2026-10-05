// REZEPTE - Schluessel, Anzeigename, Normalform, Rubrik, Gruppierung, Startrezepte (reine Funktionen)
import { CATS, CUISINE_LIST, DNAMES, QUICK_MINUTES } from "../data.js";
import { daysSince } from "./weeks.js";

// Firebase erlaubt in Schluesseln kein . # $ [ ] / -> Leerzeichen, zusammenfassen, trimmen
export const recKey = (name) => String(name||"").replace(/[.#$\[\]\/]/g," ").replace(/\s+/g," ").trim();
// Anzeigename eines Schluessels (alte Schluessel ohne Umlaute)
export const dn = (k) => DNAMES[k] || k;
export const recName = (rec, key) => (rec && rec.name) || DNAMES[key] || key;
// Kategorie eines Rezepts ermitteln (migriert alte meal-Werte: Fr->Fruehstueck, Mi/Ab->Hauptgericht)
export const recCat = (rec) => (rec && rec.category) ? rec.category : (rec && rec.meal==="Fr" ? "Frühstück" : "Hauptgericht");

const strList = (a) => Array.isArray(a) ? a.filter(x=>typeof x==="string") : (a&&typeof a==="object" ? Object.values(a).filter(x=>typeof x==="string") : []);
const isISO = (s) => typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Geist = Rest eines geloeschten Rezepts (nur rating/updatedAt o. ae., ohne name, ingredients und steps)
export const isGhostRecipe = (raw) => !raw || typeof raw!=="object" || (!raw.name && !strList(raw.ingredients).length && !strList(raw.steps).length);
// Schluessel aller Geister in einer Serversammlung
export const ghostKeys = (obj) => Object.keys(obj||{}).filter(k=>isGhostRecipe(obj[k]));

// Fehlende Felder ergaenzen, damit Altbestand und neue Eintraege gleich aussehen (Abschnitt 3 des Bauplans)
// Merkmale eines Rezepts (auch fuer Eintraege der Rezept-Basis, die nicht normalisiert sind)
const LEGACY_TAG = { "Kinderessen":"kinder", "Schnelle Küche":"schnell" };
export const recTags = (rec) => {
  const t = new Set(strList(rec && rec.tags));
  const legacy = LEGACY_TAG[rec && rec.category];
  if(legacy) t.add(legacy);
  return [...t];
};
export const isKids  = (rec) => recTags(rec).includes("kinder");
export const isQuick = (rec) => recTags(rec).includes("schnell") || (Number(rec && rec.minutes)>0 && Number(rec.minutes)<=QUICK_MINUTES);

export const normalizeRecipe = (key, raw, now) => {
  const r = raw && typeof raw==="object" ? raw : {};
  const tags = recTags(r);
  const ts = now===undefined ? Date.now() : now;
  const cooked = [...new Set([...strList(r.cooked), ...(isISO(r.lastCooked)?[r.lastCooked]:[])].filter(isISO))].sort();
  const servings = Number(r.servings), minutes = Number(r.minutes), rating = Number(r.rating);
  return {
    name: r.name || DNAMES[key] || key,
    ingredients: strList(r.ingredients),
    steps: strList(r.steps),
    description: r.description || "",
    category: LEGACY_TAG[recCat(r)] ? "Hauptgericht" : recCat(r),
    tags,
    cuisine: r.cuisine==="Schnell" ? "International" : (r.cuisine || "International"),
    servings: servings>0 ? servings : 4,
    minutes: minutes>0 ? minutes : null,
    source: r.source || "eigen",
    origin: r.origin || "",
    sourceNote: r.sourceNote || "",
    plan: typeof r.plan==="string" ? r.plan : "",      // Essensplan-Id, wenn aus einer Vorlage uebernommen
    stepsGenerated: !!r.stepsGenerated,
    rating: rating>0 ? Math.min(5,Math.round(rating)) : 0,
    notes: r.notes || "",
    cooked,
    lastCooked: cooked.length ? cooked[cooked.length-1] : "",
    createdAt: r.createdAt || ts,
    updatedAt: r.updatedAt || r.createdAt || ts,
  };
};
// Ganze Sammlung normalisieren (Server -> Zustand); Geister werden verworfen
export const normalizeRecipes = (obj, now) => {
  const out={};
  Object.keys(obj||{}).forEach(k=>{ if(obj[k]&&typeof obj[k]==="object"&&!isGhostRecipe(obj[k])) out[k]=normalizeRecipe(k,obj[k],now); });
  return out;
};
// Zeitangaben in einem Schritt ("20 Min. köcheln", "1 Stunde", "10-15 Minuten") -> Minuten fuer Timer-Knoepfe
export const stepMinutes = (step) => {
  const out=[]; const s=String(step||"");
  const re=/(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?\s*(Min\.?|Minuten?|Std\.?|Stunden?|Sek\.?|Sekunden?)(?![a-zäöü])/gi;
  let m;
  while((m=re.exec(s))){
    const a=parseFloat(m[1].replace(",",".")), b=m[2]?parseFloat(m[2].replace(",",".")):a;
    const u=m[3].toLowerCase();
    let mins = b;
    if(u.startsWith("std")||u.startsWith("stunde")) mins=b*60;
    else if(u.startsWith("sek")) mins=b/60;
    mins=Math.round(mins*10)/10;
    if(mins>0&&mins<=600&&!out.includes(mins)) out.push(mins);
  }
  return out;
};
export const cookedCount = (rec) => (rec && Array.isArray(rec.cooked)) ? rec.cooked.length : (rec && rec.lastCooked ? 1 : 0);
// Bewaehrt = mindestens einmal gekocht und Bewertung >= 3
export const isProven = (rec) => cookedCount(rec)>=1 && (rec.rating||0)>=3;
// Kochdatum eintragen (aufsteigend, ohne Doppelungen)
export const addCooked = (rec, iso) => {
  const c=[...new Set([...strList(rec&&rec.cooked), ...(isISO(iso)?[iso]:[])].filter(isISO))].sort();
  return {cooked:c, lastCooked:c.length?c[c.length-1]:""};
};
// Kochhistorie als Text: "3× gekocht, zuletzt vor 12 Tagen" bzw. "noch nie gekocht"
export const cookedLabel = (rec, now) => {
  const n=cookedCount(rec);
  if(!n) return "noch nie gekocht";
  const c=strList(rec&&rec.cooked);
  const ds=daysSince((rec&&rec.lastCooked)||c[c.length-1], now);
  const when=ds===null?"":ds===0?"heute":ds===1?"gestern":"vor "+ds+" Tagen";
  return n+"× gekocht"+(when?", zuletzt "+when:"");
};

// Rezeptliste sortieren: "cooked" (zuletzt gekocht), "best" (Bewertung, dann oft gekocht), "new" (neu), "az" (Name)
export const sortRecipeKeys = (recipes, mode) => {
  const keys=Object.keys(recipes||{});
  const nm=(k)=>recName(recipes[k],k);
  const byName=(a,b)=>nm(a).localeCompare(nm(b),"de");
  if(mode==="best") return keys.sort((a,b)=>((recipes[b].rating||0)-(recipes[a].rating||0))||(cookedCount(recipes[b])-cookedCount(recipes[a]))||byName(a,b));
  if(mode==="new") return keys.sort((a,b)=>((recipes[b].createdAt||0)-(recipes[a].createdAt||0))||byName(a,b));
  if(mode==="cooked") return keys.sort((a,b)=>String(recipes[b].lastCooked||"").localeCompare(String(recipes[a].lastCooked||""))||byName(a,b));
  return keys.sort(byName);
};

// Symbolbild zum Rezept (externer Bilddienst, fester Seed je Name) - nur bei settings.aiImages
export const foodImg = (name) => {
  const seed = name.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const prompt = dn(name)+", food photography, professional, appetizing, natural light, minimal background";
  return "https://image.pollinations.ai/prompt/"+encodeURIComponent(prompt)+"?width=800&height=480&nologo=true&seed="+seed;
};

// DROPDOWN: Rezepte nach Kategorie (Rubrik) gruppieren
export const recipesByCat = (recipes) => {
  const byCat={}; CATS.forEach(c=>byCat[c]=[]);
  Object.keys(recipes).forEach(name=>{
    const c=recCat(recipes[name]);
    if(!byCat[c])byCat[c]=[];
    byCat[c].push(name);
  });
  return byCat;
};
// Eine Namensliste nach Kueche untergruppieren (fuer Hauptgericht)
export const groupByCuisine = (recipes,names) => {
  const groups=[];
  CUISINE_LIST.forEach(cuisine=>{
    const items=names.filter(n=>((recipes[n]&&recipes[n].cuisine)||"")===cuisine);
    if(items.length)groups.push({cuisine,items});
  });
  const assigned=new Set(groups.flatMap(g=>g.items));
  const rest=names.filter(n=>!assigned.has(n));
  if(rest.length)groups.push({cuisine:"Weitere",items:rest});
  return groups;
};

// STARTREZEPTE - werden NICHT mehr automatisch gespeichert; nur Vorschau/Uebernahme auf Wunsch
export const DR = {
  "Haferflocken mit Beeren":{ ingredients:["Haferflocken 100g","Beeren 150g","Milch 200ml","Honig 1 EL"], steps:["Haferflocken mit Milch in einen Topf geben und bei mittlerer Hitze aufkochen.","Hitze reduzieren und 3-4 Min. köcheln lassen.","In Schüssel füllen, Beeren und Honig darüber."], cuisine:"Klassisch", meal:"Fr" },
  "Avocado Toast":{ ingredients:["Avocado 1 St.","Vollkornbrot 2 Scheiben","Zitrone 0.5 St.","Salz und Pfeffer"], steps:["Brot toasten.","Avocado zerdrücken, mit Zitronensaft und Salz abschmecken.","Auf Toast verteilen und servieren."], cuisine:"International", meal:"Fr" },
  "Ruehreier":{ ingredients:["Eier 3 St.","Butter 10g","Salz und Pfeffer","Schnittlauch"], steps:["Eier in Schüssel verquirlen, salzen und pfeffern.","Butter in Pfanne bei mittlerer Hitze schmelzen.","Eimasse zugeben, langsam unter Rühren stocken lassen.","Vom Herd nehmen, mit Schnittlauch garnieren."], cuisine:"Klassisch", meal:"Fr" },
  "Joghurt und Granola":{ ingredients:["Joghurt 200g","Granola 50g","Honig 1 EL","Früchte"], steps:["Joghurt in Schüssel geben.","Granola und Früchte darüber streuen.","Mit Honig beträufeln."], cuisine:"Klassisch", meal:"Fr" },
  "Pfannkuchen":{ ingredients:["Mehl 150g","Eier 2 St.","Milch 300ml","Butter","Zucker 1 EL"], steps:["Mehl, Eier, Milch und Zucker zu glattem Teig verrühren, 15 Min. ruhen lassen.","Butter in Pfanne erhitzen, Teig hineingeben.","Je 2 Min. pro Seite goldgelb backen.","Mit Belag nach Wahl servieren."], cuisine:"Klassisch", meal:"Fr" },
  "Pasta Bolognese":{ ingredients:["Pasta 200g","Hackfleisch 300g","Tomaten Dose 1 St.","Zwiebel 1 St.","Knoblauch 2 Zehen","Olivenöl 2 EL"], steps:["Zwiebel und Knoblauch hacken, in Olivenöl glasig dünsten.","Hackfleisch dazugeben, krümelig braten.","Dosentomaten unterrühren, 20 Min. köcheln lassen.","Pasta al dente kochen, mit Sauce mischen."], cuisine:"Italienisch", meal:"Mi" },
  "Caesar Salad":{ ingredients:["Römersalat 1 Kopf","Parmesan 50g","Croutons 50g","Caesar Dressing","Hähnchenbrust 200g"], steps:["Hähnchen mit Öl braten, 4-5 Min. je Seite, dann in Scheiben schneiden.","Salat waschen und zupfen.","Mit Dressing vermischen.","Hähnchen, Croutons und Parmesan obenauf."], cuisine:"International", meal:"Mi" },
  "Gemuesesuppe":{ ingredients:["Karotten 3 St.","Sellerie 2 St.","Lauch 1 St.","Kartoffeln 3 St.","Gemüsebrühe 1L"], steps:["Gemüse schälen und würfeln.","Brühe aufkochen, Gemüse zugeben.","20 Min. bei mittlerer Hitze kochen.","Mit Salz, Pfeffer und Kräutern abschmecken."], cuisine:"Schwäbisch", meal:"Mi" },
  "Haehnchen-Wrap":{ ingredients:["Tortilla 2 St.","Hähnchenbrust 200g","Salat","Tomate 1 St.","Joghurt-Dressing"], steps:["Hähnchen würzen und in Pfanne 6-8 Min. braten, in Streifen schneiden.","Tortillas kurz erwärmen.","Alles belegen, aufrollen und servieren."], cuisine:"International", meal:"Mi" },
  "Linsensuppe":{ ingredients:["Linsen 200g","Karotten 2 St.","Zwiebel 1 St.","Knoblauch","Kreuzkümmel","Gemüsebrühe 1L"], steps:["Zwiebel und Knoblauch hacken, mit Kreuzkümmel anbraten.","Linsen und Karotten dazu, mit Brühe aufgießen.","25 Min. köcheln lassen.","Mit Zitrone und Salz abschmecken."], cuisine:"Mediterran", meal:"Mi" },
  "Lachs mit Gemuese":{ ingredients:["Lachsfilet 200g","Brokkoli 300g","Karotten 2 St.","Olivenöl","Zitrone"], steps:["Brokkoli in Röschen teilen, Karotten schneiden.","Gemüse in Pfanne mit Öl 5 Min. anbraten.","Lachs salzen, pfeffern, je 3-4 Min. pro Seite braten.","Anrichten, mit Zitrone beträufeln."], cuisine:"Mediterran", meal:"Ab" },
  "Veggie-Curry":{ ingredients:["Kichererbsen Dose 1 St.","Kokosmilch Dose 1 St.","Tomaten Dose 1 St.","Curry-Paste 2 EL","Ingwer","Reis 200g"], steps:["Reis kochen.","Curry-Paste in Topf anrösten, Ingwer zugeben.","Kokosmilch und Tomaten unterrühren.","Kichererbsen zugeben, 15 Min. köcheln.","Über Reis servieren."], cuisine:"Asiatisch", meal:"Ab" },
  "Pasta Carbonara":{ ingredients:["Pasta 200g","Speck 100g","Eier 2 St.","Parmesan 60g","Schwarzer Pfeffer"], steps:["Pasta kochen, Kochwasser aufheben.","Speck knusprig braten.","Eier und Parmesan verquirlen.","Heiße Pasta zum Speck, Pfanne vom Herd.","Ei-Mischung unterrühren, Kochwasser bis cremig zugeben."], cuisine:"Italienisch", meal:"Ab" },
  "Risotto":{ ingredients:["Risotto-Reis 200g","Gemüsebrühe 700ml","Parmesan 50g","Zwiebel 1 St.","Weißwein 100ml","Butter"], steps:["Brühe warm halten. Zwiebel würfeln, in Butter anschwitzen.","Reis 2 Min. rösten, mit Weißwein ablöschen.","Brühe schöpfkellenweise zugeben (18 Min.), ständig rühren.","Parmesan und Butter einrühren, 5 Min. ruhen lassen."], cuisine:"Italienisch", meal:"Ab" },
};
// Startrezepte in Normalform (Schluessel = recKey, Name mit Umlauten)
export const starterRecipes = (now) => {
  const out={};
  Object.keys(DR).forEach(k=>{ const key=recKey(k); out[key]=normalizeRecipe(key,{...DR[k],name:dn(k)},now); });
  return out;
};
