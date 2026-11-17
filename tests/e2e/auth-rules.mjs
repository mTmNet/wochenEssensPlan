// Anonyme Anmeldung und Mitglieder-Regeln: Der Mock spielt den Anmeldedienst und setzt wahlweise drei Regel-Stände durch:
//   "alt"    = heutige Regeln (Code genügt, Knoten members unbekannt)
//   "stand1" = heutige Regeln plus Knoten members (eigener Eintrag schreibbar)
//   "stand2" = plans und recipeImages/<CODE> nur für eingetragene Mitglieder
// Start: VITE_FB_API_KEY=TEST npm run dev -- --port 5173 --host 127.0.0.1 &   dann   node tests/e2e/auth-rules.mjs
import pw from 'playwright'; const { chromium } = pw;
const URL0 = process.env.APP_URL || 'http://127.0.0.1:5173/';
const fails = []; const check = (c,msg,extra)=>{ if(c) console.log('  ok  ',msg); else { fails.push(msg); console.log('  FAIL',msg,extra!==undefined?JSON.stringify(extra).slice(0,300):''); } };
const CODE_RE = /^[A-Z0-9]{6,16}$/;
const META = {createdAt:1,updatedAt:1,picksUpdatedAt:1,shoppingUpdatedAt:1,recipesUpdatedAt:1,peopleUpdatedAt:1,imagesMigrated:true};
let store, mode, uidSeq = 0, denied;
const getAt = (parts)=>{ let o=store; for(const p of parts){ if(o==null||typeof o!=='object') return null; o=o[p]; } return o===undefined?null:o; };
const setAt = (parts,val)=>{ let o=store; for(let i=0;i<parts.length-1;i++){ if(o[parts[i]]==null||typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; } if(val===null) delete o[parts[parts.length-1]]; else o[parts[parts.length-1]]=val; };
const isMember = (code,uid)=>!!uid && !!getAt(['members',code,uid]);
const allowed = (m,parts,uid,body)=>{
  const read = m==='GET', top = parts[0], code = parts[1];
  if(top==='globalRecipes') return read;
  if(top==='members'){
    if(mode==='alt') return false;
    if(parts.length>=3) return !!uid && parts[2]===uid && CODE_RE.test(code) && (read || m==='DELETE' || parts.length>3 || (body && typeof body.name==='string' && !!body.since) || (m==='PATCH' && !!getAt(parts)));
    if(parts.length===2) return isMember(code,uid) && (read || m==='DELETE');
    return false;
  }
  if(top==='plans') return parts.length>=2 && CODE_RE.test(code) && (mode!=='stand2' || isMember(code,uid));
  if(top==='recipeImages'){
    if(parts.length<2) return false;
    if(!CODE_RE.test(code)) return read;
    return mode!=='stand2' ? true : isMember(code,uid);
  }
  return false;
};
const wire = async(ctx)=>{
  await ctx.route(/identitytoolkit|securetoken/, r=>{ const u=r.request().url();
    if(u.includes('signUp')){ const uid='U'+(++uidSeq); return r.fulfill({contentType:'application/json',body:JSON.stringify({idToken:'TOK-'+uid,refreshToken:'RT-'+uid,localId:uid,expiresIn:'3600'})}); }
    const rt=new URLSearchParams(r.request().postData()).get('refresh_token'); const uid=rt.replace('RT-','');
    r.fulfill({contentType:'application/json',body:JSON.stringify({id_token:'TOK-'+uid,refresh_token:rt,user_id:uid,expires_in:'3600'})}); });
  await ctx.route(/firebasedatabase\.app/, r=>{ const req=r.request(), u=new URL(req.url()), m=req.method();
    const parts=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
    const tok=u.searchParams.get('auth'); const uid=tok&&tok.startsWith('TOK-')?tok.slice(4):'';
    let body; try{ body=req.postData()?JSON.parse(req.postData()):undefined; }catch(e){}
    if(u.hostname.includes('haushaltsbuch')) return r.fulfill({contentType:'application/json',body:'null'});
    if(!allowed(m,parts,uid,body)){ denied.push(m+' /'+parts.join('/')+(uid?'':' (ohne Nachweis)')); return r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Permission denied'})}); }
    if(m==='GET') return r.fulfill({contentType:'application/json',body:JSON.stringify(getAt(parts))});
    if(m==='PUT') setAt(parts,body);
    if(m==='DELETE') setAt(parts,null);
    if(m==='PATCH') for(const [k,v] of Object.entries(body||{})) setAt([...parts,...k.split('/')],v);
    r.fulfill({contentType:'application/json',body:'{}'}); });
  await ctx.route(/pollinations|fonts\.g/, r=>r.abort());
};
const fresh = async(b,session)=>{ const ctx=await b.newContext(); await wire(ctx); const p=await ctx.newPage();
  if(session) await p.addInitScript(s=>{ if(!localStorage.getItem('wochenplan-session-set')){ localStorage.setItem(s.key,JSON.stringify(s.val)); localStorage.setItem('wochenplan-session-set','1'); } },session);
  await p.goto(URL0); return {ctx,p}; };
const inApp = async(p)=>{ await p.waitForTimeout(1800); return (await p.locator('text=PLAN STARTEN').count())===0; };
const reset = (m,plans)=>{ mode=m; store={plans:plans||{},recipeImages:{},globalRecipes:{}}; denied=[]; };

const b = await chromium.launch();
// Sitzungsschlüssel der App aus dem Quelltext lesen (bleibt so auch nach einer Umbenennung richtig)
import { readFileSync } from 'node:fs';
const SESSION_KEY = (readFileSync(new URL('../../src/App.jsx', import.meta.url),'utf8').match(/SESSION_KEY\s*=\s*"([^"]+)"/)||[])[1];
check(!!SESSION_KEY,'Sitzungsschlüssel gefunden',SESSION_KEY);

console.log('\nStand 2: neuer Plan, Beitritt mit Code, falscher Code');
reset('stand2');
{ const a=await fresh(b); await a.p.fill('#join-name','Anna'); const code=(await a.p.locator('text=/^[A-Z2-9]{10}$/').first().textContent()).trim();
  await a.p.click('text=PLAN STARTEN');
  check(await inApp(a.p),'Anna startet einen Plan und ist in der App');
  check(!!getAt(['plans',code,'meta']),'Plan wurde angelegt');
  check(Object.keys(getAt(['members',code])||{}).length===1 && getAt(['members',code,'U'+uidSeq,'name'])==='Anna','Anna steht als Mitglied drin',getAt(['members',code]));
  await a.p.reload(); check(await inApp(a.p),'nach dem Neuladen weiter in der App (gleiche Nutzer-ID)'); check(Object.keys(getAt(['members',code])).length===1,'kein zweiter Eintrag nach dem Neuladen');
  const c2=await fresh(b); await c2.p.fill('#join-name','Ben'); await c2.p.fill('[aria-label="Plan-Code"]',code); await c2.p.click('button:has-text("BEITRETEN")');
  check(await inApp(c2.p),'Ben tritt mit dem Code bei');
  check(Object.keys(getAt(['members',code])).length===2,'zwei Mitglieder',getAt(['members',code]));
  check((getAt(['plans',code,'participants'])||[]).includes('Ben'),'Ben steht in der Teilnehmerliste');
  const c3=await fresh(b); await c3.p.fill('#join-name','Cem'); await c3.p.fill('[aria-label="Plan-Code"]','FALSCH2345'); await c3.p.click('button:has-text("BEITRETEN")'); await c3.p.waitForTimeout(1800);
  check(await c3.p.locator('text=Kein Plan mit diesem Code').count()===1,'falscher Code: Meldung „Kein Plan mit diesem Code“');
  check(Object.keys(getAt(['members','FALSCH2345'])||{}).length===0,'falscher Code hinterlässt keinen Mitglieder-Eintrag',getAt(['members']));
  const before=denied.length; const r=await c3.p.evaluate(async(c)=>{ const x=await fetch('https://wochenessenplan-3d0e1-default-rtdb.europe-west1.firebasedatabase.app/plans/'+c+'.json'); return x.status; },code);
  check(r===401 && denied.length===before+1,'ohne Nachweis und ohne Mitgliedschaft bleibt der Plan zu');
  await a.ctx.close(); await c2.ctx.close(); await c3.ctx.close(); }

console.log('\nStand 1: bestehender Plan ohne Mitglieder, gespeicherte Sitzung');
reset('stand1',{ALTPLAN234:{participants:['Anna'],meta:META}});
{ const a=await fresh(b,{key:SESSION_KEY,val:{code:'ALTPLAN234',name:'Anna'}});
  check(await inApp(a.p),'gespeicherte Sitzung öffnet den Plan');
  check(Object.values(getAt(['members','ALTPLAN234'])||{}).some(m=>m.name==='Anna'&&/^\d{4}-\d{2}-\d{2}$/.test(m.since)),'Gerät hat sich im Hintergrund als Mitglied eingetragen',getAt(['members']));
  mode='stand2'; await a.p.reload();
  check(await inApp(a.p),'nach dem Scharfstellen kommt dasselbe Gerät weiter hinein');
  await a.ctx.close(); }

console.log('\nStand 2 sofort: bestehender Plan, Gerät hat sich noch nie eingetragen (Freund öffnet die App erst nach dem Scharfstellen)');
reset('stand2',{ALTPLAN234:{participants:['Anna'],meta:META}});
{ const a=await fresh(b,{key:SESSION_KEY,val:{code:'ALTPLAN234',name:'Anna'}});
  check(await inApp(a.p),'gespeicherter Code reicht: Gerät trägt sich ein und öffnet den Plan');
  check(Object.keys(getAt(['members','ALTPLAN234'])||{}).length===1,'ein Mitglieder-Eintrag');
  await a.ctx.close(); }

console.log('\nAlte Regeln (Knoten members unbekannt): alles wie bisher');
reset('alt',{ALTPLAN234:{participants:['Anna'],meta:META}});
{ const a=await fresh(b,{key:SESSION_KEY,val:{code:'ALTPLAN234',name:'Anna'}});
  check(await inApp(a.p),'gespeicherte Sitzung öffnet den Plan');
  check(!store.members,'kein Mitglieder-Eintrag entstanden');
  check(denied.every(d=>d.includes('/members/')),'abgelehnt wurden nur die Versuche am Knoten members',denied);
  await a.ctx.close(); }

await b.close();
console.log(fails.length?('\n'+fails.length+' FEHLER'):'\nalles ok'); process.exit(fails.length?1:0);
