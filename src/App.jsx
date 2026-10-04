import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { C, SF } from "./theme.js";
import { CUISINE_LIST, CATS, BASIC_LABEL } from "./data.js";
import { fbGet, fbPatch, hbGet, HB_CODE_RE, CODE_RE, randCode, normCode } from "./fb.js";
import { callAI, kiErrText, buildExtractPrompt, buildSuggestPrompt, parseJsonBlock, compressImageToBase64 } from "./ai.js";
import { makeRecipePDF, makeCookbookPDF } from "./pdf.js";
import { hbStock, scoreRecipe, hbCats, ingStatus, pickFoodCat, goneKey } from "./logic/stock.js";
import { todayISO, isoWeekKey, shiftWeek, todayDayKey, slotOrderNow, emptyWeek, normalizeWeek, migrateWeek, slotList } from "./logic/weeks.js";
import { recKey, recName, recCat, normalizeRecipe, normalizeRecipes, addCooked, starterRecipes, isProven, ghostKeys } from "./logic/recipes.js";
import { newShopId, makeShopItem, shoppingList, nextOrder, migrateShopping, groupShopping, addIngredients, planItems, mergeShopping, scaledIngredients, shoppingText, orphanIds, isListed, addedSlotKeys } from "./logic/shopping.js";
import { shopCat, ingKey } from "./logic/ingredients.js";
import { CLASSICS } from "./classics.js";
import Join from "./views/Join.jsx";
import Shell from "./views/Shell.jsx";
import Heute from "./views/Heute.jsx";
import Plan from "./views/Plan.jsx";
import Shopping from "./views/Shopping.jsx";
import Recipes from "./views/Recipes.jsx";
import RecipeDetail from "./views/RecipeDetail.jsx";
import CookMode from "./views/CookMode.jsx";

