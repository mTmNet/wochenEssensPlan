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
  // Design des Geraets: SCHEME=dark node tests/e2e/walk-v3.mjs prueft das dunkle Design, sonst hell
  const SCHEME = process.env.SCHEME==='dark' ? 'dark' : 'light';
  const ctx = await browser.newContext({ viewport:{width:+process.env.W||390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'de-DE', colorScheme:SCHEME });
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
  // Vorratszeile: Herkunft steht im aufgeklappten Bereich unter "⋯"
  const openRow = async(name)=>{ const b=page.locator('button[aria-label="'+name+': weitere Aktionen"]'); if((await b.getAttribute('aria-expanded'))!=='true'){ await b.click(); await page.waitForTimeout(200); } };
  const shot = async(name)=>{ await page.waitForTimeout(350); await page.screenshot({path:`${OUT}/v3-${name}.png`, fullPage:true}); log('shot', name); };
  const IN_APP = 'button:text-is("Rezepte")';
  const today = new Date(); const iso = (d)=>{ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  const T = iso(today);

  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('text=Kochbuch starten', {timeout:15000});
  await page.fill('input[placeholder="z.B. Anna"]', 'Claude');
  const code = (await page.textContent('span[style*="letter-spacing: 6px"]')).trim();
  await shot('00-einstieg');
  await page.click('text=Kochbuch starten');
  await page.waitForSelector(IN_APP, {timeout:10000});
  await page.waitForTimeout(600);
  const plan = ()=>db.wochen.plans[code];
  check(!!plan()?.meta && plan().meta.picksUpdatedAt>0 && !plan().weeks, 'Neuer Plan: meta mit picksUpdatedAt, keine weeks', plan()?.meta);
  const tabs = await page.locator('div[style*="border-bottom"] button[aria-current], div[style*="overflow-x: auto"] button').allTextContents();
  check(tabs.join('|').includes('Heute')&&tabs.join('|').includes('Vorrat')&&!tabs.join('|').includes('Woche')&&!tabs.join('|').includes('Plan'), 'Reiter: Heute · Vorrat · Rezepte · Einkauf, kein Woche, Plan versteckt', tabs);
  // HEUTE mit leerem Kochbuch: Vorschlaege aus der Rezept-Basis
  check(await page.isVisible('text=Was kochen wir heute?') && await page.isVisible('text=Aus der Rezept-Basis') && await page.isVisible('button:has-text("Zum Rezept")') && !(await page.isVisible('button:has-text("Vormerken")')), 'Heute: leeres Kochbuch -> bester Vorschlag aus der Rezept-Basis mit Zum Rezept/Kochmodus, kein Vormerken');
  check(await page.isVisible('text=Vorrat füllen'), 'Heute: Vorrat-Zeile laedt zum Fuellen ein (Einkaeufe abhaken oder Haushaltsbuch)');
  await shot('01-heute-leer');
  // REZEPTE: Meine/Alle, Startrezepte
  await page.click(IN_APP); await page.waitForTimeout(300);
  check(await page.isVisible('button:has-text("Alle (mit Rezept-Basis)")') && await page.isVisible('text=Rezept-Basis ·'), 'Rezepte: leeres Kochbuch zeigt "Alle" mit Rezept-Basis');
  await page.click('text=Startrezepte übernehmen');
  await page.waitForSelector('button:has-text("Pasta Bolognese")'); await page.waitForTimeout(400);
  check(Object.keys(plan().recipes||{}).length===14, 'Startrezepte liegen unter plans/<CODE>/recipes');
  check(!(await page.isVisible('text=Rezept-Basis ·')), 'Rezepte: mit Kochbuch zeigt "Meine" ohne Rezept-Basis');
  await page.click('button:has-text("Alle (mit Rezept-Basis)")'); await page.waitForTimeout(200);
  check(await page.isVisible('text=Rezept-Basis ·'), 'Rezepte: Umschalter "Alle" blendet die Rezept-Basis ein');
  await shot('02-rezepte-alle');
  // HEUTE: Vorschlag aus dem Kochbuch; "Neue Vorschläge" wechselt die Hauptkachel; Alternative antippen wird Hauptkachel
  await page.click('button:text-is("Heute")'); await page.waitForTimeout(400);
  const heroName = async()=>(await page.locator('div[style*="font-size: 27px"]').first().textContent()).trim();
  const topName = await heroName();
  check(!!topName && !(await page.isVisible('text=Vorrat: ')), 'Heute: bester Vorschlag "'+topName+'"');
  await page.click('button:has-text("Neue Vorschläge")'); await page.waitForTimeout(200);
  const topAfter = await heroName();
  check(topAfter!==topName, 'Heute: "Neue Vorschläge" wechselt auch die Hauptkachel', {topName, topAfter});
  const altName = (await page.locator('div[style*="font-size: 17px"][style*="white-space: nowrap"]').first().textContent()).replace('Basis','').trim();
  await page.locator('div[style*="font-size: 17px"][style*="white-space: nowrap"]').first().click(); await page.waitForTimeout(200);
  check((await heroName())===altName, 'Heute: angetippte Alternative wird Hauptkachel', {altName, hero: await heroName()});
  await page.click('button:has-text("Schnell")'); await page.waitForTimeout(200);
  check(await page.isVisible('button[aria-pressed="true"]:has-text("Schnell")'), 'Heute: Filter Schnell aktiv');
  await page.click('button:has-text("Schnell")');
  await shot('03-heute');
  // PLAN (versteckt): ueber das Menue, Vormerken fuer heute und demnaechst, Einkaufsliste erzeugen
  await page.click('button[aria-label="Menü"]'); await page.click('text=Plan · Vorgemerkt'); await page.waitForTimeout(300);
  check(await page.isVisible('text=Noch nichts vorgemerkt'), 'Plan: leer, ueber das Menue erreichbar');
  await page.click('button:has-text("+ Vormerken")'); await page.waitForTimeout(300);
  await page.fill('input[placeholder="Rezept suchen…"]', 'Bolognese');
  await page.click('button:has-text("Pasta Bolognese")'); await page.waitForTimeout(200);
  await page.click('div[role="dialog"] button:text-is("Vormerken")'); await page.waitForTimeout(500);
  const pk = Object.values(plan().picks||{});
  check(pk.length===1 && pk[0].day===T && pk[0].key==='Pasta Bolognese', 'Vormerken: picks/<id> mit heutigem Tag geschrieben', pk);
  check(await page.isVisible('button:text-is("Plan (1)")'), 'Reiter Plan (1) erscheint');
  await page.click('button:has-text("+ Vormerken")'); await page.waitForTimeout(300);
  await page.fill('input[placeholder="Rezept suchen…"]', 'Risotto');
  await page.click('button:has-text("Risotto")'); await page.waitForTimeout(200);
  await page.click('button:has-text("Demnächst")');
  await page.click('div[role="dialog"] button:text-is("Vormerken")'); await page.waitForTimeout(500);
  check(Object.values(plan().picks).length===2 && Object.values(plan().picks).some(p=>p.key==='Risotto'&&p.day===''), 'Vorgemerkt: Risotto fuer demnaechst ueber die Suche');
  await shot('03b-plan');
  await page.click('button:text-is("Heute")'); await page.waitForTimeout(300);
  check(await page.isVisible('text=Für heute vorgemerkt') && await page.isVisible('text=Pasta Bolognese'), 'Heute: Block "Fuer heute vorgemerkt"');
  await page.click('button:text-is("Plan (2)")'); await page.waitForTimeout(300);
  check(await page.isVisible('text=Demnächst'), 'Vorgemerkt: Gruppe Demnaechst sichtbar');
  await page.click('button:has-text("Einkaufsliste aus dem Vorgemerkten")'); await page.waitForTimeout(600);
  const shop = Object.values(plan().shopping||{});
  check(shop.length>3 && shop.every(i=>i.src==='plan'), 'Einkauf: Liste aus dem Vorgemerkten erzeugt', shop.length);
  check(await page.isVisible('text=Erledigt'), 'Einkauf: Ansicht offen');
  await shot('04-einkauf');
  // OHNE HAUSHALTSBUCH: Abhaken traegt den Posten als heute gekauft in den Vorrat ein, Haken weg nimmt ihn zurueck
  {
    const before = Object.keys(plan().stock?.items||{}).length;
    const sid = Object.keys(plan().shopping).find(id=>!plan().shopping[id].basic&&!plan().shopping[id].checked);
    const txt = plan().shopping[sid].text;
    const rowBtn = page.locator('div:has(> span:text-is("'+txt.replace(/"/g,'\\"')+'")) > button[aria-label="Abhaken"]').first();
    await rowBtn.click(); await page.waitForTimeout(700);
    const ek = plan().stock?.items?.['ek_'+sid];
    check(plan().shopping[sid].checked===true && ek && ek.src==='einkauf' && ek.date===T && !/\d/.test(ek.name), 'Einkauf ohne Haushaltsbuch: Abhaken schreibt stock/items/ek_<id> (Herkunft einkauf, Name ohne Menge)', {txt, ek});
    check(await page.isVisible('span:text-is("'+txt.replace(/"/g,'\\"')+'")'), 'Einkauf: abgehakter Posten bleibt in der Liste stehen');
    await page.click('button:text-is("Vorrat")'); await page.waitForTimeout(400);
    await page.locator('button[aria-label$=": weitere Aktionen"]').first().click(); await page.waitForTimeout(200);
    check(await page.isVisible('text=/zuletzt heute · Einkauf/'), 'Vorrat: Herkunft "Einkauf" unter "⋯" der Zeile');
    await shot('04b-vorrat-aus-einkauf');
    await page.click('button:text-matches("^Einkauf")'); await page.waitForTimeout(400);
    await page.locator('div:has(> span:text-is("'+txt.replace(/"/g,'\\"')+'")) > button[aria-label="Haken entfernen"]').first().click(); await page.waitForTimeout(700);
    check(plan().shopping[sid].checked===false && !plan().stock?.items?.['ek_'+sid] && Object.keys(plan().stock?.items||{}).length===before, 'Einkauf: Haken am selben Tag entfernt nimmt den Vorratseintrag zurueck');
  }
  // "WURDE HEUTE GEKOCHT" im Rezept: Kochdatum, Vormerkung weg, Bewertungsdialog
  await page.click('button:text-is("Heute")'); await page.waitForTimeout(300);
  await page.locator('text=Pasta Bolognese').first().click(); await page.waitForTimeout(500);
  check(await page.isVisible('button:has-text("Wurde heute gekocht")'), 'Rezept: Knopf "Wurde heute gekocht" neben der Bewertung');
  await page.click('button:has-text("Wurde heute gekocht")'); await page.waitForTimeout(600);
  check(await page.isVisible('text=Wie war'), 'Gekocht: Bewertungsdialog');
  await page.click('button:has-text("Überspringen")'); await page.waitForTimeout(300);
  // Kochmodus: Schritt, Zutatenleiste, zurueck zum Rezept
  await page.click('button:text-is("Kochmodus")'); await page.waitForTimeout(400);
  await page.click('button:has-text("Zutaten (")'); await page.waitForTimeout(200);
  check(await page.isVisible('button:text-is("Weiter")') && await page.isVisible('text=1 / '), 'Kochmodus: erster Schritt mit Zutatenleiste und Weiter');
  await shot('03c-kochmodus');
  await page.click('button:text-is("Zurück")'); await page.waitForTimeout(300);
  const cookedRec = plan().recipes['Pasta Bolognese'];
  check(Array.isArray(cookedRec.cooked)&&cookedRec.cooked.includes(T) && Object.values(plan().picks).every(p=>p.day!==T), 'Gekocht: Kochdatum heute gespeichert, Vormerkung fuer heute entfernt', cookedRec.cooked);
  check(await page.isVisible('button:has-text("✓ Heute gekocht")'), 'Rezept: Knopf zeigt "Heute gekocht"');
  await page.click('text=Zurück'); await page.waitForTimeout(300);
  check(!(await page.isVisible('text=Für heute vorgemerkt')), 'Heute: Block fuer heute ist weg');
  // VORRAT: Haushaltsbuch verbinden, Liste, x
  await page.click('button:text-is("Vorrat")'); await page.waitForTimeout(300);
  await page.fill('input[placeholder="BUCH-CODE"]', 'FAMILIE1');
  await page.click('button:has-text("Verbinden")'); await page.waitForTimeout(800);
  check(plan().hb?.code==='FAMILIE1' && await page.isVisible('text=Wahrscheinlich da ('), 'Vorrat: Haushaltsbuch verbunden, Liste sichtbar');
  // NAMEN NORMIEREN: Regeln sofort (Rinderhack 500g -> Hackfleisch, Paprika rot 3er -> Paprika), Rest per KI (ein Aufruf), gespeichert unter stock/alias
  await page.waitForTimeout(1500);
  const aliasCalls = aiCalls.filter(c=>String(c.system||'').includes('Kassenbons'));
  const alias = plan().stock?.alias||{};
  check(aliasCalls.length===1 && Object.keys(alias).length===1 && alias.bratwurst?.name==='Bratwurst' && alias.bratwurst.src==='ki', 'Normieren: ein KI-Aufruf nur fuer den einzigen unklaren Namen (Bratwurst), Ergebnis unter stock/alias', {calls:aliasCalls.length, alias, sent:aliasCalls[0]?.messages?.[0]?.content});
  // Hand-Korrektur: "Lachsfilet" (Regel) -> "Lachs", gilt fuer die Rohbezeichnung "Lachsfilet TK"
  await page.click('button[aria-label="Lachsfilet: Name zuordnen"]'); await page.waitForTimeout(200);
  await page.fill('div[role="dialog"] input[aria-label="Zutatenname"]', 'Lachs');
  await page.click('div[role="dialog"] button:text-is("Speichern")'); await page.waitForTimeout(500);
  const alias2 = plan().stock?.alias||{};
  await openRow('Lachs');
  check(alias2.lachsfilet?.name==='Lachs' && alias2.lachsfilet.src==='hand' && (await page.locator('button[aria-label="Lachs: Name zuordnen"]').count())===1 && await page.isVisible('text=aus: Lachsfilet TK'), 'Vorrat: Hand-Zuordnung Lachsfilet -> Lachs unter stock/alias (src hand), Zeile heisst Lachs', alias2);
  // Kein Lebensmittel: Zeile verschwindet, unten "wieder einblenden" bringt sie zurueck
  await page.click('button[aria-label="Honig: Name zuordnen"]'); await page.waitForTimeout(200);
  await page.click('div[role="dialog"] button:text-is("Kein Lebensmittel")'); await page.waitForTimeout(500);
  check((await page.locator('button[aria-label="Honig: Name zuordnen"]').count())===0 && plan().stock.alias.honig?.name==='' && plan().stock.alias.honig.raw==='Honig' && await page.isVisible('button[aria-label="Honig wieder einblenden"]'), 'Vorrat: "Kein Lebensmittel" blendet Honig aus, unten steht es zum Wiedereinblenden');
  await page.click('button[aria-label="Honig wieder einblenden"]'); await page.waitForTimeout(500);
  check((await page.locator('button[aria-label="Honig: Name zuordnen"]').count())===1 && !plan().stock.alias.honig, 'Vorrat: Wieder einblenden loescht die Zuordnung, Honig ist zurueck');
  const rowNames = await page.locator('button[aria-label$=": Name zuordnen"]').allTextContents();
  check(rowNames.some(t=>/Hackfleisch/.test(t)) && rowNames.some(t=>/Paprika$/.test(t.trim())) && rowNames.some(t=>/Joghurt/.test(t)) && !rowNames.some(t=>/500g|3er|Natur|3,5/.test(t)), 'Vorrat: Zeilen zeigen Zutatennamen statt Kassenbon-Bezeichnungen', rowNames);
  await openRow('Hackfleisch');
  check(await page.isVisible('text=aus: Rinderhack 500g'), 'Vorrat: Herkunft "aus: Rinderhack 500g" unter "⋯" der Zeile');
  check(!(await page.isVisible('text=ungeklärt')), 'Vorrat: keine ungeklaerten Namen mehr');
  check((await page.locator('span[data-level]').count())>0 && !(await page.isVisible('text=/^\\d+ %$/')), 'Vorrat: Stufe in Worten statt Prozent');
  await page.click('button:has-text("So funktioniert der Vorrat")'); await page.waitForTimeout(200);
  check(await page.isVisible('text=Verblasst nach:'), 'Vorrat: Verblassen-Hinweis im Abschnitt "So funktioniert der Vorrat"');
  // Eigene Positionen: Hand, Dauervorrat (Pin), Foto, x
  await page.fill('input[placeholder="Lebensmittel, z. B. Linsen"]', 'Zwiebeln');
  await page.click('button[aria-label="Hinzufügen"]'); await page.waitForTimeout(500);
  const own = Object.values(plan().stock?.items||{});
  check(own.length===1 && own[0].name==='Zwiebeln' && own[0].sub==='Gemüse' && own[0].src==='hand' && own[0].date===T, 'Vorrat: Handeintrag unter stock/items mit erratener Gruppe', own);
  await openRow('Zwiebeln');
  check(await page.isVisible('text=Haushaltsbuch + Hand') && await page.isVisible('text=aus: Zwiebeln 1kg'), 'Vorrat: Zwiebeln (Hand) verschmilzt mit "Zwiebeln 1kg" aus dem Haushaltsbuch: beide Quellen, Herkunft in der Zeile');
  await page.click('button[aria-label="Spaghetti: weitere Aktionen"]'); await page.waitForTimeout(200);
  check(await page.isVisible('button:text-is("Einsortieren")') && await page.isVisible('button:text-is("Kein Lebensmittel")'), 'Vorrat: Menue "⋯" zeigt Einsortieren, Kein Lebensmittel, Dauervorrat');
  await page.click('button:text-is("★ Dauervorrat")'); await page.waitForTimeout(500);
  const perm = plan().stock?.perm||{};
  check(Object.keys(perm).length===1 && perm[Object.keys(perm)[0]].name==='Spaghetti' && await page.isVisible('text=Dauervorrat (1)'), 'Vorrat: Pin schreibt stock/perm, Block Dauervorrat erscheint', perm);
  // Foto: kleines PNG, KI simuliert
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAD0lEQVQIW2P8z8DwnwEIGAEQ4AHu0b8t1AAAAABJRU5ErkJggg==','base64');
  await page.setInputFiles('input[type="file"]', {name:'speisekammer.png', mimeType:'image/png', buffer:png});
  await page.waitForSelector('button:has-text("Übernehmen")', {timeout:15000});
  check((await page.locator('input[type="checkbox"]').count())===4 && (await page.inputValue('input[aria-label="Name für Rote Linsen"]'))==='Rote Linsen', 'Foto: 4 erkannte Lebensmittel zur Pruefung, Namen editierbar');
  await page.locator('input[aria-label="Spülmittel übernehmen"]').uncheck();
  await page.fill('input[aria-label="Name für Kichererbsen"]', 'Kichererbsen Dose');
  await page.click('button:has-text("3 Übernehmen")'); await page.waitForTimeout(600);
  const own2 = Object.values(plan().stock?.items||{});
  check(own2.length===4 && own2.filter(i=>i.src==='foto').length===3 && !own2.some(i=>i.name==='Spülmittel'), 'Foto: 3 Positionen uebernommen (Spuelmittel abgewaehlt)', own2.map(i=>i.name));
  await openRow('Linsen');
  check(await page.isVisible('text=Kichererbsen') && await page.isVisible('text=aus: Rote Linsen') && own2.some(i=>i.name==='Kichererbsen Dose'), 'Vorrat: Foto-Positionen in der Liste (Name im Dialog geaendert, Rote Linsen als Linsen mit Herkunft)');
  await page.click('button[aria-label="Kichererbsen: aufgebraucht, streichen"]'); await page.waitForTimeout(400);
  check(Object.values(plan().stock.items).length===3 && !(plan().hb.gone&&Object.keys(plan().hb.gone).length), 'x bei eigener Position (Kichererbsen aus dem Foto) loescht nur den Eintrag, kein gone-Marker');
  await page.click('button[aria-label="Bananen: aufgebraucht, streichen"]'); await page.waitForTimeout(400);
  check(plan().hb.gone && Object.keys(plan().hb.gone).length===1, 'x bei Haushaltsbuch-Position setzt gone-Marker');
  // Auffrischen: Haken bei einer verblassten Haushaltsbuch-Position -> Handeintrag von heute, 100 %
  await page.click('button[aria-label="Butter auffrischen: ist noch da"]'); await page.waitForTimeout(500);
  const fresh = Object.values(plan().stock.items).find(i=>i.name==='Butter');
  await openRow('Butter');
  check(!!fresh && fresh.src==='hand' && fresh.date===T && await page.isVisible('text=Haushaltsbuch + Hand') && (await page.locator('div:has(> div button[aria-label="Butter: Name zuordnen"]) span[data-level]').first().textContent())==='ist da', 'Vorrat: Haken schreibt stock/items fuer Butter mit heutigem Datum (100 %)', fresh);
  check((await page.locator('button[aria-label="Butter auffrischen: ist noch da"]').count())===0, 'Vorrat: bei "ist da" gibt es keinen Haken mehr');
  await shot('05-vorrat');
  // GRAPH: Umschalter, Wolken, Rezeptkanten, Auswahl, Wolke zuklappen, Daraus kochen (KI)
  await page.click('button:text-is("Netz")'); await page.waitForTimeout(500);
  const G = 'svg[data-testid="vorrat-graph"]';
  const nodeCount = await page.locator(G+' g[role="button"][aria-label$=" auswählen"]').count();
  const groupLabels = await page.locator(G+' g[role="button"][aria-label^="Gruppe "]').allTextContents();
  check(!groupLabels.some(t=>/Obst/.test(t)) && groupLabels.some(t=>/Gem.se \(3\)/.test(t)) && groupLabels.some(t=>/Fleisch \(3\)/.test(t)), 'Graph: Gruppen stimmen (Gemuese 3, Fleisch 3, kein Obst nach Streichen der Bananen)', groupLabels);
  const sectorCount = await page.locator(G+' line[data-edge="hub"]').count();
  check(nodeCount>=8 && groupLabels.length>=3 && sectorCount===nodeCount && (await page.locator(G+' g[aria-label^="Gruppe "] circle[fill^="#"]').count())>=groupLabels.length, 'Netz: Punkte haengen an farbigen Mittelpunkten der Gruppen', {nodeCount, groupLabels, sectorCount});
  check((await page.locator(G+' g[aria-label="Spaghetti auswählen"] circle[data-ring="dauer"]').count())===1, 'Graph: Dauervorrat Spaghetti mit Ring');
  check((await page.locator(G+' g[aria-label="Bratwurst auswählen"] circle[stroke="var(--c-err)"]').count())===1 && (await page.locator(G+' g[aria-label="Hackfleisch auswählen"] circle[stroke="var(--c-err)"]').count())===0, 'Graph: Bratwurst (kippt bald) mit rotem Bogen, Hackfleisch ohne');
  await page.click('button[aria-pressed="false"]:has-text("Pasta Bolognese")'); await page.waitForTimeout(400);
  const edges = await page.locator(G+' path[data-edge="present"]').count();
  const center = await page.locator(G+' g[data-testid="graph-center"]').textContent();
  check(edges>=2 && /fehlt: Knoblauch/.test(center) && /Pasta Bolognese/.test(center) && await page.isVisible('button:has-text("Zum Rezept")') && await page.isVisible('text=/\\d+ von \\d+ Zutaten da/'), 'Graph: Rezept im Mittelkreis mit Kanten zu vorhandenen Zutaten, Fehlendes im Kreis, Leiste mit Zum Rezept', {edges, center});
  await shot('05b-graph-rezept');
  await page.click('button[aria-label="Rezept ausblenden"]'); await page.waitForTimeout(200);
  check((await page.locator(G+' path[data-edge="present"]').count())===0, 'Graph: Rezept ausgeblendet, keine Kanten');
  await page.click(G+' g[aria-label="Kokosmilch auswählen"]'); await page.waitForTimeout(200);
  await page.click(G+' g[aria-label="Linsen auswählen"]'); await page.waitForTimeout(300);
  check(await page.isVisible('text=2 ausgewählt') && await page.isVisible('text=Kokosmilch, Linsen') && await page.isVisible('button:has-text("DARAUS KOCHEN")') && await page.isVisible('text=Rezepte mit der Auswahl'), 'Graph: zwei Punkte ausgewaehlt, Leiste mit Daraus kochen, Rezepte zur Auswahl');
  await page.click(G+' g[aria-label="Gruppe Gemüse zuklappen"] text'); await page.waitForTimeout(300);
  check((await page.locator(G+' g[aria-label="Gruppe Gemüse aufklappen"]').count())===1 && (await page.locator(G+' g[aria-label="Zwiebeln auswählen"]').count())===0, 'Graph: Wolke Gemuese zugeklappt, ihre Punkte verborgen');
  // Emoji auf den Punkten, Verschieben eines Punkts (Lage im Plan), Zuruecksetzen
  const passataTxt = await page.locator(G+' g[aria-label="Tomaten auswählen"] text').allTextContents();
  check(!passataTxt.includes('🍅') && passataTxt.includes('Tomaten'), 'Netz: Passata heisst jetzt Tomaten, ohne Emoji', passataTxt);
  const bb = await page.locator(G+' g[aria-label="Tomaten auswählen"] circle').first().boundingBox();
  await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.mouse.down();
  await page.mouse.move(bb.x+bb.width/2+10, bb.y+bb.height/2+8, {steps:3}); await page.mouse.move(bb.x+bb.width/2+34, bb.y+bb.height/2+26, {steps:6}); await page.mouse.up();
  await page.waitForTimeout(500);
  const layout = plan().stock?.layout||{};
  const lk = Object.keys(layout);
  check(lk.length===1 && lk[0]==='tomaten' && Number.isFinite(layout.tomaten.t) && layout.tomaten.r>=16 && layout.tomaten.r<=120 && layout.tomaten.at>0, 'Graph: Verschieben schreibt stock/layout/tomaten (normierter Schluessel von Passata) = {t, r, at}', layout);
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
  check(await page.isVisible('button:has-text("Vormerken")') && !(await page.isVisible('text=ZUM WOCHENPLAN')), 'Rezeptdetail: Vormerken statt Zum Wochenplan');
  await shot('06b-rezeptdetail');
  const tags = await page.locator('span[data-stock]').evaluateAll(els=>els.map(e=>e.getAttribute('data-stock')));
  check(tags.includes('da') && tags.includes('fehlt') && (await page.locator('span[data-stock="da"]').count())>=2 && (await page.locator('span[data-stock="fehlt"]').first().textContent())==='fehlt?', 'Rezeptdetail: Zutaten mit "da" / "fehlt?" nach Vorrat', tags);
  // "Nur Fehlendes" auf die Einkaufsliste, dann "Ist da" aus dem Rezept: erste fehlende Zutat in den Vorrat
  const missingBefore = await page.locator('button[aria-label$=": ist da"]').count();
  const shopBefore = Object.keys(plan().shopping||{}).length;
  await page.click('button:has-text("Auf die Einkaufsliste")'); await page.waitForTimeout(200);
  await page.click('button:has-text("NUR FEHLENDES")'); await page.waitForTimeout(500);
  const shopAfter = Object.keys(plan().shopping||{}).length;
  check(missingBefore>0 && shopAfter-shopBefore===missingBefore, 'Rezeptdetail: "Nur Fehlendes" legt genau die fehlenden Zutaten auf die Einkaufsliste', {shopBefore, shopAfter, missingBefore});
  check((await page.locator('button[aria-label$=": ist da"]').first().textContent())==='doch da', 'Rezeptdetail: Knopf "doch da" an fehlenden Zutaten');
  const firstMissing = await page.locator('button[aria-label$=": ist da"]').first().getAttribute('aria-label');
  const itemsBefore = Object.keys(plan().stock.items).length;
  await page.locator('button[aria-label$=": ist da"]').first().click(); await page.waitForTimeout(500);
  const missingAfter = await page.locator('button[aria-label$=": ist da"]').count();
  check(missingAfter===missingBefore-1 && Object.keys(plan().stock.items).length===itemsBefore+1 && (await page.locator('button:has-text("Nur Fehlendes auf die Liste ('+missingAfter+')")').count())===1, 'Rezeptdetail: "ist da" legt die Zutat in den Vorrat, Zeile wird "da", Zaehler im geteilten Knopf sinkt', {firstMissing, missingBefore, missingAfter});
  check(await page.isVisible('button:has-text("Alles auf die Liste")'), 'Rezeptdetail: Knopf "Auf die Einkaufsliste" mit Wahl "Alles | Nur Fehlendes"');
  // EINKAUF: kein Block "Wahrscheinlich da" mehr - ein Posten bleibt in der Liste, auch wenn er inzwischen im Vorrat steht
  await page.goBack(); await page.waitForTimeout(300);
  await page.click('button:text-matches("^Einkauf")'); await page.waitForTimeout(400);
  const stocked = firstMissing.replace(/: ist da$/,'');
  check(!(await page.isVisible('text=Wahrscheinlich da (')) && (await page.locator('span[data-level]').count())===0 && await page.isVisible('span:text-is("'+stocked+'")'), 'Einkauf: kein Block "Wahrscheinlich da", Posten bleibt trotz Vorrat in der Liste', stocked);
  await shot('06c-einkauf-ohne-wahrscheinlich-da');
  // MENGENAUSWAHL: Eingetipptes landet sofort in der Liste, darunter geht die Auswahl auf; jede Auswahl schreibt nur den Text des Postens
  {
    const find = (re)=>Object.entries(plan().shopping).find(([,v])=>re.test(v.text));
    await page.fill('input[aria-label="Produkt hinzufügen"]', 'Käse'); await page.press('input[aria-label="Produkt hinzufügen"]', 'Enter'); await page.waitForTimeout(400);
    const [kid, k0] = find(/^Käse$/)||[];
    const grp = page.locator('div[role="group"][aria-label="Menge für Käse"]');
    check(!!kid && k0.src==='manuell' && await grp.isVisible() && await grp.locator('button:text-is("Fertig")').isVisible(), 'Einkauf: "Käse" steht sofort in der Liste, Mengenauswahl geht auf', k0);
    await grp.locator('button:text-is("2")').click(); await page.waitForTimeout(400);
    check(plan().shopping[kid].text==='2 Käse' && plan().shopping[kid].cat==='Milch & Käse', 'Mengenauswahl: Tipp auf 2 macht "2 Käse"', plan().shopping[kid]);
    await grp.locator('button:text-is("Gramm")').click(); await page.waitForTimeout(400);
    check(plan().shopping[kid].text==='200 g Käse' && await grp.locator('button:text-is("500")').isVisible(), 'Mengenauswahl: Tipp auf "Gramm" macht "200 g Käse" (Text bleibt kurz), Zahlen wechseln auf Gramm', plan().shopping[kid]);
    await shot('06d-einkauf-mengenauswahl');
    await grp.locator('button:text-is("Packung")').click(); await page.waitForTimeout(300);
    await grp.locator('button:text-is("3")').click(); await page.waitForTimeout(400);
    const k1 = plan().shopping[kid];
    check(k1.text==='3 Packungen Käse' && k1.cat==='Milch & Käse' && Object.keys(k1).sort().join()===Object.keys(k0).sort().join(), 'Mengenauswahl: "3 Packungen Käse", Abteilung bleibt, kein neues Feld am Posten', k1);
    await grp.locator('button:text-is("Fertig")').click(); await page.waitForTimeout(300);
    check(!(await grp.isVisible()) && await page.isVisible('span:text-is("3 Packungen Käse")'), 'Mengenauswahl: "Fertig" schliesst, Zeile zeigt die Menge');
    // bestehender Posten: Tipp auf die Zeile oeffnet dieselbe Auswahl unter der Zeile, freie Eingabe und Umbenennen gehen weiter
    await page.click('span:text-is("3 Packungen Käse")'); await page.waitForTimeout(300);
    check((await grp.locator('input[aria-label="Menge"]').inputValue())==='3 Packungen', 'Mengenauswahl: Tipp auf die Zeile oeffnet die Auswahl mit der bisherigen Menge');
    await grp.locator('input[aria-label="Menge"]').fill('2 große'); await grp.locator('input[aria-label="Posten bearbeiten"]').fill('Bergkäse');
    await page.locator('div[role="group"] button:text-is("Fertig")').click(); await page.waitForTimeout(400);
    check(plan().shopping[kid].text==='2 große Bergkäse' && plan().shopping[kid].checked===false, 'Mengenauswahl: freie Menge und neuer Name werden gespeichert', plan().shopping[kid]);
    // Menge gleich mitgetippt: keine Auswahl
    await page.fill('input[aria-label="Produkt hinzufügen"]', '500 g Quark'); await page.press('input[aria-label="Produkt hinzufügen"]', 'Enter'); await page.waitForTimeout(400);
    check(!!find(/^500 g Quark$/) && (await page.locator('div[role="group"]').count())===0, 'Einkauf: mit getippter Menge geht keine Auswahl auf');
    await page.click('button[aria-label="Entfernen"]:right-of(span:text-is("500 g Quark"))'); await page.waitForTimeout(300);
    await page.click('span:text-is("2 große Bergkäse")'); await page.waitForTimeout(200);
    await shot('06e-einkauf-menge-in-zeile');
    await page.locator('div[role="group"] button:text-is("Fertig")').click(); await page.waitForTimeout(200);
    await page.locator('span:text-is("2 große Bergkäse")').locator('xpath=..').locator('button[aria-label="Entfernen"]').click(); await page.waitForTimeout(300);
    // NUR ABGEHAKTE LOESCHEN: entfernt gezielt die abgehakten Posten, offene bleiben, der Vorrat bleibt unberuehrt
    const delBtn = page.locator('button:has-text("Nur abgehakte Posten löschen")');
    await page.fill('input[aria-label="Produkt hinzufügen"]', '1 Testbrot'); await page.press('input[aria-label="Produkt hinzufügen"]', 'Enter'); await page.waitForTimeout(400);
    const [bid] = find(/^1 Testbrot$/)||[];
    await page.locator('span:text-is("1 Testbrot")').locator('xpath=..').locator('button[aria-label="Abhaken"]').click(); await page.waitForTimeout(500);
    const openIds = Object.entries(plan().shopping).filter(([,v])=>!v.checked).map(([k])=>k);
    const doneN = Object.values(plan().shopping).filter(v=>v.checked).length;
    const stockN = JSON.stringify(plan().stock?.items||{});
    check(doneN>0 && plan().shopping[bid].checked===true && (await delBtn.textContent()).includes('('+doneN+')') && await page.isVisible('button:text-is("Einkaufsliste komplett löschen")'), 'Einkauf: beide Loeschen-Knoepfe sichtbar, der zweite zeigt die Zahl der abgehakten', doneN);
    await shot('06f-einkauf-loeschen-knoepfe');
    await delBtn.click(); await page.waitForTimeout(500);
    const left = Object.keys(plan().shopping||{});
    check(openIds.length>0 && left.sort().join()===openIds.sort().join() && !(await page.isVisible('span:text-is("1 Testbrot")')), 'Nur abgehakte loeschen: abgehakte weg, offene Posten bleiben', {left:left.length, open:openIds.length});
    check(JSON.stringify(plan().stock?.items||{})===stockN, 'Nur abgehakte loeschen: Vorrat bleibt unveraendert');
    check((await delBtn.count())===0, 'Nur abgehakte loeschen: ohne Haken ist der Knopf nicht da');
  }
  await page.click(IN_APP); await page.waitForTimeout(300);
  await page.click('button:has-text("Pasta Carbonara")'); await page.waitForTimeout(400);
  await page.click('button:has-text("Vormerken")'); await page.waitForTimeout(200);
  await page.click('button:has-text("Morgen")'); await page.click('div[role="dialog"] button:text-is("Vormerken")'); await page.waitForTimeout(500);
  check(Object.values(plan().picks).some(p=>p.key==='Pasta Carbonara'), 'Rezeptdetail: Vormerken schreibt picks');
  // "Einkaufsliste aus dem Vorgemerkten" legt nur Fehlendes neu an: Eier sind laut Vorrat da und standen nicht auf der Liste
  {
    const idsBefore = new Set(Object.keys(plan().shopping||{}));
    await page.goBack(); await page.waitForTimeout(300);
    await page.click('button:text-matches("^Plan")'); await page.waitForTimeout(300);
    await page.click('button:has-text("Einkaufsliste aus dem Vorgemerkten")'); await page.waitForTimeout(600);
    const added = Object.keys(plan().shopping||{}).filter(id=>!idsBefore.has(id)).map(id=>plan().shopping[id].text);
    const all = Object.values(plan().shopping||{}).map(i=>i.text);
    check(!all.some(t=>/^Eier/.test(t)) && await page.isVisible('span:text-is("'+stocked+'")'), 'Vorgemerkt: Liste nur mit Fehlendem (Eier sind da), Vorhandenes auf der Liste bleibt', {added, all});
    await page.click(IN_APP); await page.waitForTimeout(300);
    await page.click('button:has-text("Pasta Carbonara")'); await page.waitForTimeout(400);
  }
  // KOCHBUCH ALS DATEI (Stufe 4): sichern (Download), laden mit Vorschau, ersetzen / ueberspringen, Fotos
  await page.goBack().catch(()=>{}); await page.waitForTimeout(200);
  if(!(await page.isVisible('button:has-text("Sichern (.json)")'))){ await page.click(IN_APP); await page.waitForTimeout(300); }
  const [dl] = await Promise.all([ page.waitForEvent('download', {timeout:15000}), page.click('button:has-text("Sichern (.json)")') ]);
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
  await page.click('div[role="dialog"] button:text-is("Importieren")'); await page.waitForTimeout(800);
  const impRec = plan().recipes['Importiertes Testgericht'], bolo = plan().recipes['Pasta Bolognese'];
  check(!!impRec && impRec.steps[0]==='Testen.' && bolo.rating===2 && bolo.notes==='Import-Test' && bolo.steps[0]==='Importierte Fassung.' && Object.keys(plan().recipes).length===recCount+1, 'Kochbuch laden (ersetzen): neues Rezept da, Pasta Bolognese ersetzt', {impRec:!!impRec, rating:bolo.rating});
  check(String(db.wochen.recipeImages?.[code]?.['Importiertes Testgericht']||'').startsWith('data:image/png;base64,'), 'Kochbuch laden: Foto unter recipeImages/<CODE>/<key>');
  check(await page.isVisible('text=Importiertes Testgericht') && !(await page.isVisible('div[role="dialog"]')), 'Kochbuch laden: Dialog zu, Rezept in der Liste');
  await page.setInputFiles('input[accept="application/json,.json"]', {name:'kochbuch.json', mimeType:'application/json', buffer:Buffer.from(importFile,'utf8')});
  await page.waitForSelector('div[role="dialog"]', {timeout:5000});
  await page.click('div[role="dialog"] button:text-is("Importieren")'); await page.waitForTimeout(500);
  check(Object.keys(plan().recipes).length===recCount+1 && plan().recipes['Pasta Bolognese'].rating===2 && !(await page.isVisible('div[role="dialog"]')), 'Kochbuch laden (behalten): nichts ueberschrieben');
  await page.setInputFiles('input[accept="application/json,.json"]', {name:'kaputt.json', mimeType:'application/json', buffer:Buffer.from('{"hallo":1}','utf8')});
  await page.waitForSelector('div[role="dialog"]', {timeout:5000});
  check(/keine Rezepte/.test(await page.locator('div[role="dialog"]').textContent()), 'Kochbuch laden: unbrauchbare Datei zeigt Fehler');
  await page.click('div[role="dialog"] button:text-is("Schließen")'); await page.waitForTimeout(200);
  // Menue: Datenschutz, Vorgemerkt
  await page.click('button[aria-label="Menü"]'); await page.waitForTimeout(200);
  const menu = (await page.locator('div[role="menu"]').textContent());
  // Design-Umschalter: System folgt dem Geraet, Hell und Dunkel werden gemerkt
  const themeOf = ()=>page.evaluate(()=>[document.documentElement.getAttribute('data-theme'), localStorage.getItem('wochenplan_theme')]);
  const t0 = await themeOf();
  await page.click('div[role="menu"] button:text-is("Dunkel")'); const t1 = await themeOf();
  await page.click('div[role="menu"] button:text-is("Hell")'); const t2 = await themeOf();
  await shot('06c-menue');
  await page.click('div[role="menu"] button:text-is("System")'); const t3 = await themeOf();
  check(t0[0]===SCHEME && t0[1]===null && t1[0]==='dark' && t1[1]==='dark' && t2[0]==='light' && t2[1]==='light' && t3[0]===SCHEME && t3[1]===null, 'Menue: Design System/Hell/Dunkel schaltet um und wird gemerkt', {t0,t1,t2,t3});
  check(menu.includes('Vorgemerkt')&&menu.includes('Datenschutz')&&!menu.includes('Symbolbilder')&&!menu.includes('Haushaltsbuch'), 'Menue: Vorgemerkt, Datenschutz, keine KI-Symbolbilder', menu);
  await page.click('text=Datenschutz & Daten'); await page.waitForTimeout(200);
  check(await page.isVisible('button:has-text("Plan endgültig löschen")'), 'Datenschutz-Modal offen');
  await page.click('button:has-text("Schließen")');
  // Desktop-Blick
  const dctx = await browser.newContext({ viewport:{width:1280,height:900}, locale:'de-DE', colorScheme:SCHEME });
  await dctx.route(/wochenessenplan-3d0e1-default-rtdb/, mockFb(db.wochen));
  await dctx.route(/haushaltsbuch-3cefb-default-rtdb/, mockFb(db.hb));
  await dctx.route(/fonts\.(googleapis|gstatic)\.com/, route=>route.abort());
  const dp = await dctx.newPage();
  await dp.goto('http://127.0.0.1:5173/');
  await dp.waitForSelector('text=Kochbuch starten');
  await dp.fill('input[placeholder="z.B. Anna"]', 'Mero');
  await dp.fill('input[placeholder="CODE"]', code);
  await dp.click('button:has-text("Beitreten")');
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
