// Einzelnes Rezept als Datei: Rezept-Seite, Menue "⋯" -> "Als Datei (.json)", danach in einem neuen Plan wieder laden.
// Firebase simuliert (wie walk-v3.mjs). Aufruf: node tests/e2e/einzelexport.mjs (Dev-Server auf Port 5173)
import pw from 'playwright'; const { chromium } = pw;
import fs from 'fs';
const OUT = new URL('./shots/', import.meta.url).pathname; fs.mkdirSync(OUT,{recursive:true});
const fails=[]; const check=(c,m,x)=>{ if(c) console.log('  ok  ',m); else { fails.push(m); console.log('  FAIL',m,x!==undefined?JSON.stringify(x).slice(0,300):''); } };
const getAt=(r,ps)=>{ let o=r; for(const p of ps){ if(o==null||typeof o!=='object') return null; o=o[p]; } return o===undefined?null:o; };
const setAt=(r,ps,v)=>{ let o=r; for(let i=0;i<ps.length-1;i++){ if(o[ps[i]]==null||typeof o[ps[i]]!=='object') o[ps[i]]={}; o=o[ps[i]]; } if(v===null) delete o[ps[ps.length-1]]; else o[ps[ps.length-1]]=v; };
const db={};
const mockFb=async(route)=>{ const req=route.request(); const u=new URL(req.url()); const ps=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent); const m=req.method();
  if(m==='GET') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(getAt(db,ps))});
  if(m==='DELETE'){ setAt(db,ps,null); return route.fulfill({status:200,contentType:'application/json',body:'null'}); }
  const data=JSON.parse(req.postData()||'null');
  if(m==='PUT') setAt(db,ps,data); else { if(getAt(db,ps)==null) setAt(db,ps,{}); for(const [k,v] of Object.entries(data||{})) setAt(db,[...ps,...k.split('/')],v); }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}); };
(async()=>{
  const browser=await chromium.launch();
  const scheme=process.env.SCHEME==='dark'?'dark':'light';
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'de-DE',colorScheme:scheme,acceptDownloads:true});
  await ctx.route(/wochenessenplan-3d0e1-default-rtdb/,mockFb);
  await ctx.route(/haushaltsbuch-3cefb-default-rtdb/,r=>r.fulfill({status:200,contentType:'application/json',body:'null'}));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('http://127.0.0.1:5173/'); await page.waitForSelector('text=Kochbuch starten',{timeout:15000});
  await page.fill('input[placeholder="z.B. Anna"]','Claude');
  const code=(await page.textContent('span[style*="letter-spacing: 6px"]')).trim();
  await page.click('text=Kochbuch starten'); await page.waitForSelector('button:text-is("Rezepte")',{timeout:10000});
  await page.click('button:text-is("Rezepte")'); await page.click('text=Startrezepte übernehmen');
  await page.waitForSelector('button:has-text("Pasta Bolognese")'); await page.waitForTimeout(400);
  check(await page.isVisible('text=Ein einzelnes Rezept sicherst du auf seiner Seite unter ⋯.'),'Rezepte: Hinweis auf den Einzel-Export');
  await page.click('button:has-text("Pasta Bolognese")'); await page.waitForTimeout(400);
  await page.click('button[aria-label="Weitere Aktionen"]'); await page.waitForTimeout(250);
  const items=await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
  check(items.join('|')==='Bearbeiten|Als PDF|Als Datei (.json)|Rezept löschen','Menü ⋯: Bearbeiten, Als PDF, Als Datei (.json), Rezept löschen',items);
  await page.screenshot({path:OUT+'einzelexport-menue-'+scheme+'.png'});
  const [dl]=await Promise.all([page.waitForEvent('download'),page.click('[role="menuitem"]:has-text("Als Datei (.json)")')]);
  const name=dl.suggestedFilename(); const file=await dl.path(); const data=JSON.parse(fs.readFileSync(file,'utf8'));
  check(/^rezept-pasta-bolognese-\d{4}-\d\d-\d\d\.json$/.test(name),'Dateiname '+name);
  check(data.format==='wochenplan-kochbuch'&&data.count===1&&Object.keys(data.recipes).length===1,'Datei enthält genau ein Rezept',Object.keys(data.recipes||{}));
  await page.waitForTimeout(300);
  check(await page.isVisible('text=Rezept als Datei gesichert.'),'Hinweis „Rezept als Datei gesichert.“');
  check(!(await page.isVisible('[role="menu"]')),'Menü schließt nach dem Tippen');
  // Gesamt-Export unveraendert
  await page.goBack().catch(()=>{}); await page.waitForTimeout(300);
  if(!(await page.isVisible('button:has-text("Sichern (.json)")'))) await page.click('button:text-is("Rezepte")');
  await page.waitForTimeout(300);
  const [dl2]=await Promise.all([page.waitForEvent('download'),page.click('button:has-text("Sichern (.json)")')]);
  const all=JSON.parse(fs.readFileSync(await dl2.path(),'utf8'));
  check(/^wochenplan-kochbuch-/.test(dl2.suggestedFilename())&&all.count===14,'Gesamt-Export weiterhin alle 14 Rezepte',all.count);
  // In einem neuen Plan laden
  const page2=await (await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'de-DE',colorScheme:scheme})).newPage();
  await page2.context().route(/wochenessenplan-3d0e1-default-rtdb/,mockFb); await page2.context().route(/fonts\./,r=>r.abort());
  await page2.goto('http://127.0.0.1:5173/'); await page2.waitForSelector('text=Kochbuch starten');
  await page2.fill('input[placeholder="z.B. Anna"]','Zweiter'); const code2=(await page2.textContent('span[style*="letter-spacing: 6px"]')).trim();
  await page2.click('text=Kochbuch starten'); await page2.waitForSelector('button:text-is("Rezepte")'); await page2.click('button:text-is("Rezepte")'); await page2.waitForTimeout(300);
  await page2.setInputFiles('input[type="file"][accept="application/json,.json"]',file); await page2.waitForTimeout(400);
  await page2.screenshot({path:OUT+'einzelexport-laden-'+scheme+'.png'});
  check(await page2.isVisible('[role="dialog"][aria-label="Kochbuch laden"] >> text=1 Rezept'),'Laden-Dialog nennt 1 Rezept');
  await page2.click('[role="dialog"] button:text-is("Importieren")'); await page2.waitForTimeout(800);
  check(Object.keys(getAt(db,['plans',code2,'recipes'])||{}).join()==='Pasta Bolognese','Neuer Plan hat nach dem Laden genau dieses Rezept',getAt(db,['plans',code2,'recipes']));
  check(code!==code2&&!errs.length,'keine Seitenfehler',errs);
  await browser.close(); console.log(fails.length?'FEHLER: '+fails.length:'Alles ok'); process.exit(fails.length?1:0);
})();
