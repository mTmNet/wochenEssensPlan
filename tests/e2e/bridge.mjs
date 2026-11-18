// Brücke zum Haushaltsbuch im Browser: Der Mock spielt beide Datenbanken. Das Haushaltsbuch-Projekt kennt drei Zustände:
//   "ohne"   = noch kein Einkaufsauszug (heutiger Stand): Buch über den Code lesbar
//   "beides" = Auszug vorhanden, Buch über den Code weiter lesbar (Übergang)
//   "scharf" = Buch nur noch für Mitglieder (für den Wochenplan gesperrt), Auszug über den Schlüssel lesbar
// Start: npm run dev -- --port 5173 --host 127.0.0.1 &   dann   node tests/e2e/bridge.mjs
import pw from 'playwright'; const { chromium } = pw;
import { readFileSync } from 'node:fs';
const URL0 = process.env.APP_URL || 'http://127.0.0.1:5173/';
const fails = []; const check = (c,msg,extra)=>{ if(c) console.log('  ok  ',msg); else { fails.push(msg); console.log('  FAIL',msg,extra!==undefined?JSON.stringify(extra).slice(0,300):''); } };
const day = (off)=>new Date(Date.now()-off*86400000).toISOString().slice(0,10);
const META = {createdAt:1,updatedAt:1,picksUpdatedAt:1,shoppingUpdatedAt:1,recipesUpdatedAt:1,peopleUpdatedAt:1,imagesMigrated:true};
const KEY = 'abcdefghjkmnpqrstuvwxyz23456', BUCH = 'FAMILIE1', PLAN = 'TESTPLAN23';
const ITEMS = [{name:'Bananen',sub:'Obst'},{name:'Zwiebeln',sub:'Gemüse'},{name:'Spaghetti',sub:'Trockenwaren'}];
const hbDb = ()=>({ books:{[BUCH]:{categories:['Lebensmittel','Sonstiges'],entries:{e1:{date:day(1),category:'Lebensmittel',amount:6480,merchant:'Laden',by:'Anna',items:ITEMS.map(i=>({...i,amount:199}))}}}},
  kitchenKeys:{[BUCH]:{key:KEY,sig:'x'}}, kitchen:{[KEY]:{cat:'Lebensmittel',updatedAt:1,entries:{e1:{date:day(1),category:'Lebensmittel',items:ITEMS.map(i=>({...i,amount:1}))}}}} });
