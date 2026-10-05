// Durchlauf durch die App nach dem Umbau (plans/<CODE>/weeks|shopping|recipes, Meta-Poll, Beitritt nur zu bestehenden Plaenen).
// Firebase, Haushaltsbuch und /api/gemini sind simuliert; Screenshots landen in tests/e2e/shots/.
import pw from 'playwright'; const { chromium } = pw;
import fs from 'fs';
import { isoWeekKey, todayISO, todayDay, weekDates, weekLabel, shiftWeek, shortDate, slotOrderNow, migrateWeek } from '../../src/logic/weeks.js';
import { DAYS, MEALS } from '../../src/data.js';
const OUT = new URL('./shots/', import.meta.url).pathname;
// Monatskuerzel koennen sich zwischen Node und Chromium unterscheiden ("Sep." / "Sept.") -> auf drei Buchstaben kuerzen
const normLabel = (s)=>String(s||'').replace(/([A-Za-zÄÖÜäöü]+)\.?/g,(m,w)=>w.slice(0,3)).replace(/\s+/g,' ').trim();
const log = (...a)=>console.log(...a);
const findings = [];
const note = (s)=>{ findings.push(s); log('NOTE:', s); };
const fails = []; let n=0;
const check = (cond,msg,extra)=>{ n++; if(cond) log('  ok  ', msg); else { fails.push(msg); log('  FAIL', msg, extra!==undefined?JSON.stringify(extra).slice(0,300):''); } };

// ---------- Mock Firebase (in-memory REST, Multi-Path-PATCH) ----------
const db = { wochen: {}, hb: {} };
const iso = (daysAgo)=>{ const d=new Date(Date.now()-daysAgo*86400000); return d.toISOString().slice(0,10); };
db.hb.books = { FAMILIE1: {
  name: 'Familie Test', categories: ['Lebensmittel','Drogerie','Sonstiges'],
  entries: {
    e1: { date: iso(1), category:'Lebensmittel', shop:'Rewe', items:[
      {name:'Rinderhack 500g', amount:4.99, sub:'Fleisch'},{name:'Zwiebeln 1kg', amount:1.29, sub:'Gemüse'},
      {name:'Passata', amount:0.99, sub:'Konserven'},{name:'Spaghetti Barilla', amount:1.79, sub:'Trockenwaren'},
      {name:'Parmesan Stk', amount:3.49, sub:'Käse'},{name:'Vollmilch 3,5%', amount:1.09, sub:'Milchprodukte'},
      {name:'Jogh Natur', amount:0.89, sub:'Milchprodukte'},{name:'Bananen', amount:1.59, sub:'Obst'},
      {name:'Eier 10er Bio', amount:3.29, sub:'Milchprodukte'},{name:'Spülmittel', amount:1.49, sub:'Reinigung'} ]},
    e2: { date: iso(3), category:'Lebensmittel', shop:'Aldi', items:[
      {name:'Hähnchenbrustfilet', amount:5.49, sub:'Fleisch'},{name:'Paprika rot 3er', amount:2.49, sub:'Gemüse'},
      {name:'Basmati Reis', amount:2.29, sub:'Trockenwaren'},{name:'Kokosmilch', amount:1.19, sub:'Konserven'},
      {name:'Brokkoli', amount:1.29, sub:'Gemüse'},{name:'Lachsfilet TK', amount:6.99, sub:'Tiefkühl'} ]},
    e3: { date: iso(10), category:'Lebensmittel', shop:'Edeka', items:[
      {name:'Tellerlinsen', amount:1.99, sub:'Trockenwaren'},{name:'Möhren 1kg', amount:0.99, sub:'Gemüse'},
      {name:'Kartoffeln festk.', amount:2.49, sub:'Gemüse'},{name:'Lauch', amount:1.19, sub:'Gemüse'},
      {name:'Butter', amount:2.29, sub:'Milchprodukte'} ]},
    e4: { date: iso(30), category:'Lebensmittel', shop:'dm', items:[
      {name:'Haferflocken kernig', amount:0.99, sub:'Trockenwaren'},{name:'Honig', amount:3.99, sub:'Süßwaren'},
      {name:'Avocado', amount:1.49, sub:'Obst'} ]},
  }}};

const getAt = (root, parts)=>{ let o=root; for(const p of parts){ if(o==null||typeof o!=='object') return null; o=o[p]; } return o===undefined?null:o; };
const setAt = (root, parts, val)=>{ let o=root; for(let i=0;i<parts.length-1;i++){ if(o[parts[i]]==null||typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; } if(val===null) delete o[parts[parts.length-1]]; else o[parts[parts.length-1]]=val; };
const fbStats = { get:0, put:0, patch:0, patchGlobal:0, bytesUp:0, metaGets:0, weekGets:{} };
const mockFb = (store)=>async(route)=>{
  const req = route.request(); const u = new URL(req.url());
  const parts = u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
  const m = req.method();
  if(m==='GET'){
    fbStats.get++; if(parts[parts.length-1]==='meta') fbStats.metaGets++;
    if(parts[parts.length-2]==='weeks'){ const k=parts[parts.length-1]; fbStats.weekGets[k]=(fbStats.weekGets[k]||0)+1; }
    return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify(getAt(store,parts))});
  }
  const body = req.postData()||'null'; fbStats.bytesUp += body.length;
  const data = JSON.parse(body);
  if(m==='PUT'){ fbStats.put++; setAt(store,parts,data); }
  else if(m==='PATCH'){ fbStats.patch++; if(parts[0]==='globalRecipes') fbStats.patchGlobal++; if(getAt(store,parts)==null) setAt(store,parts,{}); for(const [k,v] of Object.entries(data||{})) setAt(store,[...parts,...k.split('/')],v); }
  return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify(data)});
};

// ---------- Mock KI ----------
const aiCalls = [];
const mockAi = async(route)=>{
  const body = JSON.parse(route.request().postData()||'{}');
  aiCalls.push(body);
  let text;
  if(body.mode==='suggest'){
    text = JSON.stringify({name:'Hähnchen-Paprika-Pfanne mit Reis', ingredients:['400 g Hähnchenbrustfilet','2 Paprika','1 Zwiebel','200 g Basmatireis','200 ml Kokosmilch','1 EL Currypulver','Salz','Pfeffer'], steps:['Reis nach Packung kochen.','Hähnchen würfeln, anbraten.','Paprika und Zwiebel zugeben, 5 Min. braten.','Kokosmilch und Curry zugeben, 8 Min. köcheln.','Mit Reis servieren.'], description:'Eine schnelle Pfanne aus dem, was da ist.', cuisine:'Asiatisch', genutzt:['Hähnchenbrustfilet','Paprika','Zwiebeln','Basmati Reis','Kokosmilch'], fehlt:['Currypulver']});
  } else {
    text = JSON.stringify({name:'Käsespätzle', ingredients:['400 g Spätzle','200 g Bergkäse','100 g Emmentaler','3 Zwiebeln','2 EL Butter','Salz','Pfeffer','Schnittlauch'], steps:['Zwiebeln in Ringe schneiden und in Butter goldbraun rösten.','Spätzle in Salzwasser kochen.','Spätzle und Käse schichtweise in eine Schüssel geben.','Mit Röstzwiebeln und Schnittlauch servieren.'], description:'Der schwäbische Klassiker: Spätzle, geschichtet mit würzigem Bergkäse und knusprigen Röstzwiebeln.', category:'Hauptgericht', cuisine:'Schwäbisch'});
  }
  await new Promise(r=>setTimeout(r,800));
  return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify({text})});
};

