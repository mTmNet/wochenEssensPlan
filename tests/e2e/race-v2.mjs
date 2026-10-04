// Zwei Geräte am selben Plan + Beitritt mit falschem Code + Migration eines Altbestands + Nebenläufigkeits-Nachweise.
// Weist nach, dass jede Änderung gezielt geschrieben wird (Multi-Path-PATCH auf plans/<CODE>) und nichts verloren geht:
// (a) Haken = kleiner PATCH, (b) gelöschtes Rezept kommt nicht zurück, (c) Bewertung überlebt fremden Haken,
// (f) Wochen-Cache wird frisch geladen und Slots gegen den Server abgeglichen, (g) kein Geister-Rezept durch Feld-PATCH,
// (h) Editor schreibt nur Felder, (i) Einkaufsliste wird zusammengeführt, (m) Umbenennen stellt Planzellen um,
// (l) Import mit vorhandenem Namen fragt nach, (n) Zurück-Taste schließt Dialog und Dropdown,
// (j) Schreibfehler bleibt rot bis zum Abgleich, (k) hängender PATCH stoppt den Poll nicht,
// (d) unbekannter Code legt keinen Plan an, (e) Migration vollständig, idempotent, deterministische Ids.
import pw from 'playwright'; const { chromium } = pw;
import { isoWeekKey, todayISO, shiftWeek } from '../../src/logic/weeks.js';

const db = {};
const getAt=(r,p)=>{let o=r;for(const k of p){if(o==null||typeof o!=='object')return null;o=o[k];}return o===undefined?null:o;};
const setAt=(r,p,v)=>{let o=r;for(let i=0;i<p.length-1;i++){if(o[p[i]]==null||typeof o[p[i]]!=='object')o[p[i]]={};o=o[p[i]];}if(v===null)delete o[p[p.length-1]];else o[p[p.length-1]]=v;};
const uploads=[];
let metaGets=0;
// Firebase-Mock mit Multi-Path-PATCH ("weeks/2026-W41/Mo/meals/Ab": [...])
const mock=async(route)=>{const req=route.request();const u=new URL(req.url());const parts=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);const m=req.method();
 if(m==='GET'){ if(parts[parts.length-1]==='meta') metaGets++; return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(getAt(db,parts))}); }
 const body=req.postData()||'null';const data=JSON.parse(body);uploads.push({m,path:parts.join('/'),bytes:body.length,keys:Object.keys(data||{})});
 if(m==='PUT')setAt(db,parts,data);else if(m==='PATCH'){if(getAt(db,parts)==null)setAt(db,parts,{});for(const[k,v]of Object.entries(data||{}))setAt(db,[...parts,...k.split('/')],v);}
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});};
// KI-Mock fuer den Import: liefert immer "Pasta Carbonara" (Name existiert schon)
const aiCalls=[];
const mockAi=async(route)=>{const body=JSON.parse(route.request().postData()||'{}');aiCalls.push(body);
 const text=JSON.stringify({name:'Pasta Carbonara',ingredients:['300 g Spaghetti','150 g Guanciale','3 Eigelb'],steps:['Kochen.','Mischen.'],stepsGenerated:false,description:'Römischer Klassiker.',category:'Hauptgericht',cuisine:'Italienisch',servings:4,minutes:30,origin:'Rom'});
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text})});};

const fails=[]; let n=0;
const check=(cond,msg,extra)=>{ n++; if(cond) console.log('  ok  ', msg); else { fails.push(msg); console.log('  FAIL', msg, extra!==undefined?JSON.stringify(extra).slice(0,400):''); } };
const snap=(o)=>JSON.stringify(o);
const TICK='button[aria-label="Abhaken"]';
const struck=(p)=>p.locator('span[title="Tippen zum Bearbeiten"][style*="line-through"]').count();

