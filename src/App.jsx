import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { C, SF } from "./theme.js";
import { CUISINE_LIST, CATS, TAGS, BASIC_LABEL } from "./data.js";
import { fbGet, fbPatch, hbLoad, HB_CODE_RE, CODE_RE, randCode, normCode, fbDelete, ensureMember, dropMember, activity, storePhoto, removePhoto, photoAsDataUrl, ablage } from "./fb.js";
import { isDataUrl } from "./ablage.js";
import { callAI, kiErrText, buildExtractPrompt, buildSuggestPrompt, buildPantryPrompt, buildAliasPrompt, buildShoppingVoicePrompt, audioMessage, parseJsonBlock, compressImageToBase64 } from "./ai.js";
import { spokenItems } from "./logic/voice.js";
import { makeRecipePDF, makeCookbookPDF } from "./pdf.js";
import { buildStock, learnHalfLives, ingStatus, pickFoodCat, goneKey, guessGroup, STOCK_GROUPS, hbRawNames, shopStockId, shopStockItem, cookUse, goneUse, staleUsed } from "./logic/stock.js";
import { vocabulary, resolveName, unmappedNames, parseAliasAnswer, aliasKey } from "./logic/alias.js";
import { todayISO } from "./logic/weeks.js";
import { pickList, pickItems, newPickId } from "./logic/picks.js";
import { recKey, recName, recCat, normalizeRecipe, normalizeRecipes, addCooked, starterRecipes, ghostKeys } from "./logic/recipes.js";
import { newShopId, makeShopItem, shoppingList, nextOrder, migrateShopping, groupShopping, addIngredients, mergeShopping, scaledIngredients, shoppingText, orphanIds, isListed, onlyNeeded, checkedIds, findOpenItem } from "./logic/shopping.js";
import { shopCat, ingKey, parseIng } from "./logic/ingredients.js";
import { exportCookbook, cookbookFileName, recipeFileName, parseCookbook, planImport } from "./logic/cookbook.js";
import { CLASSICS } from "./classics.js";
import Join from "./views/Join.jsx";
import Shell from "./views/Shell.jsx";
import Heute from "./views/Heute.jsx";
import Plan from "./views/Plan.jsx";
import Vorrat from "./views/Vorrat.jsx";
import Shopping from "./views/Shopping.jsx";
import Recipes from "./views/Recipes.jsx";
import RecipeDetail from "./views/RecipeDetail.jsx";
import CookMode from "./views/CookMode.jsx";

