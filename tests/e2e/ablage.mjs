// Dateiablage und Rechtstexte im Browser: Firebase (Anmeldung, Datenbank, Dateispeicher) ist nachgebaut.
//   1. Speicher nicht eingerichtet: Plan öffnet, altes Foto bleibt in der Datenbank, nichts geht verloren
//   2. Speicher eingerichtet: altes Foto zieht um, in der Datenbank steht danach der Link, Bild wird angezeigt
//   3. Datenschutz-Hinweis mit Datenschutzerklärung und Impressum, vom Start und aus dem Menü
// Start: VITE_FB_API_KEY=TEST npm run dev -- --port 5173 --host 127.0.0.1 &   dann   node tests/e2e/ablage.mjs
import pw from 'playwright'; const { chromium } = pw;
import { readFileSync } from 'node:fs';
const URL0 = process.env.APP_URL || 'http://127.0.0.1:5173/';
const fails = []; const check = (c,msg,extra)=>{ if(c) console.log('  ok  ',msg); else { fails.push(msg); console.log('  FAIL',msg,extra!==undefined?JSON.stringify(extra).slice(0,300):''); } };
const SESSION_KEY = (readFileSync(new URL('../../src/App.jsx', import.meta.url),'utf8').match(/SESSION_KEY\s*=\s*"([^"]+)"/)||[])[1];
const META = {createdAt:1,updatedAt:1,picksUpdatedAt:1,shoppingUpdatedAt:1,recipesUpdatedAt:1,peopleUpdatedAt:1,imagesMigrated:true};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let store, objs, storageOn, uidSeq = 0, storageCalls;
const getAt = (parts)=>{ let o=store; for(const p of parts){ if(o==null||typeof o!=='object') return null; o=o[p]; } return o===undefined?null:o; };
const setAt = (parts,val)=>{ let o=store; for(let i=0;i<parts.length-1;i++){ if(o[parts[i]]==null||typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; } if(val===null) delete o[parts[parts.length-1]]; else o[parts[parts.length-1]]=val; };
const wire = async(ctx)=>{
  await ctx.route(/identitytoolkit|securetoken/, r=>{ const u=r.request().url();
    if(u.includes('signUp')){ const uid='U'+(++uidSeq); return r.fulfill({contentType:'application/json',body:JSON.stringify({idToken:'TOK-'+uid,refreshToken:'RT-'+uid,localId:uid,expiresIn:'3600'})}); }
    const rt=new URLSearchParams(r.request().postData()).get('refresh_token'); const uid=rt.replace('RT-','');
    r.fulfill({contentType:'application/json',body:JSON.stringify({id_token:'TOK-'+uid,refresh_token:rt,user_id:uid,expires_in:'3600'})}); });
  await ctx.route(/firebasedatabase\.app/, r=>{ const req=r.request(), u=new URL(req.url()), m=req.method();
    const parts=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
    let body; try{ body=req.postData()?JSON.parse(req.postData()):undefined; }catch(e){}
    if(u.hostname.includes('haushaltsbuch')) return r.fulfill({contentType:'application/json',body:'null'});
    if(m==='GET') return r.fulfill({contentType:'application/json',body:JSON.stringify(getAt(parts))});
    if(m==='PUT') setAt(parts,body);
    if(m==='DELETE') setAt(parts,null);
    if(m==='PATCH') for(const [k,v] of Object.entries(body||{})) setAt([...parts,...k.split('/')],v);
    r.fulfill({contentType:'application/json',body:'{}'}); });
  // Dateispeicher wie die Speicher-Regeln: nur mit Nachweis, nur unter fotos/<32 Zeichen>/, kein Überschreiben
  await ctx.route(/firebasestorage\.googleapis\.com/, r=>{ const req=r.request(), u=new URL(req.url()), m=req.method();
    storageCalls.push(m+' '+u.pathname);
    if(!storageOn) return r.fulfill({status:404,contentType:'application/json',body:'{}'});
    const pre=u.pathname.indexOf('/o'); const rest=u.pathname.slice(pre+2);
    const name = m==='POST' ? u.searchParams.get('name') : decodeURIComponent(rest.slice(1));
    const o=objs.get(name); const tokenOk = o && u.searchParams.get('token')===o.token;
    const authOk=/^Firebase TOK-U\d+$/.test(req.headers()['authorization']||'');
    if(!(authOk||tokenOk) || !/^fotos\/[A-Za-z0-9]{32}\//.test(name||'')) return r.fulfill({status:403,body:'{}'});
    if(m==='POST'){ if(o) return r.fulfill({status:403,body:'{}'}); const buf=req.postDataBuffer(); const t='tok'+objs.size; objs.set(name,{buf,type:req.headers()['content-type'],token:t});
      return r.fulfill({contentType:'application/json',body:JSON.stringify({name,size:String(buf.length),downloadTokens:t})}); }
    if(!o) return r.fulfill({status:404,body:'{}'});
    if(m==='DELETE'){ objs.delete(name); return r.fulfill({status:204,body:''}); }
    if(u.searchParams.get('alt')==='media') return r.fulfill({contentType:o.type,body:o.buf});
    r.fulfill({contentType:'application/json',body:JSON.stringify({name,size:String(o.buf.length),downloadTokens:o.token})}); });
  await ctx.route(/fonts\.g|\/api\//, r=>r.fulfill({contentType:'application/json',body:'{"ok":true}'}));
};
const reset = (on)=>{ storageOn=on; objs=new Map(); storageCalls=[];
  store={plans:{ALTPLAN234:{participants:['Anna'],meta:META}},recipeImages:{ALTPLAN234:{testrezept:PNG}},globalRecipes:{}}; };
const open = async(b)=>{ const ctx=await b.newContext(); await wire(ctx); const p=await ctx.newPage();
  await p.addInitScript(s=>{ if(!sessionStorage.getItem('gesetzt')){ localStorage.setItem(s.key,JSON.stringify(s.val)); sessionStorage.setItem('gesetzt','1'); } },{key:SESSION_KEY,val:{code:'ALTPLAN234',name:'Anna'}});
  await p.goto(URL0); await p.waitForTimeout(2500); return {ctx,p}; };

const b = await chromium.launch();
check(!!SESSION_KEY,'Sitzungsschlüssel gefunden');

console.log('\n1. Speicher nicht eingerichtet');
reset(false);
{ const {ctx,p}=await open(b);
  check(await p.locator('text=PLAN STARTEN').count()===0,'Plan öffnet');
  check(getAt(['recipeImages','ALTPLAN234','testrezept'])===PNG,'altes Foto unverändert in der Datenbank');
  check(storageCalls.length<=1,'höchstens ein Versuch beim Speicher, danach Pause',storageCalls);
  await ctx.close(); }

console.log('\n2. Speicher eingerichtet: Umzug');
reset(true);
{ const {ctx,p}=await open(b); await p.waitForTimeout(1500);
  const v=getAt(['recipeImages','ALTPLAN234','testrezept']); const key=getAt(['plans','ALTPLAN234','fileKey']);
  console.log('    Speicheraufrufe:',storageCalls); check(/^[A-Za-z0-9]{32}$/.test(key||''),'Plan hat einen geheimen Ordnernamen',key);
  check(objs.size===1 && [...objs.keys()][0].startsWith('fotos/'+key+'/'),'Foto liegt im Speicher im Ordner des Plans',[...objs.keys()]);
  check(typeof v==='string' && v.startsWith('https://firebasestorage.googleapis.com/v0/b/wochenessenplan-3d0e1.firebasestorage.app/o/') && v.includes('token='),'in der Datenbank steht jetzt der Link',v);
  const [obj]=[...objs.values()]; check(obj && obj.buf.length===Buffer.from(PNG.split(',')[1],'base64').length && obj.type==='image/png','Datei hat Größe und Typ des Originals',obj&&[obj.buf.length,obj.type]);
  const img=await p.evaluate(async(u)=>{ const r=await fetch(u); return r.status; },v);
  check(img===200,'Link liefert das Bild');
  // zweites Gerät öffnet denselben Plan: kein zweites Hochladen
  const before=objs.size; const two=await open(b); await two.p.waitForTimeout(1500);
  check(objs.size===before,'zweites Gerät legt keine Kopie an');
  await two.ctx.close();
  // Menü: Datenschutz & Daten, dann Datenschutzerklärung und Impressum
  await p.click('[aria-label="Menü"]').catch(()=>{});
  const menuItem=p.locator('text=Datenschutz & Daten'); if(await menuItem.count()) await menuItem.first().click();
  check(await p.locator('text=Datenschutz & deine Daten').count()>0,'Hinweis aus dem Menü öffnet');
  const txt=await p.locator('[role="dialog"]').first().innerText();
  check(!/pollinations|Symbolbild/i.test(txt),'kein Hinweis mehr auf externe Symbolbilder');
  await p.click('button:has-text("Datenschutzerklärung")');
  check(await p.locator('h1:has-text("Datenschutzerklärung")').count()===1,'Datenschutzerklärung öffnet');
  check(await p.locator('text=Lautenschlagerstraße 20').count()===1,'Aufsichtsbehörde Baden-Württemberg genannt');
  await p.screenshot({path:'/tmp/claude-0/s/wp-dse.png'});
  await p.click('[aria-label="Schließen"] >> nth=-1'); await p.waitForTimeout(200);
  check(await p.locator('h1:has-text("Datenschutzerklärung")').count()===0,'schließt wieder, Hinweis bleibt offen');
  await p.click('button:text-is("Impressum")');
  check(await p.locator('h1:has-text("Impressum")').count()===1,'Impressum öffnet');
  check(await p.locator('text=(Angabe folgt)').count()>0,'leere Angaben erscheinen als „(Angabe folgt)“');
  await ctx.close(); }

console.log('\n3. Startbildschirm');
reset(true);
{ const ctx=await b.newContext(); await wire(ctx); const p=await ctx.newPage(); await p.goto(URL0); await p.waitForTimeout(1500);
  await p.click('button:has-text("Datenschutz · Impressum")');
  await p.click('button:text-is("Impressum")');
  check(await p.locator('h1:has-text("Impressum")').count()===1,'Impressum vom Start erreichbar');
  await p.screenshot({path:'/tmp/claude-0/s/wp-impressum.png'});
  await ctx.close(); }

await b.close();
console.log(fails.length?('\n'+fails.length+' FEHLER'):'\nalles ok'); process.exit(fails.length?1:0);
