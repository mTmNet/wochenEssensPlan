import { useState, useRef, useEffect, useCallback } from "react";

// FIREBASE - hardcoded, no setup needed
const FB = "https://wochenessenplan-default-rtdb.europe-west1.firebasedatabase.app";

// SESSION PERSISTENCE - merkt sich Code + Name, damit man nicht rausfliegt
const SESSION_KEY = "wochenplan_session";

// DESIGN - mid-dark theme
const C = {
  bg:"#1E1E24",
  white:"#2A2A32",
  border:"#3A3A46",
  text:"#F0EEE9",
  muted:"#9A9898",
  subtle:"#5A5A64",
  accent:"#D4904A",
  abg:"#2E2820",
  dark:"#13131A",
  ok:"#4CAF7D",
  err:"#E05555",
};
const SF = "system-ui,-apple-system,Helvetica Neue,Arial,sans-serif";
const SER = "Georgia,'Times New Roman',serif";

// CONSTANTS
const DAYS   = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const DAYFUL = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
// PLAN-SLOTS - wann gegessen wird (pro Tag)
const MEALS  = ["Fr","Mi","Ab","Zw"];
const ML     = { Fr:"Frühstück", Mi:"Mittagessen", Ab:"Abendessen", Zw:"Snacks" };

// REZEPT-KATEGORIEN (Rubriken) - was fuer ein Gericht (unabhaengig vom Plan-Slot)
const CATS = ["Frühstück","Hauptgericht","Beilagen & Salate","Soßen & Dips","Snacks"];
// KUECHEN - nur fuer Hauptgericht relevant (Untergruppen im Dropdown)
const CUISINE_LIST = ["Schwäbisch","Italienisch","Asiatisch","Mediterran","Klassisch","International","Vegetarisch","Grillen","Schnell"];
// Kategorie eines Rezepts ermitteln (migriert alte meal-Werte: Fr->Fruehstueck, Mi/Ab->Hauptgericht)
const recCat = (rec) => (rec && rec.category) ? rec.category : (rec && rec.meal==="Fr" ? "Frühstück" : "Hauptgericht");

// SUPERMARKET CATEGORIES
const SHOP_CATS = [
  { label:"Obst & Gemüse",  keys:["karott","brokkoli","tomat","salat","zwiebel","knoblauch","lauch","sellerie","kartoffel","ingwer","avocado","zitrone","beere","frucht","paprika","spinat","gurk","pilz","lauch","kohl","apfel","banane"] },
  { label:"Fleisch & Fisch", keys:["hackfleisch","haehnchen","hähnchen","hühnchen","speck","lachs","fleisch","fisch","wurst","rind","schwein","thun","garnele","schinken","putenbrust"] },
  { label:"Milch & Käse",   keys:["milch","butter","eier","joghurt","parmesan","kaese","käse","sahne","quark","mozzarella","ricotta","creme","schlagobers"] },
  { label:"Backwaren",      keys:["brot","tortilla","brötchen","toast","croissant","mehl","vollkornbrot"] },
  { label:"Trockenwaren",   keys:["pasta","reis","haferflocken","linsen","granola","zucker","risotto","kichererbsen","bulgur","couscous","quinoa","nudel","müsli"] },
  { label:"Konserven",      keys:["dose","bruehe","brühe","kokosmilch","konserv","passiert"] },
  { label:"Gewürze & Öle", keys:["olivenoel","olivenöl","curry","honig","essig","senf","soja","pesto","mayonnaise","ketchup","dressing","gewürz","kreuzküm","kreuzkümmel"] },
  { label:"Getränke",       keys:["weisswein","weißwein","rotwein","bier","saft","wasser","bruehe","brühe"] },
];

const shopCat = (text) => {
  const l = text.toLowerCase();
  for (const c of SHOP_CATS) {
    if (c.keys.some(k => l.includes(k))) return c.label;
  }
  return "Sonstiges";
};

// DISPLAY NAMES
const DNAMES = {
  "Ruehreier":"Rühreier","Joghurt und Granola":"Joghurt & Granola",
  "Gemuesesuppe":"Gemüsesuppe","Haehnchen-Wrap":"Hähnchen-Wrap","Lachs mit Gemuese":"Lachs mit Gemüse",
};
const dn = (k) => DNAMES[k] || k;

// DEFAULT RECIPES
const DR = {
  "Haferflocken mit Beeren":{ ingredients:["Haferflocken 100g","Beeren 150g","Milch 200ml","Honig 1 EL"], steps:["Haferflocken mit Milch in einen Topf geben und bei mittlerer Hitze aufkochen.","Hitze reduzieren und 3-4 Min. köcheln lassen.","In Schüssel füllen, Beeren und Honig darüber."], cuisine:"Klassisch", meal:"Fr" },
  "Avocado Toast":{ ingredients:["Avocado 1 St.","Vollkornbrot 2 Scheiben","Zitrone 0.5 St.","Salz und Pfeffer"], steps:["Brot toasten.","Avocado zerdrücken, mit Zitronensaft und Salz abschmecken.","Auf Toast verteilen und servieren."], cuisine:"International", meal:"Fr" },
  "Ruehreier":{ ingredients:["Eier 3 St.","Butter 10g","Salz und Pfeffer","Schnittlauch"], steps:["Eier in Schüssel verquirlen, salzen und pfeffern.","Butter in Pfanne bei mittlerer Hitze schmelzen.","Eimasse zugeben, langsam unter Rühren stocken lassen.","Vom Herd nehmen, mit Schnittlauch garnieren."], cuisine:"Klassisch", meal:"Fr" },
  "Joghurt und Granola":{ ingredients:["Joghurt 200g","Granola 50g","Honig 1 EL","Früchte"], steps:["Joghurt in Schüssel geben.","Granola und Früchte darüber streuen.","Mit Honig beträufeln."], cuisine:"Klassisch", meal:"Fr" },
  "Pfannkuchen":{ ingredients:["Mehl 150g","Eier 2 St.","Milch 300ml","Butter","Zucker 1 EL"], steps:["Mehl, Eier, Milch und Zucker zu glattem Teig verrühren, 15 Min. ruhen lassen.","Butter in Pfanne erhitzen, Teig hineingeben.","Je 2 Min. pro Seite goldgelb backen.","Mit Belag nach Wahl servieren."], cuisine:"Klassisch", meal:"Fr" },
  "Pasta Bolognese":{ ingredients:["Pasta 200g","Hackfleisch 300g","Tomaten Dose 1 St.","Zwiebel 1 St.","Knoblauch 2 Zehen","Olivenoel 2 EL"], steps:["Zwiebel und Knoblauch hacken, in Olivenöl glasig dünsten.","Hackfleisch dazugeben, krümelig braten.","Dosentomaten unterrühren, 20 Min. köcheln lassen.","Pasta al dente kochen, mit Sauce mischen."], cuisine:"Italienisch", meal:"Mi" },
  "Caesar Salad":{ ingredients:["Roemersalat 1 Kopf","Parmesan 50g","Croutons 50g","Caesar Dressing","Haehnchenbrust 200g"], steps:["Hähnchen mit Öl braten, 4-5 Min. je Seite, dann in Scheiben schneiden.","Salat waschen und zupfen.","Mit Dressing vermischen.","Hähnchen, Croutons und Parmesan obenauf."], cuisine:"International", meal:"Mi" },
  "Gemuesesuppe":{ ingredients:["Karotten 3 St.","Sellerie 2 St.","Lauch 1 St.","Kartoffeln 3 St.","Gemüsebrühe 1L"], steps:["Gemüse schälen und würfeln.","Brühe aufkochen, Gemüse zugeben.","20 Min. bei mittlerer Hitze kochen.","Mit Salz, Pfeffer und Kräutern abschmecken."], cuisine:"Schwäbisch", meal:"Mi" },
  "Haehnchen-Wrap":{ ingredients:["Tortilla 2 St.","Haehnchenbrust 200g","Salat","Tomate 1 St.","Joghurt-Dressing"], steps:["Hähnchen würzen und in Pfanne 6-8 Min. braten, in Streifen schneiden.","Tortillas kurz erwärmen.","Alles belegen, aufrollen und servieren."], cuisine:"International", meal:"Mi" },
  "Linsensuppe":{ ingredients:["Linsen 200g","Karotten 2 St.","Zwiebel 1 St.","Knoblauch","Kreuzkümmel","Gemüsebrühe 1L"], steps:["Zwiebel und Knoblauch hacken, mit Kreuzkümmel anbraten.","Linsen und Karotten dazu, mit Brühe aufgießen.","25 Min. köcheln lassen.","Mit Zitrone und Salz abschmecken."], cuisine:"Mediterran", meal:"Mi" },
  "Lachs mit Gemuese":{ ingredients:["Lachsfilet 200g","Brokkoli 300g","Karotten 2 St.","Olivenoel","Zitrone"], steps:["Brokkoli in Röschen teilen, Karotten schneiden.","Gemüse in Pfanne mit Öl 5 Min. anbraten.","Lachs salzen, pfeffern, je 3-4 Min. pro Seite braten.","Anrichten, mit Zitrone beträufeln."], cuisine:"Mediterran", meal:"Ab" },
  "Veggie-Curry":{ ingredients:["Kichererbsen Dose 1 St.","Kokosmilch Dose 1 St.","Tomaten Dose 1 St.","Curry-Paste 2 EL","Ingwer","Reis 200g"], steps:["Reis kochen.","Curry-Paste in Topf anrösten, Ingwer zugeben.","Kokosmilch und Tomaten unterrühren.","Kichererbsen zugeben, 15 Min. köcheln.","Über Reis servieren."], cuisine:"Asiatisch", meal:"Ab" },
  "Pasta Carbonara":{ ingredients:["Pasta 200g","Speck 100g","Eier 2 St.","Parmesan 60g","Schwarzer Pfeffer"], steps:["Pasta kochen, Kochwasser aufheben.","Speck knusprig braten.","Eier und Parmesan verquirlen.","Heiße Pasta zum Speck, Pfanne vom Herd.","Ei-Mischung unterrühren, Kochwasser bis cremig zugeben."], cuisine:"Italienisch", meal:"Ab" },
  "Risotto":{ ingredients:["Risotto-Reis 200g","Gemüsebrühe 700ml","Parmesan 50g","Zwiebel 1 St.","Weisswein 100ml","Butter"], steps:["Brühe warm halten. Zwiebel würfeln, in Butter anschwitzen.","Reis 2 Min. rösten, mit Weißwein ablöschen.","Brühe schöpfkellenweise zugeben (18 Min.), ständig rühren.","Parmesan und Butter einrühren, 5 Min. ruhen lassen."], cuisine:"Italienisch", meal:"Ab" },
};

// FIREBASE HELPERS
const fbGet   = async (p) => { try { const r=await fetch(FB+"/"+p+".json"); return r.ok?await r.json():null; } catch(e){return null;} };
const fbPut   = async (p,d) => { try { await fetch(FB+"/"+p+".json",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}); } catch(e){} };
const fbPatch = async (p,d) => { try { await fetch(FB+"/"+p+".json",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}); } catch(e){} };

