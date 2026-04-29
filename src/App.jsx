import { useState, useRef, useEffect, useCallback } from "react";

// CONSTANTS
const DAYS   = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const DAYFUL = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const MEALS  = ["Fr","Mi","Ab"];
const MEAL_LABELS = { "Fr":"Fruehstueck", "Mi":"Mittagessen", "Ab":"Abendessen" };
const MEAL_DISPLAY = { "Fr":"Frühstück", "Mi":"Mittagessen", "Ab":"Abendessen" };

const C = {
  bg:      "#F7F6F3",
  white:   "#FFFFFF",
  border:  "#E8E6E1",
  text:    "#1A1917",
  muted:   "#8A8780",
  subtle:  "#C4C2BC",
  accent:  "#C17D3C",
  abg:     "#FBF3EA",
  dark:    "#1A1917",
  ok:      "#3A7D52",
  err:     "#C0392B",
};

const DEFAULT_RECIPES = {
  "Haferflocken mit Beeren":  { i:["Haferflocken 100g","Beeren 150g","Milch 200ml","Honig 1 EL"], s:["Haferflocken mit Milch aufkochen.","3-4 Min. koecheln lassen.","Mit Beeren und Honig servieren."] },
  "Avocado Toast":            { i:["Avocado 1 St.","Vollkornbrot 2 Scheiben","Zitrone 0.5 St.","Salz und Pfeffer"], s:["Brot toasten.","Avocado zerdruecken und wuerzen.","Auf Toast verteilen."] },
  "Ruehreier":                { i:["Eier 3 St.","Butter 10g","Salz und Pfeffer","Schnittlauch"], s:["Eier verquirlen.","In Butter langsam stocken lassen.","Mit Schnittlauch servieren."] },
  "Joghurt und Granola":      { i:["Joghurt 200g","Granola 50g","Honig 1 EL","Fruechte"], s:["Joghurt in Schuessel geben.","Granola und Fruechte darueber.","Mit Honig betraeufeln."] },
  "Pfannkuchen":              { i:["Mehl 150g","Eier 2 St.","Milch 300ml","Butter","Zucker 1 EL"], s:["Teig anruehren, 15 Min. ruhen.","In Butter ausbacken.","Mit Belag servieren."] },
  "Pasta Bolognese":          { i:["Pasta 200g","Hackfleisch 300g","Tomaten Dose 1 St.","Zwiebel 1 St.","Knoblauch 2 Zehen","Olivenoel"], s:["Zwiebel und Knoblauch anbraten.","Hackfleisch braun braten.","Tomaten zugeben, 20 Min. koecheln.","Pasta al dente kochen und servieren."] },
  "Caesar Salad":             { i:["Roemersalat 1 Kopf","Parmesan 50g","Croutons 50g","Caesar Dressing","Haehnchenbrust 200g"], s:["Haehnchen braten, in Streifen schneiden.","Salat waschen und zupfen.","Mit Dressing mischen.","Mit Haehnchen und Parmesan toppen."] },
  "Gemuesesuppe":             { i:["Karotten 3 St.","Sellerie 2 St.","Lauch 1 St.","Kartoffeln 3 St.","Gemuesebruehe 1L"], s:["Gemuese wuerfeln.","In Bruehe 20 Min. kochen.","Abschmecken und servieren."] },
  "Haehnchen-Wrap":           { i:["Tortilla 2 St.","Haehnchenbrust 200g","Salat","Tomate 1 St.","Joghurt-Dressing"], s:["Haehnchen anbraten und schneiden.","Tortillas waermen.","Belegen, rollen und servieren."] },
  "Linsensuppe":              { i:["Linsen 200g","Karotten 2 St.","Zwiebel 1 St.","Knoblauch","Kreuzküemmel","Gemuesebruehe 1L"], s:["Zwiebeln und Gewuerze anbraten.","Linsen und Karotten zugeben.","25 Min. koecheln, abschmecken."] },
  "Lachs mit Gemuese":        { i:["Lachsfilet 200g","Brokkoli 300g","Karotten 2 St.","Olivenoel","Zitrone"], s:["Gemuese anbraten.","Lachs je 3-4 Min. braten.","Mit Zitrone servieren."] },
  "Veggie-Curry":             { i:["Kichererbsen Dose 1 St.","Kokosmilch Dose 1 St.","Tomaten Dose 1 St.","Curry-Paste 2 EL","Ingwer","Reis 200g"], s:["Reis kochen.","Curry-Paste anroesten.","Kokosmilch, Tomaten, Kichererbsen zugeben.","15 Min. koecheln, ueber Reis servieren."] },
  "Pasta Carbonara":          { i:["Pasta 200g","Speck 100g","Eier 2 St.","Parmesan 60g","Schwarzer Pfeffer"], s:["Pasta kochen, Kochwasser aufheben.","Speck knusprig braten.","Eier und Parmesan verquirlen.","Alles mischen, mit Kochwasser cremig ruehren."] },
  "Risotto":                  { i:["Risotto-Reis 200g","Gemuesebruehe 700ml","Parmesan 50g","Zwiebel 1 St.","Weisswein 100ml","Butter"], s:["Zwiebel anschwitzen, Reis roesten.","Mit Weisswein abloeschen.","Bruehe schöpfkellenweise zugeben (18 Min.).","Mit Parmesan und Butter vollenden."] },
};

const DISPLAY = {
  "Ruehreier":"Rühreier","Joghurt und Granola":"Joghurt & Granola",
  "Gemuesesuppe":"Gemüsesuppe","Haehnchen-Wrap":"Hähnchen-Wrap","Lachs mit Gemuese":"Lachs mit Gemüse",
};
const dn = (k) => DISPLAY[k] || k;

const BASE_SUGG = {
  "Fr":["Haferflocken mit Beeren","Avocado Toast","Ruehreier","Joghurt und Granola","Pfannkuchen"],
  "Mi":["Caesar Salad","Pasta Bolognese","Gemuesesuppe","Haehnchen-Wrap","Linsensuppe"],
  "Ab":["Lachs mit Gemuese","Veggie-Curry","Pasta Carbonara","Risotto"],
};

const CATS = [
  { label:"Fruehstueck und Brunch", keys:["Haferflocken mit Beeren","Avocado Toast","Ruehreier","Joghurt und Granola","Pfannkuchen"] },
  { label:"Suppen und Salate",      keys:["Gemuesesuppe","Linsensuppe","Caesar Salad"] },
  { label:"Pasta und Risotto",      keys:["Pasta Bolognese","Pasta Carbonara","Risotto"] },
  { label:"Hauptgerichte",          keys:["Lachs mit Gemuese","Haehnchen-Wrap","Veggie-Curry"] },
];

// FIREBASE
const fbGet   = async (b,p) => { try { const r=await fetch(b+"/"+p+".json"); return r.ok?await r.json():null; } catch(e){return null;} };
const fbPut   = async (b,p,d) => { try { await fetch(b+"/"+p+".json",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}); } catch(e){} };
const fbPatch = async (b,p,d) => { try { await fetch(b+"/"+p+".json",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}); } catch(e){} };

// IMAGE
const foodImg = (name) => {
  var prompt = dn(name) + " food photography professional natural light top view minimal";
  return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=800&height=420&nologo=true&seed=42";
};

