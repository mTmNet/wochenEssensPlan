// FIREBASE - eigenes Projekt "wochenessenplan-3d0e1" (seit 2026-10, alte DB wochenessenplan-default-rtdb bleibt als Backup)
// Regeln: Wurzel gesperrt, plans/$code und recipeImages/$code nur mit Code (recipeImages ist nicht auflistbar),
// globalRecipes nur lesbar. Wortlaut siehe README.
// Alles Neue liegt unter plans/<CODE>/… und recipeImages/<CODE>/…; globalRecipes und recipeImages/<Name> werden nur noch gelesen.
import { createAuth, authedFetch } from "./auth.js";
import { createActivity } from "./aktiv.js";
import { createAblage, FILE_KEY_RE, randFileKey, parseDataUrl, isDataUrl } from "./ablage.js";

export const FB = "https://wochenessenplan-3d0e1-default-rtdb.europe-west1.firebasedatabase.app";

// Zeitgrenze fuer jeden Netzaufruf: haengende Verbindungen (Funkloch) duerfen den Poll nicht dauerhaft blockieren.
// Grosse Koerper (Bilder) bekommen mehr Zeit: 15 s Grundwert, +15 s je 500 KB, hoechstens 60 s.
export const FETCH_TIMEOUT_MS = 15000;
export const timeoutFor = (bodyLen) => Math.min(60000, FETCH_TIMEOUT_MS + Math.floor((bodyLen||0)/500000)*15000);
// Anmeldung: Der Web-Schlüssel des Firebase-Projekts kommt aus der Vercel-Variable VITE_FB_API_KEY (öffentlich, kein Geheimnis).
// Fehlt sie, bleibt die Anmeldung aus und alle Aufrufe gehen wie bisher ohne Nachweis hinaus.
export const auth = createAuth({ apiKey: (import.meta.env && import.meta.env.VITE_FB_API_KEY) || "" });
// Messung "zuletzt aktiv" (src/aktiv.js): Herkunft aus dem Einstiegslink gleich beim Laden merken, gemeldet wird beim Abgleich
export const activity = createActivity({ prefix: "wochenplan", auth });
activity.capture();
const fetchT = async (url, init, ms) => {
  const ctl = typeof AbortController!=="undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(()=>ctl.abort(), ms) : null;
  try { return await fetch(url, ctl ? {...init, signal:ctl.signal} : init); }
  finally { if(timer) clearTimeout(timer); }
};

// Aufruf an die eigene Datenbank, mit Anmelde-Nachweis (das Haushaltsbuch liegt in einem anderen Projekt und bekommt keinen)
const fetchA = (url, init, ms) => authedFetch(auth, fetchT, url, init, ms);

// undefined = Fehler (Netz, Regeln, Zeitueberschreitung), null = Knoten leer, sonst die Daten
export const fbGet = async (p) => {
  try { const r=await fetchA(FB+"/"+p+".json",{},FETCH_TIMEOUT_MS); return r.ok?await r.json():undefined; } catch(e){ return undefined; }
};
// Schreibhelfer melden zurueck, ob das Speichern geklappt hat (true/false)
export const fbPut = async (p,d) => {
  const body=JSON.stringify(d);
  try { const r=await fetchA(FB+"/"+p+".json",{method:"PUT",headers:{"Content-Type":"application/json"},body},timeoutFor(body.length)); return r.ok; } catch(e){ return false; }
};
// Knoten komplett entfernen (DELETE), z. B. plans/<CODE> beim endgueltigen Loeschen
export const fbDelete = async (p) => {
  try { const r=await fetchA(FB+"/"+p+".json",{method:"DELETE"},FETCH_TIMEOUT_MS); return r.ok; } catch(e){ return false; }
};
export const fbPatch = async (p,d) => {
  const body=JSON.stringify(d);
  try { const r=await fetchA(FB+"/"+p+".json",{method:"PATCH",headers:{"Content-Type":"application/json"},body},timeoutFor(body.length)); return r.ok; } catch(e){ return false; }
};

