import pw from 'playwright'; const { chromium } = pw;
import fs from 'fs';
const OUT = new URL('./shots/', import.meta.url).pathname;
const log = (...a)=>console.log(...a);
const findings = [];
const note = (s)=>{ findings.push(s); log('NOTE:', s); };

// ---------- Mock Firebase (in-memory REST) ----------
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
const fbStats = { get:0, put:0, patch:0, patchGlobal:0, bytesUp:0 };
const mockFb = (store)=>async(route)=>{
  const req = route.request(); const u = new URL(req.url());
  const parts = u.pathname.replace(/\.json$/,'').split('/').filter(Boolean);
  const m = req.method();
  if(m==='GET'){ fbStats.get++; return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify(getAt(store,parts))}); }
  const body = req.postData()||'null'; fbStats.bytesUp += body.length;
  const data = JSON.parse(body);
  if(m==='PUT'){ fbStats.put++; setAt(store,parts,data); }
  else if(m==='PATCH'){ fbStats.patch++; if(parts[0]==='globalRecipes') fbStats.patchGlobal++; let o=getAt(store,parts); if(o==null||typeof o!=='object'){o={}; setAt(store,parts,o);} for(const [k,v] of Object.entries(data)){ if(v===null) delete o[k]; else o[k]=v; } }
  return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify(data)});
};

