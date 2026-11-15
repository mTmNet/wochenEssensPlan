// Durchlauf durch Version 3 ("Heute statt Woche"): Vormerken, Vorrat, Vorschlaege, Einkauf aus dem Vorgemerkten.
// Firebase, Haushaltsbuch und /api/gemini sind simuliert; Screenshots landen in tests/e2e/shots/ (Praefix v3-).
import pw from 'playwright'; const { chromium } = pw;
import fs from 'fs';
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
    e5: { date: iso(5), category:'Lebensmittel', shop:'Metzger', items:[ {name:'Bratwurst', amount:2.99, sub:'Fleisch'} ]},
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
  if(m==='DELETE'){ fbStats.del=(fbStats.del||0)+1; setAt(store,parts,null); return route.fulfill({status:200, contentType:'application/json', body:'null'}); }
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
  if(String(body.system||'').includes('Kassenbons')){
    // Namen zuordnen: einfache Regel im Mock (erstes Wort), ein paar feste Faelle, Spuelmittel = kein Lebensmittel
    const FIX = {'Jogh Natur':'Joghurt','Vollmilch 3,5%':'Milch','Lachsfilet TK':'Lachs','Eier 10er Bio':'Eier','Bratwurst':'Bratwurst','Honig':'Honig','Spülmittel':null,'Kokosmilch':'Kokosmilch','Haferflocken kernig':'Haferflocken','Butter':'Butter','Avocado':'Avocado'};
    const raws = String(body.messages?.[0]?.content||'').split('\n').filter(l=>l.startsWith('- ')).map(l=>l.slice(2));
    text = JSON.stringify({zuordnung: raws.map(r=>({roh:r, name: r in FIX ? FIX[r] : r.split(' ')[0]}))});
  } else if(String(body.system||'').includes('Speisekammer')){
    text = JSON.stringify({items:[{name:'Kokosmilch',gruppe:'Konserven'},{name:'Rote Linsen',gruppe:'Trockenwaren'},{name:'Kichererbsen',gruppe:'Konserven'},{name:'Spülmittel',gruppe:'Sonstiges'}]});
  } else if(body.mode==='suggest'){
    text = JSON.stringify({name:'Hähnchen-Paprika-Pfanne mit Reis', ingredients:['400 g Hähnchenbrustfilet','2 Paprika','1 Zwiebel','200 g Basmatireis','200 ml Kokosmilch','1 EL Currypulver','Salz','Pfeffer'], steps:['Reis nach Packung kochen.','Hähnchen würfeln, anbraten.','Paprika und Zwiebel zugeben, 5 Min. braten.','Kokosmilch und Curry zugeben, 8 Min. köcheln.','Mit Reis servieren.'], description:'Eine schnelle Pfanne aus dem, was da ist.', cuisine:'Asiatisch', genutzt:['Hähnchenbrustfilet','Paprika','Zwiebeln','Basmati Reis','Kokosmilch'], fehlt:['Currypulver']});
  } else {
    text = JSON.stringify({name:'Käsespätzle', ingredients:['400 g Spätzle','200 g Bergkäse','100 g Emmentaler','3 Zwiebeln','2 EL Butter','Salz','Pfeffer','Schnittlauch'], steps:['Zwiebeln in Ringe schneiden und in Butter goldbraun rösten.','Spätzle in Salzwasser kochen.','Spätzle und Käse schichtweise in eine Schüssel geben.','Mit Röstzwiebeln und Schnittlauch servieren.'], description:'Der schwäbische Klassiker: Spätzle, geschichtet mit würzigem Bergkäse und knusprigen Röstzwiebeln.', category:'Hauptgericht', cuisine:'Schwäbisch'});
  }
  await new Promise(r=>setTimeout(r,800));
  return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify({text})});
};

// ---------- Mock images ----------
const svgImg = (label)=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a5a2b"/><stop offset="1" stop-color="#3b2a1a"/></linearGradient></defs><rect width="800" height="480" fill="url(#g)"/><text x="400" y="250" font-family="Georgia" font-size="34" fill="#f0e6d8" text-anchor="middle">${label.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text></svg>`;