// INGREDIENT AGGREGATOR
var parseIng = function(t) {
  var m = t.match(/^(.*?)\s*([\d]+(?:[.,][\d]+)?)\s*(.*)$/);
  if (!m) return {name:t.trim(),amount:null,unit:""};
  return {name:m[1].trim()||t.trim(),amount:parseFloat(m[2].replace(",",".")),unit:m[3].trim()};
};
var fmtIng = function(name,amount,unit) {
  if (amount===null) return name;
  var d = Number.isInteger(amount)?String(amount):parseFloat(amount.toFixed(1)).toString();
  return unit?name+" "+d+" "+unit:name+" "+d;
};
var aggregateIngs = function(raw) {
  var map = new Map(), order = [];
  raw.forEach(function(t) {
    var p = parseIng(t);
    var k = p.name.toLowerCase()+"|||"+p.unit.toLowerCase();
    if (map.has(k)) { var e=map.get(k); if(p.amount!==null&&e.amount!==null)e.amount+=p.amount; }
    else { map.set(k,{name:p.name,amount:p.amount,unit:p.unit}); order.push(k); }
  });
  return order.map(function(k){ var e=map.get(k); return fmtIng(e.name,e.amount,e.unit); });
};

// COOKBOOK
var makeCookbook = function(recipes) {
  var used = new Set();
  var cats = CATS.map(function(c){ return {label:c.label,items:c.keys.filter(function(k){return !!recipes[k];})}; }).filter(function(c){return c.items.length>0;});
  cats.forEach(function(c){c.items.forEach(function(k){used.add(k);});});
  var custom = Object.keys(recipes).filter(function(k){return !used.has(k);});
  if (custom.length) cats.push({label:"Eigene Rezepte",items:custom});
  var rb = function(k) {
    var r=recipes[k],name=dn(k);
    var ings=(r.i||r.ingredients||[]).map(function(x){return "<li>"+x+"</li>";}).join("");
    var steps=(r.s||r.steps||[]).map(function(x,i){return '<div class="step"><div class="num">'+(i+1)+"</div><p>"+x+"</p></div>";}).join("");
    return '<div class="recipe"><h2>'+name+'</h2><img src="'+foodImg(k)+'" alt="'+name+'" onerror="this.style.display=\'none\'" /><div class="tag">Zutaten</div><ul>'+ings+'</ul><div class="tag">Zubereitung</div>'+steps+'</div>';
  };
  var css = "body{font-family:Georgia,serif;color:#1A1917;max-width:800px;margin:0 auto;padding:60px 40px}.cover{text-align:center;padding:80px 0;border-bottom:1px solid #E8E6E1;margin-bottom:60px}.cover h1{font-size:48px;font-weight:400;margin-bottom:12px}.chapter-title{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C17D3C;margin-bottom:32px}.recipe{margin-bottom:60px;padding-bottom:60px;border-bottom:1px solid #E8E6E1}.recipe h2{font-size:28px;font-weight:400;margin-bottom:16px}.recipe img{width:100%;height:260px;object-fit:cover;border-radius:4px;margin-bottom:24px}.tag{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C17D3C;margin:24px 0 12px}ul{list-style:none}ul li{padding:8px 0;border-bottom:1px solid #f1f1f1;font-size:14px}.step{display:flex;gap:16px;margin-bottom:16px}.num{width:28px;height:28px;border-radius:50%;border:1px solid #1A1917;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}.step p{font-size:14px;line-height:1.7;padding-top:4px}";
  var toc = cats.map(function(c){ return '<p style="font-weight:700">'+c.label+'</p>'+c.items.map(function(k){return '<p style="color:#8A8780">'+dn(k)+'</p>';}).join(""); }).join("");
  var chapters = cats.map(function(c){ return '<div><h2 class="chapter-title">'+c.label+'</h2>'+c.items.map(rb).join("")+'</div>'; }).join("");
  return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Kochbuch</title><style>'+css+'</style></head><body><div class="cover"><h1>Mein Kochbuch</h1><p style="color:#8A8780">'+new Date().toLocaleDateString("de-DE")+' - '+Object.keys(recipes).length+' Rezepte</p></div><div style="margin-bottom:60px;padding:32px;background:#F7F6F3;border:1px solid #E8E6E1"><h2 class="chapter-title">Inhalt</h2>'+toc+'</div>'+chapters+'</body></html>';
};

// HELPERS
var emptyPlan = function() {
  var p = {};
  DAYS.forEach(function(d) {
    p[d] = {meals:{},cook:""};
    MEALS.forEach(function(m){ p[d].meals[m]=""; });
  });
  return p;
};
var randCode = function() { return Math.random().toString(36).slice(2,8).toUpperCase(); };
var initials = function(name) { if(!name) return "?"; return name.split(" ").map(function(w){return w[0]||"";}).join("").toUpperCase().slice(0,2); };

var callClaude = async function(messages, system) {
  var r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:system,messages:messages})});
  var d = await r.json();
  var b = d.content && d.content.find(function(x){return x.type==="text";});
  return b?b.text:"";
};

// STYLE CONSTANTS  
var S = {
  card: {background:C.white,border:"1px solid "+C.border,borderRadius:"2px"},
  input: {border:"1px solid "+C.border,background:C.bg,fontSize:"13px",outline:"none",fontFamily:"Helvetica Neue, Arial, sans-serif"},
  label: {fontSize:"10px",fontWeight:"700",letterSpacing:"1.5px",textTransform:"uppercase",display:"block",marginBottom:"6px"},
};