// ---------- Mock KI ----------
const aiCalls = [];
const mockAi = async(route)=>{
  const body = JSON.parse(route.request().postData()||'{}');
  aiCalls.push(body);
  const sys = body.system||'';
  let text;
  if(sys.includes('Erfinde')){
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
  page.on('pageerror', e=>consoleErrs.push('pageerror: '+e.message));
  page.on('dialog', async d=>{ log('DIALOG:', d.type(), d.message()); await d.accept(); });

  await ctx.route(/wochenessenplan-3d0e1-default-rtdb/, mockFb(db.wochen));
  await ctx.route(/haushaltsbuch-3cefb-default-rtdb/, mockFb(db.hb));
  await ctx.route(/\/api\/gemini/, mockAi);
  await ctx.route(/image\.pollinations\.ai/, async route=>{ const u=new URL(route.request().url()); const p=decodeURIComponent(u.searchParams.get('prompt')||'').split(',')[0]; await new Promise(r=>setTimeout(r,300)); return route.fulfill({status:200, contentType:'image/svg+xml', body:svgImg(p)}); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, route=>route.abort());

  const shot = async(name)=>{ await page.waitForTimeout(350); await page.screenshot({path:`${OUT}/${name}.png`, fullPage:true}); log('shot', name); };
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('text=PLAN STARTEN', {timeout:15000});
  log('join screen after', Date.now()-t0, 'ms');
  await shot('01-join');

  // Try starting without name
  await page.click('text=PLAN STARTEN');
  await page.waitForTimeout(500);
  if(await page.isVisible('text=PLAN STARTEN')) note('Join: Klick auf PLAN STARTEN ohne Namen tut gar nichts – keine Rückmeldung, warum.');
  await page.fill('input[placeholder="z.B. Anna"]', 'Claude');
  const code = (await page.textContent('span[style*="letter-spacing: 6px"]')).trim();
  log('my code', code);
  await page.click('text=PLAN STARTEN');
  await page.waitForSelector('text=Wochenplan', {timeout:10000});
  await page.waitForTimeout(800);
  await shot('02-plan-empty');

  // Add dish to Montag Abendessen via dropdown
  const addBtns = page.locator('button:has-text("+ Hinzufügen...")');
  log('add buttons', await addBtns.count());
  await addBtns.nth(2).click(); // Mo Abendessen
  await page.waitForTimeout(400);
  await shot('03-dropdown-open');
  // click category tab HAUPTGERICHT
  await page.click('button:has-text("HAUPTGERICHT")');
  await page.waitForTimeout(300);
  await shot('04-dropdown-hauptgericht');
  await page.click('button:has-text("Pasta Bolognese")');
  await page.waitForTimeout(300);
  // Add second recipe to same slot
  await addBtns.nth(2).click();
  await page.fill('input[placeholder="Suchen oder eingeben..."]', 'sal');
  await page.waitForTimeout(300);
  await shot('05-dropdown-search');
  await page.click('button:has-text("Caesar Salad")');
  // Free text dish (no recipe)
  await addBtns.nth(1).click(); // Mo Mittag
  await page.fill('input[placeholder="Suchen oder eingeben..."]', 'Reste von gestern');
  await page.keyboard.press('Enter');
  // Frühstück
  await addBtns.nth(0).click();
  await page.click('button:has-text("Haferflocken mit Beeren")');
  // Dienstag Abend
  await addBtns.nth(6).click();
  await page.click('button:has-text("Veggie-Curry")');
  // Cook picker
  await page.click('button:has-text("Wer kocht?") >> nth=0');
  await page.waitForTimeout(300);
  await shot('06-cook-picker');
  await page.click('div[style*="position: absolute"] button:has-text("Claude")');
  await page.waitForTimeout(300);
  await shot('07-plan-filled');

  // "+" to add single dish ingredients
  const plusBtn = page.locator('button[title="Zutaten zur Einkaufsliste"]').first();
  await plusBtn.click();
  await page.waitForTimeout(300);
  // Tab label
  const tabs = await page.locator('button:has-text("Einkauf")').first().textContent();
  log('Einkauf tab label after +:', tabs);
  // Generate whole list
  await page.click('text=GESAMTE EINKAUFSLISTE GENERIEREN');
  await page.waitForTimeout(600);
  await shot('08-shopping');
  const items = await page.locator('span[title="Tippen zum Bearbeiten"]').allTextContents();
  log('shopping items:', JSON.stringify(items));
  const groups = await page.locator('div[style*="letter-spacing: 2px"][style*="text-transform: uppercase"][style*="padding: 8px 14px"]').allTextContents();
  log('shopping groups:', JSON.stringify(groups));
  // check one, edit one
  await page.locator('div:has(> span[title="Tippen zum Bearbeiten"]) > button').first().click();
  await page.locator('span[title="Tippen zum Bearbeiten"]').nth(1).click();
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  await page.keyboard.type(' (Bio)');
  await page.keyboard.press('Enter');
  await page.fill('input[placeholder="Produkt hinzufügen..."]', 'Klopapier');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await shot('09-shopping-edited');
  // Regenerate -> manual items lost?
  await page.click('button:has-text("Wochenplan")');
  await page.waitForTimeout(300);
  await page.locator('button[title="Zutaten zur Einkaufsliste"]').first().click(); // + again after reset
  await page.click('text=GESAMTE EINKAUFSLISTE GENERIEREN');
  await page.waitForTimeout(500);
  const items2 = await page.locator('span[title="Tippen zum Bearbeiten"]').allTextContents();
  log('after regenerate:', JSON.stringify(items2));
  if(!items2.includes('Klopapier')) note('Einkauf: "GESAMTE EINKAUFSLISTE GENERIEREN" löscht manuell eingetragene Produkte (Klopapier weg) und abgehakte Haken.');
  const beeren = items2.find(t=>t.startsWith('Beeren')); log('Beeren after + then generate:', beeren);
  await page.click('button:has-text("Wochenplan")');
  await page.locator('button[title="Zutaten zur Einkaufsliste"]').first().click();
  await page.click('button:has-text("Einkauf")');
  await page.waitForTimeout(300);
  const items3 = await page.locator('span[title="Tippen zum Bearbeiten"]').allTextContents();
  log('Beeren after extra +:', items3.find(t=>t.startsWith('Beeren')));

  // Recipes tab
  await page.click('button:has-text("Rezepte")');
  await page.waitForTimeout(400);
  await shot('10-recipes');
  await page.fill('input[placeholder="Rezept oder Zutat suchen..."]', 'parmesan');
  await page.waitForTimeout(300);
  await shot('11-recipes-search');
  await page.fill('input[placeholder="Rezept oder Zutat suchen..."]', '');
  // Detail
  await page.click('button:has-text("Pasta Carbonara")');
  await page.waitForTimeout(900);
  await shot('12-detail');
  // Cook mode
  await page.click('text=KOCHMODUS');
  await page.waitForTimeout(300);
  await shot('13-cookmode');
  for(let i=0;i<4;i++){ await page.click('text=WEITER'); await page.waitForTimeout(150); }
  await page.click('text=FERTIG');
  await page.waitForTimeout(400);
  await shot('14-rating-dialog');
  await page.locator('button:has-text("★"), button:has-text("☆")').nth(3).click();
  await page.fill('textarea[placeholder^="Notiz fürs nächste Mal"]', 'Mehr Pfeffer, Speck knuspriger.');
  await page.click('text=SPEICHERN');
  await page.waitForTimeout(400);
  await shot('15-detail-rated');
  // Edit mode
  await page.click('text=BEARBEITEN');
  await page.waitForTimeout(300);
  await shot('16-edit');
  await page.click('text=ABBRECHEN');
  // back
  await page.click('text=ZURUECK');
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

  // Heute tab (no HB)
  await page.click('button:has-text("Heute")');
  await page.waitForTimeout(600);
  await shot('18-heute-nohb');
  // connect HB wrong code
  await page.fill('input[placeholder="BUCH-CODE"]', 'ABC');
  await page.click('button:has-text("VERBINDEN")');
  await page.waitForTimeout(300);
  log('hb err short:', await page.locator('div[style*="color: rgb(224, 85, 85)"]').last().textContent().catch(()=>'-'));
  await page.fill('input[placeholder="BUCH-CODE"]', 'FAMILIE1');
  await page.click('button:has-text("VERBINDEN")');
  await page.waitForTimeout(800);
  await shot('19-heute-hb');
  await page.click('text=MEHR VORSCHLÄGE');
  await page.waitForTimeout(300);
  await shot('20-heute-more');
  const topTitle = await page.locator('div[style*="font-size: 22px"]').first().textContent();
  log('top suggestion:', topTitle);
  const rows = await page.locator('div[style*="font-size: 15px"][style*="white-space: nowrap"]').allTextContents();
  log('suggestion rows:', JSON.stringify(rows));
  const pcts = await page.locator('div[style*="font-size: 13px"][style*="font-weight: 700"][style*="flex-shrink: 0"]').allTextContents();
  log('pcts:', JSON.stringify(pcts));
  // Kinderessen filter (empty)
  await page.click('button:has-text("Kinderessen") >> nth=0');
  await page.waitForTimeout(300);
  await shot('21-heute-kinder-empty');
  await page.click('button:has-text("Alle Gerichte")');
  // KI generate
  await page.click('button:has-text("Schnell") >> nth=0');
  await page.click('text=REZEPT MIT KI ERFINDEN');
  await page.waitForSelector('text=VORSCHLAG DER KI', {timeout:10000});
  await page.waitForTimeout(400);
  await shot('22-ki-vorschlag');
  await page.click('text=INS KOCHBUCH & ÖFFNEN');
  await page.waitForTimeout(900);
  await shot('23-ki-detail');
  await page.click('text=ZURUECK');
  await page.waitForTimeout(300);

  // Cookbook
  await page.click('button:has-text("Kochbuch")');
  await page.waitForTimeout(400);
  await shot('24-cookbook');
  // PDF popup
  const [popup] = await Promise.all([ ctx.waitForEvent('page'), page.click('text=KOCHBUCH ALS PDF DRUCKEN') ]);
  await popup.waitForTimeout(600);
  const pdfHtml = await popup.content();
  fs.writeFileSync(`${OUT}/kochbuch.html`, pdfHtml);
  log('pdf html length', pdfHtml.length);
  await popup.close().catch(()=>{});

  // Font zoom
  await page.click('button[title="Schrift größer"]');
  await page.click('button[title="Schrift größer"]');
  await page.click('button:has-text("Wochenplan")');
  await page.waitForTimeout(400);
  await shot('25-plan-zoom120');
  await page.click('button[title="Schrift kleiner"]');
  await page.click('button[title="Schrift kleiner"]');

  // Reload -> session persist
  await page.reload();
  await page.waitForTimeout(1500);
  const stillIn = await page.isVisible('button:has-text("Kochbuch")');
  log('session persisted after reload:', stillIn);

  // Desktop view
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
  await dp.waitForSelector('button:has-text("Kochbuch")');
  await dp.waitForTimeout(800);
  await dp.screenshot({path:`${OUT}/30-desktop-plan.png`, fullPage:false});
  await dp.click('button:has-text("Heute")');
  await dp.waitForTimeout(1000);
  await dp.screenshot({path:`${OUT}/31-desktop-heute.png`, fullPage:false});
  // Desktop adds a dish to Mi Abendessen, phone should see it after poll
  await dp.click('button:has-text("Wochenplan")');
  await dp.locator('button:has-text("+ Hinzufügen...")').nth(10).click();
  await dp.click('button:has-text("Risotto")');
  await dp.waitForTimeout(1500);
  // Second participant visible in cook picker on first page after poll?
  await page.waitForTimeout(11000);
  await page.click('button:has-text("Wer kocht?") >> nth=0');
  await page.waitForTimeout(300);
  const names = await page.locator('div[style*="position: absolute"] button').allTextContents();
  log('cook picker participants on phone after sync:', JSON.stringify(names));
  await page.keyboard.press('Escape');
  await page.mouse.click(5,5);
  const phoneHasRisotto = await page.isVisible('span:has-text("Risotto")');
  log('phone sees Risotto after sync:', phoneHasRisotto);
  const t1=Date.now(); await page.click('button:has-text("Einkauf")'); await page.click('button:has-text("Wochenplan")');
  await shot('26-plan-two-users');

  log('--- fb stats', JSON.stringify(fbStats));
  log('--- globalRecipes keys in mock:', Object.keys(db.wochen.globalRecipes||{}));
  log('--- plan participants:', JSON.stringify(db.wochen.plans?.[code]?.participants));
  log('--- plan Mo:', JSON.stringify(db.wochen.plans?.[code]?.plan?.Mo));
  log('--- ai calls:', aiCalls.length);
  fs.writeFileSync(`${OUT}/aicalls.json`, JSON.stringify(aiCalls,null,1));
  log('--- console errors/warnings:', consoleErrs.length); consoleErrs.slice(0,15).forEach(e=>log('  ', e));
  log('--- findings:'); findings.forEach(f=>log(' *', f));
  await browser.close();
})().catch(e=>{ console.error('FAILED', e); process.exit(1); });