// FOOD IMAGE
const foodImg = (name) => {
  const seed = name.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const prompt = dn(name)+", food photography, professional, appetizing, natural light, minimal background";
  return "https://image.pollinations.ai/prompt/"+encodeURIComponent(prompt)+"?width=800&height=480&nologo=true&seed="+seed;
};

// INGREDIENT AGGREGATOR
const parseIng = (t) => {
  const m = t.match(/^(.*?)\s*([\d]+(?:[.,][\d]+)?)\s*(.*)$/);
  if (!m) return {name:t.trim(),amount:null,unit:""};
  return {name:m[1].trim()||t.trim(),amount:parseFloat(m[2].replace(",",".")),unit:m[3].trim()};
};
const fmtIng = (n,a,u) => {
  if (a===null) return n;
  const d = Number.isInteger(a)?String(a):parseFloat(a.toFixed(1)).toString();
  return u?n+" "+d+" "+u:n+" "+d;
};
const aggregateIngs = (raw) => {
  const map=new Map(),order=[];
  raw.forEach(t=>{
    const p=parseIng(t);
    const k=p.name.toLowerCase()+"|||"+p.unit.toLowerCase();
    if(map.has(k)){const e=map.get(k);if(p.amount!==null&&e.amount!==null)e.amount+=p.amount;}
    else{map.set(k,{name:p.name,amount:p.amount,unit:p.unit});order.push(k);}
  });
  return order.map(k=>{const e=map.get(k);return fmtIng(e.name,e.amount,e.unit);});
};

// SINGLE RECIPE PDF (HTML zum Drucken / als PDF speichern)
const makeRecipePDF = (name, rec) => {
  const title = dn(name);
  const ings = (rec.ingredients||[]).map(i=>"<li>"+i+"</li>").join("");
  const steps = (rec.steps||[]).map((s,i)=>'<div class="step"><span class="num">'+(i+1)+'</span><p>'+s+'</p></div>').join("");
  const desc = rec.description ? '<p class="desc">'+rec.description+'</p>' : '';
  const meta = recCat(rec)+(rec.cuisine?(" · "+rec.cuisine):"");
  const imgUrl = foodImg(name);
  const css = `
    @page{margin:2cm}
    body{font-family:Georgia,serif;color:#1A1917;max-width:760px;margin:0 auto;padding:0}
    .meta{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C17D3C;font-weight:700;margin-bottom:10px}
    h1{font-size:38px;font-weight:400;letter-spacing:-1px;margin:0 0 18px}
    img{width:100%;height:300px;object-fit:cover;border-radius:4px;margin-bottom:20px;display:block}
    .desc{font-style:italic;font-size:15px;line-height:1.8;color:#4A4843;margin:0 0 24px}
    .tag{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C17D3C;margin:24px 0 10px}
    ul{list-style:none;padding:0;margin:0}
    ul li{font-size:14px;padding:7px 0;border-bottom:1px solid #F0EEE9}
    .step{display:flex;gap:14px;margin-bottom:14px}
    .num{width:26px;height:26px;border-radius:50%;border:1px solid #1A1917;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;font-family:system-ui,sans-serif}
    .step p{font-size:14px;line-height:1.7;margin:0;padding-top:2px}
  `;
  return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>'+title+'</title><style>'+css+'</style></head><body>'+
    '<div class="meta">'+meta+'</div>'+
    '<h1>'+title+'</h1>'+
    '<img src="'+imgUrl+'" alt="'+title+'" onerror="this.style.display=\'none\'">'+
    desc+
    '<div class="tag">Zutaten</div><ul>'+ings+'</ul>'+
    '<div class="tag">Zubereitung</div>'+steps+
    '</body></html>';
};

// PDF COOKBOOK
const makePDF = (recipes) => {
  const sections = [];
  CATS.forEach(cat=>{
    const items = Object.entries(recipes).filter(([k,v])=>recCat(v)===cat);
    if(items.length) sections.push({title:cat, items});
  });

  const recipeHTML = ([key,rec])=>{
    const name=dn(key);
    const ings=(rec.ingredients||[]).map(i=>"<li>"+i+"</li>").join("");
    const steps=(rec.steps||[]).map((s,i)=>'<div class="step"><span class="num">'+(i+1)+"</span><p>"+s+"</p></div>").join("");
    const imgUrl=foodImg(key);
    const desc=rec.description?'<p class="desc">'+rec.description+'</p>':'';
    return '<div class="recipe"><h2>'+name+'</h2><img src="'+imgUrl+'" alt="'+name+'" onerror="this.style.display=\'none\'">'+desc+'<div class="tag">Zutaten</div><ul>'+ings+'</ul><div class="tag">Zubereitung</div>'+steps+'</div>';
  };

  const sectionsHTML = sections.map(sec=>'<div class="section"><h1 class="section-title">'+sec.title+'</h1>'+sec.items.map(recipeHTML).join("")+'</div>').join("");

  const css = `
    @page{margin:2cm}
    body{font-family:Georgia,serif;color:#1A1917;max-width:900px;margin:0 auto;padding:0}
    .cover{text-align:center;padding:120px 40px;border-bottom:1px solid #E8E6E1;page-break-after:always}
    .cover h1{font-size:52px;font-weight:400;letter-spacing:-2px;margin-bottom:12px}
    .cover p{color:#8A8780;font-size:15px}
    .toc{padding:40px;page-break-after:always}
    .toc h2{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C17D3C;margin-bottom:24px}
    .toc-section{font-weight:700;font-size:13px;margin:14px 0 4px;color:#1A1917}
    .toc-item{font-size:13px;color:#8A8780;padding:2px 0}
    .section{page-break-before:always}
    .section-title{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C17D3C;margin-bottom:40px;padding-bottom:10px;border-bottom:1px solid #E8E6E1;font-weight:700}
    .recipe{margin-bottom:60px;padding-bottom:60px;border-bottom:1px solid #E8E6E1;page-break-inside:avoid}
    .recipe h2{font-size:28px;font-weight:400;margin-bottom:16px}
    .recipe img{width:100%;height:260px;object-fit:cover;border-radius:4px;margin-bottom:20px;display:block}
    .recipe .desc{font-style:italic;font-size:14px;line-height:1.8;color:#4A4843;margin:0 0 16px}
    .tag{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C17D3C;margin:20px 0 10px}
    ul{list-style:none;padding:0}
    ul li{font-size:14px;padding:7px 0;border-bottom:1px solid #F0EEE9}
    .step{display:flex;gap:14px;margin-bottom:14px}
    .num{width:26px;height:26px;border-radius:50%;border:1px solid #1A1917;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;font-family:system-ui,sans-serif}
    .step p{font-size:14px;line-height:1.7;margin:0;padding-top:2px}
    @media print{.section{page-break-before:always}.recipe{page-break-inside:avoid}}
  `;

  const tocHTML = sections.map(sec=>'<div class="toc-section">'+sec.title+'</div>'+sec.items.map(([k])=>'<div class="toc-item">'+dn(k)+'</div>').join("")).join("");

  return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Kochbuch</title><style>'+css+'</style></head><body>'+
    '<div class="cover"><h1>Mein Kochbuch</h1><p>'+new Date().toLocaleDateString("de-DE")+" - "+Object.keys(recipes).length+' Rezepte</p></div>'+
    '<div class="toc"><h2>Inhalt</h2>'+tocHTML+'</div>'+
    sectionsHTML+'</body></html>';
};

// IMAGE PREP FOR AI IMPORT
const compressImageToBase64 = (file, opts = {}) => {
  const { maxEdge = 1600, quality = 0.82 } = opts;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas-Kontext nicht verfügbar."));
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Bildkomprimierung fehlgeschlagen."));
              return;
            }
            const outReader = new FileReader();
            outReader.onerror = () => reject(new Error("Komprimiertes Bild konnte nicht gelesen werden."));
            outReader.onload = () => {
              const dataUrl = String(outReader.result || "");
              const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
              resolve({
                base64,
                mimeType: "image/jpeg",
                previewUrl: URL.createObjectURL(blob),
              });
            };
            outReader.readAsDataURL(blob);
          },
          "image/jpeg",
          quality
        );
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
};

// AI API - Anthropic in Claude artifact, Gemini on Vercel
const callClaude = async (messages, system) => {
  const isArtifact = window.location.hostname.includes("claude.ai") ||
                     window.location.protocol === "blob:";
  if (isArtifact) {
    // Direct Anthropic call in Claude.ai artifact
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,system,messages}),
    });
    if(!r.ok) throw new Error("Anthropic Fehler "+r.status);
    const d = await r.json();
    if(d.error) throw new Error(d.error.message||JSON.stringify(d.error));
    const b = d.content&&d.content.find(x=>x.type==="text");
    return b?b.text:"";
  } else {
    // KI backend via Vercel serverless function
    const r = await fetch("/api/gemini", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({system, messages}),
    });
    if(!r.ok) {
      const errText = await r.text();
      throw new Error("KI Fehler "+r.status+": "+errText.slice(0,300));
    }
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    return d.text||"";
  }
};

// HELPERS
const emptyPlan = () => {
  const p={};
  DAYS.forEach(d=>{p[d]={meals:{},cook:""};MEALS.forEach(m=>{p[d].meals[m]="";});});
  return p;
};
const randCode = () => Math.random().toString(36).slice(2,8).toUpperCase();
const initials = (name) => name?name.split(" ").map(w=>w[0]||"").join("").toUpperCase().slice(0,2):"?";