(async()=>{
 const browser=await chromium.launch();
 const mk=async(routeFn)=>{const c=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'});await c.route(/firebasedatabase\.app/,routeFn||mock);await c.route(/\/api\/gemini/,mockAi);await c.route(/image\.pollinations\.ai/,r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'}));await c.route(/fonts\./,r=>r.abort());const p=await c.newPage();p.on('dialog',d=>d.accept());p.on('pageerror',e=>console.log('PAGEERROR',e.message));return p;};
 const IN_APP='button:has-text("Rezepte")';
 const A=await mk(), B=await mk();
 const wk=isoWeekKey(todayISO()), nextWk=shiftWeek(wk,1);

 // ---------- A legt einen Plan an und uebernimmt die Startrezepte ----------
 console.log('\n# Aufbau');
 await A.goto('http://127.0.0.1:5173/');await A.waitForSelector('text=PLAN STARTEN');
 await A.fill('input[placeholder="z.B. Anna"]','Anna');const code=(await A.textContent('span[style*="letter-spacing: 6px"]')).trim();await A.click('text=PLAN STARTEN');await A.waitForSelector(IN_APP);
 check(code.length===10&&/^[A-HJ-NP-Z2-9]{10}$/.test(code),'Neuer Code hat 10 Zeichen ohne O/0/I/1: '+code);
 check(db.plans?.[code]?.meta&&db.plans[code].participants?.[0]==='Anna','Plan angelegt mit meta und participants',db.plans?.[code]);
 check(!db.plans?.[code]?.recipes&&!db.globalRecipes,'Neuer Plan startet ohne Rezepte, globalRecipes bleibt unberuehrt');
 await A.click('button:has-text("Rezepte")');await A.click('text=STARTREZEPTE ÜBERNEHMEN');await A.waitForSelector('button:has-text("Pasta Bolognese")');await A.waitForTimeout(500);
 check(Object.keys(db.plans[code].recipes||{}).length===14,'Startrezepte liegen unter plans/<CODE>/recipes (14)',Object.keys(db.plans[code].recipes||{}));
 check(!db.globalRecipes,'globalRecipes wurde nicht beschrieben');
 await A.click('button:text-is("Woche")');
 await A.locator('button:has-text("+ Hinzufügen...")').nth(2).click();await A.click('button:has-text("Pasta Bolognese")');
 await A.click('text=GESAMTE EINKAUFSLISTE GENERIEREN');await A.waitForTimeout(1200);
 check(snap(db.plans[code].weeks?.[wk]?.Mo?.meals?.Ab)===snap(['Pasta Bolognese']),'Slot liegt unter weeks/'+wk+'/Mo/meals/Ab',db.plans[code].weeks);
 check(db.plans[code].shopping&&!Array.isArray(db.plans[code].shopping)&&Object.keys(db.plans[code].shopping).length>0,'shopping ist ein Objekt mit Posten');

 // ---------- B tritt bei (bekommt Rezepte und Liste beim Beitritt) ----------
 await B.goto('http://127.0.0.1:5173/');await B.waitForSelector('text=PLAN STARTEN');
 await B.fill('input[placeholder="z.B. Anna"]','Ben');await B.fill('input[placeholder="CODE"]',code);await B.click('button:has-text("BEITRETEN")');await B.waitForSelector(IN_APP);
 check(snap(db.plans[code].participants)===snap(['Anna','Ben']),'Teilnehmer per PATCH ergaenzt',db.plans[code].participants);
 await B.click('button:has-text("Einkauf")');await B.waitForTimeout(300);
 const nB=await B.locator('span[title="Tippen zum Bearbeiten"]').count();
 check(nB>0,'B sieht die Einkaufsliste ('+nB+' Posten)');

 // ---------- (a)+(b) A loescht ein Rezept, B hakt ab -> Rezept bleibt weg ----------
 console.log('\n# (a)+(b) Haken ist kleiner PATCH, geloeschtes Rezept kommt nicht zurueck');
 await A.click('button:has-text("Rezepte")');await A.click('button:has-text("Avocado Toast")');await A.waitForTimeout(500);await A.click('text=REZEPT LÖSCHEN');await A.waitForTimeout(1000);
 check(!('Avocado Toast' in (db.plans[code].recipes||{})),'Nach Loeschen auf A: Avocado Toast nicht mehr in der DB');
 uploads.length=0;
 await B.locator(TICK).first().click();await B.waitForTimeout(1200);
 console.log('  Upload von B beim Haken:', JSON.stringify(uploads));
 check(uploads.length===1&&uploads[0].m==='PATCH'&&uploads[0].path==='plans/'+code,'(a) Haken = genau ein PATCH auf plans/<CODE>',uploads);
 check(uploads.every(u=>u.keys.every(k=>!k.startsWith('recipes'))),'(a) kein recipes/-Schluessel im Upload',uploads.map(u=>u.keys));
 check(uploads.some(u=>u.keys.some(k=>/^shopping\/[^/]+\/checked$/.test(k))&&u.keys.includes('meta/shoppingUpdatedAt')&&u.keys.includes('meta/updatedAt')),'(a) Upload enthaelt shopping/<id>/checked + meta-Zeitstempel',uploads.map(u=>u.keys));
 check(uploads.every(u=>u.bytes<400),'(a) Upload ist klein (<400 Byte)',uploads.map(u=>u.bytes));
 check(!('Avocado Toast' in (db.plans[code].recipes||{})),'(b) Nach Haken auf B: Avocado Toast weiterhin nicht in der DB');
 await A.waitForTimeout(10500);   // A pollt
 await A.click('button:has-text("Rezepte")');await A.waitForTimeout(300);
 check(!(await A.isVisible('button:has-text("Avocado Toast")')),'(b) A sieht Avocado Toast nach dem Poll nicht wieder');
 check(Object.values(db.plans[code].shopping).filter(x=>x.checked).length===1,'Haken von B ist in der DB (1 Posten abgehakt)',db.plans[code].shopping);

 // ---------- (c) A bewertet, B hakt ab -> Bewertung bleibt ----------
 console.log('\n# (c) Bewertung ueberlebt den Haken auf B');
 await A.click('button:has-text("Risotto")');await A.waitForTimeout(400);await A.locator('button[aria-label="5 Sterne"]').click();await A.waitForTimeout(1000);
 check(db.plans[code].recipes?.Risotto?.rating===5,'Bewertung 5 in der DB nach A',db.plans[code].recipes?.Risotto);
 uploads.length=0;
 await B.locator(TICK).first().click();await B.waitForTimeout(1200);
 check(db.plans[code].recipes?.Risotto?.rating===5,'(c) Bewertung nach Haken auf B weiterhin 5');
 check(uploads.every(u=>u.keys.every(k=>!k.startsWith('recipes'))),'(c) B hat keine Rezepte hochgeladen',uploads.map(u=>u.keys));
 await B.waitForTimeout(10500);   // B pollt: nur recipes nachladen, nichts schreiben
 check(db.plans[code].recipes?.Risotto?.rating===5,'(c) Bewertung nach Poll von B weiterhin 5');
 check(Object.keys(db.plans[code].recipes).length===13,'Rezeptbestand: 13 (14 minus Avocado Toast)',Object.keys(db.plans[code].recipes));
 await A.click('text=ZURÜCK').catch(()=>{});await A.waitForTimeout(300);

 // ---------- (f) Wochen-Cache: besuchte Woche wird frisch geladen, Slot gegen Server abgeglichen ----------
 console.log('\n# (f) Wochen-Cache und Slot-Abgleich');
 await A.click('button:text-is("Woche")');await A.waitForTimeout(300);
 await A.click('button[aria-label="Nächste Woche"]');await A.waitForTimeout(600);     // A sieht die naechste Woche (leer) und kehrt zurueck
 check(await A.isVisible('text=Diese Woche ist noch leer.'),'(f) A sieht die naechste Woche zunaechst leer');
 await A.click('button[title="Zur aktuellen Woche"]');await A.waitForTimeout(300);
 await B.click('button:text-is("Woche")');await B.click('button[aria-label="Nächste Woche"]');await B.waitForTimeout(600);
 await B.locator('button:has-text("+ Hinzufügen...")').nth(2).click();await B.click('button:has-text("Veggie-Curry")');await B.waitForTimeout(800);
 check(snap(db.plans[code].weeks?.[nextWk]?.Mo?.meals?.Ab)===snap(['Veggie-Curry']),'(f) B hat Veggie-Curry in '+nextWk+' Mo/Ab eingetragen',db.plans[code].weeks?.[nextWk]);
 await A.click('button[aria-label="Nächste Woche"]');await A.waitForTimeout(800);   // ohne Poll: beim Oeffnen frisch geladen
 check(await A.isVisible('span:has-text("Veggie-Curry")'),'(f) A sieht Veggie-Curry beim erneuten Oeffnen der naechsten Woche (frisch geladen, kein veralteter Cache)');
 // Fremder Eintrag ohne Zeitstempel-Aenderung (A kann ihn nicht kennen): Slot-Schreiben gleicht gegen den Server ab
 setAt(db,['plans',code,'weeks',nextWk,'Di','meals','Ab'],['Risotto']);
 await A.locator('button:has-text("+ Hinzufügen...")').nth(6).click();await A.click('button:has-text("Linsensuppe")');await A.waitForTimeout(900);
 const diAb=db.plans[code].weeks?.[nextWk]?.Di?.meals?.Ab;
 check(Array.isArray(diAb)&&diAb.includes('Risotto')&&diAb.includes('Linsensuppe'),'(f) Eintrag des anderen Geraets ueberlebt den eigenen Eintrag in derselben Zelle',diAb);
 check(await A.isVisible('span:has-text("Risotto")')&&await A.isVisible('span:has-text("Linsensuppe")'),'(f) A zeigt nach dem Abgleich beide Gerichte in der Zelle');
 await A.click('button[title="Zur aktuellen Woche"]');await B.click('button[title="Zur aktuellen Woche"]');await A.waitForTimeout(300);

 // ---------- (g) Geister-Rezept: Feld-PATCH auf ein soeben geloeschtes Rezept ----------
 console.log('\n# (g) Kein Geister-Rezept durch Feld-PATCH');
 await A.click('button:has-text("Rezepte")');await A.click('button:has-text("Pfannkuchen")');await A.waitForTimeout(400);
 await B.click('button:has-text("Rezepte")');await B.click('button:has-text("Pfannkuchen")');await B.waitForTimeout(400);await B.click('text=REZEPT LÖSCHEN');await B.waitForTimeout(700);
 check(!('Pfannkuchen' in db.plans[code].recipes),'(g) Pfannkuchen nach Loeschen auf B nicht in der DB');
 uploads.length=0;
 await A.locator('button[aria-label="4 Sterne"]').click();await A.waitForTimeout(900);
 console.log('  Upload von A:', JSON.stringify(uploads.map(u=>u.keys)));
 check(!('Pfannkuchen' in db.plans[code].recipes),'(g) DB enthaelt kein recipes/Pfannkuchen (kein Geist)',db.plans[code].recipes?.Pfannkuchen);
 check(uploads.every(u=>u.keys.every(k=>!k.startsWith('recipes/Pfannkuchen'))),'(g) A hat keinen Feld-PATCH auf das geloeschte Rezept geschickt',uploads.map(u=>u.keys));
 check(await A.isVisible('text=auf einem anderen Gerät gelöscht'),'(g) A zeigt den Hinweis "auf einem anderen Gerät gelöscht"');
 check(!(await A.isVisible('text=KOCHMODUS')),'(g) Detail des geloeschten Rezepts ist auf A geschlossen');
 await B.waitForTimeout(10500);
 check(!(await B.isVisible('button:has-text("Pfannkuchen")')),'(g) B sieht Pfannkuchen nach dem Poll nicht wieder');

 // ---------- (h) Editor schreibt nur Felder: fremde Bewertung bleibt ----------
 console.log('\n# (h) Editor speichert nur die editierten Felder');
 await A.click('button:has-text("Pasta Carbonara")');await A.waitForTimeout(400);await A.click('button:has-text("BEARBEITEN")');await A.waitForTimeout(300);
 await B.click('button:has-text("Pasta Carbonara")');await B.waitForTimeout(400);await B.locator('button[aria-label="5 Sterne"]').click();await B.waitForTimeout(800);
 check(db.plans[code].recipes['Pasta Carbonara'].rating===5,'(h) B hat Carbonara mit 5 bewertet (DB)');
 await A.waitForTimeout(11000);   // A pollt (Editor offen: Rezepte werden nicht nachgeladen)
 await A.locator('input[type="number"]').nth(1).fill('25');
 uploads.length=0;
 await A.locator('button:text-is("SPEICHERN")').click();await A.waitForTimeout(800);
 console.log('  Upload von A:', JSON.stringify(uploads.map(u=>u.keys)));
 const carb=db.plans[code].recipes['Pasta Carbonara'];
 check(carb.rating===5,'(h) Bewertung von B ueberlebt das Speichern des Editors auf A',carb.rating);
 check(carb.minutes===25,'(h) editiertes Feld minutes=25 ist in der DB');
 check(uploads.some(u=>u.keys.includes('recipes/Pasta Carbonara/minutes'))&&uploads.every(u=>!u.keys.includes('recipes/Pasta Carbonara')),'(h) Upload besteht aus Feld-Pfaden, nicht aus dem ganzen Rezept',uploads.map(u=>u.keys));
 await A.click('text=ZURÜCK').catch(()=>{});await B.click('text=ZURÜCK').catch(()=>{});await A.waitForTimeout(300);

 // ---------- (i) Einkaufsliste zusammenfuehren statt ersetzen ----------
 console.log('\n# (i) "Gesamte Einkaufsliste generieren" fuehrt zusammen');
 await B.click('button:has-text("Einkauf")');await B.fill('input[placeholder="Produkt hinzufügen..."]','Klopapier');await B.press('input[placeholder="Produkt hinzufügen..."]','Enter');await B.waitForTimeout(600);
 check(Object.values(db.plans[code].shopping).some(x=>x.text==='Klopapier'&&x.src==='manuell'),'(i) Klopapier (manuell, B) in der DB');
 const checkedBefore=Object.values(db.plans[code].shopping).filter(x=>x.checked).map(x=>x.key).sort();
 await A.click('button:text-is("Woche")');await A.waitForTimeout(300);uploads.length=0;
 await A.click('text=GESAMTE EINKAUFSLISTE GENERIEREN');await A.waitForTimeout(900);
 console.log('  Upload von A:', JSON.stringify(uploads.map(u=>u.keys)));
 check(Object.values(db.plans[code].shopping).some(x=>x.text==='Klopapier'),'(i) Klopapier bleibt nach dem Generieren auf A in der DB');
 const checkedAfter=Object.values(db.plans[code].shopping).filter(x=>x.checked).map(x=>x.key).sort();
 check(snap(checkedAfter)===snap(checkedBefore)&&checkedBefore.length>0,'(i) Haken bleiben bei gleichem key erhalten',{checkedBefore,checkedAfter});
 check(uploads.every(u=>!u.keys.includes('shopping')&&u.keys.every(k=>k.startsWith('shopping/')||k.startsWith('meta/'))),'(i) kein Schluessel "shopping" als Ganzes, nur gezielte Pfade',uploads.map(u=>u.keys));

 // ---------- (m) Umbenennen stellt die Planzellen um ----------
 console.log('\n# (m) Umbenennen eines Rezepts');
 await A.click('button:has-text("Rezepte")');await A.click('button:has-text("Pasta Bolognese")');await A.waitForTimeout(400);await A.click('button:has-text("BEARBEITEN")');await A.waitForTimeout(300);
 await A.fill('input[aria-label="Name"]','Spaghetti Bolognese');uploads.length=0;
 await A.locator('button:text-is("SPEICHERN")').click();await A.waitForTimeout(900);
 console.log('  Upload von A:', JSON.stringify(uploads.map(u=>u.keys)));
 const recs=db.plans[code].recipes;
 check(!!recs['Spaghetti Bolognese']&&!recs['Pasta Bolognese']&&recs['Spaghetti Bolognese'].name==='Spaghetti Bolognese','(m) Rezept unter neuem Schluessel, alter weg',Object.keys(recs));
 check(snap(db.plans[code].weeks[wk].Mo.meals.Ab)===snap(['Spaghetti Bolognese']),'(m) Planzelle Mo/Ab zeigt auf den neuen Schluessel',db.plans[code].weeks[wk].Mo.meals.Ab);
 check(uploads.some(u=>u.keys.includes('weeks/'+wk+'/Mo/meals/Ab')&&u.keys.includes('recipes/Spaghetti Bolognese')&&u.keys.includes('recipes/Pasta Bolognese')),'(m) Umbenennen ist EIN Multi-Path-PATCH mit Rezept- und Wochenpfaden',uploads.map(u=>u.keys));
 check(await A.isVisible('text=Spaghetti Bolognese'),'(m) Detail zeigt den neuen Namen');
 await A.click('text=ZURÜCK');await A.click('button:text-is("Woche")');await A.waitForTimeout(400);
 const row=await A.locator('div:has(> span:text-is("Spaghetti Bolognese"))').first().textContent().catch(()=>'');
 check(row.includes('Spaghetti Bolognese')&&row.includes('REZEPT'),'(m) Planzeile zeigt Spaghetti Bolognese mit REZEPT-Knopf',row);

 // ---------- (l) Import mit vorhandenem Namen: Rueckfrage, Ersetzen behaelt Bewertung ----------
 console.log('\n# (l) Import mit vorhandenem Rezeptnamen');
 await A.click('button:has-text("Rezepte")');await A.fill('textarea[placeholder^="Füge hier einen Rezepttext"]','Pasta Carbonara: Spaghetti, Guanciale, Eigelb');
 await A.click('text=REZEPT MIT KI EXTRAHIEREN');await A.waitForSelector('text=ERKANNTES REZEPT',{timeout:8000});await A.waitForTimeout(300);
 check(aiCalls.length>0&&aiCalls[aiCalls.length-1].mode==='extract','(l) KI-Anfrage traegt mode "extract"',aiCalls[aiCalls.length-1]&&aiCalls[aiCalls.length-1].mode);
 check(await A.isVisible('button:text-is("ERSETZEN")')&&await A.isVisible('text=ALS KOPIE SPEICHERN'),'(l) Rueckfrage "Ersetzen oder als Kopie speichern" sichtbar');
 await A.click('button:text-is("ERSETZEN")');await A.waitForTimeout(900);
 const carb2=db.plans[code].recipes['Pasta Carbonara'];
 check(carb2.rating===5&&carb2.ingredients[0]==='300 g Spaghetti'&&carb2.source==='import'&&carb2.origin==='Rom','(l) Ersetzen uebernimmt Zutaten, behaelt Bewertung 5',carb2);
 await A.waitForTimeout(2300);
 await A.fill('textarea[placeholder^="Füge hier einen Rezepttext"]','Pasta Carbonara nochmal');
 await A.click('text=REZEPT MIT KI EXTRAHIEREN');await A.waitForSelector('text=ERKANNTES REZEPT',{timeout:8000});await A.waitForTimeout(300);
 await A.click('text=ALS KOPIE SPEICHERN');await A.waitForTimeout(900);
 check(!!db.plans[code].recipes['Pasta Carbonara (Kopie)']&&db.plans[code].recipes['Pasta Carbonara'].rating===5,'(l) Kopie wird unter "Pasta Carbonara (Kopie)" gespeichert, Original unveraendert',Object.keys(db.plans[code].recipes));
 await A.waitForTimeout(2300);

 // ---------- (n) Zurueck-Taste schliesst Dialog und Dropdown ----------
 console.log('\n# (n) Zurueck-Taste');
 await A.click('button:text-is("Woche")');await A.waitForTimeout(300);
 await A.click('text=WOCHE ABSCHLIESSEN');await A.waitForTimeout(300);
 check(await A.isVisible('div[role="dialog"]'),'(n) Dialog "Woche abschließen" offen');
 await A.evaluate(()=>window.history.back());await A.waitForTimeout(500);
 check(!(await A.isVisible('div[role="dialog"]'))&&!(await A.isVisible('text=Nochmal „Zurück“ drücken')),'(n) Zurueck schliesst den Dialog ohne Verlassen-Hinweis');
 await A.locator('button:has-text("+ Hinzufügen...")').nth(1).click();await A.waitForTimeout(300);
 check(await A.isVisible('input[placeholder="Suchen oder eingeben..."]'),'(n) Dropdown offen');
 await A.evaluate(()=>window.history.back());await A.waitForTimeout(500);
 check(!(await A.isVisible('input[placeholder="Suchen oder eingeben..."]'))&&!(await A.isVisible('text=Nochmal „Zurück“ drücken')),'(n) Zurueck schliesst das Dropdown ohne Verlassen-Hinweis');
 await A.evaluate(()=>window.history.back());await A.waitForTimeout(400);
 check(await A.isVisible('text=Nochmal „Zurück“ drücken'),'(n) Zurueck auf der Hauptansicht zeigt den Verlassen-Hinweis');
 await A.waitForTimeout(2700);

 // ---------- (d) Beitritt mit unbekanntem Code ----------
 console.log('\n# (d) Beitritt mit unbekanntem Code');
 const plansBefore=Object.keys(db.plans);
 const Cp=await mk();await Cp.goto('http://127.0.0.1:5173/');await Cp.waitForSelector('text=PLAN STARTEN');
 await Cp.fill('input[placeholder="z.B. Anna"]','Oma');await Cp.fill('input[placeholder="CODE"]','XXXX99');await Cp.click('button:has-text("BEITRETEN")');await Cp.waitForTimeout(800);
 check(await Cp.isVisible('text=PLAN STARTEN'),'(d) bleibt auf dem Startbildschirm');
 check(await Cp.isVisible('text=Kein Plan mit diesem Code.'),'(d) Meldung "Kein Plan mit diesem Code." sichtbar');
 check(await Cp.isVisible('text=NEUEN PLAN MIT DIESEM CODE ANLEGEN'),'(d) Knopf "Neuen Plan mit diesem Code anlegen" sichtbar');
 check(!db.plans.XXXX99&&snap(Object.keys(db.plans))===snap(plansBefore),'(d) kein Plan angelegt',Object.keys(db.plans));
 await Cp.fill('input[placeholder="CODE"]','abc-1');await Cp.waitForTimeout(100);
 check((await Cp.inputValue('input[placeholder="CODE"]'))==='ABC1','(d) Eingabe normalisiert (Grossbuchstaben, Bindestrich raus)');
 await Cp.fill('input[placeholder="z.B. Anna"]','');await Cp.click('text=PLAN STARTEN');await Cp.waitForTimeout(300);
 check(await Cp.isVisible('text=Bitte zuerst deinen Namen eingeben.'),'(d) "Plan starten" ohne Namen zeigt Hinweis');
 check(Object.keys(db.plans).length===plansBefore.length,'(d) "Plan starten" ohne Namen legt keinen Plan an');
 const Np=await mk();await Np.unroute(/firebasedatabase\.app/);await Np.route(/firebasedatabase\.app/,r=>r.abort());
 await Np.goto('http://127.0.0.1:5173/');await Np.waitForSelector('text=PLAN STARTEN');
 await Np.fill('input[placeholder="z.B. Anna"]','Opa');await Np.fill('input[placeholder="CODE"]',code);await Np.click('button:has-text("BEITRETEN")');await Np.waitForTimeout(800);
 check(await Np.isVisible('text=Keine Verbindung zur Datenbank.'),'(d) Netzfehler beim Beitritt wird gemeldet');

 // ---------- (e) Migration eines Altbestands ----------
 console.log('\n# (e) Migration ALT123');
 const emptyDay=()=>({meals:{Fr:'',Mi:'',Ab:'',Zw:''},cook:''});
 db.plans.ALT123={ plan:{Mo:{meals:{Fr:'',Mi:'',Ab:'Pasta Bolognese',Zw:''},cook:'Oma'},Di:emptyDay(),Mi:emptyDay(),Do:emptyDay(),Fr:emptyDay(),Sa:emptyDay(),So:emptyDay()},
   shopping:[{text:'Pasta 200 g',checked:false,cat:'Trockenwaren'},{text:'Klopapier',checked:true,cat:'Sonstiges'}], participants:['Oma'], updatedAt:1700000000000 };
 db.globalRecipes={
   'Pasta Bolognese':{ingredients:['Pasta 200g','Hackfleisch 300g'],steps:['Kochen.'],cuisine:'Italienisch',meal:'Ab',rating:4,lastCooked:'2026-09-20',notes:'weniger Salz'},
   'Ruehreier':{ingredients:['Eier 3 St.'],steps:['Braten.'],cuisine:'Klassisch',meal:'Fr'},
   'Risotto':{ingredients:['Risotto-Reis 200g'],steps:['Ruehren.'],cuisine:'Italienisch',meal:'Ab',rating:2},
 };
 db.recipeImages={'Pasta Bolognese':'data:image/png;base64,AAAA'};
 const globalBefore=snap(db.globalRecipes), planBefore=snap(db.plans.ALT123.plan);
 uploads.length=0;
 const D=await mk();await D.goto('http://127.0.0.1:5173/');await D.waitForSelector('text=PLAN STARTEN');
 await D.fill('input[placeholder="z.B. Anna"]','Oma');await D.fill('input[placeholder="CODE"]','ALT123');await D.click('button:has-text("BEITRETEN")');await D.waitForSelector(IN_APP);await D.waitForTimeout(600);
 const alt=db.plans.ALT123;
 check(snap(alt.weeks?.[wk]?.Mo?.meals?.Ab)===snap(['Pasta Bolognese']),'(e) weeks/'+wk+'/Mo/meals/Ab == ["Pasta Bolognese"]',alt.weeks);
 check(alt.weeks?.[wk]?.Mo?.cook==='Oma'&&snap(alt.weeks?.[wk]?.Mo?.meals?.Zw)===snap([]),'(e) Koch bleibt, "" wird []',alt.weeks?.[wk]?.Mo);
 check(alt.shopping&&!Array.isArray(alt.shopping)&&snap(Object.keys(alt.shopping))===snap(['alt000','alt001']),'(e) shopping ist Objekt mit 2 Posten und deterministischen Ids alt000/alt001',alt.shopping);
 const sv=Object.values(alt.shopping||{});
 check(sv.every(x=>typeof x.text==='string'&&typeof x.checked==='boolean'&&x.cat&&x.src==='plan'&&x.key&&x.order&&x.addedAt),'(e) Posten haben text/checked/cat/src/key/order/addedAt',sv);
 check(sv.find(x=>x.text==='Klopapier')?.checked===true,'(e) Haken bleibt erhalten');
 check(Object.keys(alt.recipes||{}).length===3,'(e) recipes mit 3 Eintraegen',Object.keys(alt.recipes||{}));
 check(Object.values(alt.recipes||{}).every(r=>r.servings===4&&r.source==='eigen'),'(e) servings 4, source eigen');
 check(snap(alt.recipes?.['Pasta Bolognese']?.cooked)===snap(['2026-09-20'])&&alt.recipes?.['Pasta Bolognese']?.lastCooked==='2026-09-20','(e) cooked aus lastCooked',alt.recipes?.['Pasta Bolognese']);
 check(alt.recipes?.['Pasta Bolognese']?.rating===4&&alt.recipes?.['Pasta Bolognese']?.notes==='weniger Salz','(e) Bewertung und Notiz uebernommen');
 check(alt.recipes?.Ruehreier?.category==='Frühstück'&&alt.recipes?.Ruehreier?.name==='Rühreier','(e) meal Fr -> Fruehstueck, Umlaut-Name',alt.recipes?.Ruehreier);
 check(db.recipeImages?.ALT123?.['Pasta Bolognese']==='data:image/png;base64,AAAA','(e) Bild nach recipeImages/ALT123/"Pasta Bolognese" kopiert',db.recipeImages);
 const imgUp=uploads.filter(u=>u.path==='recipeImages/ALT123'), metaUp=uploads.findIndex(u=>u.path==='plans/ALT123'&&u.keys.includes('meta'));
 check(imgUp.length===1&&uploads.indexOf(imgUp[0])<metaUp,'(e) Bild wird einzeln und VOR dem meta-PATCH kopiert',uploads.map(u=>u.path+':'+u.keys.join(',')));
 check(alt.meta&&alt.meta.weeksUpdatedAt&&alt.meta.shoppingUpdatedAt&&alt.meta.recipesUpdatedAt&&alt.meta.peopleUpdatedAt&&alt.meta.updatedAt&&alt.meta.createdAt===1700000000000&&alt.meta.imagesMigrated===true,'(e) meta vorhanden (createdAt = altes updatedAt, imagesMigrated)',alt.meta);
 check(snap(alt.settings)===snap({aiImages:false}),'(e) settings angelegt',alt.settings);
 check(snap(db.globalRecipes)===globalBefore,'(e) globalRecipes unveraendert');
 check(snap(alt.plan)===planBefore&&alt.updatedAt===1700000000000,'(e) altes plan/updatedAt bleibt als Sicherung stehen');
 check(db.recipeImages['Pasta Bolognese']==='data:image/png;base64,AAAA','(e) altes recipeImages/<Name> bleibt stehen');
 check(await D.isVisible('span:has-text("Pasta Bolognese")'),'(e) D sieht Pasta Bolognese im Plan');
 const before2=snap(db.plans.ALT123), imgsBefore2=snap(db.recipeImages);
 const E=await mk();await E.goto('http://127.0.0.1:5173/');await E.waitForSelector('text=PLAN STARTEN');
 await E.fill('input[placeholder="z.B. Anna"]','Oma');await E.fill('input[placeholder="CODE"]','alt-123');await E.click('button:has-text("BEITRETEN")');await E.waitForSelector(IN_APP);await E.waitForTimeout(600);
 check(snap(db.plans.ALT123)===before2,'(e) zweiter Beitritt aendert nichts (idempotent)');
 check(snap(db.recipeImages)===imgsBefore2,'(e) zweiter Beitritt kopiert keine Bilder erneut');
 check(snap(db.globalRecipes)===globalBefore,'(e) globalRecipes weiterhin unveraendert');
 delete db.plans.ALT123;
 await E.reload();await E.waitForTimeout(1200);
 check(await E.isVisible('text=PLAN STARTEN')&&!db.plans.ALT123,'(e) Sitzung wiederherstellen ohne Plan -> Startbildschirm, kein Plan angelegt',Object.keys(db.plans));
 check(await E.isVisible('text=Kein Plan mit diesem Code.')&&!(await E.isVisible('text=NEUEN PLAN MIT DIESEM CODE ANLEGEN')),'(e) Meldung ohne Anlegen-Knopf beim Wiederherstellen');

 // ---------- (j) Schreibfehler: rot bis zum Abgleich, danach lokaler Zustand = Server ----------
 console.log('\n# (j) Schreibfehler wird nicht gruen gewaschen');
 await A.click('button:has-text("Einkauf")');await A.waitForTimeout(400);
 const dbChecked=()=>Object.values(db.plans[code].shopping).filter(x=>x.checked).length;
 const struckBefore=await struck(A), checkedBeforeJ=dbChecked();
 await A.context().unroute(/firebasedatabase\.app/);await A.context().route(/firebasedatabase\.app/,r=>r.request().method()==='GET'?mock(r):r.fulfill({status:401,contentType:'application/json',body:'{"error":"Permission denied"}'}));
 await A.locator(TICK).first().click();await A.waitForTimeout(900);
 check(await A.isVisible('text=Speichern fehlgeschlagen'),'(j) Sync-Leiste zeigt den Schreibfehler');
 check((await struck(A))===struckBefore+1&&dbChecked()===checkedBeforeJ,'(j) lokal abgehakt, DB unveraendert (optimistisch)');
 await A.waitForTimeout(11000);   // naechster Poll (GET klappt): Teil wird nachgeladen und abgeglichen
 const struckAfter=await struck(A);
 console.log('  nach Poll: durchgestrichen',struckBefore,'->',struckAfter,'| Fehler sichtbar:',await A.isVisible('text=Speichern fehlgeschlagen'),'| gruen:',await A.isVisible('text=/Sync \\d\\d:\\d\\d/'));
 check(struckAfter===struckBefore&&dbChecked()===checkedBeforeJ,'(j) Poll gleicht ab: lokaler Zustand entspricht wieder dem Server');
 check(!(await A.isVisible('text=Speichern fehlgeschlagen'))===(struckAfter===struckBefore),'(j) Fehler verschwindet erst MIT dem Abgleich (nicht vorher)');
 await A.context().unroute(/firebasedatabase\.app/);await A.context().route(/firebasedatabase\.app/,mock);
 await A.locator(TICK).first().click();await A.waitForTimeout(900);
 check(dbChecked()===checkedBeforeJ+1&&await A.isVisible('text=/Sync \\d\\d:\\d\\d/'),'(j) nach Wiederherstellung schreibt A wieder, Leiste gruen');

 // ---------- (k) Haengender PATCH stoppt den Poll nicht ----------
 console.log('\n# (k) Haengender Schreibvorgang');
 let hung=0, fMeta=0;
 const F=await mk(async(route)=>{const req=route.request();if(req.method()==='PATCH'){hung++;return;/* nie beantworten */}if(/\/meta\.json$/.test(req.url()))fMeta++;return mock(route);});
 await F.goto('http://127.0.0.1:5173/');await F.waitForSelector('text=PLAN STARTEN');
 await F.fill('input[placeholder="z.B. Anna"]','Ben');await F.fill('input[placeholder="CODE"]',code);await F.click('button:has-text("BEITRETEN")');await F.waitForSelector(IN_APP);
 await F.click('button:has-text("Einkauf")');await F.waitForTimeout(400);
 await F.locator(TICK).first().click();await F.waitForTimeout(600);
 check(hung===1,'(k) F hat einen PATCH abgesetzt, der nie beantwortet wird');
 fMeta=0;
 await B.click('button:text-is("Woche")');await B.locator('button:has-text("+ Hinzufügen...")').nth(6).click();await B.click('button:has-text("Linsensuppe")');await B.waitForTimeout(800);
 check(snap(db.plans[code].weeks[wk].Di.meals.Ab)===snap(['Linsensuppe']),'(k) B hat Linsensuppe fuer Di/Ab eingetragen (DB)');
 await F.waitForTimeout(17000);  // Zeitgrenze des Schreibens (15 s) ist um
 check(await F.isVisible('text=Speichern fehlgeschlagen'),'(k) Nach der Zeitgrenze wird die Leiste rot');
 check(fMeta>0,'(k) F pollt waehrend des haengenden Schreibens weiter ('+fMeta+' meta-GETs)');
 await F.waitForTimeout(11000);
 await F.click('button:text-is("Woche")');await F.waitForTimeout(400);
 check(await F.isVisible('span:has-text("Linsensuppe")'),'(k) F sieht die Aenderung von B nach dem Poll');

 console.log('\n# Ergebnis:', n-fails.length, 'von', n, 'Pruefungen bestanden');
 if(fails.length){ console.log('FEHLGESCHLAGEN:'); fails.forEach(f=>console.log(' *', f)); }
 await browser.close();
 process.exit(fails.length?1:0);
})().catch(e=>{console.error('FAILED',e);process.exit(1);});
