// FIREBASE - eigenes Projekt "wochenessenplan-3d0e1" (seit 2026-10, alte DB wochenessenplan-default-rtdb bleibt als Backup)
// Regeln: Wurzel gesperrt, plans/$code und recipeImages/$code nur mit Code (recipeImages ist nicht auflistbar),
// globalRecipes nur lesbar. Wortlaut siehe README.
// Alles Neue liegt unter plans/<CODE>/… und recipeImages/<CODE>/…; globalRecipes und recipeImages/<Name> werden nur noch gelesen.
import { createAuth, authedFetch } from "./auth.js";

export const FB = "https://wochenessenplan-3d0e1-default-rtdb.europe-west1.firebasedatabase.app";

// Zeitgrenze fuer jeden Netzaufruf: haengende Verbindungen (Funkloch) duerfen den Poll nicht dauerhaft blockieren.
// Grosse Koerper (Bilder) bekommen mehr Zeit: 15 s Grundwert, +15 s je 500 KB, hoechstens 60 s.
export const FETCH_TIMEOUT_MS = 15000;
export const timeoutFor = (bodyLen) => Math.min(60000, FETCH_TIMEOUT_MS + Math.floor((bodyLen||0)/500000)*15000);
// Anmeldung: Der Web-Schlüssel des Firebase-Projekts kommt aus der Vercel-Variable VITE_FB_API_KEY (öffentlich, kein Geheimnis).
// Fehlt sie, bleibt die Anmeldung aus und alle Aufrufe gehen wie bisher ohne Nachweis hinaus.
export const auth = createAuth({ apiKey: (import.meta.env && import.meta.env.VITE_FB_API_KEY) || "" });
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
export const hbGet = async (code) => { try { const r=await fetchT(HB_FB+"/books/"+code+".json",{},FETCH_TIMEOUT_MS); return r.ok?await r.json():undefined; } catch(e){ return undefined; } };