// SESSION PERSISTENCE - merkt sich Code + Name, damit man nicht rausfliegt
const SESSION_KEY = "wochenplan_session";
// SCHRIFTZOOM - pro Geraet gespeichert (nicht synchronisiert)
const ZOOM_KEY = "wochenplan_zoom";
// Poll-Takt: nur plans/<CODE>/meta, Teile werden bei geaendertem Zeitstempel nachgeladen
const POLL_MS = 10000;
const DEFAULT_SETTINGS = {};   // aiImages (KI-Symbolbilder eines externen Dienstes) entfernt; alte Werte im Plan werden ignoriert
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
  const [nameHint,setNameHint]       = useState(false);   // "Kochbuch starten" ohne Namen
  const [joinErr,setJoinErr]         = useState("");      // Meldung unter dem Beitritt
  const [joinOffer,setJoinOffer]     = useState("");      // Code, fuer den "Neues Kochbuch anlegen" angeboten wird
  const [joinBusy,setJoinBusy]       = useState(false);
  const [activeCode,setActiveCode]   = useState("");
  const [userName,setUserName]       = useState("");
  const [participants,setParticipants] = useState([]);
  const [settings,setSettings]       = useState(DEFAULT_SETTINGS);
  const [lastSync,setLastSync]       = useState(null);
  const [syncOk,setSyncOk]           = useState(true);
  const [syncErr,setSyncErr]         = useState("");
  const [toast,setToast]             = useState("");      // kurzer Hinweis unten (Zurueck-Taste, geloescht auf anderem Geraet, kopiert)

  // VORGEMERKT: plans/<CODE>/picks/<id> = {key, day, createdAt}
  const [picksRaw,setPicksRaw]       = useState({});
  // VORRAT (eigene Positionen und Dauervorrat): plans/<CODE>/stock = {items:{id:{name,sub,date,src}}, perm:{goneKey:{name,sub}}}
  const [stockRaw,setStockRaw]       = useState({});
  const [recipes,setRecipes]         = useState({});      // plans/<CODE>/recipes/<recKey>
  const [shopping,setShopping]       = useState({});      // plans/<CODE>/shopping/<id>
  const [images,setImages]           = useState({});      // eigene Bilder (recKey -> Link in die Ablage oder alte Data-URL), recipeImages/<CODE>

  const [view,setView]               = useState("heute");

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
  const [aiBusy,setAiBusy]           = useState(false);
  const [aliasBusy,setAliasBusy]     = useState(false);   // KI ordnet gerade Namen zu
  const [aliasErr,setAliasErr]       = useState("");
  const aliasTried=useRef(new Set());                      // in dieser Sitzung schon angefragte Rohnamen (kein Dauerlauf bei Fehlern)
  const [aiErr,setAiErr]             = useState("");

  const syncTimer    = useRef(null);
  const exitArmedRef = useRef(false);
  const handleBackRef= useRef(()=>false);
  const backHandlers = useRef([]);        // von Ansichten registrierte Schliess-Handler (Dialoge, Menue)
  const editingRef   = useRef({shop:false,recipe:false}); // offene Eingaben: der Teil wird nicht vom Server ueberschrieben
  const pendingRef   = useRef(0);         // Anzahl laufender eigener Schreibvorgaenge
  const dirtyRef     = useRef(new Set()); // Teile, deren letztes Schreiben scheiterte: der Poll laedt sie unabhaengig vom Zeitstempel nach
  const metaRef      = useRef({});        // zuletzt GESEHENE Zeitstempel (nur der Poll setzt sie)
  const codeRef      = useRef("");
  const recipesRef   = useRef(recipes);
  const shoppingRef  = useRef(shopping);
  const toastTimer   = useRef(null);
  codeRef.current = activeCode;
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
    setPicksRaw(asObj(data.picks));
    setStockRaw(asObj(data.stock));
    setShopping(Array.isArray(data.shopping)?migrateShopping(data.shopping):asObj(data.shopping));
    setRecipes(normalizeRecipes(asObj(data.recipes)));
    setParticipants(asList(data.participants).filter(Boolean));
    setHbLink(data.hb&&(data.hb.code||data.hb.key)?data.hb:null);
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
    const prev=metaRef.current||{}, ed=editingRef.current, dirty=dirtyRef.current;
    const seen={...prev}; const jobs=[];
    const canApply=()=>pendingRef.current===0&&code===codeRef.current;   // kein eigener Schreibvorgang dazwischen gestartet
    const need=(part)=>meta[part+"UpdatedAt"]!==prev[part+"UpdatedAt"]||dirty.has(part);
    if(need("picks")){
      jobs.push(fbGet("plans/"+code+"/picks").then(pk=>{ if(pk!==undefined&&canApply()){ setPicksRaw(asObj(pk)); seen.picksUpdatedAt=meta.picksUpdatedAt; dirty.delete("picks"); } }));
    }
    if(need("stock")){
      jobs.push(fbGet("plans/"+code+"/stock").then(st=>{ if(st!==undefined&&canApply()){ setStockRaw(asObj(st)); seen.stockUpdatedAt=meta.stockUpdatedAt; dirty.delete("stock"); } }));
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
    syncTimer.current=setInterval(()=>{ pollMeta(code); activity.ping(); },POLL_MS);   // ping: höchstens einmal am Tag "heute aktiv" melden
    activity.ping();
  },[pollMeta]);

  useEffect(()=>()=>{clearInterval(syncTimer.current);clearTimeout(toastTimer.current);},[]);

  // Alte Bilder (recipeImages/<Name>) einzeln nach recipeImages/<CODE>/<key> kopieren; liefert {imgs, ok}
  // Die Wurzel recipeImages ist per Regel nicht lesbar (sonst liessen sich alle Plan-Codes auflisten). Jedes alte Bild
  // wird deshalb einzeln ueber seinen Rezeptnamen geholt; die Namen stehen in globalRecipes (names, sonst hier geladen).
  const copyOldImages = async(code,recipesObj,existing,names)=>{
    if(!names){ const gr=await fbGet("globalRecipes"); if(gr===undefined) return {imgs:{},ok:false}; names=Object.keys(asObj(gr)); }
    const imgs={}; let ok=true;
    for(const name of names){
      const k=recKey(name);
      if(!recipesObj[k]||(existing&&existing[k])) continue;
      const v=await fbGet("recipeImages/"+encodeURIComponent(name));
      if(v===undefined){ ok=false; continue; }
      if(typeof v!=="string"||!v.startsWith("data:")) continue;
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
    const now=Date.now();
    const patch={};
    let shoppingNew=pd.shopping;
    if(Array.isArray(pd.shopping)||!pd.shopping){ shoppingNew=migrateShopping(Array.isArray(pd.shopping)?pd.shopping:[],now); patch.shopping=Object.keys(shoppingNew).length?shoppingNew:null; }
    let recipesNew=asObj(pd.recipes), imgs={}, imgsOk=true;
    if(!pd.recipes){
      const gr=await fbGet("globalRecipes");
      if(gr===undefined) return null;
      recipesNew={};
      Object.keys(asObj(gr)).forEach(name=>{ const k=recKey(name); if(k&&gr[name]&&typeof gr[name]==="object") recipesNew[k]=normalizeRecipe(k,gr[name],now); });
      if(Object.keys(recipesNew).length) patch.recipes=recipesNew;
      const r=await copyOldImages(code,recipesNew,null,Object.keys(asObj(gr))); imgs=r.imgs; imgsOk=r.ok;
    }
    const meta={createdAt:pd.updatedAt||now,updatedAt:now,picksUpdatedAt:now,shoppingUpdatedAt:now,recipesUpdatedAt:now,peopleUpdatedAt:now};
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
    return {...pd,shopping:shoppingNew||{},recipes:recipesNew,meta,settings:settingsNew,_imgs:imgs};
  };

  // BEITRITT - nur bestehende Plaene; create = "Kochbuch starten" / "Neues Kochbuch mit diesem Code anlegen";
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
    // Erst lesen; lehnt die Datenbank ab (Regeln nur für Mitglieder), als Mitglied eintragen und noch einmal lesen
    let pd=await fbGet("plans/"+c), joinedNow=false;
    if(pd===undefined && await ensureMember(c,nm)){ joinedNow=true; pd=await fbGet("plans/"+c); }
    if(pd===undefined) return fail(ERR_NET);
    let data=pd, imgs;
    if(!pd||!pd.meta){
      if(pd&&pd.plan){                                           // Altbestand -> migrieren
        data=await migratePlan(c,pd);
        if(!data) return fail(ERR_NET);
        imgs=data._imgs;
      }else if(o.create&&!o.restore){                            // neuer Plan (nur ausdruecklich)
        const now=Date.now();
        data={participants:[nm],settings:{...DEFAULT_SETTINGS},
              meta:{createdAt:now,updatedAt:now,picksUpdatedAt:now,shoppingUpdatedAt:now,recipesUpdatedAt:now,peopleUpdatedAt:now,imagesMigrated:true}};
        if(!(await fbPatch("plans/"+c,data))) return fail(ERR_NET);
      }else{
        if(joinedNow) dropMember(c);                             // Tippfehler im Code: eigenen Eintrag wieder entfernen
        return fail("Kein Kochbuch mit diesem Code.",o.restore?"":c);
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
    movePhotos(c,imgs);                                          // im Hintergrund: alte Fotos aus der Datenbank in die Ablage (nach codeRef, das der Umzug prüft)
    setJoinBusy(false);
    const member=joinedNow?Promise.resolve(true):ensureMember(c,nm);   // im Hintergrund: Eintrag anlegen oder Namen nachziehen
    // ZULETZT GEÖFFNET - Monat ("2026-11") für die Löschfrist unbenutzter Pläne (Datenschutzerklärung, Abschnitt 6);
    // höchstens ein Schreibzugriff je Plan und Monat, nach dem Mitglieds-Eintrag, weil nur Mitglieder schreiben dürfen
    const month=new Date().toISOString().slice(0,7);
    if(data.lastOpen!==month) member.then(()=>fbPatch("plans/"+c,{lastOpen:month})).catch(()=>{});
    try{ localStorage.setItem(SESSION_KEY,JSON.stringify({code:c,name:nm})); }catch(e){}
    return true;
  };
  // UMZUG DER FOTOS: Fotos, die noch als Base64 in der Datenbank liegen, einzeln in die Ablage (Cloud Storage) legen.
  // Erst wenn die Datei hochgeladen und ihre Größe bestätigt ist UND der Wert in der Datenbank noch derselbe ist,
  // ersetzt der Link die Bilddaten. Ist die Ablage nicht eingerichtet, passiert nichts. Einmal je Plan und Sitzung.
  const movedRef=useRef({});
  const movePhotos=async(c,imgs)=>{
    if(movedRef.current[c]||!ablage.ready()) return;
    movedRef.current[c]=true;
    for(const [k,v] of Object.entries(imgs||{})){
      if(!isDataUrl(v)||codeRef.current!==c) continue;
      const url=await storePhoto(c,v);
      if(!url) { if(!ablage.ready()) break; continue; }
      const cur=await fbGet("recipeImages/"+c+"/"+k);
      if(cur!==v) continue;                                      // inzwischen geändert: nicht überschreiben
      if(await fbPatch("recipeImages/"+c,{[k]:url})) setImages(prev=>prev[k]===v?{...prev,[k]:url}:prev);
    }
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
  // Sitzung beenden: Timer stoppen, lokale Sitzung und Zustand leeren, zurueck zum Start
  const resetSession=()=>{
    clearInterval(syncTimer.current);
    try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
    setActiveCode("");codeRef.current="";setUserName("");setJoinInput("");setJoinErr("");setJoinOffer("");setView("heute");
    setPicksRaw({});setStockRaw({});setShopping({});setRecipes({});setImages({});setParticipants([]);setSettings(DEFAULT_SETTINGS);metaRef.current={};dirtyRef.current=new Set();
    setHbLink(null);setHbBook(null);setHbErr("");
    setDetailRecipe(null);setCookMode(false);setEditMode(false);setEditData(null);setExtracted(null);
    setScreen("join");
  };
  const leavePlan=()=>{
    if(!window.confirm("Plan verlassen? Mit deinem Code kannst du jederzeit zurückkehren."))return;
    resetSession();
  };
  // ENDGUELTIG LOESCHEN: plans/<CODE> und recipeImages/<CODE> bei Firebase entfernen (fuer alle Mitglieder), Bestaetigung durch Eingabe des Codes
  const deletePlan=async()=>{
    const code=codeRef.current; if(!code) return false;
    const typed=window.prompt("Der ganze Plan "+code+" wird endgültig bei Firebase gelöscht – für alle Mitglieder, mit Rezepten, Fotos und Einkaufsliste. Vorher das Kochbuch als PDF sichern!\n\nZum Bestätigen den Plan-Code eingeben:");
    if(typed===null) return false;
    if(normCode(typed)!==code){ window.alert("Der Code stimmt nicht. Es wurde nichts gelöscht."); return false; }
    const photos=Object.values(images||{});   // Links in die Ablage merken, bevor der Plan weg ist
    const ok=await fbDelete("plans/"+code);
    if(!ok){ window.alert("Löschen fehlgeschlagen – keine Verbindung zur Datenbank. Bitte später erneut versuchen."); return false; }
    for(const v of photos) await removePhoto(v);   // Fotodateien in der Ablage
    await fbDelete("recipeImages/"+code);   // Fotos; schlaegt das fehl, bleiben nur Bilddaten ohne Bezug zurueck
    await fbDelete("members/"+code);        // Mitgliederliste zuletzt: bis hierher braucht das Loeschen die Mitgliedschaft
    resetSession();
    window.alert("Alle Daten des Plans wurden gelöscht.");
    return true;
  };

  // VORGEMERKT - picks/<id> = {key, day, createdAt}; jede Aenderung schreibt nur ihren Pfad
  const picks=useMemo(()=>pickList(picksRaw),[picksRaw]);
  const addPick=(key,day)=>{
    if(!key||!recipesRef.current[key]) return false;        // Ref: gilt auch direkt nach dem Uebernehmen aus der Rezept-Basis
    const id=newPickId(), item={key,day:day||"",createdAt:Date.now()};
    setPicksRaw(prev=>({...prev,[id]:item}));
    return writePlan({["picks/"+id]:item},"picks");
  };
  const removePick=(id)=>{
    setPicksRaw(prev=>{ const n={...prev}; delete n[id]; return n; });
    return writePlan({["picks/"+id]:null},"picks");
  };
  const movePick=(id,day)=>{
    setPicksRaw(prev=>prev[id]?{...prev,[id]:{...prev[id],day:day||""}}:prev);
    return writePlan({["picks/"+id+"/day"]:day||""},"picks");
  };
  // Vormerkungen fuer heute zu einem Rezept entfernen (nach dem Kochen)
  const clearTodayPicks=(key)=>{
    const t=todayISO();
    const todays=picks.filter(p=>p.key===key&&p.day===t);
    if(!todays.length) return;
    const patch={}; todays.forEach(p=>{ patch["picks/"+p.id]=null; });
    setPicksRaw(prev=>{ const n={...prev}; todays.forEach(p=>{ delete n[p.id]; }); return n; });
    writePlan(patch,"picks");
  };
  // "Wurde heute gekocht" im Rezept: Kochdatum heute, Vormerkung fuer heute weg, Bewertungsdialog
  // KOCHEN VERBRAUCHT: Frisches aus dem Rezept gilt als aufgebraucht, Kaese, Milch, Butter usw. als halb (stock/used/<goneKey>).
  // Grundvorrat steht nicht im Vorrat, Dauervorrat bleibt. Das laeuft still, ohne Hinweis; ein falscher Abzug laesst sich im Vorrat mit "ist noch da" korrigieren.
  const takeForCooking=(key)=>{
    const rec=recipesRef.current[key]; if(!rec) return;
    const used=(stockRaw&&stockRaw.used)||{};
    const r=cookUse(rec.ingredients,stock,used,todayISO(),Date.now());
    if(!r.names.length) return;
    const patch={};
    staleUsed(used).forEach(gk=>{ if(!r.entries[gk]) patch["stock/used/"+gk]=null; });
    Object.keys(r.entries).forEach(gk=>{ patch["stock/used/"+gk]=r.entries[gk]; });
    setStockRaw(prev=>{ const u={...(prev.used||{})}; Object.keys(patch).forEach(pk=>{ const gk=pk.slice("stock/used/".length); if(patch[pk]===null) delete u[gk]; else u[gk]=patch[pk]; }); return {...prev,used:u}; });
    writePlan(patch,"stock");
  };
  const cookedToday=(key)=>{
    const rec=recipesRef.current[key]; if(!rec) return;
    clearTodayPicks(key);
    takeForCooking(key);
    markCooked(key,todayISO());
    setDetailRecipe(key);setCookStep(0);setCookMode(false);setEditMode(false);setEditData(null);
    setRatingDraft(rec.rating||0);setNoteDraft(rec.notes||"");setRateAfterCook(true);
  };
  // Kochmodus direkt aus Heute starten
  const startCooking=(key)=>{ if(!recipesRef.current[key]) return; setDetailRecipe(key);setEditMode(false);setEditData(null);setCookStep(0);setCookMode(true); };

  // SHOPPING - Objekt <id> -> Posten; jede Aenderung schreibt nur ihren Pfad
  const household=Math.max(2,participants.length);                   // Haushaltsgroesse fuer die Mengen (Bauplan Abschnitt 9)
  // Zutaten eines Rezepts (skaliert auf servings) auf die Liste; opts.slot merkt die Plan-Zelle ("+"-Sperre im Plan)
  // opts.onlyMissing: nur Zutaten, die laut Vorrat nicht da sind (p < 0,6) und kein Grundvorrat; liefert die Anzahl der Posten (0 = nichts)
  const addRecipeToShopping=(dishKey,servings,opts)=>{
    const rec=recipes[dishKey];
    if(!rec||!rec.ingredients||!rec.ingredients.length)return 0;
    let ings=scaledIngredients(rec,servings>0?servings:household);
    if(opts&&opts.onlyMissing) ings=ings.filter(ing=>{ const st=ingStatus(ing,stock); return st&&!st.basic&&st.p<0.6; });
    if(!ings.length) return 0;
    const {next,patch}=addIngredients(shoppingRef.current,ings,{src:"manuell",slot:(opts&&opts.slot)||""});
    if(!Object.keys(patch).length)return 0;
    setShopping(next);
    writePlan(patch,"shopping");
    return ings.length;
  };
  // "Ist da" aus der Zutatenliste eines Rezepts: Zutat als Handeintrag von heute in den Vorrat (Name ohne Menge, Klammern und Zusatz)
  const markIngredientPresent=(ing)=>{
    const name=parseIng(String(ing||"")).name.replace(/\([^)]*\)/g," ").split(",")[0].replace(/\s+/g," ").trim();
    if(!name) return false;
    addStockItems([{name,src:"check"}]);
    return name;
  };
  // Einkaufsliste aus dem Vorgemerkten: ZUSAMMENFUEHREN statt ersetzen
  const buildShoppingFromPicks=()=>{
    // nur Fehlendes: was laut Vorrat da ist (p >= 0,6), kommt nicht neu auf die Liste
    const items=onlyNeeded(pickItems(picks,recipes,undefined,{servings:household,today:todayISO()}),shoppingRef.current,(text)=>{ const st=stock.length?ingStatus(text,stock):null; return !!st&&!st.basic&&st.p>=0.6; });
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
    const patch={["shopping/"+id+"/checked"]:v}, parts=["shopping"];
    // Ohne Haushaltsbuch gilt Abgehaktes als heute gekauft und kommt in den Vorrat; Haken am selben Tag wieder weg = Eintrag wieder weg
    if(!hbLink){
      const sid=shopStockId(id), cur=stockRaw.items&&stockRaw.items[sid];
      const si=v?shopStockItem(it,todayISO(),Date.now()):null;
      if(si){ patch["stock/items/"+sid]=si; parts.push("stock"); setStockRaw(prev=>({...prev,items:{...(prev.items||{}),[sid]:si}})); }
      else if(!v&&cur&&cur.date===todayISO()){ patch["stock/items/"+sid]=null; parts.push("stock"); setStockRaw(prev=>{ const items={...(prev.items||{})}; delete items[sid]; return {...prev,items}; }); }
    }
    writePlan(patch,parts);
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
  // cat (optional): Abteilung vorgeben, damit eine gewaehlte Menge ("1 Glas Honig") den Posten nicht in eine andere Abteilung schiebt
  const editShopItem=async(id,text,cat)=>{
    const txt=String(text||"").trim();
    if(!txt){ removeShopItem(id); return; }                           // leerer Text = Eintrag loeschen
    const fields={text:txt,cat:cat||shopCat(txt),key:ingKey(txt)};
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
  // Nur die abgehakten Posten entfernen (gezielt je Posten). Der Vorrat bleibt, wie er ist: Was beim Abhaken dort eingetragen wurde, bleibt dort.
  const clearCheckedShopping=()=>{
    const ids=checkedIds(shoppingRef.current);
    if(!ids.length)return;
    if(!window.confirm(ids.length===1?"Den abgehakten Posten löschen?":"Die "+ids.length+" abgehakten Posten löschen?"))return;
    setEditShopId(null);
    setShopping(prev=>{const n={...prev};ids.forEach(id=>{delete n[id];});return n;});
    const patch={}; ids.forEach(id=>{patch["shopping/"+id]=null;});
    writePlan(patch,"shopping");
  };
  const addShopItem=(text)=>{
    const txt=String(text||"").trim();
    if(!txt)return;
    // steht die Zutat schon offen auf der Liste, kommt nur ein kurzer Hinweis (kein Doppel)
    const dup=findOpenItem(shoppingRef.current,txt);
    if(dup){ showToast("„"+dup.text+"“ steht schon auf der Liste."); return; }
    const id=newShopId(), item=makeShopItem(txt,{src:"manuell",order:nextOrder(shoppingRef.current)});
    setShopping(prev=>({...prev,[id]:item}));
    writePlan({["shopping/"+id]:item},"shopping");
    return id;                                                        // die Ansicht oeffnet dazu die Mengenauswahl
  };
  // EINKAUFSLISTE PER SPRACHE: Aufnahme -> KI schreibt die Posten; die Ansicht zeigt sie zur Bestaetigung, erst dann addShopTexts
  const dictateShopping=async(audio)=>{
    let texts;
    try{
      texts=spokenItems(parseJsonBlock(await callAI({code:codeRef.current,mode:"extract",system:buildShoppingVoicePrompt(),messages:audioMessage(audio,"Schreibe die Einkaufsliste aus dieser Aufnahme. Antworte ausschließlich mit dem JSON-Objekt.")})));
    }catch(e){
      const msg=(e&&e.message)?e.message:"";
      throw new Error(kiErrText(msg)||("Die KI hat die Aufnahme nicht verstanden. Bitte erneut versuchen oder eintippen."+(msg?" ("+msg.slice(0,120)+")":"")));
    }
    if(!texts.length) throw new Error("Nichts verstanden. Bitte deutlich sprechen, z. B. „zwei Liter Milch, Zwiebeln, Butter“.");
    return texts;
  };
  // Bestaetigte Posten wie eingetippt in die Liste (ein PATCH fuer alle)
  const addShopTexts=(list)=>{
    const texts=(list||[]).map(t=>String(t||"").trim()).filter(Boolean);
    if(!texts.length) return 0;
    let order=nextOrder(shoppingRef.current);
    const patch={}, add={};
    texts.forEach(txt=>{ const id=newShopId(), item=makeShopItem(txt,{src:"manuell",order:order++}); add[id]=item; patch["shopping/"+id]=item; });
    setShopping(prev=>({...prev,...add}));
    writePlan(patch,"shopping");
    return texts.length;
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
      const old=images[key];
      setImages(prev=>{const n={...prev};delete n[key];return n;});
      if(!(await fbPatch("recipeImages/"+codeRef.current,{[key]:null}))) failWrite("Bild konnte nicht gelöscht werden.");
      else removePhoto(old);
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
        const parsed=parseJsonBlock(await callAI({code:codeRef.current,mode:"suggest",system:buildSuggestPrompt(),messages}));
        setExtracted(suggestionFromAnswer(parsed,{}));
      }else{
        const messages=mode==="photo"
          ? [{role:"user",content:[imgPart,{type:"text",text:"Schreibe das Rezept auf diesem Bild wörtlich ab. Antworte ausschließlich mit dem JSON-Objekt, kein anderer Text."}]}]
          : [{role:"user",content:"Schreibe dieses Rezept ab:\n\n"+a.text}];
        const parsed=parseJsonBlock(await callAI({code:codeRef.current,mode:"extract",system:buildExtractPrompt(),messages}));
        if(!parsed.name) throw new Error("Kein Rezeptname erkannt");
        if(!Array.isArray(parsed.ingredients)||parsed.ingredients.length===0) throw new Error("Keine Zutaten erkannt");
        let stepsGenerated=parsed.stepsGenerated===true;
        // Fehlen die Schritte ganz, einmal nachgenerieren lassen - und als ergaenzt kennzeichnen
        if(!Array.isArray(parsed.steps)||parsed.steps.length===0){
          const stepSystem="Erstelle eine detaillierte Schritt-für-Schritt-Kochanleitung. Antworte NUR mit JSON-Array ohne Markdown: [\"Schritt 1\",\"Schritt 2\"]";
          const stepRaw=await callAI({code:codeRef.current,mode:"extract",system:stepSystem,messages:[{role:"user",content:"Rezept: "+parsed.name+"\nZutaten: "+parsed.ingredients.join(", ")}]});
          let steps; try{ steps=parseJsonBlock(stepRaw,"array"); }catch(e){ steps=["Zubereitung laut Rezept."]; }
          parsed.steps=steps; stepsGenerated=true;
        }
        const sv=parseInt(parsed.servings,10), mn=parseInt(parsed.minutes,10);
        setExtracted({
          name:String(parsed.name).trim(),ingredients:parsed.ingredients.map(String),steps:parsed.steps.map(String),description:parsed.description||"",
          category:CATS.includes(parsed.category)?parsed.category:"Hauptgericht",cuisine:CUISINE_LIST.includes(parsed.cuisine)?parsed.cuisine:"International",
          servings:sv>0?sv:4,minutes:mn>0?mn:"",origin:typeof parsed.origin==="string"?parsed.origin:"",sourceNote:"",stepsGenerated,ai:false,tags:[],
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
      category:CATS.includes(parsed.category)?parsed.category:"Hauptgericht",tags:o.tags||[],
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
      servings:parseInt(extracted.servings,10)||4,minutes:parseInt(extracted.minutes,10)||null,tags:(extracted.tags||[]).filter(t=>TAGS.some(x=>x.id===t)),
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
    const r=await hbLoad(l);
    setHbLoading(false);
    if(r.err==="offline"){setHbErr("Haushaltsbuch gerade nicht erreichbar.");return;}
    if(r.err){setHbErr("Das verknüpfte Haushaltsbuch wurde nicht gefunden.");setHbBook(null);return;}
    setHbBook(r.book);
    // Einkaufsauszug gelesen: Schlüssel (und die Rubrik des Auszugs) im Plan merken und den Buch-Code aus dem Plan entfernen.
    // Ohne Code im Plan führt der Plan-Code nicht mehr zu den Finanzdaten.
    if(r.key){
      const patch={};
      if(l.key!==r.key) patch["hb/key"]=r.key;
      if(r.cat&&r.cat!==l.cat) patch["hb/cat"]=r.cat;
      if(l.code) patch["hb/code"]=null;
      if(Object.keys(patch).length){ setHbLink(prev=>{ if(!prev) return prev; const n={...prev,key:r.key,cat:r.cat||prev.cat}; delete n.code; return n; }); writePlan(patch,"people"); }
    }
  };
  const connectHb=async(codeArg)=>{
    const c=String(codeArg||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!HB_CODE_RE.test(c)){setHbErr("Der Code hat 6 bis 16 Zeichen (Buchstaben und Ziffern).");return false;}
    setHbLoading(true);setHbErr("");
    const r=await hbLoad({code:c});
    setHbLoading(false);
    if(r.err==="offline"){setHbErr("Haushaltsbuch nicht erreichbar. Code prüfen oder später erneut versuchen.");return false;}
    if(r.err){setHbErr("Kein Haushaltsbuch mit diesem Code gefunden.");return false;}
    const bk=r.book;
    // Gibt es den Einkaufsauszug, merkt sich der Plan nur dessen Schlüssel, nicht den Buch-Code
    const link=r.key?{key:r.key,cat:r.cat||pickFoodCat(bk)}:{code:c,cat:pickFoodCat(bk)};   // Rubrik wird automatisch gewaehlt, kein Dropdown mehr
    setHbLink(link);setHbBook(bk);
    writePlan({hb:link},"people");
    return true;
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
  // EIGENER VORRAT: Positionen von Hand oder aus dem Speisekammer-Foto, Dauervorrat (Pin), Entfernen
  const addStockItems=(list)=>{
    const now=Date.now(), day=todayISO(), patch={}, add={};
    (list||[]).forEach((it,i)=>{
      const name=String((it&&it.name)||"").trim(); if(!name) return;
      const id=(now+i).toString(36)+Math.random().toString(36).slice(2,6);
      const item={name,sub:STOCK_GROUPS.includes(it.sub)?it.sub:guessGroup(name),date:day,src:it.src==="foto"||it.src==="check"?it.src:"hand",createdAt:now};
      add[id]=item; patch["stock/items/"+id]=item;
    });
    if(!Object.keys(add).length) return false;
    setStockRaw(prev=>({...prev,items:{...(prev.items||{}),...add}}));
    return writePlan(patch,"stock");
  };
  const addStockItem=(name,sub)=>addStockItems([{name,sub,src:"hand"}]);
  // Auffrischen (Haken in der Vorratsliste): "ist heute noch da" - zaehlt wie ein Handeintrag von heute, das Verblassen beginnt neu
  const refreshStock=(item)=>{ const gk=goneKey(item.key); const patch={}; if(hbLink&&hbLink.gone&&hbLink.gone[gk]){ patch["hb/gone/"+gk]=null; setHbLink(prev=>{ if(!prev||!prev.gone) return prev; const g={...prev.gone}; delete g[gk]; return {...prev,gone:g}; }); writePlan(patch,"people"); } return addStockItems([{name:item.name,sub:item.sub,src:"check"}]); };
  const setPermanent=(item,on)=>{
    const gk=(!on&&item.permKey)?item.permKey:goneKey(item.key); if(!gk) return;
    setStockRaw(prev=>{ const perm={...(prev.perm||{})}; if(on) perm[gk]={name:item.name,sub:item.sub||""}; else delete perm[gk]; return {...prev,perm}; });
    return writePlan({["stock/perm/"+gk]:on?{name:item.name,sub:item.sub||""}:null},"stock");
  };
  // x in der Vorratsliste: eigene Positionen loeschen, Dauervorrat aufheben, Haushaltsbuch-Position als "nicht mehr da" streichen
  const removeStock=(item)=>{
    const patch={}, parts=[];
    if(item.ownIds&&item.ownIds.length){ item.ownIds.forEach(id=>{ patch["stock/items/"+id]=null; }); parts.push("stock"); }
    if(item.permanent){ patch["stock/perm/"+(item.permKey||goneKey(item.key))]=null; if(!parts.includes("stock")) parts.push("stock"); }
    if(item.srcs&&item.srcs.includes("hb")&&hbLink){ patch["hb/gone/"+goneKey(item.key)]=todayISO(); parts.push("people"); }
    if(!parts.length) return;
    // Als Verbrauch merken, damit die App auch ohne Haushaltsbuch lernt, wie lange es gehalten hat (nicht beim Dauervorrat)
    const ugk=goneKey(item.key), uEntry=!item.permanent&&ugk&&item.last?goneUse(item,todayISO()):null;
    if(uEntry){ patch["stock/used/"+ugk]=uEntry; if(!parts.includes("stock")) parts.push("stock"); }
    setStockRaw(prev=>{ const items={...(prev.items||{})}, perm={...(prev.perm||{})}, used={...(prev.used||{})}; (item.ownIds||[]).forEach(id=>{ delete items[id]; }); if(item.permanent) delete perm[item.permKey||goneKey(item.key)]; if(uEntry) used[ugk]=uEntry; return {...prev,items,perm,used}; });
    if(patch["hb/gone/"+goneKey(item.key)]) setHbLink(prev=>prev?{...prev,gone:{...(prev.gone||{}),[goneKey(item.key)]:todayISO()}}:prev);
    writePlan(patch,parts);
  };
  // GRAPH: von Hand verschobene Punkte unter stock/layout/<goneKey> = {t, r, at}; Eintraege zu Produkten, die seit 90 Tagen nicht mehr
  // im Vorrat sind, werden beim naechsten Schreiben aufgeraeumt. Zuruecksetzen loescht alle Hand-Lagen.
  const setStockLayout=(key,pos)=>{
    const gk=goneKey(key); if(!gk||!pos) return;
    const now=Date.now(), cur=(stockRaw&&stockRaw.layout)||{}, patch={["stock/layout/"+gk]:{t:pos.t,r:pos.r,at:now}};
    const present=new Set(stock.map(s=>goneKey(s.key)));
    Object.keys(cur).forEach(k=>{ const e=cur[k]; if(k!==gk&&!present.has(k)&&(!e||!(e.at>now-90*86400000))) patch["stock/layout/"+k]=null; });
    setStockRaw(prev=>{ const layout={...(prev.layout||{})}; Object.keys(patch).forEach(pk=>{ const k=pk.slice("stock/layout/".length); if(patch[pk]===null) delete layout[k]; else layout[k]=patch[pk]; }); return {...prev,layout}; });
    return writePlan(patch,"stock");
  };
  const resetStockLayout=()=>{
    setStockRaw(prev=>{ const n={...prev}; delete n.layout; return n; });
    return writePlan({"stock/layout":null},"stock");
  };
  // SPEISEKAMMER-FOTO: erkennbare Lebensmittel per KI auflisten; liefert [{name, sub}] (Gruppe geprueft) oder wirft
  const scanPantry=async(image)=>{
    if(!image||!image.base64) throw new Error("Kein Bild");
    const messages=[{role:"user",content:[{type:"image",source:{type:"base64",media_type:image.mimeType||"image/jpeg",data:image.base64}},{type:"text",text:"Welche Lebensmittel sind auf diesem Foto zu sehen? Antworte ausschließlich mit dem JSON-Objekt."}]}];
    const parsed=parseJsonBlock(await callAI({code:codeRef.current,mode:"extract",system:buildPantryPrompt(STOCK_GROUPS),messages}));
    const items=Array.isArray(parsed)?parsed:(parsed&&Array.isArray(parsed.items)?parsed.items:[]);
    const seen=new Set();
    return items.map(it=>({name:String((it&&(it.name||it.Name))||"").trim(),sub:(it&&(it.gruppe||it.sub))||""})).filter(it=>it.name&&!seen.has(it.name.toLowerCase())&&seen.add(it.name.toLowerCase()))
      .map(it=>({name:it.name,sub:STOCK_GROUPS.includes(it.sub)?it.sub:guessGroup(it.name),src:"foto"}));
  };
  const disconnectHb=()=>{
    if(!window.confirm("Verknüpfung zum Haushaltsbuch trennen? (Das Haushaltsbuch selbst bleibt unverändert.)"))return;
    setHbLink(null);setHbBook(null);setHbErr("");
    writePlan({hb:null},"people");
  };
  // EINSTELLUNGEN des Plans
  const setSetting=(name,value)=>{
    setSettings(prev=>({...prev,[name]:value}));
    writePlan({["settings/"+name]:value},"people");
  };

  // BEKANNTES GERICHT FINDEN (KI) - auf Basis des wahrscheinlichen Bestands; args {fast, kids, cuisine, ingredients (Auswahl im Graph)}
  const suggestRecipe=async(args)=>{
    const o=args||{};
    if(aiBusy)return;
    setAiBusy(true);setAiErr("");
    try{
      const items=stock.filter(s=>s.p>=0.25).slice(0,50);
      const fmt=(arr)=>arr.map(s=>s.name+" ("+Math.round(s.p*100)+" %)").join(", ");
      const hi=items.filter(s=>s.p>=0.6), mid=items.filter(s=>s.p>=0.4&&s.p<0.6), lo=items.filter(s=>s.p<0.4);
      const tags=[o.kids?"kinder":"",o.fast?"schnell":""].filter(Boolean);
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
      const chosen=Array.isArray(o.ingredients)?o.ingredients.map(x=>String(x||"").trim()).filter(Boolean).slice(0,12):[];
      if(chosen.length) user+="\nAUSGEWÄHLT (im Graph angetippt): "+chosen.join(", ")+".\nDas Gericht MUSS alle ausgewählten Lebensmittel verwenden; sie gehören in \"genutzt\".\n";
      // GESPROCHEN (Vorrat-Netz, Mikrofon gehalten): die Aufnahme geht in derselben Anfrage mit, die KI hört die Lebensmittel heraus
      const audio=o.audio&&o.audio.base64?o.audio:null;
      if(audio) user+="\nGESPROCHEN: In der beigefügten Sprachaufnahme sagt die Person, welche Lebensmittel da sind oder verwendet werden sollen. "+
        "Das Gericht MUSS diese Lebensmittel verwenden; sie gehören in \"genutzt\", auch wenn sie oben nicht stehen. "+
        "Schreibe die gehörten Lebensmittel zusätzlich als kurze Namen ins Feld \"gehoert\" (z. B. [\"Hähnchen\",\"Reis\"]). Hörst du keine Lebensmittel, bleibt \"gehoert\" leer und du wählst wie sonst.\n";
      if(wishes.length) user+="\nWünsche: "+wishes.join(" ")+"\n";
      const names=Object.keys(recipes).slice(0,80).map(k=>recName(recipes[k],k));
      if(names.length) user+="\nBitte nicht eines dieser vorhandenen Rezepte wiederholen: "+names.join(", ")+".";
      const parsed=parseJsonBlock(await callAI({code:codeRef.current,mode:"suggest",system:buildSuggestPrompt(),messages:audio?audioMessage(audio,user):[{role:"user",content:user}]}));
      setExtracted(suggestionFromAnswer(parsed,{cuisine:o.cuisine,tags}));
      if(audio){ const heard=spokenItems(parsed&&parsed.gehoert); showToast(heard.length?"Verstanden: "+heard.slice(0,6).join(", ")+(heard.length>6?" …":""):"Keine Lebensmittel verstanden – Vorschlag aus dem Vorrat."); }
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
      servings:rec.servings||4,minutes:rec.minutes||"",origin:rec.origin||"",sourceNote:rec.sourceNote||"",tags:[...(rec.tags||[])]});
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
      servings:servings>0?servings:4,minutes:minutes>0?minutes:null,origin:(editData.origin||"").trim(),sourceNote:(editData.sourceNote||"").trim(),tags:(editData.tags||[]).filter(t=>TAGS.some(x=>x.id===t))};
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
    const [srv,allPicks]=await Promise.all([code?fbGet("plans/"+code+"/recipes/"+oldKey):undefined,code?fbGet("plans/"+code+"/picks"):undefined]);
    if(srv===null){ await recipeGone(oldKey); return; }
    const old=srv&&typeof srv==="object"?normalizeRecipe(oldKey,srv):(recipes[oldKey]||{});
    const rec={...old,...fields,updatedAt:now};
    const patch={["recipes/"+newKey]:rec,["recipes/"+oldKey]:null};
    const parts=["recipes"];
    // Vormerkungen (frisch gelesen) auf den neuen Schluessel umstellen
    const pk=allPicks&&typeof allPicks==="object"?allPicks:picksRaw;
    const pkNext={...asObj(pk)}; let touched=false;
    Object.keys(pkNext).forEach(id=>{ if(pkNext[id]&&pkNext[id].key===oldKey){ pkNext[id]={...pkNext[id],key:newKey}; patch["picks/"+id+"/key"]=newKey; touched=true; } });
    if(touched) parts.push("picks");
    setRecipes(prev=>{ const n={...prev}; delete n[oldKey]; n[newKey]=rec; return n; });
    if(touched) setPicksRaw(pkNext);
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
      const code=codeRef.current, old=images[key];
      setImages(prev=>({...prev,[key]:dataUrl}));
      // Datei in die Ablage (Cloud Storage); geht das nicht, bleibt das Foto wie bisher in der Datenbank
      const url=await storePhoto(code,dataUrl), value=url||dataUrl;
      if(url) setImages(prev=>prev[key]===dataUrl?{...prev,[key]:url}:prev);
      const ok=await fbPatch("recipeImages/"+code,{[key]:value});
      if(ok&&old&&old!==value) removePhoto(old);
      if(!ok){ failWrite("Bild konnte nicht in der Cloud gespeichert werden."); window.alert("Das Bild wird angezeigt, konnte aber NICHT in der Cloud gespeichert werden (nach Neuladen weg)."); }
      return ok;
    }catch(e){window.alert("Bild konnte nicht verarbeitet werden.");return false;}
  };
  const resetImage=async(key)=>{
    if(!key)return;
    const old=images[key];
    setImages(prev=>{const n={...prev};delete n[key];return n;});
    const ok=await fbPatch("recipeImages/"+codeRef.current,{[key]:null});
    if(!ok) failWrite("Zurücksetzen des Bilds konnte nicht gespeichert werden.");
    else if(old) removePhoto(old);
  };

  // PDF (Druckdialog -> "Als PDF speichern"); Bilder: eigene Fotos, sonst die mitgelieferten Bilder der Rezept-Basis
  const openPrint=(html)=>{
    const w=window.open("","_blank");
    if(!w){ showToast("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(()=>{w.print();},1000);
  };
  // KOCHBUCH ALS DATEI (Stufe 4): sichern als JSON (Rezepte mit Bewertung, Notizen, Kochdaten, Fotos) und aus einer Datei laden
  const [cookbookImport,setCookbookImport]=useState(null);   // {recipes, images, exportedAt, count, added, existing, err, busy}
  // key gesetzt: nur dieses eine Rezept (Rezept-Seite, Menue "⋯"); sonst das ganze Kochbuch
  const exportCookbookFile=async(key)=>{
    const one=typeof key==="string"&&key?key:"";
    if(one&&!recipes[one]) return;
    const recs=one?{[one]:recipes[one]}:recipes;
    // Fotos aus der Ablage als Data-URL in die Datei schreiben, damit sie auch ohne diesen Plan lesbar bleibt
    const imgs={};
    for(const k of Object.keys(images||{})) if(recs[k]){ const d=await photoAsDataUrl(images[k]); if(d) imgs[k]=d; }
    const data=exportCookbook(recs,imgs);
    const blob=new Blob([JSON.stringify(data,null,1)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=one?recipeFileName(recipes[one].name||one):cookbookFileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    showToast(one?"Rezept als Datei gesichert.":data.count+(data.count===1?" Rezept":" Rezepte")+" als Datei gesichert.");
  };
  const loadCookbookFile=async(file)=>{
    if(!file) return;
    try{
      const text=await file.text();
      const parsed=parseCookbook(text);
      const keys=Object.keys(parsed.recipes), existing=keys.filter(k=>!!recipesRef.current[k]);
      setCookbookImport({...parsed,added:keys.length-existing.length,existing:existing.length,err:"",busy:false});
    }catch(e){ setCookbookImport({recipes:{},images:{},count:0,added:0,existing:0,err:(e&&e.message)||"Datei konnte nicht gelesen werden.",busy:false}); }
  };
  const confirmCookbookImport=async(mode)=>{
    const imp=cookbookImport; if(!imp||imp.err||imp.busy) return;
    const plan=planImport(recipesRef.current,imp,mode);
    const keys=Object.keys(plan.recipes);
    if(!keys.length){ setCookbookImport(null); showToast("Nichts zu laden: alle Rezepte sind schon da."); return; }
    setCookbookImport(prev=>({...prev,busy:true}));
    const patch={}; keys.forEach(k=>{ patch["recipes/"+k]=plan.recipes[k]; });
    setRecipes(prev=>({...prev,...plan.recipes}));
    await writePlan(patch,"recipes");
    let imgFail=0;
    for(const k of Object.keys(plan.images)){
      const url=await storePhoto(codeRef.current,plan.images[k]), value=url||plan.images[k];
      setImages(prev=>({...prev,[k]:value}));
      if(!(await fbPatch("recipeImages/"+codeRef.current,{[k]:value}))) imgFail++;
    }
    setCookbookImport(null);
    showToast(plan.added.length+" neu"+(plan.replaced.length?", "+plan.replaced.length+" ersetzt":"")+(plan.skipped.length?", "+plan.skipped.length+" übersprungen":"")+(imgFail?" · "+imgFail+" Foto(s) nicht gespeichert":"")+".",4000);
  };
  const downloadRecipePDF=(key)=>{ const rec=recipes[key]; if(rec) openPrint(makeRecipePDF(key,rec,images[key])); };
  const downloadPDF=()=>openPrint(makeCookbookPDF(recipes,images));

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
  editingRef.current = {shop:editShopId!==null, recipe:editMode};

  // ZURUECK-TASTE: schliesst die oberste offene Ebene statt aus der App zu fliegen.
  // Ansichten registrieren eigene Dialoge (Woche abschliessen, Menue, Wochenplan-Auswahl) ueber registerBackHandler.
  // handleBackRef wird bei jedem Render aktualisiert, damit der popstate-Listener immer den aktuellen Zustand sieht.
  const registerBackHandler=useCallback((fn)=>{ backHandlers.current.push(fn); return ()=>{ backHandlers.current=backHandlers.current.filter(f=>f!==fn); }; },[]);
  handleBackRef.current=()=>{
    for(let i=backHandlers.current.length-1;i>=0;i--){ if(backHandlers.current[i]()) return true; }
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

  // HEUTE / VORRAT / EINKAUF: Buch beim Oeffnen des Reiters laden (nicht im 10s-Poll), Bestand berechnen
  useEffect(()=>{
    if((view==="heute"||view==="shopping"||view==="vorrat")&&hbLink&&!hbBook&&!hbLoading) loadHb(hbLink);
  },[view,hbLink&&(hbLink.key||hbLink.code)]);
  // NAMEN NORMIEREN: Vokabular aus Kochbuch + Rezept-Basis, Aufloesung Rohname -> Zutatenname (Hand > KI > Regel), s. src/logic/alias.js
  const vocab=useMemo(()=>vocabulary(recipes,CLASSICS),[recipes]);
  const aliasMap=stockRaw.alias||{};
  const resolve=useMemo(()=>{ const ctx={alias:aliasMap,vocab}; const cache={}; return (raw)=>{ if(!(raw in cache)) cache[raw]=resolveName(raw,ctx); return cache[raw]; }; },[aliasMap,vocab]);
  // Gelernte Halbwertszeiten aus den Kaufabstaenden (und x-Streichungen), dann die zusammengefuehrte Vorratsliste
  const learned=useMemo(()=>learnHalfLives(hbBook,hbLink&&hbLink.cat,hbLink&&hbLink.gone,undefined,resolve,{items:stockRaw.items,used:stockRaw.used}),[hbBook,hbLink,resolve,stockRaw.items,stockRaw.used]);
  const stock=useMemo(()=>buildStock({book:hbBook,cat:hbLink&&hbLink.cat,gone:hbLink&&hbLink.gone,items:stockRaw.items,perm:stockRaw.perm,used:stockRaw.used,learned,resolve}),[hbBook,hbLink,stockRaw,learned,resolve]);
  // Rohnamen ohne Zuordnung (Haushaltsbuch + eigene Positionen) - die gehen gebuendelt an die KI, jede nur einmal je Sitzung
  const rawNames=useMemo(()=>{ const own=Object.values(stockRaw.items||{}).map(i=>i&&i.name).filter(Boolean); return [...new Set([...hbRawNames(hbBook,hbLink&&hbLink.cat),...own])]; },[hbBook,hbLink,stockRaw.items]);
  const unmapped=useMemo(()=>unmappedNames(rawNames,{alias:aliasMap,vocab}),[rawNames,aliasMap,vocab]);
  // Zuordnung speichern: stock/alias/<aliasKey(roh)> = {name, src, at}; name "" = kein Lebensmittel
  const writeAliases=(map,src)=>{
    const now=Date.now(), patch={}, add={};
    Object.keys(map).forEach(raw=>{ const k=aliasKey(raw); if(!k) return; const e={name:map[raw],src,at:now,raw:String(raw).slice(0,80)}; add[k]=e; patch["stock/alias/"+k]=e; });
    if(!Object.keys(add).length) return;
    setStockRaw(prev=>({...prev,alias:{...(prev.alias||{}),...add}}));
    writePlan(patch,"stock");
  };
  const mapNamesAI=async(names)=>{
    const list=(names||[]).filter(Boolean).slice(0,60); if(!list.length||aliasBusy) return 0;
    list.forEach(n=>aliasTried.current.add(n));
    setAliasBusy(true); setAliasErr("");
    try{
      const user="Bezeichnungen:\n"+list.map(n=>"- "+n).join("\n")+"\n\nAntworte für jede Bezeichnung genau einmal, \"roh\" exakt wie oben.";
      const parsed=parseJsonBlock(await callAI({code:codeRef.current,mode:"extract",system:buildAliasPrompt(vocab.slice(0,400).map(v=>v.name)),messages:[{role:"user",content:user}]}));
      const map=parseAliasAnswer(parsed,list,vocab);
      writeAliases(map,"ki");
      const n=Object.keys(map).length;
      if(n) showToast(n===1?"1 Produktname zugeordnet.":n+" Produktnamen zugeordnet.");
      setAliasBusy(false); return n;
    }catch(e){
      console.error("Alias error:",e); const msg=(e&&e.message)||"Unbekannter Fehler";
      setAliasErr(kiErrText(msg)||("Namen konnten nicht zugeordnet werden: "+msg.slice(0,80)));
      setAliasBusy(false); return 0;
    }
  };
  // automatisch: neue unklare Namen im Hintergrund zuordnen (nur im Plan, nicht beim Beitritt)
  useEffect(()=>{
    if(screen!=="app"||aliasBusy) return;
    const fresh=unmapped.filter(n=>!aliasTried.current.has(n));
    if(fresh.length) mapNamesAI(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[unmapped,screen]);
  // Hand-Korrektur aus der Vorratsliste: alle Rohnamen einer Zeile auf einen Namen ("" = kein Lebensmittel) oder zuruecksetzen
  const setAlias=(raws,name)=>{ const map={}; (raws||[]).forEach(r=>{ map[r]=name; }); writeAliases(map,"hand"); };
  const clearAlias=(raws,keys)=>{
    const patch={}; const ks=[...(raws||[]).map(aliasKey),...(keys||[])].filter(Boolean); if(!ks.length) return;
    ks.forEach(k=>{ patch["stock/alias/"+k]=null; });
    setStockRaw(prev=>{ const a={...(prev.alias||{})}; ks.forEach(k=>{ delete a[k]; }); return {...prev,alias:a}; });
    writePlan(patch,"stock");
  };

  // EINKAUFSLISTE in Bloecken: Liste und "Vorrat pruefen" (Grundvorrat). Was auf der Liste steht, bleibt dort, bis es abgehakt oder entfernt wird - unabhaengig vom Vorrat.
  const shopList=useMemo(()=>shoppingList(shopping),[shopping]);
  const shopMain=useMemo(()=>shopList.filter(it=>isListed(it)),[shopList]);
  const shopBasics=useMemo(()=>shopList.filter(it=>it.basic&&!it.forceBuy),[shopList]);
  const shopGroups=useMemo(()=>groupShopping(shopMain),[shopMain]);
  const unchecked=shopMain.filter(x=>!x.checked).length;
  // Liste teilen: Klartext ueber navigator.share, sonst Zwischenablage
  const shareShopping=async()=>{
    const text=shoppingText(shopMain);
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
  const finishCook=()=>{clearTodayPicks(detailRecipe);takeForCooking(detailRecipe);markCooked(detailRecipe,todayISO());setCookMode(false);setCookStep(0);setRatingDraft((curRec&&curRec.rating)||0);setNoteDraft((curRec&&curRec.notes)||"");setRateAfterCook(true);};
  // Bewertungsdialog speichern (Bewertung + Notiz in einem Feld-PATCH)
  const saveRating=()=>{ patchRecipe(detailRecipe,{rating:ratingDraft,notes:noteDraft}); setRateAfterCook(false); };

  // ZUSTAND (state) UND AKTIONEN (api) fuer die Ansichten - Namen aus Bauplan Abschnitt 12.
  const state={
    code:activeCode,userName,participants,hbLink,hbBook,hbLoading,hbErr,stock,learned,stockRaw,vocab,unmapped,aliasBusy,aliasErr,settings,household,
    picks,today:todayISO(),recipes,images,shopping,shopList,shopMain,shopBasics,shopGroups,unchecked,classics:CLASSICS,
    syncOk,syncErr,lastSync,fontZoom,aiBusy,aiErr,toast,isLocalDev,
    importState:{importErr,extracting,extracted,savedMsg},cookbookImport,
    // Rahmen und Dialoge
    view,codeCopied,editShopId,editShopText,
    detailRecipe,curRec,editMode,editData,cookStep,cookMode,rateAfterCook,ratingDraft,noteDraft,
    joinState:{myCode,joinInput,nameInput,nameHint,joinErr,joinOffer,joinBusy},
  };
  const api={
    // Vorgemerkt
    addPick,removePick,movePick,cookedToday,startCooking,
    // Einkauf
    buildShoppingFromPicks,addShopItem,dictateShopping,addShopTexts,toggleShopItem,editShopItem,removeShopItem,clearShopping,clearCheckedShopping,addRecipeToShopping,markIngredientPresent,forceBuy,shareShopping,
    // Rezepte
    openRecipe,saveRecipe,deleteRecipe,rateRecipe,noteRecipe,markCooked,uploadImage,resetImage,adoptClassic,adoptStarters,
    // KI
    extractRecipe,suggestRecipe,saveExtracted,setExtracted,setImportErr,
    // Haushaltsbuch, Einstellungen, Sitzung
    connectHb,disconnectHb,reloadHb:loadHb,markGone,clearGone,addStockItem,addStockItems,refreshStock,setPermanent,removeStock,scanPantry,setStockLayout,setAlias,clearAlias,mapNamesAI,resetStockLayout,setSetting,zoom,leavePlan,deletePlan,
    // Rahmen
    setView,copyCode,showToast,registerBackHandler,
    setEditShopId,setEditShopText,saveShopEdit,
    // Detail, Editor, Kochmodus
    closeRecipe:()=>{setDetailRecipe(null);setEditMode(false);setEditData(null);},setCookStep,setCookMode,startEdit,setEditData,saveEdit,cancelEdit:()=>{setEditMode(false);setEditData(null);},
    downloadRecipePDF,downloadPDF,exportCookbookFile,loadCookbookFile,confirmCookbookImport,cancelCookbookImport:()=>setCookbookImport(null),finishCook,setRateAfterCook,setRatingDraft,setNoteDraft,saveRating,
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
        {view==="vorrat"&&<Vorrat state={state} api={api} />}
        {view==="plan"&&<Plan state={state} api={api} />}
        {view==="shopping"&&<Shopping state={state} api={api} />}
        {view==="recipes"&&<Recipes state={state} api={api} />}
      </Shell>
    );
  }
  return null;
}