// ---------- DURCHLAUF Version 3: Heute statt Woche ----------
(async()=>{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'de-DE' });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on('console', m=>{ if(m.type()==='error'||m.type()==='warning') consoleErrs.push(m.type()+': '+m.text().slice(0,300)); });
  page.on('pageerror', e=>{ consoleErrs.push('pageerror: '+e.message); log('PAGEERROR', e.message); });
  let promptAnswer = '';
  page.on('dialog', async d=>{ log('DIALOG:', d.type(), d.message().slice(0,80)); if(d.type()==='prompt') await d.accept(promptAnswer); else await d.accept(); });
  await ctx.route(/wochenessenplan-3d0e1-default-rtdb/, mockFb(db.wochen));
  await ctx.route(/haushaltsbuch-3cefb-default-rtdb/, mockFb(db.hb));
  await ctx.route(/\/api\/gemini/, mockAi);
  await ctx.route(/image\.pollinations\.ai/, route=>route.abort());
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, route=>route.abort());
  const shot = async(name)=>{ await page.waitForTimeout(350); await page.screenshot({path:`${OUT}/v3-${name}.png`, fullPage:true}); log('shot', name); };
  const IN_APP = 'button:text-is("Rezepte")';
  const today = new Date(); const iso = (d)=>{ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  const T = iso(today);

  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('text=PLAN STARTEN', {timeout:15000});
  await page.fill('input[placeholder="z.B. Anna"]', 'Claude');
  const code = (await page.textContent('span[style*="letter-spacing: 6px"]')).trim();
  await page.click('text=PLAN STARTEN');
  await page.waitForSelector(IN_APP, {timeout:10000});
  await page.waitForTimeout(600);
  const plan = ()=>db.wochen.plans[code];
  check(!!plan()?.meta && plan().meta.picksUpdatedAt>0 && !plan().weeks, 'Neuer Plan: meta mit picksUpdatedAt, keine weeks', plan()?.meta);
  const tabs = await page.locator('div[style*="border-bottom"] button[aria-current], div[style*="overflow-x: auto"] button').allTextContents();
  check(tabs.join('|').includes('Heute')&&tabs.join('|').includes('Vorrat')&&!tabs.join('|').includes('Woche')&&!tabs.join('|').includes('Plan'), 'Reiter: Heute · Vorrat · Rezepte · Einkauf, kein Woche, Plan versteckt', tabs);
  // HEUTE mit leerem Kochbuch: Vorschlaege aus der Rezept-Basis
  check(await page.isVisible('text=Was kochen wir heute?') && await page.isVisible('text=Aus der Rezept-Basis') && await page.isVisible('button:has-text("ZUM REZEPT")') && !(await page.isVisible('button:has-text("VORMERKEN")')), 'Heute: leeres Kochbuch -> bester Vorschlag aus der Rezept-Basis mit Zum Rezept/Kochmodus, kein Vormerken');
  check(await page.isVisible('text=Vorrat verbinden'), 'Heute: Vorrat-Zeile laedt zum Verbinden ein');
  await shot('01-heute-leer');
  // REZEPTE: Meine/Alle, Startrezepte
  await page.click(IN_APP); await page.waitForTimeout(300);
  check(await page.isVisible('button:has-text("Alle (mit Rezept-Basis)")') && await page.isVisible('text=Rezept-Basis ·'), 'Rezepte: leeres Kochbuch zeigt "Alle" mit Rezept-Basis');
  await page.click('text=STARTREZEPTE ÜBERNEHMEN');
  await page.waitForSelector('button:has-text("Pasta Bolognese")'); await page.waitForTimeout(400);
  check(Object.keys(plan().recipes||{}).length===14, 'Startrezepte liegen unter plans/<CODE>/recipes');
  check(!(await page.isVisible('text=Rezept-Basis ·')), 'Rezepte: mit Kochbuch zeigt "Meine" ohne Rezept-Basis');
  await page.click('button:has-text("Alle (mit Rezept-Basis)")'); await page.waitForTimeout(200);
  check(await page.isVisible('text=Rezept-Basis ·'), 'Rezepte: Umschalter "Alle" blendet die Rezept-Basis ein');
  await shot('02-rezepte-alle');
  // HEUTE: Vorschlag aus dem Kochbuch; "Andere" wechselt die Hauptkachel; Alternative antippen wird Hauptkachel
  await page.click('button:text-is("Heute")'); await page.waitForTimeout(400);
  const heroName = async()=>(await page.locator('div[style*="font-size: 24px"]').first().textContent()).trim();
  const topName = await heroName();
  check(!!topName && !(await page.isVisible('text=Vorrat: ')), 'Heute: bester Vorschlag "'+topName+'"');
  await page.click('button:has-text("Andere")'); await page.waitForTimeout(200);
  const topAfter = await heroName();
  check(topAfter!==topName, 'Heute: "Andere" wechselt auch die Hauptkachel', {topName, topAfter});
  const altName = (await page.locator('div[style*="font-size: 16px"][style*="white-space: nowrap"]').first().textContent()).replace('BASIS','').trim();
  await page.locator('div[style*="font-size: 16px"][style*="white-space: nowrap"]').first().click(); await page.waitForTimeout(200);
  check((await heroName())===altName, 'Heute: angetippte Alternative wird Hauptkachel', {altName, hero: await heroName()});
  await page.click('button:has-text("Schnell")'); await page.waitForTimeout(200);
  check(await page.isVisible('button[aria-pressed="true"]:has-text("Schnell")'), 'Heute: Filter Schnell aktiv');
  await page.click('button:has-text("Schnell")');
  await shot('03-heute');
  // PLAN (versteckt): ueber das Menue, Vormerken fuer heute und demnaechst, Einkaufsliste erzeugen
  await page.click('button[aria-label="Menü"]'); await page.click('text=Plan · Vorgemerkt'); await page.waitForTimeout(300);
  check(await page.isVisible('text=Noch nichts vorgemerkt'), 'Plan: leer, ueber das Menue erreichbar');
  await page.click('button:has-text("+ VORMERKEN")'); await page.waitForTimeout(300);
  await page.fill('input[placeholder="Rezept suchen…"]', 'Bolognese');
  await page.click('button:has-text("Pasta Bolognese")'); await page.waitForTimeout(200);
  await page.click('div[role="dialog"] button:text-is("VORMERKEN")'); await page.waitForTimeout(500);
  const pk = Object.values(plan().picks||{});
  check(pk.length===1 && pk[0].day===T && pk[0].key==='Pasta Bolognese', 'Vormerken: picks/<id> mit heutigem Tag geschrieben', pk);
  check(await page.isVisible('button:text-is("Plan (1)")'), 'Reiter Plan (1) erscheint');
  await page.click('button:has-text("+ VORMERKEN")'); await page.waitForTimeout(300);
  await page.fill('input[placeholder="Rezept suchen…"]', 'Risotto');
  await page.click('button:has-text("Risotto")'); await page.waitForTimeout(200);
  await page.click('button:has-text("Demnächst")');
  await page.click('div[role="dialog"] button:text-is("VORMERKEN")'); await page.waitForTimeout(500);
  check(Object.values(plan().picks).length===2 && Object.values(plan().picks).some(p=>p.key==='Risotto'&&p.day===''), 'Vorgemerkt: Risotto fuer demnaechst ueber die Suche');
  await shot('03b-plan');
  await page.click('button:text-is("Heute")'); await page.waitForTimeout(300);
  check(await page.isVisible('text=Für heute vorgemerkt') && await page.isVisible('text=Pasta Bolognese'), 'Heute: Block "Fuer heute vorgemerkt"');
  await page.click('button:text-is("Plan (2)")'); await page.waitForTimeout(300);
  check(await page.isVisible('text=Demnächst'), 'Vorgemerkt: Gruppe Demnaechst sichtbar');
  await page.click('button:has-text("EINKAUFSLISTE AUS DEM VORGEMERKTEN")'); await page.waitForTimeout(600);
  const shop = Object.values(plan().shopping||{});
  check(shop.length>3 && shop.every(i=>i.src==='plan'), 'Einkauf: Liste aus dem Vorgemerkten erzeugt', shop.length);
  check(await page.isVisible('text=Erledigt'), 'Einkauf: Ansicht offen');
  await shot('04-einkauf');
  // "WURDE HEUTE GEKOCHT" im Rezept: Kochdatum, Vormerkung weg, Bewertungsdialog
  await page.click('button:text-is("Heute")'); await page.waitForTimeout(300);
  await page.locator('text=Pasta Bolognese').first().click(); await page.waitForTimeout(500);
  check(await page.isVisible('button:has-text("WURDE HEUTE GEKOCHT")'), 'Rezept: Knopf "Wurde heute gekocht" neben der Bewertung');
  await page.click('button:has-text("WURDE HEUTE GEKOCHT")'); await page.waitForTimeout(600);
  check(await page.isVisible('text=Wie war'), 'Gekocht: Bewertungsdialog');
  await page.click('button:has-text("ÜBERSPRINGEN")'); await page.waitForTimeout(300);
  const cookedRec = plan().recipes['Pasta Bolognese'];
  check(Array.isArray(cookedRec.cooked)&&cookedRec.cooked.includes(T) && Object.values(plan().picks).every(p=>p.day!==T), 'Gekocht: Kochdatum heute gespeichert, Vormerkung fuer heute entfernt', cookedRec.cooked);
  check(await page.isVisible('button:has-text("✓ HEUTE GEKOCHT")'), 'Rezept: Knopf zeigt "Heute gekocht"');
  await page.click('text=ZURÜCK'); await page.waitForTimeout(300);
  check(!(await page.isVisible('text=Für heute vorgemerkt')), 'Heute: Block fuer heute ist weg');
  // VORRAT: Haushaltsbuch verbinden, Liste, x
  await page.click('button:text-is("Vorrat")'); await page.waitForTimeout(300);
  await page.fill('input[placeholder="BUCH-CODE"]', 'FAMILIE1');
  await page.click('button:has-text("VERBINDEN")'); await page.waitForTimeout(800);
  check(plan().hb?.code==='FAMILIE1' && await page.isVisible('text=Wahrscheinlich da ('), 'Vorrat: Haushaltsbuch verbunden, Liste sichtbar');
  // NAMEN NORMIEREN: Regeln sofort (Rinderhack 500g -> Hackfleisch, Paprika rot 3er -> Paprika), Rest per KI (ein Aufruf), gespeichert unter stock/alias
  await page.waitForTimeout(1500);
  const aliasCalls = aiCalls.filter(c=>String(c.system||'').includes('Kassenbons'));
  const alias = plan().stock?.alias||{};
  check(aliasCalls.length===1 && Object.keys(alias).length===1 && alias.bratwurst?.name==='Bratwurst' && alias.bratwurst.src==='ki', 'Normieren: ein KI-Aufruf nur fuer den einzigen unklaren Namen (Bratwurst), Ergebnis unter stock/alias', {calls:aliasCalls.length, alias, sent:aliasCalls[0]?.messages?.[0]?.content});
  // Hand-Korrektur: "Lachsfilet" (Regel) -> "Lachs", gilt fuer die Rohbezeichnung "Lachsfilet TK"
  await page.click('button[aria-label="Lachsfilet: Name zuordnen"]'); await page.waitForTimeout(200);
  await page.fill('div[role="dialog"] input[aria-label="Zutatenname"]', 'Lachs');
  await page.click('div[role="dialog"] button:text-is("SPEICHERN")'); await page.waitForTimeout(500);
  const alias2 = plan().stock?.alias||{};
  check(alias2.lachsfilet?.name==='Lachs' && alias2.lachsfilet.src==='hand' && (await page.locator('button[aria-label="Lachs: Name zuordnen"]').count())===1 && await page.isVisible('text=aus: Lachsfilet TK'), 'Vorrat: Hand-Zuordnung Lachsfilet -> Lachs unter stock/alias (src hand), Zeile heisst Lachs', alias2);
  // Kein Lebensmittel: Zeile verschwindet, unten "wieder einblenden" bringt sie zurueck
  await page.click('button[aria-label="Honig: Name zuordnen"]'); await page.waitForTimeout(200);
  await page.click('div[role="dialog"] button:text-is("KEIN LEBENSMITTEL")'); await page.waitForTimeout(500);
  check((await page.locator('button[aria-label="Honig: Name zuordnen"]').count())===0 && plan().stock.alias.honig?.name==='' && plan().stock.alias.honig.raw==='Honig' && await page.isVisible('button[aria-label="Honig wieder einblenden"]'), 'Vorrat: "Kein Lebensmittel" blendet Honig aus, unten steht es zum Wiedereinblenden');
  await page.click('button[aria-label="Honig wieder einblenden"]'); await page.waitForTimeout(500);
  check((await page.locator('button[aria-label="Honig: Name zuordnen"]').count())===1 && !plan().stock.alias.honig, 'Vorrat: Wieder einblenden loescht die Zuordnung, Honig ist zurueck');
  const rowNames = await page.locator('button[aria-label$=": Name zuordnen"]').allTextContents();
  check(rowNames.some(t=>/Hackfleisch/.test(t)) && rowNames.some(t=>/Paprika$/.test(t.trim())) && rowNames.some(t=>/Joghurt/.test(t)) && !rowNames.some(t=>/500g|3er|Natur|3,5/.test(t)), 'Vorrat: Zeilen zeigen Zutatennamen statt Kassenbon-Bezeichnungen', rowNames);
  check(await page.isVisible('text=aus: Rinderhack 500g'), 'Vorrat: Herkunft "aus: Rinderhack 500g" in der Zeile');
  check(!(await page.isVisible('text=ungeklärt')), 'Vorrat: keine ungeklaerten Namen mehr');
  check(await page.isVisible('text=Verblasst nach:'), 'Vorrat: Verblassen-Hinweis');
  // Eigene Positionen: Hand, Dauervorrat (Pin), Foto, x
  await page.fill('input[placeholder="Lebensmittel, z. B. Linsen"]', 'Zwiebeln');
  await page.click('button[aria-label="Hinzufügen"]'); await page.waitForTimeout(500);
  const own = Object.values(plan().stock?.items||{});
  check(own.length===1 && own[0].name==='Zwiebeln' && own[0].sub==='Gemüse' && own[0].src==='hand' && own[0].date===T, 'Vorrat: Handeintrag unter stock/items mit erratener Gruppe', own);
  check(await page.isVisible('text=Haushaltsbuch + Hand') && await page.isVisible('text=aus: Zwiebeln 1kg'), 'Vorrat: Zwiebeln (Hand) verschmilzt mit "Zwiebeln 1kg" aus dem Haushaltsbuch: beide Quellen, Herkunft in der Zeile');
  await page.click('button[aria-label="Spaghetti als Dauervorrat"]'); await page.waitForTimeout(500);
  const perm = plan().stock?.perm||{};
  check(Object.keys(perm).length===1 && perm[Object.keys(perm)[0]].name==='Spaghetti' && await page.isVisible('text=Dauervorrat (1)'), 'Vorrat: Pin schreibt stock/perm, Block Dauervorrat erscheint', perm);
  // Foto: kleines PNG, KI simuliert
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAD0lEQVQIW2P8z8DwnwEIGAEQ4AHu0b8t1AAAAABJRU5ErkJggg==','base64');
  await page.setInputFiles('input[type="file"]', {name:'speisekammer.png', mimeType:'image/png', buffer:png});
  await page.waitForSelector('button:has-text("ÜBERNEHMEN")', {timeout:15000});
  check((await page.locator('input[type="checkbox"]').count())===4 && (await page.inputValue('input[aria-label="Name für Rote Linsen"]'))==='Rote Linsen', 'Foto: 4 erkannte Lebensmittel zur Pruefung, Namen editierbar');
  await page.locator('input[aria-label="Spülmittel übernehmen"]').uncheck();
  await page.fill('input[aria-label="Name für Kichererbsen"]', 'Kichererbsen Dose');
  await page.click('button:has-text("3 ÜBERNEHMEN")'); await page.waitForTimeout(600);
  const own2 = Object.values(plan().stock?.items||{});
  check(own2.length===4 && own2.filter(i=>i.src==='foto').length===3 && !own2.some(i=>i.name==='Spülmittel'), 'Foto: 3 Positionen uebernommen (Spuelmittel abgewaehlt)', own2.map(i=>i.name));
  check(await page.isVisible('text=Kichererbsen') && await page.isVisible('text=aus: Rote Linsen') && own2.some(i=>i.name==='Kichererbsen Dose'), 'Vorrat: Foto-Positionen in der Liste (Name im Dialog geaendert, Rote Linsen als Linsen mit Herkunft)');
  await page.click('button[aria-label="Kichererbsen entfernen"]'); await page.waitForTimeout(400);
  check(Object.values(plan().stock.items).length===3 && !(plan().hb.gone&&Object.keys(plan().hb.gone).length), 'x bei eigener Position (Kichererbsen aus dem Foto) loescht nur den Eintrag, kein gone-Marker');
  await page.click('button[aria-label="Bananen entfernen"]'); await page.waitForTimeout(400);
  check(plan().hb.gone && Object.keys(plan().hb.gone).length===1, 'x bei Haushaltsbuch-Position setzt gone-Marker');
  // Auffrischen: Haken bei einer verblassten Haushaltsbuch-Position -> Handeintrag von heute, 100 %
  await page.click('button[aria-label="Butter auffrischen: ist noch da"]'); await page.waitForTimeout(500);
  const fresh = Object.values(plan().stock.items).find(i=>i.name==='Butter');
  check(!!fresh && fresh.src==='hand' && fresh.date===T && await page.isVisible('text=Haushaltsbuch + Hand'), 'Vorrat: Haken schreibt stock/items fuer Butter mit heutigem Datum (100 %)', fresh);
  await shot('05-vorrat');
  // GRAPH: Umschalter, Wolken, Rezeptkanten, Auswahl, Wolke zuklappen, Daraus kochen (KI)
  await page.click('button:text-is("Graph")'); await page.waitForTimeout(500);
  const G = 'svg[data-testid="vorrat-graph"]';
  const nodeCount = await page.locator(G+' g[role="button"][aria-label$=" auswählen"]').count();
  const groupLabels = await page.locator(G+' g[role="button"][aria-label^="Gruppe "]').allTextContents();
  check(!groupLabels.some(t=>/OBST/.test(t)) && groupLabels.some(t=>/GEM.SE \(3\)/.test(t)) && groupLabels.some(t=>/FLEISCH \(3\)/.test(t)), 'Graph: Gruppen stimmen (Gemuese 3, Fleisch 3, kein Obst nach Streichen der Bananen)', groupLabels);
  const sectorCount = await page.locator(G+' path[fill^="#"]').count();
  check(nodeCount>=8 && groupLabels.length>=3 && sectorCount===2*groupLabels.length, 'Graph: Punkte in mehreren Kuchenstuecken mit Farbakzent (Flaeche + Band)', {nodeCount, groupLabels, sectorCount});
  check((await page.locator(G+' g[aria-label="Spaghetti auswählen"] circle[stroke="#F0EEE9"]').count())===1, 'Graph: Dauervorrat Spaghetti mit Ring');
  check((await page.locator(G+' g[aria-label="Bratwurst auswählen"] circle[stroke="#E05555"]').count())===1 && (await page.locator(G+' g[aria-label="Hackfleisch auswählen"] circle[stroke="#E05555"]').count())===0, 'Graph: Bratwurst (kippt bald) mit rotem Bogen, Hackfleisch ohne');
  await page.click('button[aria-pressed="false"]:has-text("Pasta Bolognese")'); await page.waitForTimeout(400);
  const edges = await page.locator(G+' line[data-edge="present"]').count();
  const center = await page.locator(G+' g[data-testid="graph-center"]').textContent();
  check(edges>=2 && /fehlt: Knoblauch/.test(center) && /Pasta Bolognese/.test(center) && await page.isVisible('button:has-text("ZUM REZEPT")') && await page.isVisible('text=/\\d+ von \\d+ Zutaten da/'), 'Graph: Rezept im Mittelkreis mit Kanten zu vorhandenen Zutaten, Fehlendes im Kreis, Leiste mit Zum Rezept', {edges, center});
  await shot('05b-graph-rezept');
  await page.click('button[aria-label="Rezept ausblenden"]'); await page.waitForTimeout(200);
  check((await page.locator(G+' line[data-edge="present"]').count())===0, 'Graph: Rezept ausgeblendet, keine Kanten');
  await page.click(G+' g[aria-label="Kokosmilch auswählen"]'); await page.waitForTimeout(200);
  await page.click(G+' g[aria-label="Linsen auswählen"]'); await page.waitForTimeout(300);
  check(await page.isVisible('text=2 ausgewählt') && await page.isVisible('text=Kokosmilch, Linsen') && await page.isVisible('button:has-text("DARAUS KOCHEN")') && await page.isVisible('text=Rezepte mit der Auswahl'), 'Graph: zwei Punkte ausgewaehlt, Leiste mit Daraus kochen, Rezepte zur Auswahl');
  await page.click(G+' g[aria-label="Gruppe Gemüse zuklappen"] text'); await page.waitForTimeout(300);
  check((await page.locator(G+' g[aria-label="Gruppe Gemüse aufklappen"]').count())===1 && (await page.locator(G+' g[aria-label="Zwiebeln auswählen"]').count())===0, 'Graph: Wolke Gemuese zugeklappt, ihre Punkte verborgen');
  // Emoji auf den Punkten, Verschieben eines Punkts (Lage im Plan), Zuruecksetzen
  const passataTxt = await page.locator(G+' g[aria-label="Tomaten auswählen"] text').allTextContents();
  check(passataTxt.includes('🍅') && passataTxt.includes('Tomaten'), 'Graph: Passata heisst jetzt Tomaten, mit Emoji', passataTxt);
  const bb = await page.locator(G+' g[aria-label="Tomaten auswählen"] circle').first().boundingBox();
  await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.mouse.down();
  await page.mouse.move(bb.x+bb.width/2+10, bb.y+bb.height/2+8, {steps:3}); await page.mouse.move(bb.x+bb.width/2+34, bb.y+bb.height/2+26, {steps:6}); await page.mouse.up();
  await page.waitForTimeout(500);
  const layout = plan().stock?.layout||{};
  const lk = Object.keys(layout);
  check(lk.length===1 && lk[0]==='tomaten' && Number.isFinite(layout.tomaten.t) && layout.tomaten.r>150 && layout.tomaten.at>0, 'Graph: Verschieben schreibt stock/layout/tomaten (normierter Schluessel von Passata) = {t, r, at}', layout);
  check((await page.locator(G+' g[aria-label="Tomaten auswählen"][data-manual="1"]').count())===1 && !(await page.isVisible('text=3 ausgewählt')), 'Graph: Tomaten als Hand-Lage markiert, Ziehen ist keine Auswahl');
  await shot('05c-graph-auswahl');
  await page.click('button[aria-label="Anordnung zurücksetzen"]'); await page.waitForTimeout(400);
  check(!plan().stock.layout && (await page.locator('button[aria-label="Anordnung zurücksetzen"]').count())===0, 'Graph: Zuruecksetzen loescht stock/layout');
  const aiBefore = aiCalls.length;
  await page.click('button:has-text("DARAUS KOCHEN")');
  await page.waitForSelector('#ki-vorschlag', {timeout:15000}); await page.waitForTimeout(300);
  const lastAi = aiCalls[aiCalls.length-1]; const lastMsg = (lastAi&&lastAi.messages&&lastAi.messages[0]&&lastAi.messages[0].content)||'';
  check(aiCalls.length===aiBefore+1 && lastAi.mode==='suggest' && /AUSGEWÄHLT[^\n]*Kokosmilch/.test(lastMsg) && /Linsen/.test(lastMsg), 'Daraus kochen: KI-Anfrage nennt die ausgewaehlten Produkte als Pflicht', lastMsg.slice(lastMsg.indexOf('AUSGEW'),lastMsg.indexOf('AUSGEW')+120));
  check((await page.inputValue('input[aria-label="Rezeptname"]')).startsWith('Hähnchen-Paprika-Pfanne'), 'Daraus kochen: KI-Vorschlag im Reiter Rezepte');
  await page.click('button:text-is("Vorrat")'); await page.waitForTimeout(600);
  check(await page.isVisible(G), 'Vorrat: Graph-Ansicht wird gemerkt');
  await page.click('button:text-is("Liste")'); await page.waitForTimeout(300);
  check(await page.isVisible('text=Wahrscheinlich da (') && !(await page.isVisible(G)), 'Vorrat: Umschalter zurueck zur Liste');
  await page.click('button:text-is("Heute")'); await page.waitForTimeout(400);
  check(await page.isVisible('text=/Vorrat: \\d+ Lebensmittel/') && (await page.locator('text=/\\d+ % da/').count())>=1, 'Heute: Vorrat-Zeile mit Anzahl, Vorschlaege mit Prozent');
  const pcts = (await page.locator('div[style*="font-size: 14px"][style*="font-weight: 700"]').allTextContents()).filter(t=>/^\d+ %$/.test(t.trim())).map(t=>parseInt(t,10));
  check(pcts.length>=2, 'Heute: Alternativen zeigen Prozent', pcts);
  await shot('06-heute-vorrat');
  // REZEPTDETAIL: Vormerken-Knopf
  await page.click(IN_APP); await page.waitForTimeout(300);
  await page.click('button:has-text("Pasta Carbonara")'); await page.waitForTimeout(400);
  check(await page.isVisible('button:has-text("VORMERKEN")') && !(await page.isVisible('text=ZUM WOCHENPLAN')), 'Rezeptdetail: Vormerken statt Zum Wochenplan');
  const tags = await page.locator('span[data-stock]').evaluateAll(els=>els.map(e=>e.getAttribute('data-stock')));
  check(tags.includes('da') && tags.includes('fehlt') && (await page.locator('span[data-stock="da"]').count())>=2, 'Rezeptdetail: Zutaten mit "da" / "fehlt" nach Vorrat', tags);
  await page.click('button:has-text("VORMERKEN")'); await page.waitForTimeout(200);
  await page.click('button:has-text("Morgen")'); await page.click('div[role="dialog"] button:text-is("VORMERKEN")'); await page.waitForTimeout(500);
  check(Object.values(plan().picks).some(p=>p.key==='Pasta Carbonara'), 'Rezeptdetail: Vormerken schreibt picks');
  // KOCHBUCH ALS DATEI (Stufe 4): sichern (Download), laden mit Vorschau, ersetzen / ueberspringen, Fotos
  await page.goBack().catch(()=>{}); await page.waitForTimeout(200);
  if(!(await page.isVisible('button:has-text("SICHERN (.JSON)")'))){ await page.click(IN_APP); await page.waitForTimeout(300); }
  const [dl] = await Promise.all([ page.waitForEvent('download', {timeout:15000}), page.click('button:has-text("SICHERN (.JSON)")') ]);
  const dlPath = await dl.path();
  const exported = JSON.parse(fs.readFileSync(dlPath,'utf8'));
  const recCount = Object.keys(plan().recipes).length;
  check(/^wochenplan-kochbuch-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && exported.format==='wochenplan-kochbuch' && exported.count===recCount && Object.keys(exported.recipes).length===recCount && Array.isArray(exported.recipes['Pasta Bolognese'].cooked) && exported.recipes['Pasta Bolognese'].cooked.includes(T), 'Kochbuch sichern: JSON-Datei mit allen Rezepten inkl. Kochdaten', {name:dl.suggestedFilename(), count:exported.count, recCount});
  const PNG_URL = 'data:image/png;base64,'+png.toString('base64');
  const importFile = JSON.stringify({format:'wochenplan-kochbuch', version:1, exportedAt:'2026-11-01T10:00:00.000Z', recipes:{
    'Pasta Bolognese': {name:'Pasta Bolognese', ingredients:['500 g Hackfleisch','Tomaten'], steps:['Importierte Fassung.'], rating:2, notes:'Import-Test'},
    'Importiertes Testgericht': {name:'Importiertes Testgericht', ingredients:['1 Test'], steps:['Testen.'], category:'Hauptgericht'},
  }, images:{'Importiertes Testgericht': PNG_URL}});
  await page.setInputFiles('input[accept="application/json,.json"]', {name:'kochbuch.json', mimeType:'application/json', buffer:Buffer.from(importFile,'utf8')});
  await page.waitForSelector('div[role="dialog"]', {timeout:5000});
  const dlg = await page.locator('div[role="dialog"]').textContent();
  check(/2 Rezepte/.test(dlg) && /1 neu/.test(dlg) && /1 schon im Kochbuch/.test(dlg) && /1 Foto/.test(dlg) && /\b1\.11\.2026/.test(dlg), 'Kochbuch laden: Vorschau mit Anzahl, neu, vorhanden, Foto, Datum', dlg.slice(0,200));
  await page.check('div[role="dialog"] input[value="replace"]');
  await page.click('div[role="dialog"] button:text-is("IMPORTIEREN")'); await page.waitForTimeout(800);
  const impRec = plan().recipes['Importiertes Testgericht'], bolo = plan().recipes['Pasta Bolognese'];
  check(!!impRec && impRec.steps[0]==='Testen.' && bolo.rating===2 && bolo.notes==='Import-Test' && bolo.steps[0]==='Importierte Fassung.' && Object.keys(plan().recipes).length===recCount+1, 'Kochbuch laden (ersetzen): neues Rezept da, Pasta Bolognese ersetzt', {impRec:!!impRec, rating:bolo.rating});
  check(String(db.wochen.recipeImages?.[code]?.['Importiertes Testgericht']||'').startsWith('data:image/png;base64,'), 'Kochbuch laden: Foto unter recipeImages/<CODE>/<key>');
  check(await page.isVisible('text=Importiertes Testgericht') && !(await page.isVisible('div[role="dialog"]')), 'Kochbuch laden: Dialog zu, Rezept in der Liste');
  await page.setInputFiles('input[accept="application/json,.json"]', {name:'kochbuch.json', mimeType:'application/json', buffer:Buffer.from(importFile,'utf8')});
  await page.waitForSelector('div[role="dialog"]', {timeout:5000});
  await page.click('div[role="dialog"] button:text-is("IMPORTIEREN")'); await page.waitForTimeout(500);
  check(Object.keys(plan().recipes).length===recCount+1 && plan().recipes['Pasta Bolognese'].rating===2 && !(await page.isVisible('div[role="dialog"]')), 'Kochbuch laden (behalten): nichts ueberschrieben');
  await page.setInputFiles('input[accept="application/json,.json"]', {name:'kaputt.json', mimeType:'application/json', buffer:Buffer.from('{"hallo":1}','utf8')});
  await page.waitForSelector('div[role="dialog"]', {timeout:5000});
  check(/keine Rezepte/.test(await page.locator('div[role="dialog"]').textContent()), 'Kochbuch laden: unbrauchbare Datei zeigt Fehler');
  await page.click('div[role="dialog"] button:text-is("SCHLIESSEN")'); await page.waitForTimeout(200);
  // Menue: Datenschutz, Vorgemerkt
  await page.click('button[aria-label="Menü"]'); await page.waitForTimeout(200);
  const menu = (await page.locator('div[role="menu"]').textContent());
  check(menu.includes('Vorgemerkt')&&menu.includes('Datenschutz')&&!menu.includes('Symbolbilder')&&!menu.includes('Haushaltsbuch'), 'Menue: Vorgemerkt, Datenschutz, keine KI-Symbolbilder', menu);
  await page.click('text=Datenschutz & Daten'); await page.waitForTimeout(200);
  check(await page.isVisible('button:has-text("PLAN ENDGÜLTIG LÖSCHEN")'), 'Datenschutz-Modal offen');
  await page.click('button:has-text("SCHLIESSEN")');
  // Desktop-Blick
  const dctx = await browser.newContext({ viewport:{width:1280,height:900}, locale:'de-DE' });
  await dctx.route(/wochenessenplan-3d0e1-default-rtdb/, mockFb(db.wochen));
  await dctx.route(/haushaltsbuch-3cefb-default-rtdb/, mockFb(db.hb));
  await dctx.route(/fonts\.(googleapis|gstatic)\.com/, route=>route.abort());
  const dp = await dctx.newPage();
  await dp.goto('http://127.0.0.1:5173/');
  await dp.waitForSelector('text=PLAN STARTEN');
  await dp.fill('input[placeholder="z.B. Anna"]', 'Mero');
  await dp.fill('input[placeholder="CODE"]', code);
  await dp.click('button:has-text("BEITRETEN")');
  await dp.waitForSelector(IN_APP); await dp.waitForTimeout(800);
  check(await dp.isVisible('text=Was kochen wir heute?'), 'Desktop: Beitritt und Heute');
  await dp.screenshot({path:`${OUT}/v3-07-desktop-heute.png`, fullPage:false});
  await dctx.close();

  log('--- fb stats', JSON.stringify(fbStats));
  check(fbStats.put===0&&fbStats.patchGlobal===0&&!db.wochen.globalRecipes, 'Keine PUTs, keine Schreibzugriffe auf globalRecipes', fbStats);
  log('--- plan keys:', Object.keys(plan()||{}));
  log('--- console errors/warnings:', consoleErrs.length); consoleErrs.slice(0,15).forEach(e=>log('  ', e));
  log('--- Ergebnis:', n-fails.length, 'von', n, 'Pruefungen bestanden');
  await browser.close();
  process.exit(fails.length?1:0);
})();