let plans, hb, mode, hbReads;
const getAt = (root,parts)=>{ let o=root; for(const p of parts){ if(o==null||typeof o!=='object') return null; o=o[p]; } return o===undefined?null:o; };
const setAt = (root,parts,val)=>{ let o=root; for(let i=0;i<parts.length-1;i++){ if(o[parts[i]]==null||typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; } if(val===null) delete o[parts[parts.length-1]]; else o[parts[parts.length-1]]=val; };
const wire = async(ctx)=>{
  await ctx.route(/firebasedatabase\.app/, r=>{ const req=r.request(), u=new URL(req.url()), m=req.method();
    const parts=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
    const deny=()=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Permission denied'})});
    if(u.hostname.includes('haushaltsbuch')){
      hbReads.push(m+' /'+parts.join('/'));
      if(m!=='GET') return deny();   // der Wochenplan schreibt nie ins Haushaltsbuch
      if(parts[0]==='books') return mode==='scharf'||parts.length<2?deny():r.fulfill({contentType:'application/json',body:JSON.stringify(getAt(hb,parts))});
      if(parts[0]==='kitchenKeys'||parts[0]==='kitchen') return mode==='ohne'||parts.length<2?deny():r.fulfill({contentType:'application/json',body:JSON.stringify(getAt(hb,parts))});
      return deny();
    }
    let body; try{ body=req.postData()?JSON.parse(req.postData()):undefined; }catch(e){}
    const root={plans,recipeImages:{},globalRecipes:{},members:{}};
    if(m==='GET') return r.fulfill({contentType:'application/json',body:JSON.stringify(getAt(root,parts))});
    if(parts[0]==='plans'){ const p=parts.slice(1);
      if(m==='PUT') setAt(plans,p,body); if(m==='DELETE') setAt(plans,p,null);
      if(m==='PATCH') for(const [k,v] of Object.entries(body||{})) setAt(plans,[...p,...k.split('/')],v); }
    r.fulfill({contentType:'application/json',body:'{}'}); });
  await ctx.route(/pollinations|fonts\.g|identitytoolkit|securetoken/, r=>r.abort());
};
const SESSION_KEY = (readFileSync(new URL('../../src/App.jsx', import.meta.url),'utf8').match(/SESSION_KEY\s*=\s*"([^"]+)"/)||[])[1];
const open = async(b)=>{ const ctx=await b.newContext({viewport:{width:390,height:844}}); await wire(ctx); const p=await ctx.newPage();
  await p.addInitScript(s=>localStorage.setItem(s.key,JSON.stringify(s.val)),{key:SESSION_KEY,val:{code:PLAN,name:'Anna'}});
  await p.goto(URL0); await p.waitForSelector('button:text-is("Vorrat")',{timeout:15000}); await p.click('button:text-is("Vorrat")'); await p.waitForTimeout(1500); return {ctx,p}; };
const reset = (m,link)=>{ mode=m; hb=hbDb(); hbReads=[]; plans={[PLAN]:{participants:['Anna'],meta:{...META},...(link?{hb:link}:{})}}; };
const link = ()=>plans[PLAN].hb||{};
const listed = async(p)=>await p.isVisible('text=Wahrscheinlich da (') && await p.isVisible('text=Bananen');

const b = await chromium.launch();
check(!!SESSION_KEY,'Sitzungsschlüssel gefunden');

console.log('\nBestehende Verknüpfung mit Buch-Code, Auszug ist da (Übergang)');
reset('beides',{code:BUCH,cat:'Lebensmittel'});
{ const a=await open(b);
  check(await listed(a.p),'Vorrat zeigt die Einkäufe');
  check(link().key===KEY && link().code===BUCH,'Plan hat sich den Schlüssel gemerkt, der Code bleibt vorerst als Rückfall',link());
  check(!hbReads.some(x=>x.includes('/books/')),'das Buch selbst wurde nicht mehr gelesen',hbReads);
  mode='scharf'; hbReads=[]; await a.p.reload(); await a.p.waitForSelector('button:text-is("Vorrat")'); await a.p.click('button:text-is("Vorrat")'); await a.p.waitForTimeout(1500);
  check(await listed(a.p),'nach dem Scharfstellen des Haushaltsbuchs zeigt der Vorrat die Einkäufe weiter');
  check(hbReads.every(x=>x==='GET /kitchen/'+KEY),'gelesen wird nur der Auszug',hbReads);
  await a.ctx.close(); }

console.log('\nNeu verbinden, Auszug ist da: Der Plan speichert nur den Schlüssel');
reset('beides');
{ const a=await open(b);
  await a.p.fill('input[placeholder="BUCH-CODE"]',BUCH); await a.p.click('button:has-text("Verbinden")'); await a.p.waitForTimeout(1500);
  check(await listed(a.p),'Vorrat zeigt die Einkäufe');
  check(link().key===KEY && !link().code,'im Plan steht der Schlüssel, kein Buch-Code',link());
  check(!JSON.stringify(plans).includes(BUCH),'der Buch-Code steht nirgends im Plan');
  check(hbReads.every(x=>x.startsWith('GET ')),'nur Lesezugriffe aufs Haushaltsbuch',hbReads);
  await a.ctx.close(); }

console.log('\nFalscher Code');
reset('beides');
{ const a=await open(b);
  await a.p.fill('input[placeholder="BUCH-CODE"]','FALSCH99'); await a.p.click('button:has-text("Verbinden")'); await a.p.waitForTimeout(1500);
  check(await a.p.isVisible('text=Kein Haushaltsbuch mit diesem Code gefunden') && !plans[PLAN].hb,'Meldung wie bisher, nichts gespeichert',link());
  await a.ctx.close(); }

console.log('\nNoch kein Auszug (heutiger Stand): alles wie bisher über den Code');
reset('ohne',{code:BUCH,cat:'Lebensmittel'});
{ const a=await open(b);
  check(await listed(a.p),'Vorrat zeigt die Einkäufe');
  check(link().code===BUCH && !link().key,'Verknüpfung unverändert',link());
  await a.ctx.close(); }

await b.close();
console.log(fails.length?('\n'+fails.length+' FEHLER'):'\nalles ok'); process.exit(fails.length?1:0);