// MITGLIEDSCHAFT - jedes angemeldete Gerät trägt sich unter members/<CODE>/<Nutzer-ID> ein (Vorname und Tag des Beitritts).
// Der Eintrag liegt neben dem Plan, nicht darin. Künftige Regeln lassen den Plan nur noch für eingetragene Mitglieder zu.
// Ohne Anmeldung oder solange die Regeln den Knoten nicht kennen, passiert nichts (false).
export const ensureMember = async (code, name) => {
  if(!auth.enabled || !(await auth.token()) || !auth.uid()) return false;
  const p="members/"+code+"/"+auth.uid();
  const nm=String(name||"").trim().slice(0,40);
  const cur=await fbGet(p);
  if(cur===undefined) return false;
  if(cur && typeof cur==="object" && cur.since) return cur.name===nm ? true : fbPatch(p,{name:nm});
  return fbPut(p,{name:nm,since:new Date().toISOString().slice(0,10)});
};
// Eigenen Eintrag wieder entfernen (z. B. nach einem Tippfehler im Code)
export const dropMember = async (code) => {
  if(!auth.enabled || !auth.uid()) return false;
  return fbDelete("members/"+code+"/"+auth.uid());
};

// DATEIABLAGE (src/ablage.js) - eigene Rezeptfotos als Dateien in Cloud Storage (EU) statt als Base64 in der Datenbank.
// recipeImages/<CODE>/<Rezept> enthält dann einen Link mit Download-Token statt der Bilddaten; <img> zeigt beides an.
// Bucket aus der Vercel-Variable VITE_FB_BUCKET, sonst der Standard-Bucket des Projekts. Ist der Speicher in Firebase
// nicht eingerichtet, bleiben Fotos wie bisher in der Datenbank (nichts geht verloren).
export const BUCKET = (import.meta.env && import.meta.env.VITE_FB_BUCKET) || "wochenessenplan-3d0e1.firebasestorage.app";
export const ablage = createAblage({ bucket: BUCKET, auth });
// Geheimer Ordnername des Plans unter plans/<CODE>/fileKey (nur Mitglieder lesen den Plan); beim ersten Foto angelegt
const fileKeys = {};
export const planFileKey = async (code) => {
  if (fileKeys[code]) return fileKeys[code];
  let k = await fbGet("plans/"+code+"/fileKey");
  if (k === undefined) return "";
  if (!FILE_KEY_RE.test(String(k || ""))) {
    if (!(await fbPut("plans/"+code+"/fileKey", randFileKey()))) return "";
    k = await fbGet("plans/"+code+"/fileKey");   // legen zwei Geräte gleichzeitig an, gilt der gespeicherte Name
    if (!FILE_KEY_RE.test(String(k || ""))) return "";
  }
  return (fileKeys[code] = k);
};
// Fester Dateiname aus dem Inhalt: dasselbe Foto bekommt denselben Namen, auch wenn zwei Geräte es gleichzeitig umziehen
export const contentName = (s) => {
  let h = 0x811c9dc5; const t = String(s || "");
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0") + "-" + t.length.toString(36);
};
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// Foto (Data-URL) ablegen. Liefert den Link zur Datei oder "" (dann bleibt das Foto wie bisher in der Datenbank).
export const storePhoto = async (code, dataUrl) => {
  if (!ablage.ready() || !isDataUrl(dataUrl)) return "";
  const p = parseDataUrl(dataUrl);
  if (!p || !EXT[p.mime]) return "";
  const key = await planFileKey(code);
  if (!key) return "";
  const path = "fotos/" + key + "/" + contentName(dataUrl) + "." + EXT[p.mime];
  const up = await ablage.uploadOnce(path, p.bytes, p.mime);
  return up.ok && up.token ? ablage.url(path, up.token) : "";
};
// Foto-Datei löschen, falls der Wert ein Link in die Ablage ist (Data-URLs liegen nur in der Datenbank)
export const removePhoto = async (value) => { const path = ablage.pathOf(value); return path ? ablage.remove(path) : true; };
// Für die Kochbuch-Datei: Link wieder in eine Data-URL verwandeln (die Datei soll ohne Konto lesbar bleiben)
export const photoAsDataUrl = async (value) => {
  if (isDataUrl(value)) return value;
  if (!ablage.pathOf(value)) return "";
  try {
    const r = await fetchT(value, {}, FETCH_TIMEOUT_MS);
    if (!r.ok) return "";
    const blob = await r.blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || "")); fr.onerror = () => res(""); fr.readAsDataURL(blob); });
  } catch (e) { return ""; }
};