// ---------- Mock images ----------
const svgImg = (label)=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a5a2b"/><stop offset="1" stop-color="#3b2a1a"/></linearGradient></defs><rect width="800" height="480" fill="url(#g)"/><text x="400" y="250" font-family="Georgia" font-size="34" fill="#f0e6d8" text-anchor="middle">${label.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text></svg>`;

(async()=>{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'de-DE' });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on('console', m=>{ if(m.type()==='error'||m.type()==='warning') consoleErrs.push(m.type()+': '+m.text().slice(0,300)); });
  page.on('pageerror', e=>{ consoleErrs.push('pageerror: '+e.message); log('PAGEERROR', e.message); });
  page.on('dialog', async d=>{ log('DIALOG:', d.type(), d.message()); await d.accept(); });

  await ctx.route(/wochenessenplan-3d0e1-default-rtdb/, mockFb(db.wochen));
  await ctx.route(/haushaltsbuch-3cefb-default-rtdb/, mockFb(db.hb));
  await ctx.route(/\/api\/gemini/, mockAi);
  await ctx.route(/image\.pollinations\.ai/, async route=>{ const u=new URL(route.request().url()); const p=decodeURIComponent(u.searchParams.get('prompt')||'').split(',')[0]; await new Promise(r=>setTimeout(r,300)); return route.fulfill({status:200, contentType:'image/svg+xml', body:svgImg(p)}); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, route=>route.abort());

  const shot = async(name)=>{ await page.waitForTimeout(350); await page.screenshot({path:`${OUT}/${name}.png`, fullPage:true}); log('shot', name); };
  const IN_APP = 'button:has-text("Rezepte")';
  const wk = isoWeekKey(todayISO());
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('text=PLAN STARTEN', {timeout:15000});
  log('join screen after', Date.now()-t0, 'ms');
  await shot('01-join');

  // Start ohne Namen -> Hinweis am Namensfeld
  await page.click('text=PLAN STARTEN');
  await page.waitForTimeout(300);
  check(await page.isVisible('text=Bitte zuerst deinen Namen eingeben.'), 'Join: PLAN STARTEN ohne Namen zeigt einen Hinweis');
  check(Object.keys(db.wochen.plans||{}).length===0, 'Join: ohne Namen wird kein Plan angelegt');
  await page.fill('input[placeholder="z.B. Anna"]', 'Claude');
  const code = (await page.textContent('span[style*="letter-spacing: 6px"]')).trim();
  log('my code', code);
  check(/^[A-HJ-NP-Z2-9]{10}$/.test(code), 'Join: Code hat 10 Zeichen aus dem Alphabet ohne O/0/I/1');
  await page.click('text=PLAN STARTEN');
  await page.waitForSelector(IN_APP, {timeout:10000});
  await page.waitForTimeout(600);
  await shot('02-plan-empty');
  check(!!db.wochen.plans?.[code]?.meta, 'Plan starten legt meta an', db.wochen.plans?.[code]);
  check(!db.wochen.plans?.[code]?.recipes, 'Neuer Plan startet ohne Rezepte');

  // Startrezepte uebernehmen (nur auf Wunsch)
  await page.click('button:has-text("Rezepte")');
  await page.waitForTimeout(300);
  await shot('02b-recipes-empty');
  check(await page.isVisible('text=Rezept-Basis ·'), 'Rezepte: leeres Kochbuch zeigt die Rezept-Basis ohne Schalter');
  // Heute bei leerem Kochbuch: die ganze Rezept-Basis (erst 8, dann alle)
  await page.click('button:has-text("Heute")');
  await page.waitForTimeout(400);
  const baseHead = (await page.locator('text=/Aus der Rezept-Basis \\(\\d+\\)/').first().textContent().catch(()=>'')).trim();
  const baseN = parseInt((baseHead.match(/\((\d+)\)/)||[])[1]||'0',10);
  const insBtns = await page.locator('button:has-text("INS KOCHBUCH")').count();
  check(baseN>50&&insBtns===8&&await page.isVisible(`text=ALLE ${baseN} ANZEIGEN`), 'Heute: leeres Kochbuch zeigt die Rezept-Basis (8 von allen, Knopf "Alle anzeigen")', {baseHead, insBtns});
  await page.click(`text=ALLE ${baseN} ANZEIGEN`);
  await page.waitForTimeout(300);
  check((await page.locator('button:has-text("INS KOCHBUCH")').count())===baseN, 'Heute: "Alle anzeigen" listet die ganze Rezept-Basis');
  await shot('02d-heute-empty-base');
  await page.click('button:has-text("Rezepte")');
  await page.waitForTimeout(300);
  await page.click('text=STARTREZEPTE ÜBERNEHMEN');
  await page.waitForSelector('button:has-text("Pasta Bolognese")');
  await page.waitForTimeout(400);
  check(Object.keys(db.wochen.plans?.[code]?.recipes||{}).length===14, 'Startrezepte liegen unter plans/<CODE>/recipes');
  check(!db.wochen.globalRecipes, 'globalRecipes wird nicht beschrieben');
  await shot('02c-recipes-adopted');
  // Essensplan: Rubrik in Rezepte, Uebernahme fuer zwei Wochen in einem separaten Plan-Zustand pruefen (danach Woche wieder leeren)
  await page.click('button:has-text("Essenspläne")');
  await page.waitForTimeout(300);
  check(await page.isVisible('text=Postpartaler Eisen-Wochenplan')&&await page.isVisible('text=22 Rezepte'), 'Rezepte: Rubrik "Essenspläne" zeigt die Vorlage mit 22 Rezepten');
  await shot('02e-essensplaene');
  await page.click('text=IN DEN WOCHENPLAN ÜBERNEHMEN');
  await page.waitForTimeout(400);
  check(await page.isVisible('text=Essensplan übernehmen')&&await page.isVisible('text=Tägliche Routinen')&&await page.isVisible('text=Beide Wochen'), 'Woche: Dialog "Essensplan übernehmen" mit Routinen und Wochenwahl');
  await shot('02f-essensplan-dialog');
  await page.click('button:text-is("ÜBERNEHMEN")');
  await page.waitForTimeout(800);
  const wkNext = shiftWeek(wk,1);
  const w1 = db.wochen.plans[code].weeks?.[wk], w2 = db.wochen.plans[code].weeks?.[wkNext];
  const planRecs = Object.values(db.wochen.plans[code].recipes||{}).filter(r=>r.plan==='eisen-postpartal');
  check(w1&&w2&&w1.planId==='eisen-postpartal'&&w2.planId==='eisen-postpartal', 'Essensplan: beide Wochen tragen planId', {w1:w1&&w1.planId, w2:w2&&w2.planId});
  check(w1&&DAYS.every(d=>['Fr','Mi','Zw','Ab'].every(m=>(w1[d]?.meals?.[m]||[]).length===1)), 'Essensplan: alle 28 Felder der Woche belegt', w1&&w1.Mo);
  check(w1&&w1.Mo.meals.Zw[0]==='Eisen-Power-Hour'&&w1.Mi.meals.Mi[0]==='Lachsfilet mit Zitronen-Brokkoli & Basmati-Reis', 'Essensplan: Mo Nachmittag Eisen-Power-Hour, Mi Mittag Lachs', w1&&w1.Mo);
  check(planRecs.length===22&&planRecs.every(r=>r.source==='essensplan'), 'Essensplan: 22 Rezepte mit plan/source im Kochbuch', planRecs.length);
  check(Object.keys(db.wochen.plans[code].recipes).length===36, 'Essensplan: Startrezepte bleiben (14 + 22)');
  check(await page.isVisible('text=Postpartaler Eisen-Wochenplan')&&await page.isVisible('text=Routinen'), 'Woche: Banner mit Essensplan und Routinen');
  await shot('02g-woche-essensplan');
  // Zustand fuer den weiteren Durchlauf zuruecksetzen: Essensplan-Rezepte und Wochen entfernen (direkt im Mock), neu laden
  Object.keys(db.wochen.plans[code].recipes).forEach(k=>{ if(db.wochen.plans[code].recipes[k].plan) delete db.wochen.plans[code].recipes[k]; });
  delete db.wochen.plans[code].weeks;
  db.wochen.plans[code].meta.weeksUpdatedAt=Date.now(); db.wochen.plans[code].meta.recipesUpdatedAt=Date.now();
  await page.reload(); await page.waitForSelector(IN_APP,{timeout:10000}); await page.waitForTimeout(600);
  await page.click('button:text-is("Woche")');
  await page.waitForTimeout(300);
  check(await page.isVisible('text=Diese Woche ist noch leer.')&&await page.isVisible('button:has-text("ESSENSPLAN")'), 'Woche: leere Woche bietet "Essensplan" an');

  // Add dish to Montag Abendessen via dropdown
  const addBtns = page.locator('button:has-text("+ Hinzufügen...")');
  log('add buttons', await addBtns.count());
  await addBtns.nth(2).click(); // Mo Abendessen
  await page.waitForTimeout(400);
  await shot('03-dropdown-open');
  await page.click('button:has-text("HAUPTGERICHT")');
  await page.waitForTimeout(300);
  await shot('04-dropdown-hauptgericht');
  await page.click('button:has-text("Pasta Bolognese")');
  await page.waitForTimeout(300);
  await addBtns.nth(2).click();
  await page.fill('input[placeholder="Suchen oder eingeben..."]', 'sal');
  await page.waitForTimeout(300);
  await shot('05-dropdown-search');
  await page.click('button:has-text("Caesar Salad")');
  await addBtns.nth(1).click(); // Mo Mittag, freier Text
  await page.fill('input[placeholder="Suchen oder eingeben..."]', 'Reste von gestern');
  await page.keyboard.press('Enter');
  await addBtns.nth(0).click();
  await page.click('button:has-text("Haferflocken mit Beeren")');
  await addBtns.nth(6).click(); // Di Abend
  await page.click('button:has-text("Veggie-Curry")');
  await page.click('button:has-text("Wer kocht?") >> nth=0');
  await page.waitForTimeout(300);
  await shot('06-cook-picker');
  await page.click('div[style*="position: absolute"] button:has-text("Claude")');
  await page.waitForTimeout(600);
  await shot('07-plan-filled');
  const moAb = db.wochen.plans?.[code]?.weeks?.[wk]?.Mo?.meals?.Ab;
  check(JSON.stringify(moAb)===JSON.stringify(['Pasta Bolognese','Caesar Salad']), 'Slots liegen unter weeks/'+wk, db.wochen.plans?.[code]?.weeks);
  check(db.wochen.plans?.[code]?.weeks?.[wk]?.Mo?.cook==='Claude', 'Koch liegt unter weeks/<wk>/Mo/cook');

  // ---------- Wochen (Bauplan Abschnitt 6): Navigation, Datum im Tageskopf, heutiger Tag, Letzte Woche uebernehmen, Woche abschliessen ----------
  const dates = weekDates(wk), today = todayISO(), todayIdx = todayDay();
  const nextWk = shiftWeek(wk,1), prevWk = shiftWeek(wk,-1);
  const navLabel = async()=>(await page.locator('div[title="Kalenderwoche"]').textContent()).trim();
  check(normLabel(await navLabel())===normLabel(weekLabel(wk)), 'Woche: Label "'+weekLabel(wk)+'" sichtbar', await navLabel());
  check(await page.isVisible('text=diese Woche'), 'Woche: aktuelle Woche als "diese Woche" markiert');
  check(await page.isVisible('text=Mo '+shortDate(dates[0])), 'Woche: Tageskopf zeigt "Mo '+shortDate(dates[0])+'"');
  check(await page.isVisible('text=So '+shortDate(dates[6])), 'Woche: Tageskopf zeigt "So '+shortDate(dates[6])+'"');
  check(await page.isVisible('text='+DAYS[todayIdx]+' '+shortDate(today)+' · Heute'), 'Woche: heutiger Tag ist mit "· Heute" markiert');
  // Akzentrahmen am heutigen Tag und Anspringen beim Oeffnen des Reiters
  const todayCard = ()=>page.evaluate(()=>{
    const el=[...document.querySelectorAll('div')].find(d=>d.children.length===0&&/· Heute$/.test(d.textContent||''));
    let p=el; while(p&&!/^2px solid/.test(p.style.border)) p=p.parentElement;
    if(!p) return null;
    const r=p.getBoundingClientRect();
    return {border:getComputedStyle(p).borderTopColor, top:r.top, bottom:r.bottom, scrollY:window.scrollY, vh:window.innerHeight};
  });
  const tc0 = await todayCard();
  check(tc0&&tc0.border==='rgb(212, 144, 74)', 'Woche: heutiger Tag hat den Akzentrahmen', tc0);
  await page.click('button:has-text("Einkauf")'); await page.waitForTimeout(200);
  await page.click('button:text-is("Woche")'); await page.waitForTimeout(500);
  // Angesprungen = Seite ist gescrollt und die Karte steht oben bzw. (am Wochenende, wenn darunter zu wenig Inhalt ist) ganz im Bild
  const tc1 = await todayCard();
  log('today card after reopening plan:', JSON.stringify(tc1));
  check(tc1&&tc1.scrollY>0&&tc1.top>=-2&&(tc1.top<120||tc1.bottom<=tc1.vh+2), 'Woche: heutiger Tag wird beim Oeffnen angesprungen (oben bzw. ganz im Bild)', tc1);
  await shot('07b-plan-today');
  // Naechste Woche: leer -> "Letzte Woche uebernehmen"
  await page.click('button[aria-label="Nächste Woche"]'); await page.waitForTimeout(600);
  check(normLabel(await navLabel())===normLabel(weekLabel(nextWk)), 'Woche: › zeigt '+weekLabel(nextWk), await navLabel());
  check(await page.isVisible('text=kommende Woche'), 'Woche: naechste Woche als "kommende Woche" markiert');
  check((fbStats.weekGets[nextWk]||0)>=1, 'Woche: fehlende Woche wird aus plans/<CODE>/weeks/'+nextWk+' geladen', fbStats.weekGets);
  check(await page.isVisible('text=LETZTE WOCHE ÜBERNEHMEN'), 'Woche: leere Woche bietet "Letzte Woche übernehmen"');
  check(!(await page.isVisible('text=· Heute')), 'Woche: in der naechsten Woche ist kein Tag als heute markiert');
  await shot('07c-next-week-empty');
  await page.click('text=LETZTE WOCHE ÜBERNEHMEN'); await page.waitForTimeout(700);
  const wkNow = db.wochen.plans[code].weeks;
  check(JSON.stringify(migrateWeek(wkNow[nextWk]))===JSON.stringify(migrateWeek(wkNow[wk]))&&JSON.stringify(migrateWeek(wkNow[nextWk]).Mo.meals.Ab)===JSON.stringify(['Pasta Bolognese','Caesar Salad']), 'Woche: naechste Woche = komplette Kopie der aktuellen Woche in der DB', wkNow[nextWk]);
  check(!(await page.isVisible('text=LETZTE WOCHE ÜBERNEHMEN')), 'Woche: Knopf verschwindet, sobald die Woche gefuellt ist');
  await shot('07d-next-week-copied');
  // Zwei Wochen zurueck -> vorige Woche (aus der DB geladen, leer), dann "Heute"
  await page.click('button[aria-label="Vorige Woche"]'); await page.waitForTimeout(400);
  await page.click('button[aria-label="Vorige Woche"]'); await page.waitForTimeout(600);
  check(normLabel(await navLabel())===normLabel(weekLabel(prevWk)), 'Woche: ‹ ‹ zeigt die vorige Woche '+weekLabel(prevWk), await navLabel());
  check(await page.isVisible('text=vergangene Woche'), 'Woche: vorige Woche als "vergangene Woche" markiert');
  check((fbStats.weekGets[prevWk]||0)>=1, 'Woche: vorige Woche aus der DB geladen');
  await page.click('button[title="Zur aktuellen Woche"]'); await page.waitForTimeout(500);
  check(normLabel(await navLabel())===normLabel(weekLabel(wk))&&await page.isVisible('text=diese Woche'), 'Woche: "Heute" springt zur aktuellen Woche');
  check(!db.wochen.plans[code].weeks[prevWk], 'Woche: blosses Ansehen der vorigen Woche legt nichts in der DB an', Object.keys(db.wochen.plans[code].weeks));
  // Heute Abend etwas mit Rezept planen, damit "Woche abschliessen" und "Heute im Plan" sicher etwas haben
  await addBtns.nth(todayIdx*4+2).click();
  await page.fill('input[placeholder="Suchen oder eingeben..."]', 'Linsen');
  await page.click('button:has-text("Linsensuppe")');
  await page.waitForTimeout(500);
  // Woche abschliessen: alle Gerichte mit Rezept an Tagen bis heute, vorausgewaehlt, ein PATCH
  const wkDb = migrateWeek(db.wochen.plans[code].weeks[wk]);
  const expected = []; DAYS.forEach((d,i)=>{ if(dates[i]>today) return; MEALS.forEach(m=>(wkDb[d].meals[m]||[]).forEach(k=>{ if(db.wochen.plans[code].recipes[k]) expected.push({key:k,iso:dates[i]}); })); });
  log('Woche abschliessen, erwartet:', JSON.stringify(expected));
  await page.click('text=WOCHE ABSCHLIESSEN'); await page.waitForTimeout(400);
  await shot('07e-close-week-dialog');
  const boxes = page.locator('div[role="dialog"] input[type="checkbox"]');
  check(await boxes.count()===expected.length, 'Woche abschliessen: Dialog listet '+expected.length+' Gerichte mit Rezept bis heute', await boxes.count());
  check(await boxes.evaluateAll(els=>els.length>0&&els.every(e=>e.checked)), 'Woche abschliessen: alle vorausgewaehlt');
  check(!(await page.isVisible('div[role="dialog"] >> text=Reste von gestern')), 'Woche abschliessen: freier Text ohne Rezept steht nicht im Dialog');
  const patchesBefore = fbStats.patch;
  await page.click('text=GEKOCHT EINTRAGEN'); await page.waitForTimeout(700);
  check(fbStats.patch===patchesBefore+1, 'Woche abschliessen: genau EIN Multi-Path-PATCH', fbStats.patch-patchesBefore);
  const recsDb = db.wochen.plans[code].recipes;
  check(expected.every(e=>(recsDb[e.key]?.cooked||[]).includes(e.iso)&&recsDb[e.key]?.lastCooked>=e.iso), 'Woche abschliessen: cooked enthaelt je Gericht das Datum seines Tages', expected.map(e=>[e.key,recsDb[e.key]?.cooked]));
  check(JSON.stringify(recsDb['Linsensuppe']?.cooked)===JSON.stringify([today])&&recsDb['Linsensuppe']?.lastCooked===today, 'Woche abschliessen: Linsensuppe (heute Abend) hat cooked ['+today+']', recsDb['Linsensuppe']);
  check(Object.values(recsDb).every(r=>!r.cooked||JSON.stringify(r.cooked)===JSON.stringify([...new Set(r.cooked)].sort())), 'Woche abschliessen: cooked ist sortiert und ohne Doppelungen');
  check(await page.isVisible('text=in die Kochhistorie eingetragen'), 'Woche abschliessen: Bestaetigung sichtbar');
  await shot('07f-close-week-done');
  await page.click('text=WOCHE ABSCHLIESSEN'); await page.waitForTimeout(300);
  await page.click('text=GEKOCHT EINTRAGEN'); await page.waitForTimeout(500);
  check(JSON.stringify(db.wochen.plans[code].recipes['Linsensuppe'].cooked)===JSON.stringify([today]), 'Woche abschliessen: zweites Abschliessen erzeugt keine Doppelungen');

  // "+" to add single dish ingredients
  const plusBtn = page.locator('button[title="Zutaten zur Einkaufsliste"]').first();
  await plusBtn.click();
  await page.waitForTimeout(400);
  const tabs = await page.locator('button:has-text("Einkauf")').first().textContent();
  log('Einkauf tab label after +:', tabs);
  check(/Einkauf \(\d+\)/.test(tabs), 'Einkauf-Tab zeigt offene Posten nach +');
  await page.click('text=GESAMTE EINKAUFSLISTE GENERIEREN');
  await page.waitForTimeout(600);
  await shot('08-shopping');
  const items = await page.locator('span[title="Tippen zum Bearbeiten"]').allTextContents();
  log('shopping items:', JSON.stringify(items));
  check(items.length>5, 'Einkaufsliste hat Posten');
  const shopDb = db.wochen.plans?.[code]?.shopping;
  check(shopDb&&!Array.isArray(shopDb)&&Object.values(shopDb).every(x=>(x.src==='plan'||x.src==='manuell')&&x.key&&x.order), 'shopping ist ein Objekt mit src/key/order');
  check(Object.values(shopDb).some(x=>x.src==='plan'&&x.slots), 'Der "+"-Posten wurde vom Plan übernommen (src plan) und merkt sich seine Plan-Zelle (slots)', Object.values(shopDb).filter(x=>x.slots));
  const planKeys=Object.values(shopDb).filter(x=>x.src==='plan').map(x=>x.key);
  check(new Set(planKeys).size===planKeys.length, 'Kein Plan-Posten doppelt (gleicher key nur einmal)', planKeys);
  check(Object.values(shopDb).some(x=>x.basic===true), 'Grundvorrat (Salz, Öl …) ist als basic gekennzeichnet');
  check(await page.isVisible('text=Vorrat prüfen'), 'Einkauf: Block „Vorrat prüfen“ sichtbar');
  check(await page.isVisible('button:has-text("TEILEN")'), 'Einkauf: Teilen-Knopf vorhanden');
  const inputBox=await page.locator('input[placeholder="Produkt hinzufügen..."]').boundingBox();
  const firstRow=await page.locator('span[title="Tippen zum Bearbeiten"]').first().boundingBox();
  check(inputBox&&firstRow&&inputBox.y<firstRow.y, 'Einkauf: Eingabefeld steht oben über der Liste');
  const groups = await page.locator('div[style*="letter-spacing: 2px"][style*="text-transform: uppercase"][style*="padding: 8px 14px"]').allTextContents();
  log('shopping groups:', JSON.stringify(groups));
  // check one, edit one
  await page.locator('div:has(> span[title="Tippen zum Bearbeiten"]) > button').first().click();
  await page.waitForTimeout(300);
  check(Object.values(db.wochen.plans[code].shopping).filter(x=>x.checked).length===1, 'Haken wird als Feld geschrieben');
  await page.locator('span[title="Tippen zum Bearbeiten"]').nth(1).click();
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  await page.keyboard.type(' (Bio)');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(Object.values(db.wochen.plans[code].shopping).some(x=>x.text.endsWith('(Bio)')), 'Bearbeiteter Posten in der DB');
  await page.fill('input[placeholder="Produkt hinzufügen..."]', 'Klopapier');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check(Object.values(db.wochen.plans[code].shopping).some(x=>x.text==='Klopapier'&&x.src==='manuell'), 'Handeintrag mit src manuell');
  await shot('09-shopping-edited');
  // Regenerate -> manual items lost? (bekanntes Finding, wird mit dem Zusammenfuehren behoben)
  await page.click('button:text-is("Woche")');
  await page.waitForTimeout(300);
  await page.locator('button[title="Zutaten zur Einkaufsliste"]').first().click();
  await page.click('text=GESAMTE EINKAUFSLISTE GENERIEREN');
  await page.waitForTimeout(500);
  const items2 = await page.locator('span[title="Tippen zum Bearbeiten"]').allTextContents();
  log('after regenerate:', JSON.stringify(items2));
  check(items2.includes('Klopapier'), 'Einkauf: Generieren behält den Handeintrag Klopapier (Zusammenführen)', items2);
  check(Object.values(db.wochen.plans[code].shopping).filter(x=>x.checked).length===1, 'Einkauf: Generieren behält den Haken', Object.values(db.wochen.plans[code].shopping).filter(x=>x.checked));
  check(Object.values(db.wochen.plans[code].shopping).some(x=>x.text.endsWith('(Bio)')), 'Einkauf: bearbeiteter Posten bleibt (gleicher key)');
  const beeren = items2.find(t=>t.startsWith('Beeren')); log('Beeren after + then generate:', beeren);
  await page.click('button:text-is("Woche")');
  check((await page.locator('button[title="Zutaten zur Einkaufsliste"]').count())===0||!(await page.locator('span[title="bereits zur Einkaufsliste hinzugefügt"]').count()===0), 'Plan: „+“-Sperre bleibt nach dem Generieren (liegt im Plan)');
  check((await page.locator('span[title="bereits zur Einkaufsliste hinzugefügt"]').count())>=1, 'Plan: mindestens eine Zelle zeigt den Haken „bereits hinzugefügt“');

  // Recipes tab
  await page.click('button:has-text("Rezepte")');
  await page.waitForTimeout(400);
  await shot('10-recipes');
  await page.fill('input[placeholder="Rezept oder Zutat suchen..."]', 'parmesan');
  await page.waitForTimeout(300);
  await shot('11-recipes-search');
  await page.fill('input[placeholder="Rezept oder Zutat suchen..."]', '');
  await page.click('button:has-text("Pasta Carbonara")');
  await page.waitForTimeout(900);
  await shot('12-detail');
  // Portionen-Stepper skaliert die angezeigten Mengen (Rezept bleibt bei 4 Portionen)
  check(await page.locator('text=Hauptgericht · Italienisch · 4 Portionen').first().isVisible(), 'Detail: Metazeile "Hauptgericht · Italienisch · 4 Portionen"');
  check(await page.isVisible('text=Pasta 200g'), 'Detail: Zutat in Originalmenge "Pasta 200g"');
  check(await page.isVisible('text=noch nie gekocht'), 'Detail: Kochhistorie "noch nie gekocht" vor dem Kochen');
  await page.click('button[aria-label="Portion mehr"]'); await page.waitForTimeout(200);
  check(await page.isVisible('text=Pasta 250 g')&&await page.isVisible('text=5 Portionen'), 'Detail: + rechnet Pasta 200g auf 250 g um (5 Portionen)');
  for(let i=0;i<3;i++) await page.click('button[aria-label="Portion weniger"]');
  await page.waitForTimeout(200);
  check(await page.isVisible('text=Pasta 100 g')&&await page.isVisible('text=Eier 1 St.')&&await page.isVisible('text=Parmesan 30 g'), 'Detail: − auf 2 Portionen: Pasta 100 g, Eier 1 St., Parmesan 30 g');
  check(await page.isVisible('text=Schwarzer Pfeffer'), 'Detail: Zutat ohne Menge bleibt unveraendert');
  await shot('12b-detail-portions');
  check(db.wochen.plans[code].recipes['Pasta Carbonara'].servings===4&&db.wochen.plans[code].recipes['Pasta Carbonara'].ingredients[0]==='Pasta 200g', 'Detail: Stepper aendert nur die Anzeige, nicht das Rezept');
  await page.click('button[aria-label="Portion mehr"]'); await page.click('button[aria-label="Portion mehr"]');
  await page.click('text=KOCHMODUS');
  await page.waitForTimeout(300);
  await shot('13-cookmode');
  for(let i=0;i<4;i++){ await page.click('text=WEITER'); await page.waitForTimeout(150); }
  await page.click('text=FERTIG');
  await page.waitForTimeout(400);
  await shot('14-rating-dialog');
  check(JSON.stringify(db.wochen.plans[code].recipes['Pasta Carbonara'].cooked)===JSON.stringify([todayISO()]), 'FERTIG traegt das Kochdatum in cooked ein', db.wochen.plans[code].recipes['Pasta Carbonara']);
  await page.locator('button:has-text("★"), button:has-text("☆")').nth(3).click();
  await page.fill('textarea[placeholder^="Notiz fürs nächste Mal"]', 'Mehr Pfeffer, Speck knuspriger.');
  await page.click('text=SPEICHERN');
  await page.waitForTimeout(400);
  await shot('15-detail-rated');
  const carb = db.wochen.plans[code].recipes['Pasta Carbonara'];
  check(carb.rating===4&&carb.notes==='Mehr Pfeffer, Speck knuspriger.'&&carb.ingredients.length===5, 'Bewertung/Notiz als Feld-PATCH, Rezept sonst unveraendert', carb);
  check(await page.locator('text=1× gekocht, zuletzt heute').first().isVisible(), 'Detail: Kochhistorie zeigt "1× gekocht, zuletzt heute"');
  await page.click('text=BEARBEITEN');
  await page.waitForTimeout(300);
  await shot('16-edit');
  // Neue Felder im Bearbeiten-Formular: Portionen, Minuten, Herkunft, Quelle
  check(await page.isVisible('input[placeholder="z.B. Schwaben"]')&&await page.isVisible('input[placeholder="z.B. Kochbuch Oma S. 42"]'), 'Bearbeiten: Felder Herkunft und Quelle vorhanden');
  check((await page.locator('input[type="number"]').count())===2&&(await page.locator('input[type="number"]').first().inputValue())==='4', 'Bearbeiten: Portionen (4) und Minuten als Zahlenfelder');
  await page.fill('input[type="number"] >> nth=0', '2');
  await page.fill('input[type="number"] >> nth=1', '25');
  await page.fill('input[placeholder="z.B. Schwaben"]', 'Rom');
  await page.fill('input[placeholder="z.B. Kochbuch Oma S. 42"]', 'Kochbuch Nonna S. 12');
  check(!(await page.locator('select option', {hasText:'Kinderessen'}).count())&&!(await page.locator('select option', {hasText:/^Schnell$/}).count()), 'Bearbeiten: Kinderessen und Schnell sind keine Kategorie/Kueche mehr');
  await page.click('button:has-text("Für Kinder")');
  await page.click('text=SPEICHERN');
  await page.waitForTimeout(500);
  const carb2 = db.wochen.plans[code].recipes['Pasta Carbonara'];
  check(carb2.servings===2&&carb2.minutes===25&&carb2.origin==='Rom'&&carb2.sourceNote==='Kochbuch Nonna S. 12'&&carb2.rating===4&&JSON.stringify(carb2.cooked)===JSON.stringify([todayISO()]), 'Bearbeiten: Portionen, Minuten, Herkunft, Quelle gespeichert; Bewertung und Kochhistorie bleiben', carb2);
  check(JSON.stringify(carb2.tags)===JSON.stringify(['kinder']), 'Bearbeiten: Merkmal "Für Kinder" liegt als tags im Rezept', carb2.tags);
  check(await page.locator('text=Hauptgericht · Italienisch · Rom · 2 Portionen · 25 Min. · Für Kinder').first().isVisible(), 'Detail: Metazeile "Hauptgericht · Italienisch · Rom · 2 Portionen · 25 Min. · Für Kinder"');
  check(await page.locator('text=Quelle: Kochbuch Nonna S. 12').first().isVisible(), 'Detail: Quelle sichtbar');
  check(await page.isVisible('text=2 Portionen')&&await page.isVisible('text=Pasta 200g'), 'Detail: Stepper startet bei den gespeicherten 2 Portionen, Mengen unveraendert');
  await shot('16b-detail-meta');
  await page.click('text=ZURÜCK');
  await page.waitForTimeout(300);

  // KI import (text)
  await page.fill('textarea[placeholder^="Füge hier einen Rezepttext"]', 'Käsespätzle\n400 g Spätzle, 200 g Bergkäse, 100 g Emmentaler, 3 Zwiebeln, Butter, Salz, Pfeffer, Schnittlauch\nZwiebeln rösten, Spätzle kochen, mit Käse schichten.');
  await page.click('text=REZEPT MIT KI EXTRAHIEREN');
  await page.waitForSelector('text=ERKANNTES REZEPT', {timeout:10000});
  await page.waitForTimeout(300);
  await shot('17-extracted');
  await page.click('text=REZEPT SPEICHERN');
  await page.waitForTimeout(2500);
  const hasKS = await page.isVisible('button:has-text("Käsespätzle")');
  log('Käsespätzle in list:', hasKS);
  check(hasKS, 'Importiertes Rezept erscheint in der Liste');
  check(db.wochen.plans[code].recipes['Käsespätzle']?.source==='import'&&db.wochen.plans[code].recipes['Käsespätzle']?.servings===4, 'Import gespeichert mit source import, servings 4', db.wochen.plans[code].recipes['Käsespätzle']);

  // Heute tab (no HB)
  await page.click('button:has-text("Heute")');
  await page.waitForTimeout(600);
  await shot('18-heute-nohb');
  // "Heute im Plan": Slots des heutigen Tages aus der aktuellen Woche, Reihenfolge nach Uhrzeit, Tipp oeffnet das Rezept
  check(await page.isVisible('text=Heute im Plan'), 'Heute: Block "Heute im Plan" vorhanden');
  const planBlock = page.locator('div:has(> div:text-is("Heute im Plan"))').first();
  const wkDb2 = migrateWeek(db.wochen.plans[code].weeks[wk]);
  const todayDishes = slotOrderNow().flatMap(m=>wkDb2[DAYS[todayIdx]].meals[m]||[]);
  const dnT = (k)=>db.wochen.plans[code].recipes[k]?.name||k;
  const shownToday = await planBlock.locator('span[style*="font-size: 16px"]').allTextContents();
  log('Heute im Plan:', JSON.stringify(shownToday), 'erwartet:', JSON.stringify(todayDishes.map(dnT)));
  check(JSON.stringify(shownToday)===JSON.stringify(todayDishes.map(dnT)), 'Heute im Plan: heutige Gerichte in Slot-Reihenfolge (aktueller Slot zuerst)', {shownToday, todayDishes});
  check(shownToday.includes('Linsensuppe'), 'Heute im Plan: fuer heute geplante Linsensuppe sichtbar');
  await planBlock.locator('text=Linsensuppe').first().click();
  await page.waitForTimeout(500);
  check(await page.isVisible('text=KOCHMODUS')&&await page.locator('text=1× gekocht, zuletzt heute').first().isVisible(), 'Heute im Plan: Tipp oeffnet das Rezept (mit Kochhistorie aus "Woche abschließen")');
  await page.click('text=ZURÜCK');
  await page.waitForTimeout(400);
  check(await page.isVisible('text=Heute im Plan'), 'Heute: zurueck aus dem Rezept landet wieder in Heute');
  await page.fill('input[placeholder="BUCH-CODE"]', 'ABC');
  await page.click('button:has-text("VERBINDEN")');
  await page.waitForTimeout(300);
  log('hb err short:', await page.locator('div[style*="color: rgb(224, 85, 85)"]').last().textContent().catch(()=>'-'));
  await page.fill('input[placeholder="BUCH-CODE"]', 'FAMILIE1');
  await page.click('button:has-text("VERBINDEN")');
  await page.waitForTimeout(800);
  check(db.wochen.plans[code].hb?.code==='FAMILIE1', 'Haushaltsbuch-Verknuepfung liegt im Plan', db.wochen.plans[code].hb);
  await shot('19-heute-hb');
  // Vorratsliste: Kacheln, x = "nicht mehr da" (plans/<CODE>/hb/gone), Verblassen-Hinweis, wieder einblenden
  check(await page.isVisible('button:has-text("AKTUALISIEREN")')&&await page.isVisible('button:has-text("TRENNEN")'), 'Heute: Haushaltsbuch-Karte mit Kacheln Vorrat / Aktualisieren / Trennen');
  const statusTxt = (await page.locator('text=/Lebensmittel · \\d+ wahrscheinlich da/').first().textContent().catch(()=>'')).trim();
  const nBefore = parseInt((statusTxt.match(/(\d+) wahrscheinlich/)||[])[1]||'0',10);
  check(nBefore>5, 'Heute: Statuszeile nennt Rubrik und Anzahl', statusTxt);
  await page.click('button:has-text("VORRAT")');
  await page.waitForTimeout(300);
  check(await page.isVisible('text=Verblasst nach:')&&await page.isVisible('text=Fisch 4 Tage'), 'Vorrat: Hinweis nennt die Tage je Gruppe (Fisch 4 Tage …)');
  check(await page.isVisible('text=/noch \\d+ Tage/'), 'Vorrat: jede Position zeigt Einkauf und Resttage');
  const goneBtn = page.locator('button[aria-label$="ist nicht mehr da"]').first();
  const goneName = (await goneBtn.getAttribute('aria-label')).replace(' ist nicht mehr da','');
  await goneBtn.click();
  await page.waitForTimeout(500);
  const goneKeys = Object.keys(db.wochen.plans[code].hb?.gone||{});
  const statusAfter = (await page.locator('text=/Lebensmittel · \\d+ wahrscheinlich da/').first().textContent().catch(()=>'')).trim();
  const nAfter = parseInt((statusAfter.match(/(\d+) wahrscheinlich/)||[])[1]||'0',10);
  check(goneKeys.length===1&&nAfter===nBefore-1&&!(await page.isVisible(`button[aria-label="${goneName} ist nicht mehr da"]`)), 'Vorrat: x streicht die Position, Markierung liegt unter hb/gone, Zaehler sinkt', {goneName, goneKeys, nBefore, nAfter});
  check(await page.isVisible('text=1 Position von Hand gestrichen.'), 'Vorrat: Hinweis auf gestrichene Positionen');
  await shot('19c-heute-vorrat');
  await page.click('text=wieder einblenden');
  await page.waitForTimeout(500);
  check(!db.wochen.plans[code].hb?.gone&&await page.isVisible(`button[aria-label="${goneName} ist nicht mehr da"]`), 'Vorrat: "wieder einblenden" loescht hb/gone und zeigt die Position wieder');
  // Sortierung nach Wahrscheinlichkeit: Prozentwerte der weiteren Vorschlaege fallen monoton
  await page.click('button:has-text("VORRAT")');
  await page.waitForTimeout(200);
  const pcts = (await page.locator('div[style*="font-size: 14px"][style*="font-weight: 700"]').allTextContents()).filter(t=>/^\d+ %$/.test(t.trim())).map(t=>parseInt(t,10));
  check(pcts.length>=3&&pcts.every((v,i)=>i===0||v<=pcts[i-1]), 'Heute: Vorschlaege absteigend nach Wahrscheinlichkeit sortiert', pcts);
  // Chip "Bewaehrt": gekocht und >= 3 Sterne -> nur Pasta Carbonara
  await page.click('button:has-text("Bewährt")');
  await page.waitForTimeout(300);
  const provenTop = (await page.locator('div[style*="font-size: 22px"]').first().textContent().catch(()=>'')).trim();
  const provenRows = await page.locator('div[style*="font-size: 15px"][style*="white-space: nowrap"]').allTextContents();
  check(provenTop==='Pasta Carbonara'&&provenRows.length===0, 'Heute: Chip "Bewährt" zeigt genau Pasta Carbonara (gekocht, 4 Sterne)', {provenTop, provenRows});
  await shot('19b-heute-bewaehrt');
  await page.click('button:has-text("Alle Gerichte")');
  await page.click('text=MEHR VORSCHLÄGE');
  await page.waitForTimeout(300);
  await shot('20-heute-more');
  const topTitle = await page.locator('div[style*="font-size: 22px"]').first().textContent();
  log('top suggestion:', topTitle);
  const rows = await page.locator('div[style*="font-size: 15px"][style*="white-space: nowrap"]').allTextContents();
  log('suggestion rows:', JSON.stringify(rows));
  const breakfast = ['Haferflocken mit Beeren','Avocado Toast','Rühreier','Joghurt & Granola','Pfannkuchen'];
  if(new Date().getHours()>=11) check(![topTitle,...rows].some(t=>breakfast.includes(t.trim())), 'Heute: nach 11 Uhr kein Fruehstueck unter "Alle Gerichte"', [topTitle,...rows]);
  else log('vor 11 Uhr: Fruehstueck darf unter "Alle Gerichte" erscheinen');
  await page.click('button:has-text("Frühstück") >> nth=0');
  await page.waitForTimeout(300);
  const bfTop = (await page.locator('div[style*="font-size: 22px"]').first().textContent().catch(()=>'')).trim();
  check(breakfast.includes(bfTop), 'Heute: Chip "Frühstück" zeigt Fruehstuecksrezepte', bfTop);
  await page.click('button:has-text("Alle Gerichte")');
  await page.click('button:has-text("Kinderessen") >> nth=0');
  await page.waitForTimeout(300);
  const kidsTop = (await page.locator('div[style*="font-size: 22px"]').first().textContent().catch(()=>'')).trim();
  check(kidsTop==='Pasta Carbonara', 'Heute: Chip "Kinderessen" zeigt das Rezept mit Merkmal "Für Kinder"', kidsTop);
  await shot('21-heute-kinder');
  await page.click('button:has-text("Alle Gerichte")');
  await page.click('button:has-text("Schnell") >> nth=0');
  await page.waitForTimeout(300);
  const quickTop = (await page.locator('div[style*="font-size: 22px"]').first().textContent().catch(()=>'')).trim();
  check(quickTop==='Pasta Carbonara', 'Heute: Chip "Schnell" greift ueber die Zeit (25 Min.)', quickTop);
  await page.click('button:has-text("Alle Gerichte")');
  await page.click('button:has-text("Schnell") >> nth=0');
  await page.click('text=BEKANNTES GERICHT FINDEN');
  check(aiCalls.length>0, 'KI: Aufruf abgesetzt');
  await page.waitForSelector('text=VORSCHLAG DER KI', {timeout:10000});
  await page.waitForTimeout(400);
  await shot('22-ki-vorschlag');
  await page.click('text=INS KOCHBUCH & ÖFFNEN');
  await page.waitForTimeout(900);
  await shot('23-ki-detail');
  check(db.wochen.plans[code].recipes['Hähnchen-Paprika-Pfanne mit Reis']?.source==='ki', 'KI-Vorschlag gespeichert mit source ki');
  await page.click('text=ZURÜCK');
  await page.waitForTimeout(300);

  // Kochbuch-PDF (jetzt im Reiter Rezepte)
  await page.click('button:has-text("Rezepte")');
  await page.waitForTimeout(400);
  await shot('24-recipes-pdf');
  const [popup] = await Promise.all([ ctx.waitForEvent('page'), page.click('text=KOCHBUCH ALS PDF DRUCKEN') ]);
  await popup.waitForTimeout(600);
  const pdfHtml = await popup.content();
  fs.writeFileSync(`${OUT}/kochbuch.html`, pdfHtml);
  log('pdf html length', pdfHtml.length);
  check(pdfHtml.includes('Käsespätzle')&&pdfHtml.includes('Rühreier'), 'Kochbuch-PDF enthaelt Rezepte mit Anzeigenamen');
  await popup.close().catch(()=>{});

  // Font zoom
  await page.click('button[aria-label="Menü"]'); await page.waitForTimeout(200);
  await shot('24b-menu');
  check(await page.isVisible('text=KI-Symbolbilder')&&await page.isVisible('text=Plan verlassen')&&await page.isVisible('text=Version '), 'Shell: Menü „⋯“ mit KI-Symbolbildern, Plan verlassen und Version');
  await page.click('button[title="Schrift größer"]');
  await page.click('button[title="Schrift größer"]');
  check((await page.evaluate(()=>document.body.style.zoom))==='1.2', 'Shell: A+ zweimal setzt den Zoom auf 1.2');
  await page.mouse.click(5,400); await page.waitForTimeout(200);   // Menue schliessen (Tipp daneben)
  check(!(await page.isVisible('text=Plan verlassen')), 'Shell: Tipp neben das Menü schließt es');
  await page.click('button:text-is("Woche")');
  await page.waitForTimeout(400);
  await shot('25-plan-zoom120');
  await page.click('button[aria-label="Menü"]'); await page.waitForTimeout(200);
  await page.click('button[title="Schrift kleiner"]');
  await page.click('button[title="Schrift kleiner"]');
  await page.keyboard.press('Escape'); await page.mouse.click(5,300); await page.waitForTimeout(200);

  // Reload -> session persist
  await page.reload();
  await page.waitForTimeout(1500);
  const stillIn = await page.isVisible(IN_APP);
  log('session persisted after reload:', stillIn);
  check(stillIn, 'Sitzung bleibt nach Neuladen erhalten');

  // Desktop view, zweites Geraet
  const dctx = await browser.newContext({ viewport:{width:1280,height:900}, locale:'de-DE' });
  await dctx.route(/wochenessenplan-3d0e1-default-rtdb/, mockFb(db.wochen));
  await dctx.route(/haushaltsbuch-3cefb-default-rtdb/, mockFb(db.hb));
  await dctx.route(/image\.pollinations\.ai/, route=>route.fulfill({status:200, contentType:'image/svg+xml', body:svgImg('Bild')}));
  await dctx.route(/fonts\.(googleapis|gstatic)\.com/, route=>route.abort());
  const dp = await dctx.newPage();
  await dp.goto('http://127.0.0.1:5173/');
  await dp.waitForSelector('text=PLAN STARTEN');
  await dp.fill('input[placeholder="z.B. Anna"]', 'Partner');
  await dp.fill('input[placeholder="CODE"]', code);
  await dp.click('button:has-text("BEITRETEN")');
  await dp.waitForSelector(IN_APP);
  await dp.waitForTimeout(800);
  await dp.screenshot({path:`${OUT}/30-desktop-plan.png`, fullPage:false});
  check(JSON.stringify(db.wochen.plans[code].participants)===JSON.stringify(['Claude','Partner']), 'Zweiter Teilnehmer per PATCH ergaenzt', db.wochen.plans[code].participants);
  await dp.click('button:has-text("Heute")');
  await dp.waitForTimeout(1000);
  await dp.screenshot({path:`${OUT}/31-desktop-heute.png`, fullPage:false});
  // Desktop adds a dish to Mi Abendessen, phone should see it after poll
  await dp.click('button:text-is("Woche")');
  await dp.locator('button:has-text("+ Hinzufügen...")').nth(10).click();
  await dp.click('button:has-text("Risotto")');
  await dp.waitForTimeout(1500);
  const metaBefore = fbStats.metaGets;
  await page.waitForTimeout(11000);
  await page.click('button:has-text("Wer kocht?") >> nth=0');
  await page.waitForTimeout(300);
  const names = await page.locator('div[style*="position: absolute"] button').allTextContents();
  log('cook picker participants on phone after sync:', JSON.stringify(names));
  check(names.some(t=>t.includes('Partner')), 'Zweiter Teilnehmer nach Poll im Kochpicker');
  await page.keyboard.press('Escape');
  await page.mouse.click(5,5);
  const phoneHasRisotto = await page.isVisible('span:has-text("Risotto")');
  log('phone sees Risotto after sync:', phoneHasRisotto);
  check(phoneHasRisotto, 'Handy sieht Risotto nach dem Poll');
  check(fbStats.metaGets>metaBefore, 'Poll fragt plans/<CODE>/meta ab');
  await page.click('button:has-text("Einkauf")'); await page.click('button:text-is("Woche")');
  await shot('26-plan-two-users');

  log('--- fb stats', JSON.stringify(fbStats));
  check(fbStats.put===0&&fbStats.patchGlobal===0&&!db.wochen.globalRecipes, 'Keine PUTs, keine Schreibzugriffe auf globalRecipes', fbStats);
  log('--- plan keys in mock:', Object.keys(db.wochen.plans?.[code]||{}));
  log('--- weeks:', JSON.stringify(db.wochen.plans?.[code]?.weeks));
  log('--- meta:', JSON.stringify(db.wochen.plans?.[code]?.meta));
  log('--- ai calls:', aiCalls.length);
  fs.writeFileSync(`${OUT}/aicalls.json`, JSON.stringify(aiCalls,null,1));
  log('--- console errors/warnings:', consoleErrs.length); consoleErrs.slice(0,15).forEach(e=>log('  ', e));
  log('--- findings:'); findings.forEach(f=>log(' *', f));
  log('--- Ergebnis:', n-fails.length, 'von', n, 'Pruefungen bestanden');
  if(fails.length){ log('FEHLGESCHLAGEN:'); fails.forEach(f=>log(' *', f)); }
  await browser.close();
  process.exit(fails.length?1:0);
})().catch(e=>{ console.error('FAILED', e); process.exit(1); });