// SESSION PERSISTENCE - merkt sich Code + Name, damit man nicht rausfliegt
const SESSION_KEY = "wochenplan_session";
// SCHRIFTZOOM - pro Geraet gespeichert (nicht synchronisiert)
const ZOOM_KEY = "wochenplan_zoom";
// "HEUTE"-FILTER - pro Geraet gespeichert
const HEUTE_CAT_KEY = "wochenplan_heute_cat";
// Poll-Takt: nur plans/<CODE>/meta, Teile werden bei geaendertem Zeitstempel nachgeladen
const POLL_MS = 10000;
const DEFAULT_SETTINGS = { aiImages:false };
const asList = (p) => Array.isArray(p) ? p : (p && typeof p==="object" ? Object.values(p) : []);
const asObj = (o) => (o && typeof o==="object" && !Array.isArray(o)) ? o : {};
const ERR_NET = "Keine Verbindung zur Datenbank.";
const isLocalDev = typeof window!=="undefined" && (window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1");
// Entwicklerhinweis gehoert in die Konsole, nicht in die Oberflaeche
if(isLocalDev) console.info("Wochenplan: Lokal mit dem Vite-Dev-Server ist die KI-Function nicht verfügbar. Für KI-Import und -Vorschlag die Server-Umgebung oder die deployte App nutzen.");

// APP
export default function App() {
  const [screen,setScreen]           = useState("loading");
  const [myCode]                     = useState(()=>randCode(10));
  const [joinInput,setJoinInput]     = useState("");
  const [nameInput,setNameInput]     = useState("");
  const [nameHint,setNameHint]       = useState(false);   // "Plan starten" ohne Namen
  const [joinErr,setJoinErr]         = useState("");      // Meldung unter dem Beitritt
  const [joinOffer,setJoinOffer]     = useState("");      // Code, fuer den "Neuen Plan anlegen" angeboten wird
  const [joinBusy,setJoinBusy]       = useState(false);
  const [activeCode,setActiveCode]   = useState("");
  const [userName,setUserName]       = useState("");
  const [participants,setParticipants] = useState([]);
  const [settings,setSettings]       = useState(DEFAULT_SETTINGS);
  const [lastSync,setLastSync]       = useState(null);
  const [syncOk,setSyncOk]           = useState(true);
  const [syncErr,setSyncErr]         = useState("");
  const [toast,setToast]             = useState("");      // kurzer Hinweis unten (Zurueck-Taste, geloescht auf anderem Geraet, kopiert)

  // WOCHEN: plans/<CODE>/weeks/<YYYY-Www>; weekKey = angezeigte Woche
  const [weeks,setWeeks]             = useState({});
  const [weekKey,setWeekKey]         = useState(()=>isoWeekKey(todayISO()));
  const [recipes,setRecipes]         = useState({});      // plans/<CODE>/recipes/<recKey>
  const [shopping,setShopping]       = useState({});      // plans/<CODE>/shopping/<id>
  const [images,setImages]           = useState({});      // eigene Bilder (recKey -> dataUrl), recipeImages/<CODE>

  const [view,setView]               = useState("plan");
  const [activeCell,setActiveCell]   = useState(null);
  const [cellInput,setCellInput]     = useState("");
  const [openCat,setOpenCat]         = useState(null);
  const [cookPicker,setCookPicker]   = useState(null);

  const [detailRecipe,setDetailRecipe] = useState(null);
  const [editMode,setEditMode]       = useState(false);
  const [editData,setEditData]       = useState(null);
  const [cookStep,setCookStep]       = useState(0);
  const [cookMode,setCookMode]       = useState(false);

  const [extracting,setExtracting]   = useState(false);
  const [extracted,setExtracted]     = useState(null);
  const [importErr,setImportErr]     = useState("");
  const [savedMsg,setSavedMsg]       = useState(false);
  const [codeCopied,setCodeCopied]   = useState(false);
  const [fontZoom,setFontZoom]       = useState(()=>{ try{ const v=parseFloat(localStorage.getItem(ZOOM_KEY)); return (v>=0.8&&v<=1.4)?v:1; }catch(e){ return 1; } });
  const [rateAfterCook,setRateAfterCook] = useState(false); // Bewertungs-Dialog nach dem Kochen
  const [ratingDraft,setRatingDraft] = useState(0);
  const [noteDraft,setNoteDraft]     = useState("");
  const [editShopId,setEditShopId]   = useState(null); // Id der gerade editierten Einkaufszeile
  const [editShopText,setEditShopText] = useState("");
  // "WAS KOCHEN WIR HEUTE?" - Verknuepfung zum Haushaltsbuch liegt im Plan (plans/<code>/hb), gilt fuer die Familie
  const [hbLink,setHbLink]           = useState(null);  // {code, cat}
  const [hbBook,setHbBook]           = useState(null);  // geladenes Buch (nur lesend)
  const [hbLoading,setHbLoading]     = useState(false);
  const [hbErr,setHbErr]             = useState("");
  const [heuteCat,setHeuteCat]       = useState(()=>{ try{ return localStorage.getItem(HEUTE_CAT_KEY)||"all"; }catch(e){ return "all"; } });
  const [aiBusy,setAiBusy]           = useState(false);
  const [aiErr,setAiErr]             = useState("");

  const syncTimer    = useRef(null);
  const cellRef      = useRef(null);
  const cookRef      = useRef(null);
  const exitArmedRef = useRef(false);
  const handleBackRef= useRef(()=>false);
  const backHandlers = useRef([]);        // von Ansichten registrierte Schliess-Handler (Dialoge, Menue)
  const editingRef   = useRef({cell:false,shop:false,recipe:false}); // offene Eingaben: der Teil wird nicht vom Server ueberschrieben
  const pendingRef   = useRef(0);         // Anzahl laufender eigener Schreibvorgaenge
  const dirtyRef     = useRef(new Set()); // Teile, deren letztes Schreiben scheiterte: der Poll laedt sie unabhaengig vom Zeitstempel nach
  const metaRef      = useRef({});        // zuletzt GESEHENE Zeitstempel (nur der Poll setzt sie)
  const codeRef      = useRef("");
  const weekKeyRef   = useRef(weekKey);
  const recipesRef   = useRef(recipes);
  const shoppingRef  = useRef(shopping);
  const toastTimer   = useRef(null);
  codeRef.current = activeCode;
  weekKeyRef.current = weekKey;
  recipesRef.current = recipes;
  shoppingRef.current = shopping;

  const showToast=useCallback((msg,ms)=>{ setToast(msg); clearTimeout(toastTimer.current); toastTimer.current=setTimeout(()=>setToast(""),ms||2500); },[]);
  const failWrite=(msg)=>{ setSyncOk(false); setSyncErr(msg||"Speichern fehlgeschlagen – Änderung nur auf diesem Gerät."); };

  // SCHREIBEN - ein gezielter Multi-Path-PATCH auf plans/<CODE> mit Zeitstempeln (Bauplan Abschnitt 4).
  // Der lokale Zustand ist schon aktualisiert (optimistisch); scheitert das Schreiben, wird die Sync-Leiste rot
  // und der Teil als "dirty" gemerkt: der naechste Poll laedt ihn nach und gleicht so den lokalen Zustand ab.
  // metaRef bleibt absichtlich unveraendert: der naechste Poll sieht den neuen Zeitstempel und laedt den Teil
  // einmal nach - so kommen auch Aenderungen anderer Geraete an, die kurz vor unserem Schreiben passiert sind.
  const writePlan = useCallback(async(patch,parts)=>{
    const code=codeRef.current;
    if(!code) return false;
    const now=Date.now();
    const full={...patch,"meta/updatedAt":now};
    const list=[].concat(parts||[]);
    list.forEach(p=>{ full["meta/"+p+"UpdatedAt"]=now; });
    pendingRef.current++;
    const ok=await fbPatch("plans/"+code,full);
    pendingRef.current=Math.max(0,pendingRef.current-1);
    if(ok){ setLastSync(now); if(dirtyRef.current.size===0){ setSyncOk(true); setSyncErr(""); } }
    else { list.forEach(p=>dirtyRef.current.add(p)); failWrite(); }
    return ok;
  },[]);

  // Reste aufraeumen, die durch Feld-PATCHes auf geloeschte Eintraege entstanden sind (Geister-Rezepte, Posten ohne text)
  const cleanupServer=(recipesRaw,shoppingRaw)=>{
    const patch={}, parts=[];
    if(recipesRaw!==undefined){ const g=ghostKeys(asObj(recipesRaw)); if(g.length){ g.forEach(k=>{ patch["recipes/"+k]=null; }); parts.push("recipes"); } }
    if(shoppingRaw!==undefined&&!Array.isArray(shoppingRaw)){ const o=orphanIds(asObj(shoppingRaw)); if(o.length){ o.forEach(id=>{ patch["shopping/"+id]=null; }); parts.push("shopping"); } }
    if(parts.length) writePlan(patch,parts);
  };

  // Zustand aus den geladenen Plandaten setzen (Beitritt, Migration)
  const applyPlanData = (data,imgs)=>{
    const ws={}; Object.keys(asObj(data.weeks)).forEach(k=>{ ws[k]=normalizeWeek(data.weeks[k]); });
    setWeeks(ws);
    setShopping(Array.isArray(data.shopping)?migrateShopping(data.shopping):asObj(data.shopping));
    setRecipes(normalizeRecipes(asObj(data.recipes)));
    setParticipants(asList(data.participants).filter(Boolean));
    setHbLink(data.hb&&data.hb.code?data.hb:null);
    setSettings({...DEFAULT_SETTINGS,...asObj(data.settings)});
    if(imgs!==undefined) setImages(asObj(imgs));
    metaRef.current={...asObj(data.meta)};
    dirtyRef.current=new Set();
    setLastSync((data.meta&&data.meta.updatedAt)||Date.now());setSyncOk(true);setSyncErr("");
  };

  // POLL - alle 10 s nur meta; Teile nur nachladen, wenn sich ihr Zeitstempel geaendert hat oder ein Schreiben scheiterte (dirty).
  // Laufende eigene Schreibvorgaenge brechen den Poll nicht mehr ab; sie verhindern nur das Uebernehmen (canApply).
  const pollMeta = useCallback(async(code)=>{
    if(!code) return;
    const meta=await fbGet("plans/"+code+"/meta");
    if(code!==codeRef.current) return;
    if(meta===undefined){ setSyncOk(false); setSyncErr(ERR_NET); return; }
    if(meta===null){ setSyncOk(false); setSyncErr("Plan wurde nicht gefunden."); return; }
    const prev=metaRef.current||{}, ed=editingRef.current, wk=weekKeyRef.current, dirty=dirtyRef.current;
    const seen={...prev}; const jobs=[];
    const canApply=()=>pendingRef.current===0&&code===codeRef.current;   // kein eigener Schreibvorgang dazwischen gestartet
    const need=(part)=>meta[part+"UpdatedAt"]!==prev[part+"UpdatedAt"]||dirty.has(part);
    if(need("weeks")&&!ed.cell){
      // Sichtbare und aktuelle Woche frisch laden; andere gecachte Wochen verwerfen (werden beim Oeffnen frisch geholt)
      const cur=isoWeekKey(todayISO()), keys=[...new Set([wk,cur])];
      jobs.push(Promise.all(keys.map(k=>fbGet("plans/"+code+"/weeks/"+k))).then(ws=>{
        if(ws.every(w=>w!==undefined)&&canApply()){
          setWeeks(()=>{ const n={}; keys.forEach((k,i)=>{ n[k]=normalizeWeek(ws[i]); }); return n; });
          seen.weeksUpdatedAt=meta.weeksUpdatedAt; dirty.delete("weeks");
        }
      }));
    }
    if(need("shopping")&&!ed.shop){
      jobs.push(fbGet("plans/"+code+"/shopping").then(s=>{ if(s!==undefined&&canApply()){ setShopping(Array.isArray(s)?migrateShopping(s):asObj(s)); seen.shoppingUpdatedAt=meta.shoppingUpdatedAt; dirty.delete("shopping"); cleanupServer(undefined,s); } }));
    }
    if(need("recipes")&&!ed.recipe){
      jobs.push(fbGet("plans/"+code+"/recipes").then(r=>{ if(r!==undefined&&canApply()){ setRecipes(normalizeRecipes(asObj(r))); seen.recipesUpdatedAt=meta.recipesUpdatedAt; dirty.delete("recipes"); cleanupServer(r,undefined); } }));
    }
    if(need("people")){
      jobs.push(Promise.all([fbGet("plans/"+code+"/participants"),fbGet("plans/"+code+"/hb"),fbGet("plans/"+code+"/settings")]).then(([p,h,st])=>{
        if(!canApply()) return;
        if(p!==undefined) setParticipants(asList(p).filter(Boolean));
        if(h!==undefined) setHbLink(prevL=>{ const n=(h&&h.code)?h:null; return (prevL&&n&&prevL.code===n.code&&prevL.cat===n.cat&&JSON.stringify(prevL.gone||{})===JSON.stringify(n.gone||{}))?prevL:n; });
        if(st!==undefined) setSettings({...DEFAULT_SETTINGS,...asObj(st)});
        if(p!==undefined&&h!==undefined&&st!==undefined){ seen.peopleUpdatedAt=meta.peopleUpdatedAt; dirty.delete("people"); }
      }));
    }
    await Promise.all(jobs);
    if(code!==codeRef.current) return;
    seen.updatedAt=meta.updatedAt; seen.createdAt=meta.createdAt;
    metaRef.current=seen;
    setLastSync(meta.updatedAt||Date.now());
    if(dirty.size===0){ setSyncOk(true); setSyncErr(""); }   // Fehler erst loeschen, wenn der Abgleich gelungen ist
  },[]);

  const startPolling = useCallback((code)=>{
    if(syncTimer.current)clearInterval(syncTimer.current);
    syncTimer.current=setInterval(()=>pollMeta(code),POLL_MS);
  },[pollMeta]);

  useEffect(()=>()=>{clearInterval(syncTimer.current);clearTimeout(toastTimer.current);},[]);

  // Alte Bilder (recipeImages/<Name>) einzeln nach recipeImages/<CODE>/<key> kopieren; liefert {imgs, ok}
  const copyOldImages = async(code,recipesObj,existing)=>{
    const rootImgs=await fbGet("recipeImages");
    if(rootImgs===undefined) return {imgs:{},ok:false};
    const imgs={}; let ok=true;
    for(const name of Object.keys(asObj(rootImgs))){
      const v=rootImgs[name], k=recKey(name);
      if(typeof v!=="string"||!v.startsWith("data:")||!recipesObj[k]||(existing&&existing[k])) continue;
      if(await fbPatch("recipeImages/"+code,{[k]:v})) imgs[k]=v; else ok=false;
    }
    return {imgs,ok};
  };

  // MIGRATION (Bauplan Abschnitt 5): Altbestand plan/shopping-Array/globalRecipes einmalig in die neue Form bringen.
  // Deterministische Ids und ein zweiter Blick auf meta kurz vor dem Schreiben, damit zwei gleichzeitig beitretende
  // Geraete dasselbe schreiben bzw. das zweite nur noch laedt. Bilder werden vorher einzeln kopiert; erst wenn alle da sind,
  // steht meta/imagesMigrated, sonst wird beim naechsten Beitritt nachgeholt.
  // Liefert die neuen Plandaten (oder null bei Netzfehler). plan, updatedAt (alt) und globalRecipes bleiben stehen.
  const migratePlan = async(code,pd)=>{
    const now=Date.now(), wk=isoWeekKey(todayISO());
    const patch={};
    const weeksNew={...asObj(pd.weeks)};
    if(!weeksNew[wk]){ weeksNew[wk]=migrateWeek(pd.plan); patch["weeks/"+wk]=weeksNew[wk]; }
    let shoppingNew=pd.shopping;
    if(Array.isArray(pd.shopping)||!pd.shopping){ shoppingNew=migrateShopping(Array.isArray(pd.shopping)?pd.shopping:[],now); patch.shopping=Object.keys(shoppingNew).length?shoppingNew:null; }
    let recipesNew=asObj(pd.recipes), imgs={}, imgsOk=true;
    if(!pd.recipes){
      const gr=await fbGet("globalRecipes");
      if(gr===undefined) return null;
      recipesNew={};
      Object.keys(asObj(gr)).forEach(name=>{ const k=recKey(name); if(k&&gr[name]&&typeof gr[name]==="object") recipesNew[k]=normalizeRecipe(k,gr[name],now); });
      if(Object.keys(recipesNew).length) patch.recipes=recipesNew;
      const r=await copyOldImages(code,recipesNew); imgs=r.imgs; imgsOk=r.ok;
    }
    const meta={createdAt:pd.updatedAt||now,updatedAt:now,weeksUpdatedAt:now,shoppingUpdatedAt:now,recipesUpdatedAt:now,peopleUpdatedAt:now};
    if(imgsOk) meta.imagesMigrated=true;
    patch.meta=meta;
    const settingsNew={...DEFAULT_SETTINGS,...asObj(pd.settings)};
    if(!pd.settings) patch.settings=settingsNew;
    // Hat inzwischen ein anderes Geraet migriert? Dann nur laden statt schreiben.
    const m2=await fbGet("plans/"+code+"/meta");
    if(m2===undefined) return null;
    if(m2&&m2.updatedAt){ const fresh=await fbGet("plans/"+code); if(!fresh||!fresh.meta) return null; return {...fresh,_imgs:undefined}; }
    if(!(await fbPatch("plans/"+code,patch))) return null;
    if(!imgsOk) failWrite("Rezeptbilder konnten nicht übernommen werden – wird beim nächsten Beitritt nachgeholt.");
    return {...pd,weeks:weeksNew,shopping:shoppingNew||{},recipes:recipesNew,meta,settings:settingsNew,_imgs:imgs};
  };

  // BEITRITT - nur bestehende Plaene; create = "Plan starten" / "Neuen Plan mit diesem Code anlegen";
  // restore = Sitzung wiederherstellen (legt NIE einen Plan an)
  const handleJoin = async(code,name,opts)=>{
    const o=opts||{};
    const nm=(name!==undefined?name:nameInput).trim();
    if(!nm){ setNameHint(true); if(o.restore) setScreen("join"); return false; }
    const c=normCode(code);
    if(!CODE_RE.test(c)){ setJoinErr("Der Code hat 6 bis 16 Zeichen (Buchstaben und Ziffern)."); setJoinOffer(""); if(o.restore) setScreen("join"); return false; }
    if(joinBusy) return false;
    setJoinBusy(true);setJoinErr("");setJoinOffer("");setNameHint(false);
    const fail=(msg,offer)=>{ setJoinErr(msg); setJoinOffer(offer||""); setJoinBusy(false); if(o.restore) setScreen("join"); return false; };
    const pd=await fbGet("plans/"+c);
    if(pd===undefined) return fail(ERR_NET);
    let data=pd, imgs;
    if(!pd||!pd.meta){
      if(pd&&pd.plan){                                           // Altbestand -> migrieren
        data=await migratePlan(c,pd);
        if(!data) return fail(ERR_NET);
        imgs=data._imgs;
      }else if(o.create&&!o.restore){                            // neuer Plan (nur ausdruecklich)
        const now=Date.now(), wk=isoWeekKey(todayISO());
        data={participants:[nm],settings:{...DEFAULT_SETTINGS},weeks:{[wk]:emptyWeek()},
              meta:{createdAt:now,updatedAt:now,weeksUpdatedAt:now,shoppingUpdatedAt:now,recipesUpdatedAt:now,peopleUpdatedAt:now,imagesMigrated:true}};
        if(!(await fbPatch("plans/"+c,data))) return fail(ERR_NET);
      }else{
        return fail("Kein Plan mit diesem Code.",o.restore?"":c);
      }
    }
    // Teilnehmer per PATCH ergaenzen (nie PUT), nur wenn der Name fehlt
    const ep=asList(data.participants).filter(Boolean);
    let parts=ep;
    if(!ep.includes(nm)){
      parts=[...ep,nm];
      const now=Date.now();
      if(!(await fbPatch("plans/"+c,{participants:parts,"meta/peopleUpdatedAt":now,"meta/updatedAt":now}))) return fail(ERR_NET);
      data={...data,participants:parts,meta:{...data.meta,peopleUpdatedAt:now,updatedAt:now}};
    }
    if(imgs===undefined){ const im=await fbGet("recipeImages/"+c); imgs=im===undefined?{}:asObj(im); }   // Bilder einmal beim Start
    // Bildkopie der Migration nachholen, falls sie damals scheiterte
    if(data.plan&&data.meta&&!data.meta.imagesMigrated){
      const r=await copyOldImages(c,normalizeRecipes(asObj(data.recipes)),imgs);
      imgs={...imgs,...r.imgs};
      if(r.ok) await fbPatch("plans/"+c,{"meta/imagesMigrated":true});
    }
    applyPlanData(data,imgs);
    cleanupServer(data.recipes,data.shopping);
    setActiveCode(c);codeRef.current=c;setUserName(nm);setScreen("app");startPolling(c);
    setJoinBusy(false);
    try{ localStorage.setItem(SESSION_KEY,JSON.stringify({code:c,name:nm})); }catch(e){}
    return true;
  };
  const startPlan=()=>handleJoin(myCode,undefined,{create:true});
  const joinPlan=()=>handleJoin(joinInput);
  const createWithCode=()=>joinOffer&&handleJoin(joinOffer,undefined,{create:true});

  // LOAD - gespeicherte Sitzung wiederherstellen (legt nie einen Plan an)
  useEffect(()=>{
    (async()=>{
      let session=null;
      try{ const raw=localStorage.getItem(SESSION_KEY); if(raw) session=JSON.parse(raw); }catch(e){}
      if(session&&session.code&&session.name){
        setNameInput(session.name);
        await handleJoin(session.code,session.name,{restore:true});
      }else{
        setScreen("join");
      }
    })();
  },[]);

  // PLAN VERLASSEN - Sitzung loeschen, zurueck zum Join-Screen
  const leavePlan=()=>{
    if(!window.confirm("Plan verlassen? Mit deinem Code kannst du jederzeit zurückkehren."))return;
    clearInterval(syncTimer.current);
    try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
    setActiveCode("");codeRef.current="";setUserName("");setJoinInput("");setJoinErr("");setJoinOffer("");setView("plan");
    setWeeks({});setShopping({});setRecipes({});setImages({});setParticipants([]);setSettings(DEFAULT_SETTINGS);metaRef.current={};dirtyRef.current=new Set();
    setHbLink(null);setHbBook(null);setHbErr("");
    setDetailRecipe(null);setCookMode(false);setEditMode(false);setEditData(null);setExtracted(null);
    setScreen("join");
  };

  // WOCHE - angezeigte Woche aus weeks lesen; jede Woche wird beim Oeffnen frisch vom Server geholt (kein veralteter Cache)
  const curWeekKey=isoWeekKey(todayISO());
  const week=useMemo(()=>normalizeWeek(weeks[weekKey]),[weeks,weekKey]);
  const selectWeek=async(key)=>{
    setWeekKey(key);
    if(!codeRef.current) return;
    const w=await fbGet("plans/"+codeRef.current+"/weeks/"+key);
    if(w!==undefined&&!editingRef.current.cell) setWeeks(p=>({...p,[key]:normalizeWeek(w)}));
  };
  // Slot schreiben: erst optimistisch lokal, dann gegen den Serverstand der Zelle abgleichen (fn wird auf beide angewandt),
  // damit zwei Geraete, die kurz nacheinander dieselbe Zelle aendern, nichts verlieren
  const writeSlot=async(wkKey,day,meal,fn)=>{
    const apply=(prev,arr)=>{ const w=normalizeWeek(prev[wkKey]); w[day].meals[meal]=arr; return {...prev,[wkKey]:w}; };
    const local=slotList(normalizeWeek(weeks[wkKey])[day].meals[meal]);
    setWeeks(prev=>apply(prev,fn(slotList(normalizeWeek(prev[wkKey])[day].meals[meal]))));
    const srv=codeRef.current?await fbGet("plans/"+codeRef.current+"/weeks/"+wkKey+"/"+day+"/meals/"+meal):undefined;
    const arr=fn(srv===undefined?local:slotList(srv));
    setWeeks(prev=>apply(prev,arr));
    return writePlan({["weeks/"+wkKey+"/"+day+"/meals/"+meal]:arr},"weeks");
  };
  // MEAL & COOK - ein Slot kann mehrere Rezepte enthalten (Array)
  const addDish=(day,meal,name,wkKey)=>{
    const nm=(name||"").trim();
    if(!nm)return;
    const key=recipes[nm]?nm:(recipes[recKey(nm)]?recKey(nm):nm);     // Rezeptschluessel oder freier Text
    return writeSlot(wkKey||weekKey,day,meal,arr=>arr.includes(key)?arr:[...arr,key]);
  };
  const removeDish=(day,meal,name,wkKey)=>writeSlot(wkKey||weekKey,day,meal,arr=>arr.filter(d=>d!==name));
  const setCook=(day,person)=>{
    const val=(week[day]&&week[day].cook)===person?"":(person||"");
    setWeeks(prev=>{ const w=normalizeWeek(prev[weekKey]); w[day].cook=val; return {...prev,[weekKey]:w}; });
    writePlan({["weeks/"+weekKey+"/"+day+"/cook"]:val},"weeks");
    setCookPicker(null);
  };
  // Letzte Woche in die angezeigte Woche uebernehmen: Vorwoche und Zielwoche frisch lesen, nur leere Slots fuellen
  const copyLastWeek=async()=>{
    const code=codeRef.current; if(!code) return false;
    const prevKey=shiftWeek(weekKey,-1);
    const [ps,ts]=await Promise.all([fbGet("plans/"+code+"/weeks/"+prevKey),fbGet("plans/"+code+"/weeks/"+weekKey)]);
    if(ps===undefined||ts===undefined){ failWrite(ERR_NET); return false; }
    const src=normalizeWeek(ps), target=normalizeWeek(ts);
    const patch={};
    Object.keys(target).forEach(day=>{
      Object.keys(target[day].meals).forEach(meal=>{
        if(!target[day].meals[meal].length&&src[day].meals[meal].length){ target[day].meals[meal]=[...src[day].meals[meal]]; patch["weeks/"+weekKey+"/"+day+"/meals/"+meal]=target[day].meals[meal]; }
      });
      if(!target[day].cook&&src[day].cook){ target[day].cook=src[day].cook; patch["weeks/"+weekKey+"/"+day+"/cook"]=src[day].cook; }
    });
    setWeeks(prev=>({...prev,[weekKey]:target}));
    if(!Object.keys(patch).length) return true;
    return writePlan(patch,"weeks");
  };
  // Woche abschliessen: Auswahl [{key, iso}] in die Kochhistorie der Rezepte, alles in EINEM Multi-Path-PATCH.
  // Die Rezepte werden vorher frisch gelesen, damit keine geloeschten wiederbelebt und keine fremden Daten ueberschrieben werden.
  const closeWeek=async(selection)=>{
    const byKey={};
    (selection||[]).forEach(s=>{ if(s&&s.iso&&recipes[s.key]) (byKey[s.key]=byKey[s.key]||[]).push(s.iso); });
    const keys=Object.keys(byKey);
    if(!keys.length) return false;
    const srv=codeRef.current?await fbGet("plans/"+codeRef.current+"/recipes"):undefined;
    const base=srv===undefined?recipes:normalizeRecipes(asObj(srv));
    const now=Date.now(), patch={}, upd={}; let gone=0;
    keys.forEach(k=>{
      let rec=base[k];
      if(!rec){ gone++; return; }
      byKey[k].forEach(iso=>{ rec={...rec,...addCooked(rec,iso)}; });
      upd[k]={...rec,updatedAt:now};
      patch["recipes/"+k+"/cooked"]=rec.cooked; patch["recipes/"+k+"/lastCooked"]=rec.lastCooked; patch["recipes/"+k+"/updatedAt"]=now;
    });
    if(gone) showToast(gone===1?"Ein Rezept wurde auf einem anderen Gerät gelöscht.":gone+" Rezepte wurden auf einem anderen Gerät gelöscht.");
    if(!Object.keys(upd).length) return false;
    setRecipes(prev=>{ const n={...prev,...upd}; keys.forEach(k=>{ if(!base[k]) delete n[k]; }); return n; });
    writePlan(patch,"recipes");
    return true;
  };

  // SHOPPING - Objekt <id> -> Posten; jede Aenderung schreibt nur ihren Pfad
  const household=Math.max(2,participants.length);                   // Haushaltsgroesse fuer die Mengen (Bauplan Abschnitt 9)
  // Zutaten eines Rezepts (skaliert auf servings) auf die Liste; opts.slot merkt die Plan-Zelle ("+"-Sperre im Plan)
  const addRecipeToShopping=(dishKey,servings,opts)=>{
    const rec=recipes[dishKey];
    if(!rec||!rec.ingredients||!rec.ingredients.length)return false;
    const ings=scaledIngredients(rec,servings>0?servings:household);
    const {next,patch}=addIngredients(shoppingRef.current,ings,{src:"manuell",slot:(opts&&opts.slot)||""});
    if(!Object.keys(patch).length)return false;
    setShopping(next);
    writePlan(patch,"shopping");
    return true;
  };
  // Einkaufsliste aus dem Plan: ZUSAMMENFUEHREN statt ersetzen (Bauplan Abschnitt 9)
  const buildShoppingFromPlan=()=>{
    const items=planItems(week,recipes,undefined,{servings:household});
    const {next,patch}=mergeShopping(shoppingRef.current,items);
    if(Object.keys(patch).length){ setShopping(next); writePlan(patch,"shopping"); }
    setView("shopping");
  };
  // Existiert der Posten noch auf dem Server? null = auf anderem Geraet entfernt -> lokal entfernen, Hinweis
  const shopItemGone=async(id)=>{
    const t=codeRef.current?await fbGet("plans/"+codeRef.current+"/shopping/"+id+"/text"):undefined;
    if(t!==null) return false;
    setShopping(prev=>{ const n={...prev}; delete n[id]; return n; });
    showToast("Dieser Posten wurde auf einem anderen Gerät entfernt.");
    return true;
  };
  const toggleShopItem=async(id)=>{
    const it=shopping[id]; if(!it)return;
    const v=!it.checked;
    setShopping(prev=>prev[id]?{...prev,[id]:{...prev[id],checked:v}}:prev);
    if(await shopItemGone(id)) return;
    writePlan({["shopping/"+id+"/checked"]:v},"shopping");
  };
  const forceBuy=async(id)=>{
    if(!shopping[id])return;
    setShopping(prev=>prev[id]?{...prev,[id]:{...prev[id],forceBuy:true,checked:false}}:prev);
    if(await shopItemGone(id)) return;
    writePlan({["shopping/"+id+"/forceBuy"]:true,["shopping/"+id+"/checked"]:false},"shopping");
  };
  const removeShopItem=(id)=>{
    setShopping(prev=>{const n={...prev};delete n[id];return n;});
    writePlan({["shopping/"+id]:null},"shopping");
  };
  const editShopItem=async(id,text)=>{
    const txt=String(text||"").trim();
    if(!txt){ removeShopItem(id); return; }                           // leerer Text = Eintrag loeschen
    const fields={text:txt,cat:shopCat(txt),key:ingKey(txt)};
    setShopping(prev=>prev[id]?{...prev,[id]:{...prev[id],...fields}}:prev);
    if(await shopItemGone(id)) return;
    writePlan({["shopping/"+id+"/text"]:txt,["shopping/"+id+"/cat"]:fields.cat,["shopping/"+id+"/key"]:fields.key},"shopping");
  };
  const saveShopEdit=()=>{
    if(editShopId===null)return;
    const id=editShopId, txt=editShopText;
    setEditShopId(null);setEditShopText("");
    if(shopping[id]&&shopping[id].text===txt.trim())return;
    editShopItem(id,txt);
  };
  const clearShopping=()=>{
    if(!window.confirm("Einkaufsliste komplett löschen?"))return;
    setEditShopId(null);
    setShopping({});
    writePlan({shopping:null},"shopping");
  };
  const addShopItem=(text)=>{
    const txt=String(text||"").trim();
    if(!txt)return;
    const id=newShopId(), item=makeShopItem(txt,{src:"manuell",order:nextOrder(shoppingRef.current)});
    setShopping(prev=>({...prev,[id]:item}));
    writePlan({["shopping/"+id]:item},"shopping");
  };

  // REZEPTE - einzeln unter recipes/<recKey>; Felder (Bewertung, Notiz, Kochdatum) als Feld-PATCH.
  // Vor dem Feld-PATCH wird geprueft, ob das Rezept auf dem Server noch existiert - sonst entstuende ein Geister-Rezept.
  const recipeGone=async(key)=>{
    const nm=codeRef.current?await fbGet("plans/"+codeRef.current+"/recipes/"+key+"/name"):undefined;
    if(nm!==null) return false;
    setRecipes(prev=>{ const n={...prev}; delete n[key]; return n; });
    if(detailRecipe===key){ setDetailRecipe(null); setEditMode(false); setEditData(null); setCookMode(false); setRateAfterCook(false); }
    showToast("Dieses Rezept wurde auf einem anderen Gerät gelöscht.");
    return true;
  };
  const patchRecipe=async(key,fields)=>{
    if(!recipes[key])return false;
    const now=Date.now();
    setRecipes(prev=>prev[key]?{...prev,[key]:{...prev[key],...fields,updatedAt:now}}:prev);
    if(await recipeGone(key)) return false;
    const patch={["recipes/"+key+"/updatedAt"]:now};
    Object.keys(fields).forEach(f=>{ patch["recipes/"+key+"/"+f]=fields[f]; });
    return writePlan(patch,"recipes");
  };
  const rateRecipe=(key,rating)=>patchRecipe(key,{rating});
  const noteRecipe=(key,notes)=>patchRecipe(key,{notes});
  // Kochdatum: Historie frisch vom Server, damit zwei Geraete nichts gegenseitig ueberschreiben
  const markCooked=async(key,iso)=>{
    const rec=recipes[key]; if(!rec) return false;
    const d=iso||todayISO();
    setRecipes(prev=>prev[key]?{...prev,[key]:{...prev[key],...addCooked(prev[key],d)}}:prev);
    const srv=codeRef.current?await fbGet("plans/"+codeRef.current+"/recipes/"+key):undefined;
    if(srv===null){ await recipeGone(key); return false; }
    const base=srv&&typeof srv==="object"?normalizeRecipe(key,srv):rec;
    const c=addCooked(base,d), now=Date.now();
    setRecipes(prev=>prev[key]?{...prev,[key]:{...prev[key],...c,updatedAt:now}}:prev);
    return writePlan({["recipes/"+key+"/cooked"]:c.cooked,["recipes/"+key+"/lastCooked"]:c.lastCooked,["recipes/"+key+"/updatedAt"]:now},"recipes");
  };
  // Ganzes Rezept speichern (neu oder ersetzen). opts.keepMeta: Bewertung, Notizen, Kochhistorie und createdAt
  // des vorhandenen Rezepts (frisch vom Server) bleiben erhalten.
  const saveRecipe=async(key,recipe,opts)=>{
    const k=recKey(key); if(!k)return null;
    let rec=normalizeRecipe(k,{...recipe,name:recipe.name||k});
    if(opts&&opts.keepMeta){
      const srv=codeRef.current?await fbGet("plans/"+codeRef.current+"/recipes/"+k):undefined;
      const old=srv&&typeof srv==="object"?normalizeRecipe(k,srv):recipes[k];
      if(old) rec={...rec,rating:old.rating,notes:old.notes,cooked:old.cooked,lastCooked:old.lastCooked,createdAt:old.createdAt};
    }
    setRecipes(prev=>({...prev,[k]:rec}));
    writePlan({["recipes/"+k]:rec},"recipes");
    return k;
  };
  // Startrezepte auf Wunsch in den Plan uebernehmen (nur fehlende Schluessel)
  const adoptStarters=()=>{
    const st=starterRecipes();
    const patch={}, add={};
    Object.keys(st).forEach(k=>{ if(!recipes[k]){ patch["recipes/"+k]=st[k]; add[k]=st[k]; } });
    if(!Object.keys(patch).length)return;
    setRecipes(prev=>({...prev,...add}));
    writePlan(patch,"recipes");
  };
  // Eintrag der Rezept-Basis ins Kochbuch der Familie kopieren (source "klassiker")
  const adoptClassic=async(classic)=>{
    if(!classic||!classic.name) return null;
    const k=recKey(classic.name);
    if(recipes[k]){ showToast("„"+recName(recipes[k],k)+"“ ist schon im Kochbuch."); return k; }
    const {veg,...rest}=classic;
    const key=await saveRecipe(k,{...rest,source:"klassiker"});
    if(key) showToast("„"+classic.name+"“ ins Kochbuch übernommen.");
    return key;
  };
  const deleteRecipe=async(key)=>{
    if(!window.confirm("Rezept '"+recName(recipes[key],key)+"' wirklich löschen?"))return;
    setRecipes(prev=>{const n={...prev};delete n[key];return n;});
    setDetailRecipe(null);setEditMode(false);setEditData(null);
    writePlan({["recipes/"+key]:null},"recipes");
    if(images[key]){
      setImages(prev=>{const n={...prev};delete n[key];return n;});
      if(!(await fbPatch("recipeImages/"+codeRef.current,{[key]:null}))) failWrite("Bild konnte nicht gelöscht werden.");
    }
  };

  // IMPORT - Text oder Foto einer Rezeptseite (extract, woertlich) oder Foto eines fertigen Gerichts (suggest, KI-Vorschlag)
  // args: {mode:"text"|"photo"|"dish", text, image:{base64, mimeType}}
  const extractRecipe=async(args)=>{
    const a=args||{}; const mode=a.mode||"text";
    if(extracting) return;
    if(mode==="text"&&!(a.text||"").trim()) return;
    if(mode!=="text"&&!(a.image&&a.image.base64)) return;
    setExtracting(true);setImportErr("");setExtracted(null);
    try{
      const imgPart=a.image?{type:"image",source:{type:"base64",media_type:a.image.mimeType||"image/jpeg",data:a.image.base64}}:null;
      if(mode==="dish"){
        // Fertiges Gericht: bekanntes Gericht benennen -> KI-Vorschlag, als solcher gekennzeichnet
        const messages=[{role:"user",content:[imgPart,{type:"text",text:"Welches bekannte Gericht ist auf dem Bild zu sehen? Nenne den gebräuchlichen Namen, die Herkunft und ein typisches Rezept dazu. Antworte ausschließlich mit dem JSON-Objekt."}]}];
        const parsed=parseJsonBlock(await callAI({mode:"suggest",system:buildSuggestPrompt(),messages}));
        setExtracted(suggestionFromAnswer(parsed,{}));
      }else{
        const messages=mode==="photo"
          ? [{role:"user",content:[imgPart,{type:"text",text:"Schreibe das Rezept auf diesem Bild wörtlich ab. Antworte ausschließlich mit dem JSON-Objekt, kein anderer Text."}]}]
          : [{role:"user",content:"Schreibe dieses Rezept ab:\n\n"+a.text}];
        const parsed=parseJsonBlock(await callAI({mode:"extract",system:buildExtractPrompt(),messages}));
        if(!parsed.name) throw new Error("Kein Rezeptname erkannt");
        if(!Array.isArray(parsed.ingredients)||parsed.ingredients.length===0) throw new Error("Keine Zutaten erkannt");
        let stepsGenerated=parsed.stepsGenerated===true;
        // Fehlen die Schritte ganz, einmal nachgenerieren lassen - und als ergaenzt kennzeichnen
        if(!Array.isArray(parsed.steps)||parsed.steps.length===0){
          const stepSystem="Erstelle eine detaillierte Schritt-für-Schritt-Kochanleitung. Antworte NUR mit JSON-Array ohne Markdown: [\"Schritt 1\",\"Schritt 2\"]";
          const stepRaw=await callAI({mode:"extract",system:stepSystem,messages:[{role:"user",content:"Rezept: "+parsed.name+"\nZutaten: "+parsed.ingredients.join(", ")}]});
          let steps; try{ steps=parseJsonBlock(stepRaw,"array"); }catch(e){ steps=["Zubereitung laut Rezept."]; }
          parsed.steps=steps; stepsGenerated=true;
        }
        const sv=parseInt(parsed.servings,10), mn=parseInt(parsed.minutes,10);
        setExtracted({
          name:String(parsed.name).trim(),ingredients:parsed.ingredients.map(String),steps:parsed.steps.map(String),description:parsed.description||"",
          category:CATS.includes(parsed.category)?parsed.category:"Hauptgericht",cuisine:CUISINE_LIST.includes(parsed.cuisine)?parsed.cuisine:"International",
          servings:sv>0?sv:4,minutes:mn>0?mn:"",origin:typeof parsed.origin==="string"?parsed.origin:"",sourceNote:"",stepsGenerated,ai:false,
        });
      }
    }catch(e){
      console.error("Extract error:",e);
      const msg = (e && e.message) ? e.message : "Unbekannter Fehler";
      setImportErr(kiErrText(msg)||("Fehler: "+msg+". Bitte Text oder Foto prüfen und erneut versuchen."));
    }
    setExtracting(false);
  };
  // KI-Antwort (Vorschlag) in das Ergebnisobjekt bringen; ohne Herkunft oder gebraeuchlichen Namen = "freie Kombination"
  const suggestionFromAnswer=(parsed,o)=>{
    if(!parsed.name) throw new Error("Kein Rezeptname erhalten");
    if(!Array.isArray(parsed.ingredients)||!parsed.ingredients.length) throw new Error("Keine Zutaten erhalten");
    if(!Array.isArray(parsed.steps)||!parsed.steps.length) throw new Error("Keine Kochanleitung erhalten");
    let name=String(parsed.name).trim();
    if(recipesRef.current[recKey(name)]) name+=" (neu)";                       // vorhandenes Rezept nicht ueberschreiben
    const origin=typeof parsed.origin==="string"?parsed.origin.trim():"", bekanntAls=typeof parsed.bekanntAls==="string"?parsed.bekanntAls.trim():"";
    const freeCombo=!origin||!bekanntAls||/(-[^\s-]+){3,}/.test(name);          // auch Bindestrich-Ketten gelten nicht als Klassiker
    return {
      name,bekanntAls,ingredients:parsed.ingredients.map(String),steps:parsed.steps.map(String),description:parsed.description||"",
      cuisine:CUISINE_LIST.includes(parsed.cuisine)?parsed.cuisine:(o.cuisine&&o.cuisine!=="Egal"?o.cuisine:"International"),
      category:CATS.includes(parsed.category)?parsed.category:(o.category||"Hauptgericht"),
      ai:true,freeCombo,origin,sourceNote:"",servings:parseInt(parsed.servings,10)||4,minutes:parseInt(parsed.minutes,10)||"",stepsGenerated:false,
      genutzt:Array.isArray(parsed.genutzt)?parsed.genutzt:[],
      fehlt:Array.isArray(parsed.fehlt)?parsed.fehlt:[],
    };
  };

  // Erkanntes Rezept / KI-Vorschlag ins Kochbuch uebernehmen.
  // Gibt es den Namen schon (Import), entscheidet die Ansicht: opts.replace (Bewertung, Notizen, Kochhistorie bleiben) oder opts.copy.
  // Liefert true, wenn gespeichert wurde, "exists", wenn eine Entscheidung noetig ist.
  const saveExtracted=async(opts)=>{
    const o=opts||{};
    if(!extracted||!extracted.name)return false;
    let name=String(extracted.name).trim();
    const exists=!!recipes[recKey(name)];
    if(exists&&!extracted.ai&&!o.replace&&!o.copy) return "exists";
    if(exists&&o.copy){ let i=2, base=name; name=base+" (Kopie)"; while(recipes[recKey(name)]){ name=base+" (Kopie "+(i++)+")"; } }
    const key=await saveRecipe(name,{
      name,ingredients:extracted.ingredients||[],steps:extracted.steps||[],description:extracted.description||"",
      cuisine:extracted.cuisine||"International",category:extracted.category||"Hauptgericht",
      source:extracted.ai?"ki":"import",origin:(extracted.origin||"").trim(),sourceNote:(extracted.sourceNote||"").trim(),stepsGenerated:!!extracted.stepsGenerated,
      servings:parseInt(extracted.servings,10)||4,minutes:parseInt(extracted.minutes,10)||null,
    },{keepMeta:exists&&o.replace});
    if(!key)return false;
    if(extracted.ai){ setExtracted(null); openRecipe(key); return true; }   // KI-Vorschlag: direkt zum Rezept (Kochmodus)
    setSavedMsg(true);
    setTimeout(()=>{setSavedMsg(false);setExtracted(null);},2000);
    return true;
  };

  // HAUSHALTSBUCH verbinden / laden / trennen (nur GET auf das Buch, Verknuepfung im Plan)
  const loadHb=async(link)=>{
    const l=link||hbLink;
    if(!l)return;
    setHbLoading(true);setHbErr("");
    const bk=await hbGet(l.code);
    setHbLoading(false);
    if(bk===undefined){setHbErr("Haushaltsbuch gerade nicht erreichbar.");return;}
    if(!bk){setHbErr("Das verknüpfte Haushaltsbuch wurde nicht gefunden.");setHbBook(null);return;}
    setHbBook(bk);
  };
  const connectHb=async(codeArg)=>{
    const c=String(codeArg||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!HB_CODE_RE.test(c)){setHbErr("Der Code hat 6 bis 16 Zeichen (Buchstaben und Ziffern).");return false;}
    setHbLoading(true);setHbErr("");
    const bk=await hbGet(c);
    setHbLoading(false);
    if(bk===undefined){setHbErr("Haushaltsbuch nicht erreichbar. Code prüfen oder später erneut versuchen.");return false;}
    if(!bk){setHbErr("Kein Haushaltsbuch mit diesem Code gefunden.");return false;}
    const link={code:c,cat:pickFoodCat(bk)};   // Rubrik wird automatisch gewaehlt, kein Dropdown mehr
    setHbLink(link);setHbBook(bk);
    writePlan({hb:link},"people");
    return true;
  };
  const setHbCat=(cat)=>{
    const link={...hbLink,cat};
    setHbLink(link);
    writePlan({hb:link},"people");
  };
  // "Nicht mehr da": Position aus der Vorratsliste streichen, gilt bis zum naechsten Einkauf nach heute (plans/<code>/hb/gone)
  const markGone=(key)=>{
    if(!hbLink)return;
    const gk=goneKey(key); if(!gk)return;
    const day=todayISO();
    setHbLink(prev=>prev?{...prev,gone:{...(prev.gone||{}),[gk]:day}}:prev);
    writePlan({["hb/gone/"+gk]:day},"people");
  };
  const clearGone=()=>{
    if(!hbLink)return;
    setHbLink(prev=>prev?{...prev,gone:undefined}:prev);
    writePlan({"hb/gone":null},"people");
  };
  const disconnectHb=()=>{
    if(!window.confirm("Verknüpfung zum Haushaltsbuch trennen? (Das Haushaltsbuch selbst bleibt unverändert.)"))return;
    setHbLink(null);setHbBook(null);setHbErr("");
    writePlan({hb:null},"people");
  };
  // EINSTELLUNGEN des Plans (z. B. aiImages)
  const setSetting=(name,value)=>{
    setSettings(prev=>({...prev,[name]:value}));
    writePlan({["settings/"+name]:value},"people");
  };

  // BEKANNTES GERICHT FINDEN (KI) - auf Basis des wahrscheinlichen Bestands aus dem Haushaltsbuch; args {fast, kids, cuisine}
  const suggestRecipe=async(args)=>{
    const o=args||{};
    if(aiBusy)return;
    setAiBusy(true);setAiErr("");
    try{
      const items=stock.filter(s=>s.p>=0.25).slice(0,50);
      const fmt=(arr)=>arr.map(s=>s.name+" ("+Math.round(s.p*100)+" %)").join(", ");
      const hi=items.filter(s=>s.p>=0.6), mid=items.filter(s=>s.p>=0.4&&s.p<0.6), lo=items.filter(s=>s.p<0.4);
      const category=o.kids?"Kinderessen":o.fast?"Schnelle Küche":"Hauptgericht";
      const wishes=[
        o.fast?"SCHNELL: in höchstens 25 Minuten komplett fertig.":"",
        o.kids?"KINDERESSEN: mild (nicht scharf), einfach, ohne Alkohol, ein Gericht, das Kinder gern essen.":"",
        o.cuisine&&o.cuisine!=="Egal"?"KÜCHE: "+o.cuisine+".":"",
      ].filter(Boolean);
      let user;
      if(items.length){
        user="Lebensmittel laut Einkäufen im Haushaltsbuch. Die Prozentzahl ist die Wahrscheinlichkeit, dass noch etwas davon da ist (ältere und frische Einkäufe verblassen schneller). "+
          "Die Namen stammen von Kassenbons und können abgekürzt sein – schreibe im Rezept normale Zutatennamen.\n\n"+
          (hi.length?"SEHR WAHRSCHEINLICH DA: "+fmt(hi)+"\n":"")+
          (mid.length?"VERMUTLICH DA: "+fmt(mid)+"\n":"")+
          (lo.length?"VIELLEICHT NOCH DA: "+fmt(lo)+"\n":"")+
          "IMMER VORHANDEN: "+BASIC_LABEL+"\n\n"+
          "Regeln:\n1. Wähle ein bekanntes Gericht, das vor allem aus SEHR WAHRSCHEINLICH DA besteht.\n2. VIELLEICHT-Zutaten nur ergänzend.\n"+
          "3. Bevorzuge frische Zutaten mit hoher Wahrscheinlichkeit, die bald verderben (Obst, Gemüse, Fleisch, Fisch, Milchprodukte), damit sie verbraucht werden.\n"+
          "4. Höchstens 3 Zutaten, die NICHT in der Liste stehen – diese ins Feld \"fehlt\" (Basics nicht aufführen).\n"+
          "5. In \"genutzt\" die verwendeten Lebensmittel aus der Liste.\n";
      }else{
        user="Es liegen keine Einkaufsdaten vor. Nenne ein bekanntes Gericht mit üblichen Zutaten; \"genutzt\" und \"fehlt\" bleiben leer.\n";
      }
      if(wishes.length) user+="\nWünsche: "+wishes.join(" ")+"\n";
      const names=Object.keys(recipes).slice(0,80).map(k=>recName(recipes[k],k));
      if(names.length) user+="\nBitte nicht eines dieser vorhandenen Rezepte wiederholen: "+names.join(", ")+".";
      const parsed=parseJsonBlock(await callAI({mode:"suggest",system:buildSuggestPrompt(),messages:[{role:"user",content:user}]}));
      setExtracted(suggestionFromAnswer(parsed,{cuisine:o.cuisine,category}));
      setImportErr("");setView("recipes");
      setTimeout(()=>{ const el=document.getElementById("ki-vorschlag"); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); },60);
    }catch(e){
      console.error("Suggest error:",e);
      const msg=(e&&e.message)?e.message:"Unbekannter Fehler";
      setAiErr(kiErrText(msg)||("Fehler: "+msg+". Bitte erneut versuchen."));
    }
    setAiBusy(false);
  };

  // REZEPT BEARBEITEN
  const startEdit=(key)=>{
    const rec=recipes[key];
    if(!rec)return;
    setEditData({name:recName(rec,key),ingredients:[...rec.ingredients],steps:[...rec.steps],description:rec.description||"",cuisine:rec.cuisine||"International",category:recCat(rec),
      servings:rec.servings||4,minutes:rec.minutes||"",origin:rec.origin||"",sourceNote:rec.sourceNote||""});
    setEditMode(true);
  };
  // Speichern: nur die editierten Felder als Feld-PATCH (Bewertung, Notizen, Kochhistorie anderer Geraete bleiben).
  // Beim Umbenennen: altes Rezept frisch lesen, mit den Editorfeldern zusammenfuehren, unter dem neuen Schluessel schreiben,
  // altes loeschen, Bild mitnehmen und alle Planzellen (frisch gelesen) auf den neuen Schluessel umstellen.
  const saveEdit=async()=>{
    if(!editData||!detailRecipe)return;
    const oldKey=detailRecipe, code=codeRef.current;
    const name=(editData.name||"").trim()||recName(recipes[oldKey],oldKey);
    const newKey=recKey(name)||oldKey;
    if(newKey!==oldKey&&recipes[newKey]){ window.alert("Ein Rezept mit diesem Namen gibt es schon."); return; }
    const servings=parseInt(editData.servings,10), minutes=parseInt(editData.minutes,10);
    const fields={name,ingredients:editData.ingredients.filter(x=>x.trim()),steps:editData.steps.filter(x=>x.trim()),description:editData.description||"",cuisine:editData.cuisine,category:editData.category,
      servings:servings>0?servings:4,minutes:minutes>0?minutes:null,origin:(editData.origin||"").trim(),sourceNote:(editData.sourceNote||"").trim()};
    const now=Date.now();
    if(newKey===oldKey){
      setRecipes(prev=>prev[oldKey]?{...prev,[oldKey]:{...prev[oldKey],...fields,updatedAt:now}}:prev);
      setEditMode(false);setEditData(null);
      if(await recipeGone(oldKey)) return;
      const patch={["recipes/"+oldKey+"/updatedAt"]:now};
      Object.keys(fields).forEach(f=>{ patch["recipes/"+oldKey+"/"+f]=fields[f]; });
      writePlan(patch,"recipes");
      return;
    }
    // Umbenennen
    const [srv,allWeeks]=await Promise.all([code?fbGet("plans/"+code+"/recipes/"+oldKey):undefined,code?fbGet("plans/"+code+"/weeks"):undefined]);
    if(srv===null){ await recipeGone(oldKey); return; }
    const old=srv&&typeof srv==="object"?normalizeRecipe(oldKey,srv):(recipes[oldKey]||{});
    const rec={...old,...fields,updatedAt:now};
    const patch={["recipes/"+newKey]:rec,["recipes/"+oldKey]:null};
    const parts=["recipes"];
    const ws=allWeeks&&typeof allWeeks==="object"?allWeeks:weeks;
    const localWeeks={};
    Object.keys(asObj(ws)).forEach(wk=>{
      const w=normalizeWeek(ws[wk]); let touched=false;
      Object.keys(w).forEach(day=>Object.keys(w[day].meals).forEach(meal=>{
        const arr=w[day].meals[meal];
        if(arr.includes(oldKey)){ const n=[...new Set(arr.map(d=>d===oldKey?newKey:d))]; w[day].meals[meal]=n; patch["weeks/"+wk+"/"+day+"/meals/"+meal]=n; touched=true; }
      }));
      if(touched) localWeeks[wk]=w;
    });
    if(Object.keys(localWeeks).length) parts.push("weeks");
    setRecipes(prev=>{ const n={...prev}; delete n[oldKey]; n[newKey]=rec; return n; });
    setWeeks(prev=>{ const n={...prev}; Object.keys(localWeeks).forEach(wk=>{ if(n[wk]||wk===weekKey||wk===curWeekKey) n[wk]=localWeeks[wk]; }); return n; });
    setDetailRecipe(newKey);
    setEditMode(false);setEditData(null);
    writePlan(patch,parts);
    if(images[oldKey]){
      const img=images[oldKey];
      setImages(prev=>{const n={...prev};delete n[oldKey];n[newKey]=img;return n;});
      if(!(await fbPatch("recipeImages/"+code,{[oldKey]:null,[newKey]:img}))) failWrite("Bild konnte beim Umbenennen nicht übertragen werden.");
    }
  };

  // EIGENES REZEPTBILD hochladen / zuruecksetzen (recipeImages/<CODE>/<recKey>)
  const uploadImage=async(key,file)=>{
    if(!file||!key)return false;
    try{
      const c=await compressImageToBase64(file,{maxEdge:900,quality:0.72});
      if(c.previewUrl) URL.revokeObjectURL(c.previewUrl);
      const dataUrl="data:"+(c.mimeType||"image/jpeg")+";base64,"+c.base64;
      if(dataUrl.length>1500000){window.alert("Das Bild ist auch komprimiert noch zu groß. Bitte ein kleineres Foto wählen.");return false;}
      setImages(prev=>({...prev,[key]:dataUrl}));
      const ok=await fbPatch("recipeImages/"+codeRef.current,{[key]:dataUrl});
      if(!ok){ failWrite("Bild konnte nicht in der Cloud gespeichert werden."); window.alert("Das Bild wird angezeigt, konnte aber NICHT in der Cloud gespeichert werden (nach Neuladen weg)."); }
      return ok;
    }catch(e){window.alert("Bild konnte nicht verarbeitet werden.");return false;}
  };
  const resetImage=async(key)=>{
    if(!key)return;
    setImages(prev=>{const n={...prev};delete n[key];return n;});
    const ok=await fbPatch("recipeImages/"+codeRef.current,{[key]:null});
    if(!ok) failWrite("Zurücksetzen des Bilds konnte nicht gespeichert werden.");
  };

  // PDF (Druckdialog -> "Als PDF speichern"); Bilder nur eigene Fotos oder - bei aiImages - Symbolbilder
  const openPrint=(html)=>{
    const w=window.open("","_blank");
    if(!w){ showToast("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(()=>{w.print();},1000);
  };
  const downloadRecipePDF=(key)=>{ const rec=recipes[key]; if(rec) openPrint(makeRecipePDF(key,rec,images[key],settings.aiImages)); };
  const downloadPDF=()=>openPrint(makeCookbookPDF(recipes,images,settings.aiImages));

  // CLOSE DROPDOWNS
  useEffect(()=>{
    const h=(e)=>{
      if(cellRef.current&&!cellRef.current.contains(e.target)){setActiveCell(null);setOpenCat(null);}
      if(cookRef.current&&!cookRef.current.contains(e.target))setCookPicker(null);
    };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // Notiz-Entwurf laden, wenn ein Rezept geoeffnet wird; Detail schliessen, wenn das Rezept (anderswo) verschwunden ist
  useEffect(()=>{
    if(detailRecipe&&recipes[detailRecipe]) setNoteDraft(recipes[detailRecipe].notes||"");
  },[detailRecipe]);
  useEffect(()=>{
    if(screen==="app"&&detailRecipe&&!recipes[detailRecipe]){ setDetailRecipe(null); setEditMode(false); setEditData(null); setCookMode(false); setRateAfterCook(false); }
  },[recipes,detailRecipe,screen]);

  // SCHRIFTZOOM auf die ganze App anwenden (body-Ebene erfasst alle Ansichten)
  useEffect(()=>{
    document.body.style.zoom=fontZoom;
    try{ localStorage.setItem(ZOOM_KEY,String(fontZoom)); }catch(e){}
  },[fontZoom]);
  const zoom=(d)=>setFontZoom(z=>Math.min(1.4,Math.max(0.8,Math.round((z+d)*10)/10)));

  // Sync-Schutz: offene Planzelle, Einkaufszeile oder Rezept-Editor -> der Teil wird nicht vom Server ueberschrieben
  editingRef.current = {cell:activeCell!==null, shop:editShopId!==null, recipe:editMode};

  // ZURUECK-TASTE: schliesst die oberste offene Ebene statt aus der App zu fliegen.
  // Ansichten registrieren eigene Dialoge (Woche abschliessen, Menue, Wochenplan-Auswahl) ueber registerBackHandler.
  // handleBackRef wird bei jedem Render aktualisiert, damit der popstate-Listener immer den aktuellen Zustand sieht.
  const registerBackHandler=useCallback((fn)=>{ backHandlers.current.push(fn); return ()=>{ backHandlers.current=backHandlers.current.filter(f=>f!==fn); }; },[]);
  handleBackRef.current=()=>{
    for(let i=backHandlers.current.length-1;i>=0;i--){ if(backHandlers.current[i]()) return true; }
    if(activeCell!==null){ setActiveCell(null); setOpenCat(null); return true; }
    if(cookPicker!==null){ setCookPicker(null); return true; }
    if(rateAfterCook){ setRateAfterCook(false); return true; }
    if(cookMode){ setCookMode(false); return true; }
    if(editMode){ setEditMode(false); setEditData(null); return true; }
    if(detailRecipe){ setDetailRecipe(null); return true; }
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
        showToast("Nochmal „Zurück“ drücken zum Verlassen",2500);
        window.history.pushState({wp:1},"");
        setTimeout(()=>{exitArmedRef.current=false;},2500);
      }
    };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[screen]);

  // HEUTE / EINKAUF: Buch beim Oeffnen des Reiters laden (nicht im 10s-Poll), Bestand + Rangliste berechnen
  useEffect(()=>{
    if((view==="heute"||view==="shopping")&&hbLink&&!hbBook&&!hbLoading) loadHb(hbLink);
  },[view,hbLink&&hbLink.code]);
  useEffect(()=>{ try{ localStorage.setItem(HEUTE_CAT_KEY,heuteCat); }catch(e){} },[heuteCat]);
  const stock=useMemo(()=>hbStock(hbBook,hbLink&&hbLink.cat,hbLink&&hbLink.gone),[hbBook,hbLink]);
  // Rangliste (Bauplan Abschnitt 7): "Bewaehrt" = gekocht und >= 3 Sterne, "Schnell" = <= 30 Min. oder Rubrik,
  // Fruehstueck erscheint nach 11 Uhr nur ueber den eigenen Chip
  const heuteFilter=(r,c)=>{
    const skip=["Beilagen & Salate","Soßen & Dips"];
    const lateForBreakfast=new Date().getHours()>=11;
    const general=!skip.includes(c)&&!(lateForBreakfast&&c==="Frühstück");
    if(heuteCat==="all") return general;
    if(heuteCat==="proven") return general&&isProven(r);
    if(heuteCat==="Schnelle Küche") return c==="Schnelle Küche"||(r.minutes>0&&r.minutes<=30&&general);
    return c===heuteCat;
  };
  const ranked=useMemo(()=>{
    if(view!=="heute") return [];
    return Object.keys(recipes)
      .filter(n=>heuteFilter(recipes[n],recCat(recipes[n])))
      .map(n=>({name:n,...scoreRecipe(recipes[n],stock)}))
      // mit Haushaltsbuch zuerst nach Wahrscheinlichkeit (Abdeckung), dann nach Punktzahl; ohne nur nach Punktzahl
      .sort((a,b)=>(stock.length?(b.cov-a.cov):0)||(b.score-a.score));
  },[view,recipes,stock,heuteCat]);
  // Aus der Rezept-Basis: Eintraege, die noch nicht im Kochbuch sind, nach Wahrscheinlichkeit (taeglich rotierend bei Gleichstand).
  // Leeres Kochbuch: die ganze Basis, damit man sofort etwas zum Kochen hat; sonst die drei besten.
  const classicPicks=useMemo(()=>{
    if(view!=="heute") return [];
    const dayIdx=Math.floor(Date.now()/86400000);
    const all=CLASSICS
      .filter(c=>!recipes[recKey(c.name)]&&(heuteCat==="proven"?false:heuteFilter(c,c.category)))
      .map((c,i)=>({classic:c,i,...scoreRecipe(c,stock)}))
      .sort((a,b)=>(b.cov-a.cov)||(((a.i+dayIdx)%7)-((b.i+dayIdx)%7))||(a.i-b.i));
    return Object.keys(recipes).length?all.slice(0,3):all;
  },[view,recipes,stock,heuteCat]);
  // HEUTE IM PLAN: Slots des heutigen Tages aus der aktuellen Woche, aktueller Slot zuerst
  const todayPlan=useMemo(()=>{
    const d=normalizeWeek(weeks[curWeekKey])[todayDayKey()];
    return slotOrderNow().flatMap(meal=>slotList(d&&d.meals[meal]).map(key=>({meal,key})));
  },[weeks,curWeekKey,view]);

  // EINKAUFSLISTE in Bloecken (Bauplan Abschnitt 9): Liste, "Wahrscheinlich da" (stockP >= 0,6), "Vorrat pruefen" (Grundvorrat)
  const shopList=useMemo(()=>shoppingList(shopping).map(it=>{ const st=stock.length?ingStatus(it.text,stock):null; return {...it,stockP:st&&!st.basic?st.p:0}; }),[shopping,stock]);
  const shopMain=useMemo(()=>shopList.filter(it=>isListed(it)&&(it.forceBuy||it.stockP<0.6)),[shopList]);
  const shopLikely=useMemo(()=>shopList.filter(it=>isListed(it)&&!it.forceBuy&&it.stockP>=0.6),[shopList]);
  const shopBasics=useMemo(()=>shopList.filter(it=>it.basic&&!it.forceBuy),[shopList]);
  const shopGroups=useMemo(()=>groupShopping(shopMain),[shopMain]);
  const unchecked=shopMain.filter(x=>!x.checked).length;
  const addedSlots=useMemo(()=>addedSlotKeys(shopping),[shopping]);
  // Liste teilen: Klartext ueber navigator.share, sonst Zwischenablage
  const shareShopping=async()=>{
    const text=shoppingText([...shopMain,...shopLikely]);
    if(!text){ showToast("Die Einkaufsliste ist leer."); return; }
    try{
      if(navigator.share){ await navigator.share({title:"Einkaufsliste",text}); return; }
      await navigator.clipboard.writeText(text); showToast("Einkaufsliste in die Zwischenablage kopiert.");
    }catch(e){ if(e&&e.name!=="AbortError") showToast("Teilen nicht möglich."); }
  };

  const curRec=detailRecipe?recipes[detailRecipe]:null;

  // Code in die Zwischenablage, kurz "KOPIERT" zeigen
  const copyCode=()=>{try{navigator.clipboard.writeText(activeCode);}catch(e){}setCodeCopied(true);setTimeout(()=>setCodeCopied(false),2000);};
  // Rezept oeffnen: Detailansicht frisch (Schritt 0, kein Kochmodus, kein Editor)
  const openRecipe=(key)=>{setDetailRecipe(key);setCookStep(0);setCookMode(false);setEditMode(false);setEditData(null);};
  // Kochmodus "Fertig": Kochdatum eintragen, Bewertungsdialog oeffnen
  const finishCook=()=>{markCooked(detailRecipe,todayISO());setCookMode(false);setCookStep(0);setRatingDraft((curRec&&curRec.rating)||0);setNoteDraft((curRec&&curRec.notes)||"");setRateAfterCook(true);};
  // Bewertungsdialog speichern (Bewertung + Notiz in einem Feld-PATCH)
  const saveRating=()=>{ patchRecipe(detailRecipe,{rating:ratingDraft,notes:noteDraft}); setRateAfterCook(false); };

  // ZUSTAND (state) UND AKTIONEN (api) fuer die Ansichten - Namen aus Bauplan Abschnitt 12.
  const state={
    code:activeCode,userName,participants,hbLink,hbBook,hbLoading,hbErr,stock,settings,household,
    weekKey,week,curWeekKey,todayPlan,today:todayISO(),recipes,images,shopping,shopList,shopMain,shopLikely,shopBasics,shopGroups,unchecked,addedSlots,classics:CLASSICS,classicPicks,ranked,heuteCat,
    syncOk,syncErr,lastSync,fontZoom,aiBusy,aiErr,toast,isLocalDev,
    importState:{importErr,extracting,extracted,savedMsg},
    // Rahmen und Dialoge
    view,activeCell,cellInput,openCat,cookPicker,codeCopied,editShopId,editShopText,
    detailRecipe,curRec,editMode,editData,cookStep,cookMode,rateAfterCook,ratingDraft,noteDraft,
    joinState:{myCode,joinInput,nameInput,nameHint,joinErr,joinOffer,joinBusy},
  };
  const api={
    // Plan
    setWeekKey:selectWeek,addDish,removeDish,setCook,copyLastWeek,closeWeek,
    // Einkauf
    buildShoppingFromPlan,addShopItem,toggleShopItem,editShopItem,removeShopItem,clearShopping,addRecipeToShopping,forceBuy,shareShopping,
    // Rezepte
    openRecipe,saveRecipe,deleteRecipe,rateRecipe,noteRecipe,markCooked,uploadImage,resetImage,adoptClassic,adoptStarters,
    // KI
    extractRecipe,suggestRecipe,saveExtracted,setExtracted,setImportErr,
    // Haushaltsbuch, Einstellungen, Sitzung
    connectHb,setHbCat,disconnectHb,reloadHb:loadHb,markGone,clearGone,setSetting,zoom,leavePlan,
    // Rahmen
    setView,copyCode,showToast,registerBackHandler,setHeuteCat,
    setActiveCell,setCellInput,setOpenCat,setCookPicker,cellRef,cookRef,
    setEditShopId,setEditShopText,saveShopEdit,
    // Detail, Editor, Kochmodus
    closeRecipe:()=>{setDetailRecipe(null);setEditMode(false);setEditData(null);},setCookStep,setCookMode,startEdit,setEditData,saveEdit,cancelEdit:()=>{setEditMode(false);setEditData(null);},
    downloadRecipePDF,downloadPDF,finishCook,setRateAfterCook,setRatingDraft,setNoteDraft,saveRating,
    // Beitritt
    setNameInput,setJoinInput,startPlan,joinPlan,createWithCode,
  };

  // ANSICHT WAEHLEN
  if(screen==="loading"){
    return(
      <div style={{minHeight:"100vh",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:SF,fontSize:"13px",letterSpacing:"1px"}}>
        Laden...
      </div>
    );
  }
  if(screen==="join") return <Join state={state} api={api} />;
  if(cookMode&&detailRecipe&&curRec) return <CookMode state={state} api={api} />;
  if(detailRecipe&&curRec&&!cookMode) return <RecipeDetail state={state} api={api} />;
  if(screen==="app"){
    return(
      <Shell state={state} api={api}>
        {view==="heute"&&<Heute state={state} api={api} />}
        {view==="plan"&&<Plan state={state} api={api} />}
        {view==="shopping"&&<Shopping state={state} api={api} />}
        {view==="recipes"&&<Recipes state={state} api={api} />}
      </Shell>
    );
  }
  return null;
}