// APP
export default function App() {
  const [screen,setScreen]           = useState("loading");
  const [myCode]                     = useState(randCode);
  const [joinInput,setJoinInput]     = useState("");
  const [nameInput,setNameInput]     = useState("");
  const [activeCode,setActiveCode]   = useState("");
  const [userName,setUserName]       = useState("");
  const [participants,setParticipants] = useState([]);
  const [lastSync,setLastSync]       = useState(null);
  const [syncOk,setSyncOk]           = useState(true);

  const [plan,setPlan]               = useState(emptyPlan);
  const [recipes,setRecipes]         = useState(DR);
  const [shopping,setShopping]       = useState([]);
  const [customItem,setCustomItem]   = useState("");

  const [view,setView]               = useState("plan");
  const [activeCell,setActiveCell]   = useState(null);
  const [cellInput,setCellInput]     = useState("");
  const [openCat,setOpenCat] = useState(null);
  const [cookPicker,setCookPicker]   = useState(null);

  const [detailRecipe,setDetailRecipe] = useState(null);
  const [editMode,setEditMode]       = useState(false);
  const [editData,setEditData]       = useState(null);
  const [cookStep,setCookStep]       = useState(0);
  const [cookMode,setCookMode]       = useState(false);
  const [imgLoaded,setImgLoaded]     = useState(false);

  const [importMode,setImportMode]   = useState("text");
  const [recipeText,setRecipeText]   = useState("");
  const [recipeImg,setRecipeImg]     = useState(null);
  const [recipeB64,setRecipeB64]     = useState(null);
  const [recipeImgType,setRecipeImgType] = useState("image/jpeg");
  const [extracting,setExtracting]   = useState(false);
  const [extracted,setExtracted]     = useState(null);
  const [importErr,setImportErr]     = useState("");
  const [savedMsg,setSavedMsg]       = useState(false);
  const [codeCopied,setCodeCopied]   = useState(false);
  const [filterMeal,setFilterMeal]   = useState("all");
  const [exitToast,setExitToast]     = useState(false);
  const [addedSlots,setAddedSlots]   = useState({});  // gesperrte "+"-Buttons (day|meal|dish)

  const isLocalDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const canExtract = extracting
    ? false
    : importMode === "text"
      ? !!recipeText.trim()
      : !!recipeB64;

  const fileRef      = useRef(null);
  const syncTimer    = useRef(null);
  const pushTimer    = useRef(null);
  const localChecked = useRef({});
  const cellRef      = useRef(null);
  const cookRef      = useRef(null);
  const dropRef      = useRef(null);
  const exitArmedRef = useRef(false);
  const handleBackRef= useRef(()=>false);
  const editingRef    = useRef(false);   // true solange eine Mahlzelle offen ist
  const pendingPushRef= useRef(false);   // true solange ein Upload aussteht

  useEffect(()=>()=>{ if(recipeImg) URL.revokeObjectURL(recipeImg); },[recipeImg]);

  // LOAD & SYNC - gespeicherte Sitzung wiederherstellen (Teil A)
  useEffect(()=>{
    (async()=>{
      const gr = await fbGet("globalRecipes");
      if(gr) setRecipes(Object.assign({},DR,gr));
      let session=null;
      try{ const raw=localStorage.getItem(SESSION_KEY); if(raw) session=JSON.parse(raw); }catch(e){}
      if(session&&session.code&&session.name){
        await handleJoin(session.code,session.name);
      }else{
        setScreen("join");
      }
    })();
  },[]);

  const pushSync = useCallback(async(code,p,s,r,parts)=>{
    if(!code)return;
    await Promise.all([
      fbPut("plans/"+code,{plan:p,shopping:s,participants:parts||[],updatedAt:Date.now()}),
      fbPatch("globalRecipes",r),
    ]);
    setLastSync(Date.now());setSyncOk(true);
  },[]);

  const pullSync = useCallback(async(code)=>{
    if(!code)return;
    const [pd,gr] = await Promise.all([fbGet("plans/"+code),fbGet("globalRecipes")]);
    if(pd){
      // Lokale Bearbeitung schuetzen: Plan UND Einkaufsliste NICHT vom Server
      // ueberschreiben, solange eine Zelle offen ist oder ein Upload aussteht.
      const busy = editingRef.current || pendingPushRef.current;
      if(!busy){
        const inc=pd.plan||emptyPlan();
        DAYS.forEach(d=>{if(!inc[d])inc[d]={meals:{},cook:""};if(!inc[d].meals)inc[d]={meals:inc[d]||{},cook:""};});
        setPlan(inc);
        setShopping(prev=>{
          const remote=pd.shopping||[];
          return remote.map(item=>({text:item.text,checked:localChecked.current.hasOwnProperty(item.text)?localChecked.current[item.text]:item.checked,cat:item.cat||"Sonstiges"}));
        });
        if(pd.participants)setParticipants(pd.participants);
      }
      setLastSync(pd.updatedAt||Date.now());setSyncOk(true);
    }else setSyncOk(false);
    if(gr)setRecipes(Object.assign({},DR,gr));
  },[]);

  const startPolling = useCallback((code)=>{
    if(syncTimer.current)clearInterval(syncTimer.current);
    syncTimer.current=setInterval(()=>pullSync(code),10000);
  },[pullSync]);

  useEffect(()=>()=>{clearInterval(syncTimer.current);clearTimeout(pushTimer.current);},[]);

  const schedulePush = useCallback((p,s,r,parts)=>{
    if(!activeCode)return;
    pendingPushRef.current=true;
    clearTimeout(pushTimer.current);
    pushTimer.current=setTimeout(()=>{
      pushSync(activeCode,p,s,r,parts||participants).then(()=>{localChecked.current={};pendingPushRef.current=false;});
    },700);
  },[activeCode,pushSync,participants]);

  const handleJoin = async(code,name)=>{
    const nm=(name!==undefined?name:nameInput).trim();
    const c=code.toUpperCase().trim();
    if(!c||!nm)return;
    let initParts=[nm];
    const [ex,gr]=await Promise.all([fbGet("plans/"+c),fbGet("globalRecipes")]);
    if(ex){
      const inc=ex.plan||emptyPlan();
      DAYS.forEach(d=>{if(!inc[d])inc[d]={meals:{},cook:""};if(!inc[d].meals)inc[d]={meals:inc[d]||{},cook:""};});
      setPlan(inc);setShopping(ex.shopping||[]);
      const ep=ex.participants||[];
      initParts=ep.includes(nm)?ep:[...ep,nm];
      setParticipants(initParts);
    }else{
      setParticipants(initParts);
      await fbPut("plans/"+c,{plan:emptyPlan(),shopping:[],participants:initParts,updatedAt:Date.now()});
    }
    if(gr)setRecipes(Object.assign({},DR,gr));
    setActiveCode(c);setUserName(nm);setScreen("app");startPolling(c);
    try{ localStorage.setItem(SESSION_KEY,JSON.stringify({code:c,name:nm})); }catch(e){}
  };

  // PLAN VERLASSEN - Sitzung loeschen, zurueck zum Join-Screen
  const leavePlan=()=>{
    if(!window.confirm("Plan verlassen? Mit deinem Code kannst du jederzeit zurueckkehren."))return;
    clearInterval(syncTimer.current);
    clearTimeout(pushTimer.current);
    try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
    setActiveCode("");setUserName("");setJoinInput("");setView("plan");
    setDetailRecipe(null);setCookMode(false);setEditMode(false);setEditData(null);
    setScreen("join");
  };

  // MEAL & COOK - ein Slot kann mehrere Rezepte enthalten (Array)
  const addDish=(day,meal,name)=>{
    const nm=(name||"").trim();
    if(!nm)return;
    setPlan(prev=>{
      const n=JSON.parse(JSON.stringify(prev));
      if(!n[day])n[day]={meals:{},cook:""};
      if(!n[day].meals)n[day].meals={};
      const cur=n[day].meals[meal];
      const arr=Array.isArray(cur)?cur.slice():(cur?[cur]:[]);   // alte Einzel-Strings migrieren
      if(!arr.includes(nm))arr.push(nm);                          // keine Duplikate
      n[day].meals[meal]=arr;
      schedulePush(n,shopping,recipes,participants);
      return n;
    });
  };
  const removeDish=(day,meal,name)=>{
    setPlan(prev=>{
      const n=JSON.parse(JSON.stringify(prev));
      const cur=n[day]&&n[day].meals&&n[day].meals[meal];
      const arr=Array.isArray(cur)?cur.slice():(cur?[cur]:[]);
      n[day].meals[meal]=arr.filter(d=>d!==name);
      schedulePush(n,shopping,recipes,participants);
      return n;
    });
    setAddedSlots(s=>{const n={...s};delete n[day+"|"+meal+"|"+name];return n;});
  };

  const setCookForDay=(day,person)=>{
    setPlan(prev=>{
      const n=JSON.parse(JSON.stringify(prev));
      if(!n[day])n[day]={meals:{},cook:""};
      n[day].cook=n[day].cook===person?"":person;
      schedulePush(n,shopping,recipes,participants);
      return n;
    });
    setCookPicker(null);
  };

  // SHOPPING - Zutaten eines Rezepts zur Liste; gleiche Zutat erhoeht die Menge (aggregateIngs)
  const addIngsToList=(dishKey)=>{
    const rec=recipes[dishKey];
    if(!rec||!rec.ingredients||!rec.ingredients.length)return;
    setShopping(prev=>{
      const newItems=aggregateIngs([...prev.map(x=>x.text),...rec.ingredients]).map(text=>({
        text,checked:prev.find(x=>x.text===text)?.checked||false,cat:shopCat(text)
      }));
      schedulePush(plan,newItems,recipes,participants);
      return newItems;
    });
  };

  const generateShopping=()=>{
    const rawIngs=[];const dishes=[];
    DAYS.forEach(day=>MEALS.forEach(meal=>{
      const slot=plan[day]&&plan[day].meals&&plan[day].meals[meal];
      const list=Array.isArray(slot)?slot:(slot?[slot]:[]);
      list.forEach(dish=>{
        if(!dish)return;
        const rec=recipes[dish];
        if(rec&&rec.ingredients&&rec.ingredients.length) rec.ingredients.forEach(i=>rawIngs.push(i));
        else dishes.push(dn(dish)+" (Zutaten prüfen)");
      });
    }));
    const agg=aggregateIngs(rawIngs);
    const next=[
      ...agg.map(t=>({text:t,checked:false,cat:shopCat(t)})),
      ...[...new Set(dishes)].map(t=>({text:t,checked:false,cat:"Sonstiges"}))
    ];
    localChecked.current={};
    setAddedSlots({});
    setShopping(next);schedulePush(plan,next,recipes,participants);setView("shopping");
  };

  const toggleCheck=(i)=>setShopping(prev=>{
    const n=prev.map((x,idx)=>idx===i?{...x,checked:!x.checked}:x);
    localChecked.current[n[i].text]=n[i].checked;
    schedulePush(plan,n,recipes,participants);return n;
  });
  const removeItem=(i)=>setShopping(prev=>{const n=prev.filter((_,j)=>j!==i);schedulePush(plan,n,recipes,participants);return n;});
  const addCustom=()=>{
    if(!customItem.trim())return;
    const txt=customItem.trim();
    setShopping(prev=>{const n=[...prev,{text:txt,checked:false,cat:shopCat(txt)}];schedulePush(plan,n,recipes,participants);return n;});
    setCustomItem("");
  };

  // DROPDOWN: Rezepte nach Kategorie (Rubrik) gruppieren
  const getRecipesByCat=()=>{
    const byCat={}; CATS.forEach(c=>byCat[c]=[]);
    Object.keys(recipes).forEach(name=>{
      const c=recCat(recipes[name]);
      if(!byCat[c])byCat[c]=[];
      byCat[c].push(name);
    });
    return byCat;
  };
  // Eine Namensliste nach Kueche untergruppieren (fuer Hauptgericht)
  const groupByCuisine=(names)=>{
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

  // RECIPE EXTRACT
  const extractRecipe=async()=>{
    if(!canExtract) return;
    setExtracting(true);setImportErr("");setExtracted(null);
    try{
      const system="Du bist ein Kochassistent. Extrahiere aus dem gegebenen Inhalt: 1. Rezeptname, 2. Zutatenliste, 3. Schritt-für-Schritt-Kochanleitung. Falls keine Kochanleitung vorhanden ist, erstelle eine sinnvolle Anleitung basierend auf den Zutaten. Schreibe zusätzlich eine kurze, ansprechende Beschreibung (2–4 Sätze): Worum geht es bei dem Gericht, Herkunft oder Geschichte aus der Eingabe, was macht es besonders. WICHTIG: Formuliere die Beschreibung immer komplett mit eigenen Worten neu — übernimm niemals Sätze wörtlich aus der Vorlage, damit keine direkten Kopien entstehen, erfinde aber nichts Neues dazu. Antworte NUR mit JSON ohne Markdown-Formatierung: {\"name\":\"Rezeptname\",\"ingredients\":[\"Zutat 1\"],\"steps\":[\"Schritt 1\"],\"description\":\"Kurze Beschreibung\",\"category\":\"Hauptgericht\",\"cuisine\":\"Italienisch\"}. Für category wähle genau eine aus: Frühstück, Hauptgericht, Beilagen & Salate, Soßen & Dips, Snacks. Für cuisine (vor allem bei Hauptgericht relevant) wähle aus: Schwäbisch, Italienisch, Asiatisch, Mediterran, Klassisch, International, Vegetarisch, Grillen, Schnell.";
      let messages;
      if(importMode==="photo"&&recipeB64&&recipeImgType){
        messages=[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:recipeImgType,data:recipeB64}},
          {type:"text",text:"Beschreibe das Gericht auf dem Bild und erstelle daraus ein eigenes Rezept mit Zutaten und Mengenangaben sowie einer detaillierten Schritt-fuer-Schritt-Kochanleitung. Antworte ausschliesslich mit dem JSON-Objekt, kein anderer Text."}
        ]}];
      }else{
        messages=[{role:"user",content:"Extrahiere und vervollständige dieses Rezept:\n\n"+recipeText}];
      }
      const raw=await callClaude(messages,system);
      // Robust JSON extraction - find the first { ... } block
      const jsonMatch=raw.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error("Kein JSON in Antwort: "+raw.slice(0,200));
      const parsed=JSON.parse(jsonMatch[0]);
      if(!parsed.name) throw new Error("Kein Rezeptname erkannt");
      if(!parsed.ingredients||parsed.ingredients.length===0) throw new Error("Keine Zutaten erkannt");
      // Auto-generate steps if missing
      if(!parsed.steps||parsed.steps.length===0){
        const stepSystem="Erstelle eine detaillierte Schritt-fuer-Schritt-Kochanleitung. Antworte NUR mit JSON-Array ohne Markdown: [\"Schritt 1\",\"Schritt 2\"]";
        const stepRaw=await callClaude([{role:"user",content:"Rezept: "+parsed.name+"\nZutaten: "+parsed.ingredients.join(", ")}],stepSystem);
        const stepMatch=stepRaw.match(/\[[\s\S]*\]/);
        parsed.steps=stepMatch?JSON.parse(stepMatch[0]):["Zubereitung laut Rezept."];
      }
      setExtracted(parsed);
    }catch(e){
      console.error("Extract error:",e);
      const msg = (e && e.message) ? e.message : "Unbekannter Fehler";
      if(msg.includes("404")){
        setImportErr("Die KI-API ist nicht erreichbar (404). Das Gemini-Modell wurde nicht gefunden. Bitte den Vercel-Log pruefen.");
      }else if(msg.includes("429")){
        setImportErr("Zu viele Anfragen (429). Bitte 1 Minute warten und erneut versuchen. Details: "+msg);
      }else if(msg.includes("413")){
        setImportErr("Das Bild ist zu gross fuer die Anfrage (413). Bitte ein kleineres Bild nutzen.");
      }else if(msg.includes("GEMINI_API_KEY not configured")){
        setImportErr("Server-Konfiguration fehlt: GEMINI_API_KEY ist nicht gesetzt. Bitte in Vercel unter Settings → Environment Variables eintragen und danach neu deployen.");
      }else if(msg.includes("API_KEY_INVALID") || msg.includes("401")){
        setImportErr("Der Gemini API Key ist ungueltig. Bitte in Vercel einen gueltigen GEMINI_API_KEY von aistudio.google.com/apikey eintragen und danach neu deployen.");
      }else if(msg.includes("500")){
        setImportErr("Serverfehler bei der KI-Anfrage (500). Bitte Vercel-Logs und Umgebungsvariablen pruefen.");
      }else{
        setImportErr("Fehler: "+msg+". Bitte Text oder Foto pruefen und erneut versuchen.");
      }
    }
    setExtracting(false);
  };

  const saveRecipe=async()=>{
    if(!extracted||!extracted.name)return;
    const rec={ingredients:extracted.ingredients||[],steps:extracted.steps||[],description:extracted.description||"",cuisine:extracted.cuisine||"International",category:extracted.category||"Hauptgericht"};
    const key=extracted.name;
    setRecipes(prev=>{const n={...prev,[key]:rec};schedulePush(plan,shopping,n,participants);return n;});
    const patch={};patch[key]=rec;await fbPatch("globalRecipes",patch);
    setSavedMsg(true);
    setTimeout(()=>{setSavedMsg(false);setExtracted(null);setRecipeText("");setRecipeImg(null);setRecipeB64(null);},2000);
  };

  // RECIPE EDITING
  const startEdit=(name)=>{
    const rec=recipes[name];
    setEditData({name,ingredients:[...rec.ingredients],steps:[...rec.steps],description:rec.description||"",cuisine:rec.cuisine||"International",category:recCat(rec)});
    setEditMode(true);
  };

  const saveEdit=async()=>{
    if(!editData)return;
    const rec={ingredients:editData.ingredients,steps:editData.steps,description:editData.description||"",cuisine:editData.cuisine,category:editData.category};
    const isRenamed=editData.name!==detailRecipe;
    setRecipes(prev=>{
      const n={...prev};
      if(isRenamed){delete n[detailRecipe];}
      n[editData.name]=rec;
      schedulePush(plan,shopping,n,participants);
      return n;
    });
    const patch={};patch[editData.name]=rec;
    if(isRenamed){const del={};del[detailRecipe]=null;await fbPatch("globalRecipes",del);}
    await fbPatch("globalRecipes",patch);
    setDetailRecipe(editData.name);
    setEditMode(false);setEditData(null);
  };

  const deleteRecipe=async(name)=>{
    if(!window.confirm("Rezept '"+dn(name)+"' wirklich löschen?"))return;
    setRecipes(prev=>{const n={...prev};delete n[name];schedulePush(plan,shopping,n,participants);return n;});
    const del={};del[name]=null;await fbPatch("globalRecipes",del);
    setDetailRecipe(null);setEditMode(false);
  };

  // SINGLE RECIPE PDF (Druckdialog -> "Als PDF speichern")
  const downloadRecipePDF=(name)=>{
    const rec=recipes[name];
    if(!rec)return;
    const html=makeRecipePDF(name,rec);
    const w=window.open("","_blank");
    if(!w)return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>{w.print();},1000);
  };

  // PDF COOKBOOK
  const downloadPDF=()=>{
    const html=makePDF(recipes);
    const w=window.open("","_blank");
    if(!w)return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>{w.print();},1000);
  };

  // CLOSE DROPDOWNS
  useEffect(()=>{
    const h=(e)=>{
      if(cellRef.current&&!cellRef.current.contains(e.target)){setActiveCell(null);setOpenCat(null);}
      if(cookRef.current&&!cookRef.current.contains(e.target))setCookPicker(null);
    };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // Sync-Schutz: merkt sich, ob gerade eine Mahlzelle offen ist (siehe pullSync)
  editingRef.current = activeCell!==null;

  // BACK BUTTON (Teil B): schliesst die oberste offene Ebene statt aus der App zu fliegen.
  // handleBackRef wird bei jedem Render aktualisiert, damit der popstate-Listener
  // immer den aktuellen Zustand sieht (keine veralteten Closures).
  handleBackRef.current=()=>{
    if(cookMode){ setCookMode(false); return true; }
    if(editMode){ setEditMode(false); setEditData(null); return true; }
    if(detailRecipe){ setDetailRecipe(null); setImgLoaded(false); return true; }
    return false;
  };
  useEffect(()=>{
    if(screen!=="app") return;
    window.history.pushState({wp:1},"");        // Puffer-Eintrag, damit der erste Zurueck-Druck abgefangen wird
    const onPop=()=>{
      if(handleBackRef.current()){
        window.history.pushState({wp:1},"");     // Ebene geschlossen -> Falle neu scharf machen
        return;
      }
      if(exitArmedRef.current){                  // zweiter Druck -> wirklich verlassen
        window.removeEventListener("popstate",onPop);
        window.history.back();
      }else{                                     // erster Druck auf der Hauptansicht -> Hinweis zeigen
        exitArmedRef.current=true;
        setExitToast(true);
        window.history.pushState({wp:1},"");
        setTimeout(()=>{exitArmedRef.current=false;setExitToast(false);},2500);
      }
    };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[screen]);

  const getDishes=(day,meal)=>{
    const v=plan[day]&&plan[day].meals&&plan[day].meals[meal];
    if(!v)return [];
    return Array.isArray(v)?v:[v];
  };
  const getCook=(day)=>plan[day]&&plan[day].cook||"";
  const unchecked=shopping.filter(x=>!x.checked).length;
  const curRec=detailRecipe?recipes[detailRecipe]:null;
  const curIngs=curRec?(curRec.ingredients||[]):[];
  const curSteps=curRec?(curRec.steps||[]):[];

  // GROUP SHOPPING BY SUPERMARKET CATEGORY
  const shoppingGrouped=()=>{
    const groups={};
    const catOrder=["Obst & Gemüse","Fleisch & Fisch","Milch & Käse","Backwaren","Trockenwaren","Konserven","Gewürze & Öle","Getränke","Sonstiges"];
    shopping.forEach((item,i)=>{
      const cat=item.cat||shopCat(item.text);
      if(!groups[cat])groups[cat]=[];
      groups[cat].push({...item,idx:i});
    });
    return catOrder.filter(c=>groups[c]&&groups[c].length).map(c=>({cat:c,items:groups[c]}));
  };

  // UI VARS
  var content = null;

  // LOADING
  if(screen==="loading"){
    content=(
      <div style={{minHeight:"100vh",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:SF,fontSize:"13px",letterSpacing:"1px"}}>
        Laden...
      </div>
    );
  }

  // JOIN
  else if(screen==="join"){
    content=(
      <div style={{minHeight:"100vh",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:SF}}>
        <div style={{width:"100%",maxWidth:"380px"}}>
          <div style={{textAlign:"center",marginBottom:"24px"}}>
            <div style={{color:C.accent,fontSize:"14px",fontWeight:"700",letterSpacing:"3px",textTransform:"uppercase",marginBottom:"16px"}}>Wochenplan</div>
            <div style={{color:"#fff",fontSize:"40px",fontFamily:SER,marginBottom:"4px",lineHeight:"1.1"}}>Gemeinsam kochen.</div>
            <div style={{color:"rgba(255,255,255,0.45)",fontSize:"26px",fontFamily:"'Dancing Script', 'Segoe Script', cursive",marginBottom:"8px"}}>by Mero</div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:"13px"}}>Planen - Einkaufen - Geniessen</div>
          </div>
          <div style={{marginBottom:"24px",textAlign:"center"}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:"13px",lineHeight:"1.6"}}>Nie wieder der fragende Blick in den leeren Kühlschrank:</div>
            <div style={{color:C.accent,fontStyle:"italic",fontSize:"13px",lineHeight:"1.6"}}>"Was kochen wir heute?"</div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <label style={{color:"rgba(255,255,255,0.4)",fontSize:"10px",fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Dein Name</label>
            <input value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="z.B. Anna" style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#fff",fontSize:"15px",outline:"none",boxSizing:"border-box",fontFamily:SF}} />
          </div>
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:"16px",marginBottom:"10px"}}>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"10px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"4px"}}>NEUEN PLAN ERSTELLEN</div>
            <div style={{color:"rgba(255,255,255,0.2)",fontSize:"11px",marginBottom:"12px"}}>Teile den Code mit deiner Familie.</div>
            <div style={{background:"rgba(193,125,60,0.1)",border:"1px solid rgba(193,125,60,0.3)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
              <span style={{color:"rgba(255,255,255,0.3)",fontSize:"11px",letterSpacing:"1px"}}>CODE</span>
              <span style={{color:C.accent,fontSize:"20px",fontWeight:"700",letterSpacing:"6px"}}>{myCode}</span>
            </div>
            <button onClick={()=>handleJoin(myCode)} style={{width:"100%",padding:"12px",background:nameInput.trim()?C.accent:"#2d2d2d",border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:nameInput.trim()?"pointer":"default",fontFamily:SF}}>PLAN STARTEN</button>
          </div>
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",padding:"16px"}}>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"10px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"4px"}}>BEITRETEN</div>
            <div style={{color:"rgba(255,255,255,0.2)",fontSize:"11px",marginBottom:"10px"}}>Code eingeben den du erhalten hast.</div>
            <input value={joinInput} onChange={e=>setJoinInput(e.target.value.toUpperCase())} placeholder="CODE" maxLength={6} style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",fontSize:"20px",fontWeight:"700",letterSpacing:"6px",outline:"none",boxSizing:"border-box",textAlign:"center",marginBottom:"10px",fontFamily:SF}} />
            <button onClick={()=>handleJoin(joinInput)} style={{width:"100%",padding:"12px",background:(joinInput.length>=4&&nameInput.trim())?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.02)",border:"none",color:(joinInput.length>=4&&nameInput.trim())?"#fff":"rgba(255,255,255,0.2)",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:(joinInput.length>=4&&nameInput.trim())?"pointer":"default",fontFamily:SF}}>BEITRETEN</button>
          </div>
        </div>
      </div>
    );
  }

  // COOK MODE
  else if(cookMode&&detailRecipe&&curRec){
    content=(
      <div style={{minHeight:"100vh",background:C.dark,fontFamily:SF,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"20px 24px",display:"flex",alignItems:"center",gap:"16px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          <button onClick={()=>setCookMode(false)} style={{background:"rgba(255,255,255,0.07)",border:"none",color:"rgba(255,255,255,0.6)",padding:"8px 14px",fontSize:"12px",letterSpacing:"0.5px",cursor:"pointer",fontFamily:SF}}>ZURUECK</button>
          <div style={{flex:1,fontFamily:SER,color:"#fff",fontSize:"18px"}}>{dn(detailRecipe)}</div>
          <div style={{color:C.accent,fontSize:"12px",fontWeight:"700",letterSpacing:"1px"}}>{cookStep+1} / {curSteps.length}</div>
        </div>
        <div style={{display:"flex",gap:"4px",padding:"0 24px",marginTop:"20px"}}>
          {curSteps.map((_,i)=>(
            <div key={i} onClick={()=>setCookStep(i)} style={{height:"2px",flex:1,background:i<=cookStep?C.accent:"rgba(255,255,255,0.12)",cursor:"pointer",transition:"background 0.3s"}} />
          ))}
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 32px"}}>
          <div style={{fontSize:"72px",fontFamily:SER,color:C.accent,marginBottom:"32px",lineHeight:1}}>{cookStep+1}</div>
          <div style={{fontSize:"22px",color:"rgba(255,255,255,0.9)",fontFamily:SER,textAlign:"center",lineHeight:"1.7",maxWidth:"360px"}}>{curSteps[cookStep]}</div>
        </div>
        <div style={{padding:"24px",display:"flex",gap:"12px"}}>
          <button onClick={()=>setCookStep(s=>Math.max(0,s-1))} style={{flex:1,padding:"14px",border:"none",background:"rgba(255,255,255,0.07)",color:cookStep===0?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.7)",fontSize:"13px",letterSpacing:"1px",cursor:cookStep===0?"default":"pointer",fontFamily:SF}}>ZURUECK</button>
          {cookStep<curSteps.length-1
            ?<button onClick={()=>setCookStep(s=>s+1)} style={{flex:2,padding:"14px",border:"none",background:C.accent,color:"#fff",fontSize:"13px",letterSpacing:"1px",fontWeight:"700",cursor:"pointer",fontFamily:SF}}>WEITER</button>
            :<button onClick={()=>{setCookMode(false);setCookStep(0);}} style={{flex:2,padding:"14px",border:"none",background:C.ok,color:"#fff",fontSize:"13px",letterSpacing:"1px",fontWeight:"700",cursor:"pointer",fontFamily:SF}}>FERTIG</button>
          }
        </div>
      </div>
    );
  }

  // RECIPE DETAIL
  else if(detailRecipe&&curRec&&!cookMode){
    content=(
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:SF}}>
        <div style={{position:"relative",height:"260px",background:C.dark,overflow:"hidden"}}>
          <img src={foodImg(detailRecipe)} alt={dn(detailRecipe)} onLoad={()=>setImgLoaded(true)} onError={()=>setImgLoaded(true)} style={{width:"100%",height:"100%",objectFit:"cover",opacity:imgLoaded?0.75:0,transition:"opacity 0.6s"}} />
          {!imgLoaded&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.3)",fontSize:"12px",letterSpacing:"1px"}}>BILD WIRD GELADEN...</div>}
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 30%,"+C.dark+")"}} />
          <button onClick={()=>{setDetailRecipe(null);setImgLoaded(false);setEditMode(false);setEditData(null);}} style={{position:"absolute",top:16,left:16,background:"rgba(0,0,0,0.4)",border:"none",color:"rgba(255,255,255,0.8)",padding:"8px 14px",fontSize:"11px",letterSpacing:"1px",cursor:"pointer",fontFamily:SF}}>ZURUECK</button>
          <div style={{position:"absolute",bottom:24,left:24,right:24}}>
            <div style={{color:C.accent,fontSize:"10px",fontWeight:"700",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>{recCat(curRec)}{curRec.cuisine?" / "+curRec.cuisine:""}</div>
            <div style={{color:"#fff",fontSize:"28px",fontFamily:SER,lineHeight:"1.2"}}>{dn(detailRecipe)}</div>
          </div>
        </div>

        <div style={{padding:"16px 16px 60px"}}>
          {!editMode?(
            <div>
              <div style={{display:"flex",gap:"8px",marginBottom:"14px"}}>
                {curSteps.length>0&&<button onClick={()=>{setCookStep(0);setCookMode(true);}} style={{flex:2,padding:"13px",background:C.dark,border:"none",color:"#fff",fontSize:"11px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",fontFamily:SF}}>KOCHMODUS</button>}
                <button onClick={()=>startEdit(detailRecipe)} style={{flex:1,padding:"13px",background:"none",border:"1px solid "+C.border,color:C.text,fontSize:"11px",fontWeight:"700",letterSpacing:"1px",cursor:"pointer",fontFamily:SF}}>BEARBEITEN</button>
                <button onClick={()=>downloadRecipePDF(detailRecipe)} style={{flex:1,padding:"13px",background:"none",border:"1px solid "+C.border,color:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"1px",cursor:"pointer",fontFamily:SF}}>ALS PDF</button>
              </div>
              {curRec.description&&(
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                  <div style={{fontSize:"10px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"10px"}}>Beschreibung</div>
                  <div style={{fontSize:"14px",color:C.text,lineHeight:"1.7",fontFamily:SER,fontStyle:"italic"}}>{curRec.description}</div>
                </div>
              )}
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                <div style={{fontSize:"10px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"14px"}}>Zutaten</div>
                {curIngs.map((ing,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<curIngs.length-1?"1px solid "+C.border:"none"}}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0}} />
                    <span style={{fontSize:"14px",color:C.text}}>{ing}</span>
                  </div>
                ))}
              </div>
              {curSteps.length>0&&(
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                  <div style={{fontSize:"10px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"16px"}}>Zubereitung</div>
                  {curSteps.map((step,i)=>(
                    <div key={i} style={{display:"flex",gap:"14px",marginBottom:i<curSteps.length-1?"18px":"0"}}>
                      <div style={{width:"26px",height:"26px",borderRadius:"50%",border:"1px solid "+(i===0?C.accent:C.border),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"11px",fontWeight:"700",color:i===0?C.accent:C.muted}}>{i+1}</div>
                      <div style={{paddingTop:"4px",fontSize:"14px",color:C.text,lineHeight:"1.7"}}>{step}</div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={()=>deleteRecipe(detailRecipe)} style={{width:"100%",padding:"12px",background:"none",border:"1px solid #FFCDD2",color:C.err,fontSize:"11px",fontWeight:"700",letterSpacing:"1px",cursor:"pointer",fontFamily:SF}}>REZEPT LOESCHEN</button>
            </div>
          ):(
            <div>
              <div style={{fontSize:"10px",color:C.accent,fontWeight:"700",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>REZEPT BEARBEITEN</div>
              <div style={{marginBottom:"10px"}}>
                <label style={{fontSize:"10px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>Name</label>
                <input value={editData.name} onChange={e=>setEditData(d=>({...d,name:e.target.value}))} style={{width:"100%",border:"1px solid "+C.border,padding:"10px 12px",fontSize:"15px",fontFamily:SER,color:C.text,outline:"none",boxSizing:"border-box",background:C.white}} />
              </div>
              <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:"10px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>Kategorie</label>
                  <select value={editData.category} onChange={e=>setEditData(d=>({...d,category:e.target.value}))} style={{width:"100%",border:"1px solid "+C.border,padding:"10px 12px",fontSize:"13px",fontFamily:SF,color:C.text,outline:"none",background:C.white}}>
                    {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:"10px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>Küche</label>
                  <select value={editData.cuisine} onChange={e=>setEditData(d=>({...d,cuisine:e.target.value}))} style={{width:"100%",border:"1px solid "+C.border,padding:"10px 12px",fontSize:"13px",fontFamily:SF,color:C.text,outline:"none",background:C.white}}>
                    {["Schwäbisch","Italienisch","Asiatisch","Mediterran","Klassisch","International","Vegetarisch","Grillen","Schnell"].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:"10px"}}>
                <label style={{fontSize:"10px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>Beschreibung</label>
                <textarea value={editData.description||""} onChange={e=>setEditData(d=>({...d,description:e.target.value}))} placeholder="Kurze Beschreibung / Geschichte zum Rezept..." style={{width:"100%",minHeight:"70px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:C.white}} />
              </div>
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"10px"}}>
                <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>Zutaten</div>
                {editData.ingredients.map((ing,i)=>(
                  <div key={i} style={{display:"flex",gap:"8px",padding:"5px 0",borderBottom:i<editData.ingredients.length-1?"1px solid "+C.border:"none"}}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0,marginTop:"10px"}} />
                    <input value={ing} onChange={e=>setEditData(d=>{const a=[...d.ingredients];a[i]=e.target.value;return{...d,ingredients:a};})} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF,padding:"4px 0"}} />
                    <button onClick={()=>setEditData(d=>({...d,ingredients:d.ingredients.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"16px",lineHeight:1}}>x</button>
                  </div>
                ))}
                <button onClick={()=>setEditData(d=>({...d,ingredients:[...d.ingredients,""]}))} style={{marginTop:"8px",background:"none",border:"1px solid "+C.border,padding:"5px 12px",cursor:"pointer",color:C.muted,fontSize:"11px",letterSpacing:"0.5px",fontFamily:SF}}>+ Zutat</button>
              </div>
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"14px"}}>
                <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>Schritte</div>
                {editData.steps.map((step,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"8px",padding:"6px 0",borderBottom:i<editData.steps.length-1?"1px solid "+C.border:"none"}}>
                    <span style={{color:C.accent,fontSize:"11px",fontWeight:"700",minWidth:"16px",paddingTop:"4px"}}>{i+1}.</span>
                    <textarea value={step} onChange={e=>setEditData(d=>{const a=[...d.steps];a[i]=e.target.value;return{...d,steps:a};})} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF,resize:"none",lineHeight:"1.5",minHeight:"36px"}} />
                    <button onClick={()=>setEditData(d=>({...d,steps:d.steps.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"16px",flexShrink:0}}>x</button>
                  </div>
                ))}
                <button onClick={()=>setEditData(d=>({...d,steps:[...d.steps,""]}))} style={{marginTop:"8px",background:"none",border:"1px solid "+C.border,padding:"5px 12px",cursor:"pointer",color:C.muted,fontSize:"11px",letterSpacing:"0.5px",fontFamily:SF}}>+ Schritt</button>
              </div>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={saveEdit} style={{flex:2,padding:"13px",background:C.dark,border:"none",color:"#fff",fontSize:"11px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",fontFamily:SF}}>SPEICHERN</button>
                <button onClick={()=>{setEditMode(false);setEditData(null);}} style={{flex:1,padding:"13px",background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:"11px",fontWeight:"700",letterSpacing:"1px",cursor:"pointer",fontFamily:SF}}>ABBRECHEN</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // MAIN APP
  else if(screen==="app"){
    const shopGroups=shoppingGrouped();

    content=(
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:SF}}>
        {/* EXIT HINWEIS (Teil B) */}
        {exitToast&&(
          <div style={{position:"fixed",bottom:"20px",left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"rgba(0,0,0,0.88)",color:"#fff",padding:"10px 18px",borderRadius:"6px",fontSize:"12px",letterSpacing:"0.5px",fontFamily:SF,boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}>
            Nochmal „Zurueck" druecken zum Verlassen
          </div>
        )}
        {/* HEADER */}
        <div style={{background:C.dark,padding:"12px 16px",display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{flex:1}}>
            <div style={{color:C.accent,fontSize:"9px",fontWeight:"700",letterSpacing:"3px",textTransform:"uppercase",marginBottom:"1px"}}>Wochenplan</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"11px"}}>{userName}</div>
          </div>
          <button onClick={()=>{navigator.clipboard.writeText(activeCode);setCodeCopied(true);setTimeout(()=>setCodeCopied(false),2000);}} style={{background:"rgba(193,125,60,0.15)",border:"1px solid rgba(193,125,60,0.25)",padding:"5px 10px",textAlign:"center",cursor:"pointer",fontFamily:SF}}>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:"8px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"1px"}}>{codeCopied?"KOPIERT":"CODE KOPIEREN"}</div>
            <div style={{color:C.accent,fontSize:"14px",fontWeight:"700",letterSpacing:"3px"}}>{activeCode}</div>
          </button>
          <button onClick={leavePlan} title="Plan verlassen" style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.55)",padding:"7px 10px",fontSize:"10px",fontWeight:"700",letterSpacing:"1px",cursor:"pointer",fontFamily:SF,alignSelf:"stretch"}}>VERLASSEN</button>
        </div>

        {/* SYNC */}
        <div style={{background:syncOk?"#1A2620":"#261A1A",borderBottom:"1px solid "+(syncOk?"#2E5040":"#502020"),padding:"4px 16px",display:"flex",alignItems:"center",gap:"6px"}}>
          <div style={{width:"6px",height:"6px",borderRadius:"50%",background:syncOk?C.ok:C.err}} />
          <span style={{fontSize:"10px",color:syncOk?"#4CAF7D":C.err}}>{syncOk?(lastSync?"Sync "+new Date(lastSync).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):"Verbunden"):"Verbindungsfehler"}</span>
          <span style={{marginLeft:"auto",fontSize:"9px",color:C.subtle}}>alle 10 Sek.</span>
        </div>

        {/* TABS */}
        <div style={{display:"flex",background:C.white,borderBottom:"1px solid "+C.border,padding:"0 12px",overflowX:"auto"}}>
          {[{id:"plan",label:"Wochenplan"},{id:"shopping",label:"Einkauf"+(unchecked>0?" ("+unchecked+")":"")},{id:"recipes",label:"Rezepte"},{id:"cookbook",label:"Kochbuch"}].map(t=>(
            <button key={t.id} onClick={()=>setView(t.id)} style={{padding:"12px 13px",border:"none",borderBottom:view===t.id?"2px solid "+C.accent:"2px solid transparent",color:view===t.id?C.accent:C.muted,fontWeight:view===t.id?"700":"400",fontSize:"12px",letterSpacing:"0.5px",whiteSpace:"nowrap",background:"none",cursor:"pointer",fontFamily:SF}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* PLAN VIEW */}
        {view==="plan"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {DAYS.map((day,di)=>{
              const cookName=getCook(day);
              return(
                <div key={day} style={{marginBottom:"10px",background:C.white,border:"1px solid "+C.border}}>
                  {/* Day header */}
                  <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:"10px",borderBottom:"1px solid "+C.border}}>
                    <div>
                      <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1px",textTransform:"uppercase"}}>{day}</div>
                      <div style={{fontSize:"13px",fontWeight:"600",color:C.text}}>{DAYFUL[di]}</div>
                    </div>
                    <div style={{flex:1}} />
                    {/* Cook picker */}
                    <div style={{position:"relative"}} ref={cookPicker===day?cookRef:null}>
                      <button onClick={()=>setCookPicker(cookPicker===day?null:day)} style={{display:"flex",alignItems:"center",gap:"7px",padding:"5px 10px",background:cookName?C.abg:C.bg,border:"1px solid "+(cookName?C.accent:C.border),cursor:"pointer",fontFamily:SF}}>
                        {cookName?(
                          <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                            <span style={{width:"20px",height:"20px",borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:"800",color:"#fff",flexShrink:0}}>{initials(cookName)}</span>
                            <span style={{fontSize:"11px",color:C.accent,fontWeight:"600",maxWidth:"70px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cookName}</span>
                          </span>
                        ):(
                          <span style={{fontSize:"11px",color:C.muted}}>Wer kocht?</span>
                        )}
                      </button>
                      {cookPicker===day&&(
                        <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:999,background:C.white,border:"1px solid "+C.border,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",minWidth:"160px"}}>
                          {participants.map(p=>(
                            <button key={p} onMouseDown={e=>{e.preventDefault();setCookForDay(day,p);}} style={{width:"100%",padding:"10px 14px",textAlign:"left",background:cookName===p?C.abg:C.white,color:cookName===p?C.accent:C.text,fontSize:"13px",display:"flex",alignItems:"center",gap:"9px",borderBottom:"1px solid "+C.border,border:"none",cursor:"pointer",fontFamily:SF}}>
                              <span style={{width:"22px",height:"22px",borderRadius:"50%",background:cookName===p?C.accent:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:"800",color:cookName===p?"#fff":C.muted,flexShrink:0}}>{initials(p)}</span>
                              {p}
                              {cookName===p&&<span style={{marginLeft:"auto",color:C.accent,fontSize:"12px"}}>v</span>}
                            </button>
                          ))}
                          {cookName&&<button onMouseDown={e=>{e.preventDefault();setCookForDay(day,"");}} style={{width:"100%",padding:"8px 14px",textAlign:"center",background:"none",color:C.muted,fontSize:"11px",border:"none",cursor:"pointer",fontFamily:SF}}>Auswahl entfernen</button>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Meals */}
                  {MEALS.map(meal=>{
                    const key=day+"-"+meal;
                    const isActive=activeCell===key;
                    const dishes=getDishes(day,meal);

                    return(
                      <div key={meal} style={{position:"relative"}} ref={isActive?cellRef:null}>
                        <div style={{display:"flex",alignItems:"stretch",background:isActive?C.abg:"transparent",transition:"background 0.15s"}}>
                          <div style={{width:"100px",padding:"10px 10px",flexShrink:0}}>
                            <div style={{fontSize:"10px",fontWeight:"700",color:isActive?C.accent:C.subtle,letterSpacing:"0.5px",textTransform:"uppercase",lineHeight:"1.2",whiteSpace:"nowrap"}}>{ML[meal]}</div>
                          </div>
                          <div style={{width:"1px",background:C.border,alignSelf:"stretch"}} />
                          <div style={{flex:1,padding:"4px 10px",minWidth:0}}>
                            {/* zugewiesene Rezepte */}
                            {dishes.map(d=>{
                              const hasR=!!recipes[d];
                              const addKey=day+"|"+meal+"|"+d;
                              const isAdded=!!addedSlots[addKey];
                              return(
                                <div key={d} style={{display:"flex",alignItems:"center",gap:"4px",padding:"5px 0",borderBottom:"1px solid "+C.border}}>
                                  <span style={{flex:1,fontSize:"13px",color:C.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dn(d)}</span>
                                  {hasR&&(isAdded
                                    ? <span title="bereits zur Einkaufsliste hinzugefügt" style={{color:C.ok,fontSize:"18px",padding:"8px 10px",lineHeight:1,flexShrink:0,opacity:0.85}}>✓</span>
                                    : <button onClick={()=>{addIngsToList(d);setAddedSlots(s=>({...s,[addKey]:true}));}} title="Zutaten zur Einkaufsliste" style={{color:C.ok,fontSize:"20px",background:"none",border:"none",cursor:"pointer",padding:"8px 10px",lineHeight:1,flexShrink:0}}>+</button>
                                  )}
                                  {hasR&&<button onClick={()=>{setDetailRecipe(d);setCookStep(0);setCookMode(false);setImgLoaded(false);}} style={{color:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"0.5px",background:"none",border:"none",cursor:"pointer",padding:"8px 8px",fontFamily:SF,flexShrink:0}}>REZEPT</button>}
                                  <button onClick={()=>removeDish(day,meal,d)} title="Entfernen" style={{color:C.subtle,fontSize:"20px",background:"none",border:"none",cursor:"pointer",padding:"8px 10px",lineHeight:1,flexShrink:0}}>×</button>
                                </div>
                              );
                            })}
                            {/* Hinzufuegen-Zeile */}
                            {isActive
                              ?<input autoFocus value={cellInput} onChange={e=>setCellInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){addDish(day,meal,cellInput);setCellInput("");}if(e.key==="Escape"){setActiveCell(null);setOpenCat(null);}}} placeholder="Suchen oder eingeben..." style={{width:"100%",border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",padding:"8px 0",fontFamily:SF}} />
                              :<button onClick={()=>{setActiveCell(key);setCellInput("");setOpenCat(null);}} style={{width:"100%",textAlign:"left",padding:"8px 0",fontSize:"13px",color:C.subtle,fontStyle:"italic",background:"none",border:"none",cursor:"pointer",fontFamily:SF}}>+ Hinzufügen...</button>
                            }
                          </div>
                        </div>
                        {meal!==MEALS[MEALS.length-1]&&<div style={{height:"1px",background:C.border,marginLeft:"100px"}} />}

                        {/* KATEGORIE-DROPDOWN */}
                        {isActive&&(()=>{
                          const byCat=getRecipesByCat();
                          const catsToShow=openCat?[openCat]:CATS;
                          const flt=(names)=>names.filter(s=>!cellInput||dn(s).toLowerCase().includes(cellInput.toLowerCase()));
                          const itemBtn=(s)=>(
                            <button key={s} onMouseDown={e=>{e.preventDefault();addDish(day,meal,s);setCellInput("");}} onMouseEnter={e=>e.currentTarget.style.background=C.abg} onMouseLeave={e=>e.currentTarget.style.background=C.white} style={{width:"100%",padding:"9px 14px",border:"none",borderBottom:"1px solid "+C.border,background:dishes.includes(s)?C.abg:C.white,textAlign:"left",cursor:"pointer",fontSize:"13px",color:C.text,display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:SF}}>
                              <span>{dishes.includes(s)?"✓ ":""}{dn(s)}</span>
                              {recipes[s]&&<span style={{fontSize:"9px",color:C.accent,fontWeight:"700",letterSpacing:"0.5px"}}>REZEPT</span>}
                            </button>
                          );
                          return(
                          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,background:C.white,border:"2px solid "+C.accent,borderRadius:"4px",boxShadow:"0 14px 36px rgba(0,0,0,0.55)"}}>
                            {/* Kategorie-Tabs */}
                            <div style={{display:"flex",gap:"0",overflowX:"auto",borderBottom:"1px solid "+C.border,background:C.bg}}>
                              <button onMouseDown={e=>{e.preventDefault();setOpenCat(null);}} style={{padding:"7px 10px",border:"none",background:openCat===null?C.white:"transparent",color:openCat===null?C.accent:C.muted,fontSize:"10px",fontWeight:"700",letterSpacing:"0.5px",cursor:"pointer",fontFamily:SF,flexShrink:0,whiteSpace:"nowrap",borderBottom:openCat===null?"2px solid "+C.accent:"2px solid transparent"}}>ALLE</button>
                              {CATS.map(c=>(
                                <button key={c} onMouseDown={e=>{e.preventDefault();setOpenCat(openCat===c?null:c);}} style={{padding:"7px 10px",border:"none",background:openCat===c?C.white:"transparent",color:openCat===c?C.accent:C.muted,fontSize:"10px",fontWeight:"700",letterSpacing:"0.5px",cursor:"pointer",fontFamily:SF,flexShrink:0,whiteSpace:"nowrap",borderBottom:openCat===c?"2px solid "+C.accent:"2px solid transparent"}}>{c.toUpperCase()}</button>
                              ))}
                            </div>
                            <div style={{maxHeight:"240px",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                              {catsToShow.map(cat=>{
                                const names=flt(byCat[cat]||[]);
                                if(!names.length)return null;
                                return(
                                  <div key={cat}>
                                    <div style={{padding:"7px 14px 5px",fontSize:"9px",fontWeight:"700",color:C.accent,letterSpacing:"1.5px",textTransform:"uppercase",background:C.bg,borderTop:"1px solid "+C.border,borderBottom:"1px solid "+C.border}}>{cat}</div>
                                    {cat==="Hauptgericht"
                                      ? groupByCuisine(names).map(g=>(
                                          <div key={g.cuisine}>
                                            <div style={{padding:"5px 14px 3px 22px",fontSize:"9px",fontWeight:"700",color:C.subtle,letterSpacing:"1.5px",textTransform:"uppercase"}}>{g.cuisine}</div>
                                            {g.items.map(itemBtn)}
                                          </div>
                                        ))
                                      : names.map(itemBtn)
                                    }
                                  </div>
                                );
                              })}
                            </div>
                            {cellInput&&(
                              <div style={{padding:"7px 14px",borderTop:"1px solid "+C.border,background:C.bg}}>
                                <button onMouseDown={e=>{e.preventDefault();addDish(day,meal,cellInput);setCellInput("");}} style={{background:"none",border:"none",color:C.accent,fontSize:"11px",fontWeight:"700",cursor:"pointer",fontFamily:SF}}>+ "{cellInput}" hinzufügen</button>
                              </div>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <button onClick={generateShopping} style={{width:"100%",padding:"14px",background:C.dark,border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",marginTop:"4px",fontFamily:SF}}>GESAMTE EINKAUFSLISTE GENERIEREN</button>
          </div>
        )}

        {/* SHOPPING VIEW */}
        {view==="shopping"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {shopping.length===0?(
              <div style={{textAlign:"center",padding:"64px 24px",color:C.muted}}>
                <div style={{fontSize:"40px",fontFamily:SER,color:C.subtle,marginBottom:"16px"}}>-</div>
                <div style={{fontSize:"14px",marginBottom:"20px",lineHeight:"1.6"}}>Einkaufsliste ist leer. Generiere sie über den Wochenplan oder füge einzelne Gerichte über das + Symbol hinzu.</div>
                <button onClick={()=>setView("plan")} style={{padding:"12px 24px",background:C.dark,border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"1.5px",cursor:"pointer",fontFamily:SF}}>ZUM WOCHENPLAN</button>
              </div>
            ):(
              <div>
                {/* Progress */}
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"10px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"7px"}}>
                    <span style={{fontSize:"11px",color:C.muted,letterSpacing:"0.5px",textTransform:"uppercase"}}>Erledigt</span>
                    <span style={{fontSize:"11px",fontWeight:"700",color:C.ok}}>{shopping.length-unchecked} / {shopping.length}</span>
                  </div>
                  <div style={{background:C.border,height:"2px"}}>
                    <div style={{height:"100%",width:((shopping.length-unchecked)/shopping.length*100)+"%",background:C.ok,transition:"width 0.4s"}} />
                  </div>
                </div>

                {/* Grouped by supermarket category */}
                {shopGroups.map(group=>(
                  <div key={group.cat} style={{marginBottom:"10px"}}>
                    <div style={{fontSize:"9px",fontWeight:"700",color:C.accent,letterSpacing:"2px",textTransform:"uppercase",padding:"8px 14px",background:C.bg,border:"1px solid "+C.border,borderBottom:"none"}}>{group.cat}</div>
                    <div style={{background:C.white,border:"1px solid "+C.border}}>
                      {group.items.map((item,gi)=>(
                        <div key={item.idx} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",borderBottom:gi<group.items.length-1?"1px solid "+C.border:"none",background:C.white,transition:"background 0.15s"}}>
                          <button onClick={()=>toggleCheck(item.idx)} style={{width:"28px",height:"28px",border:"2px solid "+(item.checked?C.ok:C.border),background:item.checked?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",borderRadius:"4px"}}>
                            {item.checked&&<span style={{color:"#fff",fontSize:"15px",fontWeight:"800"}}>✓</span>}
                          </button>
                          <span style={{flex:1,fontSize:"14px",color:C.text,textDecoration:item.checked?"line-through "+C.err:"none",textDecorationThickness:"2px",transition:"all 0.15s"}}>{item.text}</span>
                          <button onClick={()=>removeItem(item.idx)} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"20px",lineHeight:1,padding:"6px 8px",flexShrink:0}}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Add custom */}
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"9px",display:"flex",gap:"8px",marginTop:"4px"}}>
                  <input value={customItem} onChange={e=>setCustomItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()} placeholder="Produkt hinzufügen..." style={{flex:1,border:"1px solid "+C.border,padding:"9px 12px",fontSize:"13px",outline:"none",color:C.text,fontFamily:SF,background:"#16161C"}} />
                  <button onClick={addCustom} style={{background:C.dark,border:"none",color:"#fff",padding:"9px 16px",cursor:"pointer",fontSize:"18px",fontWeight:"700"}}>+</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RECIPES VIEW */}
        {view==="recipes"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {/* Import mode toggle */}
            <div style={{display:"flex",marginBottom:"12px",border:"1px solid "+C.border,background:C.white}}>
              {[{id:"text",label:"TEXT"},{id:"photo",label:"FOTO"}].map(m=>(
                <button key={m.id} onClick={()=>{setImportMode(m.id);setExtracted(null);setImportErr("");}} style={{flex:1,padding:"11px",background:importMode===m.id?C.dark:C.white,color:importMode===m.id?"#fff":C.muted,fontWeight:"700",fontSize:"11px",letterSpacing:"2px",cursor:"pointer",border:"none",fontFamily:SF}}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Import area */}
            <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px"}}>{importMode==="text"?"REZEPTTEXT EINFUEGEN":"REZEPTFOTO HOCHLADEN"}</div>
              {isLocalDev&&(
                <div style={{marginBottom:"10px",padding:"8px 10px",background:"#FFF8EC",border:"1px solid #F1D5AE",color:"#8C5A22",fontSize:"12px",lineHeight:"1.45"}}>
                  Hinweis: Lokal mit npm run dev ist /api/gemini oft nicht verfuegbar. Nutze vercel dev oder die deployte Vercel-App fuer KI-Extraktion.
                </div>
              )}
              {importMode==="text"
                ?<textarea value={recipeText} onChange={e=>setRecipeText(e.target.value)} placeholder="Füge hier einen Rezepttext ein. Fehlende Kochanleitung wird automatisch ergänzt..." style={{width:"100%",minHeight:"110px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:"#16161C"}} />
                :(
                  <div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={async e=>{
                      const f=e.target.files[0];
                      if(!f)return;
                      setImportErr("");
                      try{
                        const prevUrl = recipeImg;
                        const compressed = await compressImageToBase64(f,{maxEdge:1600,quality:0.82});
                        if(prevUrl) URL.revokeObjectURL(prevUrl);
                        if(!compressed.base64) throw new Error("Bilddaten fehlen nach Komprimierung.");
                        if(compressed.base64.length > 3500000) throw new Error("413 Bild zu gross nach Komprimierung.");
                        setRecipeImgType(compressed.mimeType || "image/jpeg");
                        setRecipeImg(compressed.previewUrl);
                        setRecipeB64(compressed.base64);
                      }catch(err){
                        console.error("Image import error:",err);
                        setRecipeImg(null);
                        setRecipeB64(null);
                        setRecipeImgType("image/jpeg");
                        const m = err && err.message ? err.message : "Bild konnte nicht verarbeitet werden";
                        if(m.includes("413")) setImportErr("Bild weiterhin zu gross. Bitte ein kleineres Foto oder Screenshot verwenden.");
                        else setImportErr("Bildfehler: "+m);
                      }finally{
                        if(e.target) e.target.value = "";
                      }
                    }} style={{display:"none"}} />
                    <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{width:"100%",padding:recipeImg?"12px":"28px 16px",border:"1px dashed "+C.border,background:"#16161C",cursor:"pointer",color:C.muted,fontSize:"13px",display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",fontFamily:SF}}>
                      {recipeImg?<img src={recipeImg} alt="Rezept" style={{maxHeight:"140px",maxWidth:"100%",objectFit:"contain"}} />:<span style={{fontSize:"14px"}}>Foto auswaehlen (Kochbuchseite, Screenshot, Foto)</span>}
                    </button>
                    {recipeImg&&<button onClick={()=>{setRecipeImg(null);setRecipeB64(null);setRecipeImgType("image/jpeg");}} style={{marginTop:"6px",background:"none",border:"none",color:C.err,cursor:"pointer",fontSize:"12px",fontFamily:SF}}>Bild entfernen</button>}
                  </div>
                )
              }
              {importErr&&<div style={{marginTop:"8px",padding:"9px 12px",background:"#FDF3F2",border:"1px solid #FFCDD2",color:C.err,fontSize:"12px"}}>{importErr}</div>}
              <button disabled={!canExtract} onClick={extractRecipe} style={{width:"100%",marginTop:"10px",padding:"12px",background:extracting?C.subtle:C.dark,border:"none",color:"#fff",fontSize:"11px",fontWeight:"700",letterSpacing:"2px",cursor:canExtract?"pointer":"default",fontFamily:SF,opacity:canExtract?1:0.4}}>
                {extracting?"KI ANALYSIERT (fehlende Schritte werden generiert)...":"REZEPT MIT KI EXTRAHIEREN"}
              </button>
            </div>

            {/* Extracted result */}
            {extracted&&(
              <div style={{background:C.white,border:"1px solid "+C.accent,padding:"14px",marginBottom:"12px"}}>
                <div style={{fontSize:"10px",color:C.accent,fontWeight:"700",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"6px"}}>ERKANNTES REZEPT</div>
                <input value={extracted.name} onChange={e=>setExtracted(r=>({...r,name:e.target.value}))} style={{fontSize:"20px",fontFamily:SER,color:C.text,border:"none",background:"transparent",outline:"none",width:"100%",padding:"4px 0 10px",borderBottom:"1px solid "+C.border,marginBottom:"10px"}} />
                <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                  <div style={{flex:1}}>
                    <label style={{fontSize:"10px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>Kategorie</label>
                    <select value={extracted.category||"Hauptgericht"} onChange={e=>setExtracted(r=>({...r,category:e.target.value}))} style={{width:"100%",border:"1px solid "+C.border,padding:"8px 10px",fontSize:"13px",fontFamily:SF,color:C.text,outline:"none",background:C.white}}>
                      {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{flex:1}}>
                    <label style={{fontSize:"10px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>Küche</label>
                    <select value={extracted.cuisine||"International"} onChange={e=>setExtracted(r=>({...r,cuisine:e.target.value}))} style={{width:"100%",border:"1px solid "+C.border,padding:"8px 10px",fontSize:"13px",fontFamily:SF,color:C.text,outline:"none",background:C.white}}>
                      {["Schwäbisch","Italienisch","Asiatisch","Mediterran","Klassisch","International","Vegetarisch","Grillen","Schnell"].map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:"10px"}}>
                  <label style={{fontSize:"10px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>Beschreibung</label>
                  <textarea value={extracted.description||""} onChange={e=>setExtracted(r=>({...r,description:e.target.value}))} placeholder="Kurze Beschreibung / Geschichte zum Rezept..." style={{width:"100%",minHeight:"70px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:C.white}} />
                </div>
                <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"8px"}}>Zutaten</div>
                {(extracted.ingredients||[]).map((ing,i)=>(
                  <div key={i} style={{display:"flex",gap:"8px",padding:"5px 0",borderBottom:i<(extracted.ingredients||[]).length-1?"1px solid "+C.border:"none"}}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0,marginTop:"9px"}} />
                    <input value={ing} onChange={e=>setExtracted(r=>{const a=[].concat(r.ingredients);a[i]=e.target.value;return {...r,ingredients:a};})} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF}} />
                    <button onClick={()=>setExtracted(r=>({...r,ingredients:r.ingredients.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"14px"}}>x</button>
                  </div>
                ))}
                <button onClick={()=>setExtracted(r=>({...r,ingredients:(r.ingredients||[]).concat([""])}))} style={{marginTop:"6px",background:"none",border:"1px solid "+C.border,padding:"4px 10px",cursor:"pointer",color:C.muted,fontSize:"11px",fontFamily:SF}}>+ Zutat</button>
                <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",margin:"14px 0 8px"}}>Schritte</div>
                {(extracted.steps||[]).map((step,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"7px",padding:"5px 0",borderBottom:i<(extracted.steps||[]).length-1?"1px solid "+C.border:"none"}}>
                    <span style={{color:C.accent,fontSize:"11px",fontWeight:"700",minWidth:"16px",paddingTop:"3px"}}>{i+1}.</span>
                    <textarea value={step} onChange={e=>setExtracted(r=>{const a=[].concat(r.steps);a[i]=e.target.value;return {...r,steps:a};})} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF,resize:"none",lineHeight:"1.5",minHeight:"34px"}} />
                    <button onClick={()=>setExtracted(r=>({...r,steps:r.steps.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"14px",flexShrink:0}}>x</button>
                  </div>
                ))}
                <button onClick={()=>setExtracted(r=>({...r,steps:(r.steps||[]).concat([""])}))} style={{marginTop:"6px",background:"none",border:"1px solid "+C.border,padding:"4px 10px",cursor:"pointer",color:C.muted,fontSize:"11px",fontFamily:SF}}>+ Schritt</button>
                <button onClick={saveRecipe} style={{width:"100%",marginTop:"14px",padding:"12px",background:savedMsg?C.ok:C.dark,border:"none",color:"#fff",fontSize:"11px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",transition:"background 0.3s",fontFamily:SF}}>{savedMsg?"GESPEICHERT":"REZEPT SPEICHERN"}</button>
              </div>
            )}

            {/* Kategorie-Filter */}
            <div style={{display:"flex",gap:"6px",marginBottom:"12px",flexWrap:"wrap"}}>
              {[{id:"all",label:"Alle"},...CATS.map(c=>({id:c,label:c}))].map(f=>(
                <button key={f.id} onClick={()=>setFilterMeal(f.id)} style={{padding:"6px 12px",border:"1px solid "+(filterMeal===f.id?C.accent:C.border),background:filterMeal===f.id?C.abg:C.white,color:filterMeal===f.id?C.accent:C.muted,fontSize:"11px",fontWeight:filterMeal===f.id?"700":"400",cursor:"pointer",fontFamily:SF}}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Recipe list grouped by cuisine */}
            {(()=>{
              const filtered = Object.entries(recipes).filter(([k,v])=>filterMeal==="all"||recCat(v)===filterMeal);
              const cuisineMap={};
              filtered.forEach(([k,v])=>{
                const c=v.cuisine||"Weitere";
                if(!cuisineMap[c])cuisineMap[c]=[];
                cuisineMap[c].push(k);
              });
              return Object.entries(cuisineMap).map(([cuisine,keys])=>(
                <div key={cuisine} style={{marginBottom:"16px"}}>
                  <div style={{fontSize:"9px",fontWeight:"700",color:C.accent,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px",paddingBottom:"6px",borderBottom:"1px solid "+C.border}}>{cuisine}</div>
                  {keys.map(name=>{
                    const rec=recipes[name];
                    const ings=(rec&&rec.ingredients)||[];
                    const steps=(rec&&rec.steps)||[];
                    return(
                      <button key={name} onClick={()=>{setDetailRecipe(name);setCookStep(0);setCookMode(false);setImgLoaded(false);setEditMode(false);setEditData(null);}} style={{width:"100%",background:C.white,border:"1px solid "+C.border,padding:"11px 14px",marginBottom:"5px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:"10px",fontFamily:SF}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:"14px",fontFamily:SER,color:C.text,marginBottom:"2px"}}>{dn(name)}</div>
                          <div style={{fontSize:"11px",color:C.muted}}>{recCat(rec)} - {ings.length} Zutaten - {steps.length} Schritte</div>
                        </div>
                        <span style={{color:C.subtle,fontSize:"16px"}}>{">"}</span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}

        {/* COOKBOOK VIEW */}
        {view==="cookbook"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            <button onClick={downloadPDF} style={{width:"100%",padding:"15px",background:C.dark,border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",marginBottom:"8px",cursor:"pointer",fontFamily:SF}}>
              KOCHBUCH ALS PDF DRUCKEN / SPEICHERN
            </button>
            <div style={{fontSize:"11px",color:C.muted,textAlign:"center",marginBottom:"24px",lineHeight:"1.5"}}>Ein neues Fenster öffnet sich. Dort "Als PDF speichern" im Druckdialog wählen.</div>

            {/* Preview grouped by category */}
            {(()=>{
              const sections=[];
              CATS.forEach(cat=>{
                const items=Object.entries(recipes).filter(([k,v])=>recCat(v)===cat);
                if(items.length)sections.push({title:cat,items});
              });
              return sections.map(sec=>(
                <div key={sec.title} style={{marginBottom:"16px"}}>
                  <div style={{fontSize:"9px",fontWeight:"700",color:C.accent,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px",paddingBottom:"6px",borderBottom:"1px solid "+C.border}}>{sec.title}</div>
                  {sec.items.map(([name,rec])=>{
                    const ings=(rec&&rec.ingredients)||[];
                    const steps=(rec&&rec.steps)||[];
                    return(
                      <button key={name} onClick={()=>{setDetailRecipe(name);setCookStep(0);setCookMode(false);setImgLoaded(false);setEditMode(false);setEditData(null);setView("recipes");}} style={{width:"100%",background:C.white,border:"1px solid "+C.border,marginBottom:"5px",overflow:"hidden",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"stretch",fontFamily:SF}}>
                        <div style={{width:"3px",background:C.accent,flexShrink:0}} />
                        <div style={{padding:"10px 13px",flex:1}}>
                          <div style={{fontSize:"13px",fontFamily:SER,color:C.text,marginBottom:"2px"}}>{dn(name)}</div>
                          <div style={{fontSize:"11px",color:C.muted}}>{ings.length} Zutaten - {steps.length} Schritte</div>
                        </div>
                        <div style={{padding:"10px",display:"flex",alignItems:"center"}}><span style={{color:C.subtle,fontSize:"15px"}}>{">"}</span></div>
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    );
  }

  return content;
}
