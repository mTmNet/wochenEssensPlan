import pw from 'playwright'; const { chromium } = pw;
const db = {};
const getAt=(r,p)=>{let o=r;for(const k of p){if(o==null||typeof o!=='object')return null;o=o[k];}return o===undefined?null:o;};
const setAt=(r,p,v)=>{let o=r;for(let i=0;i<p.length-1;i++){if(o[p[i]]==null||typeof o[p[i]]!=='object')o[p[i]]={};o=o[p[i]];}if(v===null)delete o[p[p.length-1]];else o[p[p.length-1]]=v;};
const uploads=[];
const mock=async(route)=>{const req=route.request();const u=new URL(req.url());const parts=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean);const m=req.method();
 if(m==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(getAt(db,parts))});
 const body=req.postData()||'null';const data=JSON.parse(body);uploads.push({m,path:parts.join('/'),bytes:body.length,keys:Object.keys(data||{}).length});
 if(m==='PUT')setAt(db,parts,data);else if(m==='PATCH'){let o=getAt(db,parts);if(o==null||typeof o!=='object'){o={};setAt(db,parts,o);}for(const[k,v]of Object.entries(data)){if(v===null)delete o[k];else o[k]=v;}}
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});};
(async()=>{
 const browser=await chromium.launch();
 const mk=async()=>{const c=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'});await c.route(/firebasedatabase\.app/,mock);await c.route(/image\.pollinations\.ai/,r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'}));await c.route(/fonts\./,r=>r.abort());const p=await c.newPage();p.on('dialog',d=>d.accept());return p;};
 const A=await mk(), B=await mk();
 await A.goto('http://127.0.0.1:5173/');await A.waitForSelector('text=PLAN STARTEN');
 await A.fill('input[placeholder="z.B. Anna"]','Anna');const code=(await A.textContent('span[style*="letter-spacing: 6px"]')).trim();await A.click('text=PLAN STARTEN');await A.waitForSelector('button:has-text("Kochbuch")');
 await B.goto('http://127.0.0.1:5173/');await B.waitForSelector('text=PLAN STARTEN');
 await B.fill('input[placeholder="z.B. Anna"]','Ben');await B.fill('input[placeholder="CODE"]',code);await B.click('button:has-text("BEITRETEN")');await B.waitForSelector('button:has-text("Kochbuch")');
 // both have recipes loaded. A generates shopping list so B has items to tick
 await A.locator('button:has-text("+ Hinzufügen...")').nth(2).click();await A.click('button:has-text("Pasta Bolognese")');
 await A.click('text=GESAMTE EINKAUFSLISTE GENERIEREN');await A.waitForTimeout(1500);
 await B.waitForTimeout(10500); // B polls
 await B.click('button:has-text("Einkauf")');await B.waitForTimeout(300);
 const nB=await B.locator('span[title="Tippen zum Bearbeiten"]').count();console.log('B sees shopping items:',nB);
 // A deletes recipe "Avocado Toast"
 await A.click('button:has-text("Rezepte")');await A.click('button:has-text("Avocado Toast")');await A.waitForTimeout(500);await A.click('text=REZEPT LOESCHEN');await A.waitForTimeout(1200);
 console.log('after delete on A, in DB:', 'Avocado Toast' in (db.globalRecipes||{}));
 // B (stale, hasn't polled yet) ticks a checkbox within the 10 s window
 uploads.length=0;
 await B.locator('div:has(> span[title="Tippen zum Bearbeiten"]) > button').first().click();await B.waitForTimeout(1500);
 console.log('B upload on checkbox tick:', JSON.stringify(uploads));
 console.log('after B ticks checkbox, Avocado Toast back in DB:', 'Avocado Toast' in (db.globalRecipes||{}));
 await A.waitForTimeout(10500);
 await A.click('text=ZURUECK').catch(()=>{});
 await A.click('button:has-text("Rezepte")');await A.waitForTimeout(300);
 console.log('A sees Avocado Toast again after poll:', await A.isVisible('button:has-text("Avocado Toast")'));
 // Rating overwrite: A rates Risotto 5; B (stale) ticks another box
 await A.click('button:has-text("Risotto")');await A.waitForTimeout(400);await A.locator('button:has-text("☆")').nth(4).click();await A.waitForTimeout(1200);
 console.log('Risotto rating in DB after A rates:', db.globalRecipes?.Risotto?.rating);
 await B.locator('div:has(> span[title="Tippen zum Bearbeiten"]) > button').nth(1).click();await B.waitForTimeout(1500);
 console.log('Risotto rating in DB after B ticks checkbox:', db.globalRecipes?.Risotto?.rating);
 // Typo join: joining unknown code creates a plan silently?
 const C=await mk();await C.goto('http://127.0.0.1:5173/');await C.waitForSelector('text=PLAN STARTEN');
 await C.fill('input[placeholder="z.B. Anna"]','Oma');await C.fill('input[placeholder="CODE"]','XXXX99');await C.click('button:has-text("BEITRETEN")');await C.waitForTimeout(1000);
 console.log('join with unknown code -> in app:', await C.isVisible('button:has-text("Kochbuch")'), '| plans in DB:', Object.keys(db.plans||{}));
 await browser.close();
})().catch(e=>{console.error('FAILED',e);process.exit(1);});