// APP
export default function App() {
  var [screen, setScreen]         = useState("loading");
  var [fbUrl, setFbUrl]           = useState("");
  var [fbInput, setFbInput]       = useState("");
  var [fbError, setFbError]       = useState("");
  var [myCode]                    = useState(randCode);
  var [joinInput, setJoinInput]   = useState("");
  var [nameInput, setNameInput]   = useState("");
  var [activeCode, setActiveCode] = useState("");
  var [userName, setUserName]     = useState("");
  var [participants, setParticipants] = useState([]);
  var [lastSync, setLastSync]     = useState(null);
  var [syncOk, setSyncOk]         = useState(true);
  var [plan, setPlan]             = useState(emptyPlan);
  var [recipes, setRecipes]       = useState(DEFAULT_RECIPES);
  var [shopping, setShopping]     = useState([]);
  var [customItem, setCustomItem] = useState("");
  var [view, setView]             = useState("plan");
  var [activeCell, setActiveCell] = useState(null);
  var [cellInput, setCellInput]   = useState("");
  var [cookPicker, setCookPicker] = useState(null);
  var [detailRecipe, setDetailRecipe] = useState(null);
  var [cookStep, setCookStep]     = useState(0);
  var [cookMode, setCookMode]     = useState(false);
  var [imgLoaded, setImgLoaded]   = useState(false);
  var [importMode, setImportMode] = useState("text");
  var [recipeText, setRecipeText] = useState("");
  var [recipeImg, setRecipeImg]   = useState(null);
  var [recipeB64, setRecipeB64]   = useState(null);
  var [extracting, setExtracting] = useState(false);
  var [extracted, setExtracted]   = useState(null);
  var [importErr, setImportErr]   = useState("");
  var [savedMsg, setSavedMsg]     = useState(false);
  var [dlMsg, setDlMsg]           = useState(false);
  var [codeCopied, setCodeCopied] = useState(false);

  var fileRef      = useRef(null);
  var syncTimer    = useRef(null);
  var pushTimer    = useRef(null);
  var localChecked = useRef({});
  var cellRef      = useRef(null);
  var cookRef      = useRef(null);

  useEffect(function() {
    (async function() {
      try {
        var s = await window.storage.get("fb-url");
        if (s && s.value) { setFbUrl(s.value); setFbInput(s.value); setScreen("join"); }
        else setScreen("setup");
      } catch(e) { setScreen("setup"); }
    })();
  }, []);

  var saveFirebaseUrl = async function() {
    var url = fbInput.trim().replace(/\/+$/,"");
    if (!url.startsWith("https://")) { setFbError("URL muss mit https:// beginnen"); return; }
    try { await window.storage.set("fb-url",url); } catch(e) {}
    setFbUrl(url); setScreen("join"); setFbError("");
  };

  var pushSync = useCallback(async function(code,p,s,r,parts) {
    if (!fbUrl || fbUrl==="demo" || !code) return;
    await Promise.all([
      fbPut(fbUrl,"plans/"+code,{plan:p,shopping:s,participants:parts||[],updatedAt:Date.now()}),
      fbPatch(fbUrl,"globalRecipes",r),
    ]);
    setLastSync(Date.now()); setSyncOk(true);
  }, [fbUrl]);

  var pullSync = useCallback(async function(code) {
    if (!fbUrl || fbUrl==="demo" || !code) return;
    var results = await Promise.all([fbGet(fbUrl,"plans/"+code), fbGet(fbUrl,"globalRecipes")]);
    var pd = results[0], gr = results[1];
    if (pd) {
      var incoming = pd.plan || emptyPlan();
      DAYS.forEach(function(d) {
        if (!incoming[d]) incoming[d]={meals:{},cook:""};
        if (!incoming[d].meals) incoming[d]={meals:incoming[d],cook:""};
      });
      setPlan(incoming);
      setShopping(function(prev) {
        var remote = pd.shopping || [];
        return remote.map(function(item) {
          return {text:item.text, checked:localChecked.current.hasOwnProperty(item.text)?localChecked.current[item.text]:item.checked};
        });
      });
      if (pd.participants) setParticipants(pd.participants);
      setLastSync(pd.updatedAt||Date.now()); setSyncOk(true);
    } else { setSyncOk(false); }
    if (gr) setRecipes(Object.assign({},DEFAULT_RECIPES,gr));
  }, [fbUrl]);

  var startPolling = useCallback(function(code) {
    if (syncTimer.current) clearInterval(syncTimer.current);
    syncTimer.current = setInterval(function(){pullSync(code);}, 10000);
  }, [pullSync]);

  useEffect(function(){return function(){clearInterval(syncTimer.current);clearTimeout(pushTimer.current);};},[]);

  var schedulePush = useCallback(function(p,s,r,parts) {
    if (!activeCode) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(function() {
      pushSync(activeCode,p,s,r,parts||participants).then(function(){localChecked.current={};});
    }, 700);
  }, [activeCode, pushSync, participants]);

  var handleJoin = async function(code) {
    var c = code.toUpperCase().trim();
    if (!c || !nameInput.trim()) return;
    var initParts = [nameInput.trim()];
    if (fbUrl && fbUrl!=="demo") {
      var results = await Promise.all([fbGet(fbUrl,"plans/"+c), fbGet(fbUrl,"globalRecipes")]);
      var ex = results[0], gr = results[1];
      if (ex) {
        var incoming = ex.plan||emptyPlan();
        DAYS.forEach(function(d){ if(!incoming[d])incoming[d]={meals:{},cook:""}; if(!incoming[d].meals)incoming[d]={meals:incoming[d]||{},cook:""}; });
        setPlan(incoming);
        setShopping(ex.shopping||[]);
        var ep = ex.participants||[];
        initParts = ep.includes(nameInput.trim())?ep:[...ep,nameInput.trim()];
        setParticipants(initParts);
      } else {
        setParticipants(initParts);
        await fbPut(fbUrl,"plans/"+c,{plan:emptyPlan(),shopping:[],participants:initParts,updatedAt:Date.now()});
      }
      if (gr) setRecipes(Object.assign({},DEFAULT_RECIPES,gr));
      startPolling(c);
    } else { setParticipants(initParts); }
    setActiveCode(c); setUserName(nameInput.trim()); setScreen("app");
  };

  var setMeal = function(day,meal,val) {
    setPlan(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next[day]) next[day]={meals:{},cook:""};
      if (!next[day].meals) next[day].meals={};
      next[day].meals[meal]=val;
      schedulePush(next,shopping,recipes,participants);
      return next;
    });
  };

  var setCookForDay = function(day,person) {
    setPlan(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next[day]) next[day]={meals:{},cook:""};
      next[day].cook = next[day].cook===person?"":person;
      schedulePush(next,shopping,recipes,participants);
      return next;
    });
    setCookPicker(null);
  };

  var generateShopping = function() {
    var rawIngs=[], dishes=[];
    DAYS.forEach(function(day) {
      MEALS.forEach(function(meal) {
        var dish = plan[day]&&plan[day].meals&&plan[day].meals[meal];
        if (!dish) return;
        var rec = recipes[dish];
        var ings = rec&&(rec.i||rec.ingredients)||[];
        if (ings.length) ings.forEach(function(x){rawIngs.push(x);});
        else dishes.push(dn(dish)+" (Zutaten pruefen)");
      });
    });
    var agg = aggregateIngs(rawIngs);
    var uniq = dishes.filter(function(v,i,a){return a.indexOf(v)===i;});
    var next = agg.map(function(t){return {text:t,checked:false};}).concat(uniq.map(function(t){return {text:t,checked:false};}));
    localChecked.current={};
    setShopping(next); schedulePush(plan,next,recipes,participants); setView("shopping");
  };

  var toggleCheck = function(i) {
    setShopping(function(prev) {
      var next = prev.map(function(x,idx){return idx===i?{text:x.text,checked:!x.checked}:x;});
      localChecked.current[next[i].text]=next[i].checked;
      schedulePush(plan,next,recipes,participants);
      return next;
    });
  };

  var removeItem = function(i) {
    setShopping(function(prev){var n=prev.filter(function(_,j){return j!==i;});schedulePush(plan,n,recipes,participants);return n;});
  };

  var addCustom = function() {
    if (!customItem.trim()) return;
    var txt = customItem.trim();
    setShopping(function(prev){var n=[...prev,{text:txt,checked:false}];schedulePush(plan,n,recipes,participants);return n;});
    setCustomItem("");
  };

  var getSugg = function(meal,q) {
    var base = BASE_SUGG[meal]||[];
    var custom = Object.keys(recipes).filter(function(r){return base.indexOf(r)===-1;});
    var all = base.concat(custom);
    return q?all.filter(function(s){return s.toLowerCase().indexOf(q.toLowerCase())!==-1;}):all;
  };

  useEffect(function() {
    var h = function(e) {
      if (cellRef.current&&!cellRef.current.contains(e.target)) setActiveCell(null);
      if (cookRef.current&&!cookRef.current.contains(e.target)) setCookPicker(null);
    };
    document.addEventListener("mousedown",h);
    return function(){document.removeEventListener("mousedown",h);};
  }, []);

  var extractRecipe = async function() {
    setExtracting(true); setImportErr(""); setExtracted(null);
    try {
      var system = "Du bist ein Kochassistent. Extrahiere Rezeptname, Zutaten, Schritte. Antworte NUR mit JSON: {\"name\":\"Name\",\"ingredients\":[\"Zutat\"],\"steps\":[\"Schritt\"]}";
      var messages;
      if (importMode==="photo"&&recipeB64) {
        messages = [{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:recipeB64}},{type:"text",text:"Extrahiere Rezeptname, Zutaten und Schritt-fuer-Schritt-Anleitung."}]}];
      } else {
        messages = [{role:"user",content:"Extrahiere:\n\n"+recipeText}];
      }
      var raw = await callClaude(messages,system);
      setExtracted(JSON.parse(raw.replace(/```json/g,"").replace(/```/g,"").trim()));
    } catch(e) { setImportErr("Konnte das Rezept nicht lesen."); }
    setExtracting(false);
  };

  var saveRecipe = async function() {
    if (!extracted||!extracted.name) return;
    var rec = {ingredients:extracted.ingredients||[],steps:extracted.steps||[]};
    var key = extracted.name;
    setRecipes(function(prev){var n=Object.assign({},prev);n[key]=rec;schedulePush(plan,shopping,n,participants);return n;});
    if (fbUrl&&fbUrl!=="demo") { var patch={}; patch[key]=rec; await fbPatch(fbUrl,"globalRecipes",patch); }
    setSavedMsg(true);
    setTimeout(function(){setSavedMsg(false);setExtracted(null);setRecipeText("");setRecipeImg(null);setRecipeB64(null);},2000);
  };

  var downloadCookbook = function() {
    var html = makeCookbook(recipes);
    var blob = new Blob([html],{type:"text/html"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href=url; a.download="Kochbuch.html"; a.click();
    URL.revokeObjectURL(url);
    setDlMsg(true); setTimeout(function(){setDlMsg(false);},2500);
  };

  var getDish = function(day,meal){return plan[day]&&plan[day].meals&&plan[day].meals[meal]||"";};
  var getCook = function(day){return plan[day]&&plan[day].cook||"";};
  var unchecked = shopping.filter(function(x){return !x.checked;}).length;
  var currentRecipe = detailRecipe?recipes[detailRecipe]:null;
  var recipeIngs = currentRecipe?(currentRecipe.i||currentRecipe.ingredients||[]):[];
  var recipeSteps = currentRecipe?(currentRecipe.s||currentRecipe.steps||[]):[];

  // Render logic using variables
  var content = null;

  if (screen==="loading") {
    content = (
      <div style={{minHeight:"100vh",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"Helvetica Neue, Arial, sans-serif",fontSize:"13px",letterSpacing:"1px"}}>
        Laden...
      </div>
    );
  }

  else if (screen==="setup") {
    content = (
      <div style={{minHeight:"100vh",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
        <div style={{width:"100%",maxWidth:"440px"}}>
          <div style={{marginBottom:"40px"}}>
            <div style={{color:C.accent,fontSize:"10px",fontWeight:"700",letterSpacing:"3px",textTransform:"uppercase",marginBottom:"12px"}}>Ersteinrichtung</div>
            <div style={{color:"#fff",fontSize:"32px",fontFamily:"Georgia, serif",marginBottom:"8px"}}>Firebase verbinden</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:"14px",lineHeight:"1.6"}}>Fuer die Synchronisierung zwischen Geraeten brauchen wir eine kostenlose Firebase Datenbank.</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:"24px",marginBottom:"20px"}}>
            <div style={{color:C.accent,fontSize:"10px",fontWeight:"700",letterSpacing:"2px",marginBottom:"20px"}}>3 MINUTEN EINRICHTUNG</div>
            <div style={{display:"flex",gap:"12px",marginBottom:"12px"}}><div style={{width:"22px",height:"22px",border:"1px solid "+C.accent,display:"flex",alignItems:"center",justifyContent:"center",color:C.accent,fontSize:"11px",fontWeight:"700",flexShrink:0}}>1</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"13px",paddingTop:"3px"}}>firebase.google.com oeffnen und anmelden</div></div>
            <div style={{display:"flex",gap:"12px",marginBottom:"12px"}}><div style={{width:"22px",height:"22px",border:"1px solid "+C.accent,display:"flex",alignItems:"center",justifyContent:"center",color:C.accent,fontSize:"11px",fontWeight:"700",flexShrink:0}}>2</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"13px",paddingTop:"3px"}}>Projekt erstellen, Namen eingeben, weiter</div></div>
            <div style={{display:"flex",gap:"12px",marginBottom:"12px"}}><div style={{width:"22px",height:"22px",border:"1px solid "+C.accent,display:"flex",alignItems:"center",justifyContent:"center",color:C.accent,fontSize:"11px",fontWeight:"700",flexShrink:0}}>3</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"13px",paddingTop:"3px"}}>Menue: Realtime Database - Datenbank erstellen</div></div>
            <div style={{display:"flex",gap:"12px",marginBottom:"12px"}}><div style={{width:"22px",height:"22px",border:"1px solid "+C.accent,display:"flex",alignItems:"center",justifyContent:"center",color:C.accent,fontSize:"11px",fontWeight:"700",flexShrink:0}}>4</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"13px",paddingTop:"3px"}}>Testmodus auswaehlen und aktivieren</div></div>
            <div style={{display:"flex",gap:"12px"}}><div style={{width:"22px",height:"22px",border:"1px solid "+C.accent,display:"flex",alignItems:"center",justifyContent:"center",color:C.accent,fontSize:"11px",fontWeight:"700",flexShrink:0}}>5</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"13px",paddingTop:"3px"}}>Die angezeigte URL hier einfuegen</div></div>
          </div>
          <input value={fbInput} onChange={function(e){setFbInput(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")saveFirebaseUrl();}} placeholder="https://mein-projekt-default-rtdb.firebaseio.com" style={{width:"100%",padding:"14px 16px",background:"rgba(255,255,255,0.06)",border:"1px solid "+(fbError?"#C0392B":"rgba(255,255,255,0.12)"),color:"#fff",fontSize:"13px",outline:"none",boxSizing:"border-box",marginBottom:"8px",fontFamily:"Helvetica Neue, Arial, sans-serif"}} />
          {fbError&&<div style={{color:"#E57373",fontSize:"12px",marginBottom:"10px"}}>{fbError}</div>}
          <button onClick={saveFirebaseUrl} style={{width:"100%",padding:"15px",background:fbInput.trim()?C.accent:"rgba(255,255,255,0.05)",border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",marginBottom:"12px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>VERBINDEN</button>
          <div style={{textAlign:"center"}}>
            <button onClick={function(){setFbUrl("demo");setScreen("join");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.25)",fontSize:"12px",cursor:"pointer",textDecoration:"underline"}}>Ohne Sync fortfahren</button>
          </div>
        </div>
      </div>
    );
  }

  else if (screen==="join") {
    content = (
      <div style={{minHeight:"100vh",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
        <div style={{width:"100%",maxWidth:"380px"}}>
          <div style={{textAlign:"center",marginBottom:"48px"}}>
            <div style={{color:C.accent,fontSize:"10px",fontWeight:"700",letterSpacing:"3px",textTransform:"uppercase",marginBottom:"16px"}}>Wochenplan</div>
            <div style={{color:"#fff",fontSize:"40px",fontFamily:"Georgia, serif",marginBottom:"8px",lineHeight:"1.1"}}>Gemeinsam kochen.</div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:"13px"}}>Planen - Einkaufen - Geniessen</div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <label style={{color:"rgba(255,255,255,0.4)",fontSize:"10px",fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Dein Name</label>
            <input value={nameInput} onChange={function(e){setNameInput(e.target.value);}} placeholder="z.B. Anna" style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#fff",fontSize:"15px",outline:"none",boxSizing:"border-box",fontFamily:"Helvetica Neue, Arial, sans-serif"}} />
          </div>
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:"16px",marginBottom:"10px"}}>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"10px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"4px"}}>NEUEN PLAN ERSTELLEN</div>
            <div style={{color:"rgba(255,255,255,0.2)",fontSize:"11px",marginBottom:"12px"}}>Teile den Code mit deiner Familie.</div>
            <div style={{background:"rgba(193,125,60,0.1)",border:"1px solid rgba(193,125,60,0.3)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
              <span style={{color:"rgba(255,255,255,0.3)",fontSize:"11px",letterSpacing:"1px"}}>CODE</span>
              <span style={{color:C.accent,fontSize:"20px",fontWeight:"700",letterSpacing:"6px"}}>{myCode}</span>
            </div>
            <button onClick={function(){handleJoin(myCode);}} style={{width:"100%",padding:"12px",background:nameInput.trim()?C.accent:"#2d2d2d",border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:nameInput.trim()?"pointer":"default",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>PLAN STARTEN</button>
          </div>
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",padding:"16px"}}>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"10px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"4px"}}>BEITRETEN</div>
            <div style={{color:"rgba(255,255,255,0.2)",fontSize:"11px",marginBottom:"10px"}}>Code eingeben, den du erhalten hast.</div>
            <input value={joinInput} onChange={function(e){setJoinInput(e.target.value.toUpperCase());}} placeholder="CODE" maxLength={6} style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",fontSize:"20px",fontWeight:"700",letterSpacing:"6px",outline:"none",boxSizing:"border-box",textAlign:"center",marginBottom:"10px",fontFamily:"Helvetica Neue, Arial, sans-serif"}} />
            <button onClick={function(){handleJoin(joinInput);}} style={{width:"100%",padding:"12px",background:(joinInput.length>=4&&nameInput.trim())?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.02)",border:"none",color:(joinInput.length>=4&&nameInput.trim())?"#fff":"rgba(255,255,255,0.2)",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:(joinInput.length>=4&&nameInput.trim())?"pointer":"default",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>BEITRETEN</button>
          </div>
          <div style={{textAlign:"center",marginTop:"12px"}}>
            <button onClick={function(){setScreen("setup");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.2)",fontSize:"11px",cursor:"pointer"}}>Firebase-Einstellungen</button>
          </div>
        </div>
      </div>
    );
  }

  else if (cookMode&&detailRecipe&&currentRecipe) {
    content = (
      <div style={{minHeight:"100vh",background:C.dark,fontFamily:"Helvetica Neue, Arial, sans-serif",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"20px 24px",display:"flex",alignItems:"center",gap:"16px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          <button onClick={function(){setCookMode(false);}} style={{background:"rgba(255,255,255,0.07)",border:"none",color:"rgba(255,255,255,0.6)",padding:"8px 14px",fontSize:"12px",letterSpacing:"0.5px",cursor:"pointer"}}>ZURUECK</button>
          <div style={{flex:1,fontFamily:"Georgia, serif",color:"#fff",fontSize:"18px"}}>{dn(detailRecipe)}</div>
          <div style={{color:C.accent,fontSize:"12px",fontWeight:"700",letterSpacing:"1px"}}>{cookStep+1} / {recipeSteps.length}</div>
        </div>
        <div style={{display:"flex",gap:"4px",padding:"0 24px",marginTop:"20px"}}>
          {recipeSteps.map(function(_,i) {
            return <div key={i} onClick={function(){setCookStep(i);}} style={{height:"2px",flex:1,background:i<=cookStep?C.accent:"rgba(255,255,255,0.12)",cursor:"pointer",transition:"background 0.3s"}} />;
          })}
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 32px"}}>
          <div style={{fontSize:"72px",fontFamily:"Georgia, serif",color:C.accent,marginBottom:"32px",lineHeight:1}}>{cookStep+1}</div>
          <div style={{fontSize:"22px",color:"rgba(255,255,255,0.9)",fontFamily:"Georgia, serif",textAlign:"center",lineHeight:"1.7",maxWidth:"360px"}}>{recipeSteps[cookStep]}</div>
        </div>
        <div style={{padding:"24px",display:"flex",gap:"12px"}}>
          <button onClick={function(){setCookStep(function(s){return Math.max(0,s-1);});}} style={{flex:1,padding:"14px",border:"none",background:"rgba(255,255,255,0.07)",color:cookStep===0?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.7)",fontSize:"13px",letterSpacing:"1px",cursor:cookStep===0?"default":"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>ZURUECK</button>
          {cookStep<recipeSteps.length-1
            ? <button onClick={function(){setCookStep(function(s){return s+1;});}} style={{flex:2,padding:"14px",border:"none",background:C.accent,color:"#fff",fontSize:"13px",letterSpacing:"1px",fontWeight:"700",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>WEITER</button>
            : <button onClick={function(){setCookMode(false);setCookStep(0);}} style={{flex:2,padding:"14px",border:"none",background:C.ok,color:"#fff",fontSize:"13px",letterSpacing:"1px",fontWeight:"700",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>FERTIG</button>
          }
        </div>
      </div>
    );
  }

  else if (detailRecipe&&currentRecipe) {
    content = (
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
        <div style={{position:"relative",height:"260px",background:C.dark,overflow:"hidden"}}>
          <img src={foodImg(detailRecipe)} alt={dn(detailRecipe)} onLoad={function(){setImgLoaded(true);}} onError={function(){setImgLoaded(true);}} style={{width:"100%",height:"100%",objectFit:"cover",opacity:imgLoaded?0.7:0,transition:"opacity 0.6s"}} />
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 30%,"+C.dark+")"}} />
          <button onClick={function(){setDetailRecipe(null);setImgLoaded(false);}} style={{position:"absolute",top:16,left:16,background:"rgba(0,0,0,0.4)",border:"none",color:"rgba(255,255,255,0.8)",padding:"8px 14px",fontSize:"11px",letterSpacing:"1px",cursor:"pointer"}}>ZURUECK</button>
          <div style={{position:"absolute",bottom:24,left:24,right:24}}>
            <div style={{color:C.accent,fontSize:"10px",fontWeight:"700",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>Rezept</div>
            <div style={{color:"#fff",fontSize:"28px",fontFamily:"Georgia, serif",lineHeight:"1.2"}}>{dn(detailRecipe)}</div>
          </div>
        </div>
        <div style={{padding:"20px 16px 60px"}}>
          {recipeSteps.length>0&&<button onClick={function(){setCookStep(0);setCookMode(true);}} style={{width:"100%",padding:"15px",background:C.dark,border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",marginBottom:"16px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>KOCHMODUS STARTEN</button>}
          <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
            <div style={{fontSize:"10px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"14px"}}>Zutaten</div>
            {recipeIngs.map(function(ing,i) {
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<recipeIngs.length-1?"1px solid "+C.border:"none"}}>
                  <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0}} />
                  <span style={{fontSize:"14px",color:C.text}}>{ing}</span>
                </div>
              );
            })}
          </div>
          {recipeSteps.length>0&&(
            <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"16px"}}>Zubereitung</div>
              {recipeSteps.map(function(step,i) {
                return (
                  <div key={i} style={{display:"flex",gap:"14px",marginBottom:i<recipeSteps.length-1?"18px":"0"}}>
                    <div style={{width:"26px",height:"26px",borderRadius:"50%",border:"1px solid "+(i===0?C.accent:C.border),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"11px",fontWeight:"700",color:i===0?C.accent:C.muted}}>{i+1}</div>
                    <div style={{paddingTop:"4px",fontSize:"14px",color:C.text,lineHeight:"1.7"}}>{step}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  else if (screen==="app") {
    // Determine what to show in the plan view for each day
    content = (
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Helvetica Neue, Arial, sans-serif"}}>

        {/* HEADER */}
        <div style={{background:C.dark,padding:"13px 16px",display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{flex:1}}>
            <div style={{color:C.accent,fontSize:"9px",fontWeight:"700",letterSpacing:"3px",textTransform:"uppercase",marginBottom:"1px"}}>Wochenplan</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"11px"}}>{userName}</div>
          </div>
          {fbUrl!=="demo"&&(
            <button onClick={function(){navigator.clipboard.writeText(activeCode);setCodeCopied(true);setTimeout(function(){setCodeCopied(false);},2000);}} style={{background:"rgba(193,125,60,0.15)",border:"1px solid rgba(193,125,60,0.25)",padding:"5px 10px",textAlign:"center",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
              <div style={{color:"rgba(255,255,255,0.35)",fontSize:"8px",fontWeight:"700",letterSpacing:"1.5px",marginBottom:"1px"}}>{codeCopied?"KOPIERT":"CODE KOPIEREN"}</div>
              <div style={{color:C.accent,fontSize:"14px",fontWeight:"700",letterSpacing:"3px"}}>{activeCode}</div>
            </button>
          )}
        </div>

        {/* SYNC */}
        {fbUrl!=="demo"&&(
          <div style={{background:syncOk?"#F0F7F3":"#FDF3F2",borderBottom:"1px solid "+(syncOk?"#C8E6C9":"#FFCDD2"),padding:"5px 16px",display:"flex",alignItems:"center",gap:"8px"}}>
            <div style={{width:"6px",height:"6px",borderRadius:"50%",background:syncOk?C.ok:C.err}} />
            <span style={{fontSize:"11px",color:syncOk?"#2E7D52":C.err}}>{syncOk?(lastSync?"Sync "+new Date(lastSync).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):"Verbunden"):"Verbindungsfehler"}</span>
            <span style={{marginLeft:"auto",fontSize:"9px",color:C.subtle}}>alle 10 Sek.</span>
          </div>
        )}

        {/* TABS */}
        <div style={{display:"flex",background:C.white,borderBottom:"1px solid "+C.border,padding:"0 12px"}}>
          {[{id:"plan",label:"Wochenplan"},{id:"shopping",label:"Einkauf"+(unchecked>0?" ("+unchecked+")":"")},{id:"recipes",label:"Rezepte"},{id:"cookbook",label:"Kochbuch"}].map(function(t) {
            return (
              <button key={t.id} onClick={function(){setView(t.id);}} style={{padding:"12px 13px",border:"none",borderBottom:view===t.id?"2px solid "+C.accent:"2px solid transparent",color:view===t.id?C.accent:C.muted,fontWeight:view===t.id?"700":"400",fontSize:"12px",letterSpacing:"0.5px",whiteSpace:"nowrap",background:"none",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* PLAN */}
        {view==="plan"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {DAYS.map(function(day,di) {
              var cookName = getCook(day);
              return (
                <div key={day} style={{marginBottom:"10px",background:C.white,border:"1px solid "+C.border}}>
                  <div style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:"10px",borderBottom:"1px solid "+C.border}}>
                    <div>
                      <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1px",textTransform:"uppercase"}}>{day}</div>
                      <div style={{fontSize:"13px",fontWeight:"600",color:C.text}}>{DAYFUL[di]}</div>
                    </div>
                    <div style={{flex:1}} />
                    <div style={{position:"relative"}} ref={cookPicker===day?cookRef:null}>
                      <button onClick={function(){setCookPicker(cookPicker===day?null:day);}} style={{display:"flex",alignItems:"center",gap:"7px",padding:"5px 10px",background:cookName?C.abg:C.bg,border:"1px solid "+(cookName?C.accent:C.border),cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
                        {cookName?(
                          <span style={{display:"flex",alignItems:"center",gap:"7px"}}>
                            <span style={{width:"20px",height:"20px",borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:"800",color:"#fff",flexShrink:0}}>{initials(cookName)}</span>
                            <span style={{fontSize:"11px",color:C.accent,fontWeight:"600"}}>{cookName}</span>
                          </span>
                        ):(
                          <span style={{fontSize:"11px",color:C.muted}}>Wer kocht?</span>
                        )}
                      </button>
                      {cookPicker===day&&(
                        <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:999,background:C.white,border:"1px solid "+C.border,boxShadow:"0 8px 24px rgba(0,0,0,0.1)",minWidth:"160px"}}>
                          {participants.map(function(p) {
                            return (
                              <button key={p} onMouseDown={function(e){e.preventDefault();setCookForDay(day,p);}} style={{width:"100%",padding:"10px 14px",textAlign:"left",background:cookName===p?C.abg:C.white,color:cookName===p?C.accent:C.text,fontSize:"13px",display:"flex",alignItems:"center",gap:"9px",borderBottom:"1px solid "+C.border,border:"none",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
                                <span style={{width:"22px",height:"22px",borderRadius:"50%",background:cookName===p?C.accent:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:"800",color:cookName===p?"#fff":C.muted,flexShrink:0}}>{initials(p)}</span>
                                {p}
                                {cookName===p&&<span style={{marginLeft:"auto",fontSize:"11px",color:C.accent}}>v</span>}
                              </button>
                            );
                          })}
                          {cookName&&<button onMouseDown={function(e){e.preventDefault();setCookForDay(day,"");}} style={{width:"100%",padding:"8px 14px",textAlign:"center",background:"none",color:C.muted,fontSize:"11px",border:"none",cursor:"pointer"}}>Auswahl entfernen</button>}
                        </div>
                      )}
                    </div>
                  </div>
                  {MEALS.map(function(meal) {
                    var key = day+"-"+meal;
                    var isActive = activeCell===key;
                    var dish = getDish(day,meal);
                    var hasRec = dish&&!!recipes[dish];
                    var sugg = getSugg(meal,cellInput);
                    return (
                      <div key={meal} style={{position:"relative"}} ref={isActive?cellRef:null}>
                        <div style={{display:"flex",alignItems:"center",background:isActive?C.abg:"transparent",transition:"background 0.15s"}}>
                          <div style={{width:"92px",padding:"10px 14px",flexShrink:0}}>
                            <div style={{fontSize:"10px",fontWeight:"700",color:isActive?C.accent:C.subtle,letterSpacing:"0.5px",textTransform:"uppercase"}}>{MEAL_DISPLAY[meal]}</div>
                          </div>
                          <div style={{width:"1px",background:C.border,alignSelf:"stretch"}} />
                          <div style={{flex:1,padding:"0 12px"}}>
                            {isActive
                              ? <input autoFocus value={cellInput} onChange={function(e){setCellInput(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter"){setMeal(day,meal,cellInput);setActiveCell(null);}if(e.key==="Escape")setActiveCell(null);}} placeholder="Gericht eingeben..." style={{width:"100%",border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",padding:"10px 0",fontFamily:"Helvetica Neue, Arial, sans-serif"}} />
                              : <button onClick={function(){setActiveCell(key);setCellInput(dish);}} style={{width:"100%",textAlign:"left",padding:"10px 0",fontSize:"13px",color:dish?C.text:C.subtle,fontStyle:dish?"normal":"italic",background:"none",border:"none",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>{dish?dn(dish):"Hinzufügen..."}</button>
                            }
                          </div>
                          {hasRec&&!isActive&&(
                            <button onClick={function(){setDetailRecipe(dish);setCookStep(0);setCookMode(false);setImgLoaded(false);}} style={{padding:"10px 11px",color:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"0.5px",background:"none",border:"none",borderLeft:"1px solid "+C.border,cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>REZEPT</button>
                          )}
                          {dish&&!isActive&&(
                            <button onClick={function(){setMeal(day,meal,"");}} style={{padding:"10px 11px",color:C.subtle,fontSize:"15px",background:"none",border:"none",borderLeft:hasRec?"none":"1px solid "+C.border,cursor:"pointer",lineHeight:1}}>x</button>
                          )}
                        </div>
                        {meal!=="Ab"&&<div style={{height:"1px",background:C.border,marginLeft:"92px"}} />}
                        {isActive&&(
                          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,background:C.white,border:"1px solid "+C.border,boxShadow:"0 12px 32px rgba(0,0,0,0.10)"}}>
                            <div style={{maxHeight:"210px",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                              {sugg.length>0?sugg.map(function(s,i) {
                                return (
                                  <button key={s} onMouseDown={function(e){e.preventDefault();setMeal(day,meal,s);setActiveCell(null);}} onMouseEnter={function(e){e.currentTarget.style.background=C.abg;}} onMouseLeave={function(e){e.currentTarget.style.background=C.white;}} style={{width:"100%",padding:"10px 14px",border:"none",borderBottom:i<sugg.length-1?"1px solid "+C.border:"none",background:C.white,textAlign:"left",cursor:"pointer",fontSize:"13px",color:C.text,display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
                                    <span>{dn(s)}</span>
                                    {recipes[s]&&<span style={{fontSize:"10px",color:C.accent,fontWeight:"700",letterSpacing:"0.5px"}}>REZEPT</span>}
                                  </button>
                                );
                              }):<div style={{padding:"12px 14px",color:C.muted,fontSize:"13px"}}>Kein Treffer</div>}
                            </div>
                            {cellInput&&(
                              <div style={{padding:"8px 14px",borderTop:"1px solid "+C.border,background:C.bg}}>
                                <button onMouseDown={function(e){e.preventDefault();setMeal(day,meal,cellInput);setActiveCell(null);}} style={{background:"none",border:"none",color:C.accent,fontSize:"12px",fontWeight:"700",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>+ "{cellInput}" uebernehmen</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <button onClick={generateShopping} style={{width:"100%",padding:"14px",background:C.dark,border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",marginTop:"4px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>EINKAUFSLISTE GENERIEREN</button>
          </div>
        )}

        {/* SHOPPING */}
        {view==="shopping"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {shopping.length===0?(
              <div style={{textAlign:"center",padding:"64px 24px",color:C.muted}}>
                <div style={{fontSize:"48px",fontFamily:"Georgia, serif",color:C.subtle,marginBottom:"16px"}}>-</div>
                <div style={{fontSize:"14px",marginBottom:"20px",lineHeight:"1.6"}}>Fuelle den Wochenplan aus und generiere die Einkaufsliste.</div>
                <button onClick={function(){setView("plan");}} style={{padding:"12px 24px",background:C.dark,border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"1.5px",cursor:"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>ZUM WOCHENPLAN</button>
              </div>
            ):(
              <div>
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"13px 15px",marginBottom:"10px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"7px"}}>
                    <span style={{fontSize:"11px",color:C.muted,letterSpacing:"0.5px",textTransform:"uppercase"}}>Erledigt</span>
                    <span style={{fontSize:"11px",fontWeight:"700",color:C.ok}}>{shopping.length-unchecked} / {shopping.length}</span>
                  </div>
                  <div style={{background:C.border,height:"2px"}}>
                    <div style={{height:"100%",width:((shopping.length-unchecked)/shopping.length*100)+"%",background:C.ok,transition:"width 0.4s"}} />
                  </div>
                </div>
                <div style={{background:C.white,border:"1px solid "+C.border,marginBottom:"10px"}}>
                  {shopping.map(function(item,i) {
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"11px 14px",borderBottom:i<shopping.length-1?"1px solid "+C.border:"none",background:item.checked?"#FAFAF8":C.white,transition:"background 0.15s"}}>
                        <button onClick={function(){toggleCheck(i);}} style={{width:"20px",height:"20px",border:"1px solid "+(item.checked?C.ok:C.border),background:item.checked?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
                          {item.checked&&<span style={{color:"#fff",fontSize:"11px",fontWeight:"800"}}>v</span>}
                        </button>
                        <span style={{flex:1,fontSize:"13px",color:item.checked?C.subtle:C.text,textDecoration:item.checked?"line-through":"none",transition:"all 0.15s"}}>{item.text}</span>
                        <button onClick={function(){removeItem(i);}} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"16px",lineHeight:1}}>x</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"9px",display:"flex",gap:"8px"}}>
                  <input value={customItem} onChange={function(e){setCustomItem(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addCustom();}} placeholder="Produkt hinzufügen..." style={{flex:1,border:"1px solid "+C.border,padding:"9px 12px",fontSize:"13px",outline:"none",color:C.text,fontFamily:"Helvetica Neue, Arial, sans-serif",background:C.bg}} />
                  <button onClick={addCustom} style={{background:C.dark,border:"none",color:"#fff",padding:"9px 16px",cursor:"pointer",fontSize:"18px",fontWeight:"700"}}>+</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RECIPES */}
        {view==="recipes"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            <div style={{display:"flex",marginBottom:"14px",border:"1px solid "+C.border,background:C.white}}>
              {[{id:"text",label:"TEXT"},{id:"photo",label:"FOTO"}].map(function(m) {
                return <button key={m.id} onClick={function(){setImportMode(m.id);setExtracted(null);setImportErr("");}} style={{flex:1,padding:"11px",background:importMode===m.id?C.dark:C.white,color:importMode===m.id?"#fff":C.muted,fontWeight:"700",fontSize:"11px",letterSpacing:"2px",cursor:"pointer",border:"none",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>{m.label}</button>;
              })}
            </div>
            <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"12px"}}>{importMode==="text"?"REZEPTTEXT EINFUEGEN":"REZEPTFOTO HOCHLADEN"}</div>
              {importMode==="text"
                ? <textarea value={recipeText} onChange={function(e){setRecipeText(e.target.value);}} placeholder="Fuege hier einen Rezepttext ein..." style={{width:"100%",minHeight:"110px",border:"1px solid "+C.border,padding:"11px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:"Helvetica Neue, Arial, sans-serif",background:C.bg}} />
                : (
                  <div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={function(e){var f=e.target.files[0];if(!f)return;setRecipeImg(URL.createObjectURL(f));var r=new FileReader();r.onload=function(){setRecipeB64(r.result.split(",")[1]);};r.readAsDataURL(f);}} style={{display:"none"}} />
                    <button onClick={function(){if(fileRef.current)fileRef.current.click();}} style={{width:"100%",padding:recipeImg?"12px":"28px 16px",border:"1px dashed "+C.border,background:C.bg,cursor:"pointer",color:C.muted,fontSize:"13px",display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
                      {recipeImg?<img src={recipeImg} alt="Rezept" style={{maxHeight:"140px",maxWidth:"100%",objectFit:"contain"}} />:<span>Foto auswaehlen</span>}
                    </button>
                    {recipeImg&&<button onClick={function(){setRecipeImg(null);setRecipeB64(null);}} style={{marginTop:"7px",background:"none",border:"none",color:C.err,cursor:"pointer",fontSize:"12px"}}>Bild entfernen</button>}
                  </div>
                )
              }
              {importErr&&<div style={{marginTop:"9px",padding:"9px 12px",background:"#FDF3F2",border:"1px solid #FFCDD2",color:C.err,fontSize:"12px"}}>{importErr}</div>}
              <button onClick={extractRecipe} style={{width:"100%",marginTop:"11px",padding:"12px",background:extracting?C.subtle:C.dark,border:"none",color:"#fff",fontSize:"11px",fontWeight:"700",letterSpacing:"2px",cursor:extracting?"default":"pointer",fontFamily:"Helvetica Neue, Arial, sans-serif",opacity:(importMode==="text"?!recipeText.trim():!recipeB64)?0.4:1}}>
                {extracting?"ANALYSIEREN...":"REZEPT EXTRAHIEREN"}
              </button>
            </div>

            {extracted&&(
              <div style={{background:C.white,border:"1px solid "+C.accent,padding:"14px",marginBottom:"12px"}}>
                <div style={{fontSize:"10px",color:C.accent,fontWeight:"700",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"6px"}}>Erkanntes Rezept</div>
                <input value={extracted.name} onChange={function(e){setExtracted(function(r){return Object.assign({},r,{name:e.target.value});});}} style={{fontSize:"20px",fontFamily:"Georgia, serif",color:C.text,border:"none",background:"transparent",outline:"none",width:"100%",padding:"4px 0 10px",borderBottom:"1px solid "+C.border,marginBottom:"12px"}} />
                <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"8px"}}>Zutaten</div>
                {(extracted.ingredients||[]).map(function(ing,i) {
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 0",borderBottom:i<(extracted.ingredients||[]).length-1?"1px solid "+C.border:"none"}}>
                      <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0}} />
                      <input value={ing} onChange={function(e){setExtracted(function(r){var a=[].concat(r.ingredients);a[i]=e.target.value;return Object.assign({},r,{ingredients:a});});}} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:"Helvetica Neue, Arial, sans-serif"}} />
                      <button onClick={function(){setExtracted(function(r){return Object.assign({},r,{ingredients:r.ingredients.filter(function(_,j){return j!==i;})});});}} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"14px"}}>x</button>
                    </div>
                  );
                })}
                <button onClick={function(){setExtracted(function(r){return Object.assign({},r,{ingredients:(r.ingredients||[]).concat([""])});});}} style={{marginTop:"8px",background:"none",border:"1px solid "+C.border,padding:"5px 10px",cursor:"pointer",color:C.muted,fontSize:"11px",letterSpacing:"0.5px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>+ Zutat</button>
                <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",margin:"16px 0 8px"}}>Schritte</div>
                {(extracted.steps||[]).map(function(step,i) {
                  return (
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"8px",padding:"6px 0",borderBottom:i<(extracted.steps||[]).length-1?"1px solid "+C.border:"none"}}>
                      <span style={{color:C.accent,fontSize:"11px",fontWeight:"700",minWidth:"16px",paddingTop:"2px"}}>{i+1}.</span>
                      <textarea value={step} onChange={function(e){setExtracted(function(r){var a=[].concat(r.steps);a[i]=e.target.value;return Object.assign({},r,{steps:a});});}} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:"Helvetica Neue, Arial, sans-serif",resize:"none",lineHeight:"1.5",minHeight:"34px"}} />
                      <button onClick={function(){setExtracted(function(r){return Object.assign({},r,{steps:r.steps.filter(function(_,j){return j!==i;})});});}} style={{background:"none",border:"none",cursor:"pointer",color:C.subtle,fontSize:"14px",flexShrink:0}}>x</button>
                    </div>
                  );
                })}
                <button onClick={function(){setExtracted(function(r){return Object.assign({},r,{steps:(r.steps||[]).concat([""])});});}} style={{marginTop:"8px",background:"none",border:"1px solid "+C.border,padding:"5px 10px",cursor:"pointer",color:C.muted,fontSize:"11px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>+ Schritt</button>
                <button onClick={saveRecipe} style={{width:"100%",marginTop:"14px",padding:"12px",background:savedMsg?C.ok:C.dark,border:"none",color:"#fff",fontSize:"11px",fontWeight:"700",letterSpacing:"2px",cursor:"pointer",transition:"background 0.3s",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>{savedMsg?"GESPEICHERT":"REZEPT SPEICHERN"}</button>
              </div>
            )}

            <div style={{fontSize:"10px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px"}}>Alle Rezepte ({Object.keys(recipes).length})</div>
            {Object.keys(recipes).map(function(name) {
              var rec=recipes[name];
              var rIngs=(rec&&(rec.i||rec.ingredients))||[];
              var rSteps=(rec&&(rec.s||rec.steps))||[];
              return (
                <button key={name} onClick={function(){setDetailRecipe(name);setCookStep(0);setCookMode(false);setImgLoaded(false);}} style={{width:"100%",background:C.white,border:"1px solid "+C.border,padding:"12px 14px",marginBottom:"6px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:"10px",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"14px",fontFamily:"Georgia, serif",color:C.text,marginBottom:"2px"}}>{dn(name)}</div>
                    <div style={{fontSize:"11px",color:C.muted}}>{rIngs.length} Zutaten - {rSteps.length} Schritte</div>
                  </div>
                  <span style={{color:C.subtle,fontSize:"16px"}}>{">"}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* COOKBOOK */}
        {view==="cookbook"&&(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            <button onClick={downloadCookbook} style={{width:"100%",padding:"15px",background:dlMsg?C.ok:C.dark,border:"none",color:"#fff",fontSize:"12px",fontWeight:"700",letterSpacing:"2px",marginBottom:"10px",cursor:"pointer",transition:"background 0.3s",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
              {dlMsg?"HERUNTERGELADEN":"KOCHBUCH HERUNTERLADEN (.HTML)"}
            </button>
            <div style={{fontSize:"11px",color:C.muted,textAlign:"center",marginBottom:"24px",lineHeight:"1.5"}}>HTML-Datei im Browser oeffnen und ausdrucken.</div>
            {(function() {
              var used = new Set();
              var catList = CATS.map(function(c){return {label:c.label,items:c.keys.filter(function(k){return !!recipes[k];})};}).filter(function(c){return c.items.length>0;});
              catList.forEach(function(c){c.items.forEach(function(k){used.add(k);});});
              var customKeys = Object.keys(recipes).filter(function(k){return !used.has(k);});
              if (customKeys.length) catList.push({label:"Eigene Rezepte",items:customKeys});
              return catList.map(function(cat) {
                return (
                  <div key={cat.label} style={{marginBottom:"20px"}}>
                    <div style={{fontSize:"10px",fontWeight:"700",color:C.accent,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px",paddingBottom:"8px",borderBottom:"1px solid "+C.border}}>{cat.label}</div>
                    {cat.items.map(function(name) {
                      var rec=recipes[name];
                      var rIngs=(rec&&(rec.i||rec.ingredients))||[];
                      var rSteps=(rec&&(rec.s||rec.steps))||[];
                      return (
                        <button key={name} onClick={function(){setDetailRecipe(name);setCookStep(0);setCookMode(false);setImgLoaded(false);setView("recipes");}} style={{width:"100%",background:C.white,border:"1px solid "+C.border,marginBottom:"6px",overflow:"hidden",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"stretch",fontFamily:"Helvetica Neue, Arial, sans-serif"}}>
                          <div style={{width:"3px",background:C.accent,flexShrink:0}} />
                          <div style={{padding:"11px 13px",flex:1}}>
                            <div style={{fontSize:"13px",fontFamily:"Georgia, serif",color:C.text,marginBottom:"2px"}}>{dn(name)}</div>
                            <div style={{fontSize:"11px",color:C.muted}}>{rIngs.length} Zutaten - {rSteps.length} Schritte</div>
                          </div>
                          <div style={{padding:"11px",display:"flex",alignItems:"center"}}><span style={{color:C.subtle,fontSize:"15px"}}>{">"}</span></div>
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        )}

      </div>
    );
  }

  return content;
}