// PLAN-CODES: 10 Zeichen ohne verwechselbare O/0/I/1, Eingabe 6 bis 16 Zeichen (alte 6-stellige Codes bleiben gueltig)
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-Z0-9]{6,16}$/;
export const randCode = (len=10) => {
  const buf=new Uint32Array(len);
  if(typeof crypto!=="undefined"&&crypto.getRandomValues) crypto.getRandomValues(buf);
  else for(let i=0;i<len;i++) buf[i]=Math.floor(Math.random()*4294967296);
  let s=""; for(let i=0;i<len;i++) s+=CODE_ALPHABET[buf[i]%CODE_ALPHABET.length];
  return s;
};
// Eingabe normalisieren: Grossbuchstaben, Bindestriche und Leerzeichen raus
export const normCode = (s) => String(s||"").toUpperCase().replace(/[\s-]/g,"");

// HAUSHALTSBUCH - eigenes Firebase-Projekt, wird NUR gelesen (Einkaeufe -> wahrscheinlicher Bestand); gleiche Code-Regel
export const HB_FB = "https://haushaltsbuch-3cefb-default-rtdb.europe-west1.firebasedatabase.app";
export const HB_CODE_RE = CODE_RE;
// undefined = nicht erreichbar, null = kein Buch mit diesem Code
const hbRead = async (path) => { try { const r=await fetchT(HB_FB+"/"+path+".json",{},FETCH_TIMEOUT_MS); return r.ok?await r.json():undefined; } catch(e){ return undefined; } };
export const hbGet = (code) => hbRead("books/"+code);
// EINKAUFSAUSZUG: Das Haushaltsbuch legt die Lebensmittel-Einkäufe (Datum, Artikel, Unterkategorie, keine Beträge) unter
// kitchen/<Schlüssel> ab; den Schlüssel gibt es einmalig gegen den Buch-Code unter kitchenKeys/<CODE>.
// Der Plan merkt sich den Schlüssel statt des Buch-Codes: Wer den Plan-Code kennt, kommt so nicht mehr an die Finanzdaten.
export const HB_KEY_RE = /^[A-Za-z0-9]{20,40}$/;
// undefined = nicht erreichbar oder (noch) nicht erlaubt, null = das Buch hat keinen Auszug
export const hbKitchenKey = async (code) => { const k=await hbRead("kitchenKeys/"+code); if(k===undefined) return undefined; return k&&HB_KEY_RE.test(String(k.key||""))?k.key:null; };
export const hbKitchen = (key) => hbRead("kitchen/"+key);
// Einkäufe zu einer Verknüpfung {key?, code?, cat} laden: erst der Auszug, sonst (Übergang) das Buch über den Code.
// Liefert {book, key?, cat?} oder {err:"offline"|"missing"}. key ist gesetzt, wenn der Auszug gelesen wurde.
export const hbLoad = async (link, io) => {
  const f=io||{hbGet,hbKitchenKey,hbKitchen}, l=link||{};
  let key=HB_KEY_RE.test(String(l.key||""))?l.key:"";
  if(!key&&l.code){ const k=await f.hbKitchenKey(l.code); if(k) key=k; }
  if(key){
    const ex=await f.hbKitchen(key);
    if(ex&&typeof ex==="object") return {book:ex,key,cat:typeof ex.cat==="string"?ex.cat:""};
    if(!l.code) return {err:ex===undefined?"offline":"missing"};
  }
  if(!l.code) return {err:"missing"};
  const bk=await f.hbGet(l.code);
  if(bk===undefined) return {err:"offline"};
  return bk?{book:bk}:{err:"missing"};
};
