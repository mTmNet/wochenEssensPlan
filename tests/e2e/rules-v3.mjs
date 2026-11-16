// Firebase-Regeln fuer recipeImages/globalRecipes: Der Mock setzt die Regeln aus der README durch
// (Wurzel recipeImages nicht lesbar, Schreiben nur unter einem Plan-Code, globalRecipes nur lesbar).
// Geprueft wird: Beitritt, Migration eines Altbestands samt Bildkopie und Sitzung funktionieren unveraendert,
// und die App fragt die Wurzel recipeImages nie ab.
import pw from 'playwright'; const { chromium } = pw;
const fails = []; const check = (c,msg,extra)=>{ if(c) console.log('  ok  ',msg); else { fails.push(msg); console.log('  FAIL',msg,extra!==undefined?JSON.stringify(extra).slice(0,300):''); } };
const CODE_RE = /^[A-Z0-9]{6,16}$/;
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const store = {
  plans: {
    ALTPLAN234: { plan:{Mo:{Ab:'Linsen Dal'}}, shopping:['Milch'], participants:['Anna'], updatedAt:1700000000000 },
    NEUPLAN234: { participants:['Anna'], recipes:{'Pasta Test':{name:'Pasta Test',ingredients:['Nudeln'],steps:['Kochen.']}},
                  meta:{createdAt:1,updatedAt:1,picksUpdatedAt:1,shoppingUpdatedAt:1,recipesUpdatedAt:1,peopleUpdatedAt:1,imagesMigrated:true} },
  },
  globalRecipes: { 'Linsen Dal':{ingredients:['Linsen'],steps:['Kochen.']}, 'Käse-Spätzle (alt)':{ingredients:['Spätzle'],steps:['Schichten.']}, 'Ohne Bild':{ingredients:['x'],steps:['y']} },
  recipeImages: { 'Linsen Dal':IMG, 'Käse-Spätzle (alt)':IMG, 'Fremdes Gericht':IMG, NEUPLAN234:{'Pasta Test':IMG}, FREMDCODE99:{'Geheim':IMG} },
};
const getAt = (parts)=>{ let o=store; for(const p of parts){ if(o==null||typeof o!=='object') return null; o=o[p]; } return o===undefined?null:o; };
const setAt = (parts,val)=>{ let o=store; for(let i=0;i<parts.length-1;i++){ if(o[parts[i]]==null||typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; } if(val===null) delete o[parts[parts.length-1]]; else o[parts[parts.length-1]]=val; };
const allowed = (m,parts)=>{
  const read = m==='GET';
  if(parts[0]==='plans') return parts.length>=2 && CODE_RE.test(parts[1]);
  if(parts[0]==='globalRecipes') return read;
  if(parts[0]==='recipeImages') return parts.length>=2 && (read || CODE_RE.test(parts[1]));
  return false;
};
const log = { denied:[], rootImageGets:0, imageGets:[] };
const mockFb = async(route)=>{
  const req=route.request(), u=new URL(req.url()), m=req.method();
  const parts=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
  if(parts[0]==='recipeImages'&&m==='GET'){ if(parts.length===1) log.rootImageGets++; else log.imageGets.push(parts[1]); }
  if(!allowed(m,parts)){ log.denied.push(m+' '+parts.join('/')); return route.fulfill({status:401, contentType:'application/json', body:'{"error":"Permission denied"}'}); }
  if(m==='GET') return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(getAt(parts))});
  if(m==='DELETE'){ setAt(parts,null); return route.fulfill({status:200, contentType:'application/json', body:'null'}); }
  const data=JSON.parse(req.postData()||'null');
  if(m==='PUT') setAt(parts,data);
  else { if(getAt(parts)==null) setAt(parts,{}); for(const [k,v] of Object.entries(data||{})) setAt([...parts,...k.split('/')],v); }
  return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(data)});
};

const browser = await chromium.launch();
const open = async(code)=>{
  const ctx = await browser.newContext();
  await ctx.route(/firebasedatabase\.app/, mockFb);
  await ctx.route('**/api/gemini', r=>r.fulfill({status:200, contentType:'application/json', body:'{}'}));
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5173/');
  await page.fill('#join-name','Anna');
  await page.fill('input[aria-label="Plan-Code"]',code);
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=Heute', {timeout:15000});
  await page.waitForTimeout(800);
  return {ctx,page};
};

console.log('Altbestand: Migration mit Bildkopie');
let s = await open('ALTPLAN234');
const alt = store.plans.ALTPLAN234;
check(!!alt.meta && alt.meta.imagesMigrated===true, 'Migration abgeschlossen, meta/imagesMigrated gesetzt', alt.meta);
check(Object.keys(alt.recipes||{}).length===3, 'Alle alten Rezepte uebernommen', Object.keys(alt.recipes||{}));
const copied = store.recipeImages.ALTPLAN234||{};
check(copied['Linsen Dal']===IMG && copied['Käse-Spätzle (alt)']===IMG && Object.keys(copied).length===2, 'Alte Bilder (auch mit Umlaut und Klammer) unter recipeImages/<CODE>/<key>', Object.keys(copied));
check(store.recipeImages['Linsen Dal']===IMG && !!store.globalRecipes['Linsen Dal'], 'Altbestand bleibt unveraendert stehen');
await s.ctx.close();

console.log('Aktueller Plan: Beitritt und Bilder');
s = await open('NEUPLAN234');
check(log.imageGets.includes('NEUPLAN234'), 'Bilder des Plans ueber recipeImages/<CODE> geladen');
await s.ctx.close();

check(log.rootImageGets===0, 'Wurzel recipeImages wird nie gelesen', log.rootImageGets);
check(!log.imageGets.includes('FREMDCODE99') && !log.imageGets.includes('Fremdes Gericht'), 'Keine fremden Bildknoten gelesen', log.imageGets);
check(log.denied.length===0, 'Kein Zugriff von den Regeln abgelehnt', log.denied);
await browser.close();
console.log(fails.length?`\n${fails.length} Pruefung(en) gescheitert`:'\nAlle Pruefungen bestanden');
process.exit(fails.length?1:0);
