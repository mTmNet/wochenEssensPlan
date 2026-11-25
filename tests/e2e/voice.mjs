// Spracheingabe im Browser: Mikrofon-Knopf gedrückt halten, sprechen, loslassen -> Posten in der Einkaufsliste.
// Chromium spielt eine WAV-Datei als Mikrofon ab (VOICE_WAV=/pfad/zur/datei.wav, Deutsch gesprochen, z. B. „Zwei Liter Milch, ein Kilo Zwiebeln …“).
// Firebase ist simuliert. Die KI ist simuliert (prüft nur, dass eine Aufnahme ankommt); mit REAL_KI=1 geht die Aufnahme
// über toGeminiContents an die echte Schnittstelle (Schlüssel im Kopf x-goog-api-key aus GEMINI_API_KEY oder dem Proxy).
// Start: npm run dev -- --port 5173 --host 127.0.0.1 &  dann  VOICE_WAV=… node tests/e2e/voice.mjs
import pw from 'playwright'; const { chromium } = pw;
import { toGeminiContents, pickGeneration } from '../../api/_shared.js';
const OUT = new URL('./shots/', import.meta.url).pathname;
const fails = []; const check = (c,m,x)=>{ if(c) console.log('  ok  ', m); else { fails.push(m); console.log('  FAIL', m, x!==undefined?JSON.stringify(x).slice(0,300):''); } };

const db = {};
const getAt=(r,p)=>{ let o=r; for(const k of p){ if(o==null||typeof o!=='object') return null; o=o[k]; } return o===undefined?null:o; };
const setAt=(r,p,v)=>{ let o=r; for(let i=0;i<p.length-1;i++){ if(o[p[i]]==null||typeof o[p[i]]!=='object') o[p[i]]={}; o=o[p[i]]; } if(v===null) delete o[p[p.length-1]]; else o[p[p.length-1]]=v; };
const mockFb = async(route)=>{
  const req=route.request(), u=new URL(req.url()), parts=u.pathname.replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent), m=req.method();
  if(m==='GET') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(getAt(db,parts))});
  const data=JSON.parse(req.postData()||'null');
  if(m==='PUT') setAt(db,parts,data); else if(m==='PATCH'){ for(const [k,v] of Object.entries(data||{})) setAt(db,[...parts,...k.split('/')],v); } else if(m==='DELETE') setAt(db,parts,null);
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
};
const aiCalls=[];
const ai = async(route)=>{
  const body=JSON.parse(route.request().postData()||'{}'); aiCalls.push(body);
  const audio=(body.messages?.[0]?.content||[]).find(p=>p.type==='audio');
  if(!process.env.REAL_KI){
    const t = body.mode==='suggest'
      ? JSON.stringify({name:'Hähnchen-Paprika-Pfanne',ingredients:['400 g Hähnchen','2 Paprika','200 g Reis'],steps:['Braten.'],description:'Schnell.',cuisine:'International',genutzt:['Hähnchen','Paprika','Reis'],fehlt:[],gehoert:audio?['Hähnchen','Paprika','Reis']:[]})
      : (audio&&audio.source.data.length>1000 ? '{"items":["2 l Milch","1 kg Zwiebeln","Butter"]}' : '{"items":[]}');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:t})});
  }
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+(process.env.KI_MODEL||'gemini-2.5-flash')+':generateContent',{method:'POST',
    headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY||'proxy'},
    body:JSON.stringify({contents:toGeminiContents(body.messages),generationConfig:pickGeneration(body.mode),...(body.system?{systemInstruction:{parts:[{text:body.system}]}}:{})})});
  const d=await r.json();
  if(process.env.DUMP){ (await import('fs')).writeFileSync(process.env.DUMP, Buffer.from(audio.source.data,'base64')); console.log('  Antwort:', JSON.stringify(d).slice(0,400)); }
  const text=(d.candidates?.[0]?.content?.parts||[]).filter(p=>typeof p.text==='string'&&!p.thought).map(p=>p.text).join('');
  console.log('  KI:', text.replace(/\s+/g,' ').slice(0,200));
  return route.fulfill({status:r.ok?200:r.status,contentType:'application/json',body:JSON.stringify(r.ok?{text}:{error:JSON.stringify(d).slice(0,300)})});
};

(async()=>{
  const wav=process.env.VOICE_WAV; if(!wav){ console.log('VOICE_WAV fehlt'); process.exit(2); }
  const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+wav]});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'de-DE',colorScheme:process.env.SCHEME==='dark'?'dark':'light',permissions:['microphone']});
  const page=await ctx.newPage();
  page.on('pageerror',e=>{ fails.push('pageerror '+e.message); console.log('PAGEERROR',e.message); });
  await ctx.route(/wochenessenplan-3d0e1-default-rtdb/,mockFb);
  await ctx.route(/\/api\/gemini/,ai);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('text=Kochbuch starten',{timeout:15000});
  await page.fill('input[placeholder="z.B. Anna"]','Test');
  const code=(await page.textContent('span[style*="letter-spacing: 6px"]')).trim();
  await page.click('text=Kochbuch starten');
  await page.waitForSelector('button:text-is("Rezepte")',{timeout:10000});
  await page.click('button:text-matches("^Einkauf")'); await page.waitForTimeout(300);
  const mic=page.locator('button[aria-label="Sprechen: gedrückt halten oder antippen"]');
  check(await mic.isVisible(),'Einkauf: Mikrofon-Knopf neben dem Plus');
  const box=await mic.boundingBox(); const x=box.x+box.width/2, y=box.y+box.height/2;
  const shopNow=()=>Object.values(db.plans?.[code]?.shopping||{});

  // 1) GEHALTEN: Halten, sprechen, loslassen -> Zwischenschritt, nichts in der Liste; „Verwerfen“ lässt die Liste leer
  await page.mouse.move(x,y); await page.mouse.down(); await page.waitForTimeout(600);
  check(await page.isVisible('text=Ich höre zu') && !(await page.isVisible('button:text-is("Fertig")')),'Halten: „Ich höre zu“, kein Fertig-Knopf');
  await page.screenshot({path:OUT+'voice-01-aufnahme.png'});
  await page.waitForTimeout(+process.env.HOLD_MS||8000); await page.mouse.up();
  await page.waitForTimeout(300); await page.screenshot({path:OUT+'voice-02-ki.png'});
  await page.waitForSelector('text=Verstanden – prüfen und übernehmen',{timeout:30000}).catch(()=>{});
  const a=aiCalls[0]?.messages?.[0]?.content?.find(p=>p.type==='audio');
  check(aiCalls.length===1 && a && /^audio\/(webm|mp4|ogg)$/.test(a.source.media_type) && a.source.data.length>1000,'Eine KI-Anfrage mit Aufnahme (Format ohne Codec-Zusatz)',a&&{type:a.source.media_type,len:a.source.data.length});
  const rows=await page.locator('div[aria-label="Erkannte Posten"] input').evaluateAll(els=>els.map(e=>e.value));
  console.log('  Verstanden:', rows.join(' | '));
  check(rows.length>=3 && shopNow().length===0,'Zwischenschritt zeigt die Posten, Liste noch leer',rows);
  await page.screenshot({path:OUT+'voice-03-pruefen.png'});
  await page.click('button:text-is("Verwerfen")'); await page.waitForTimeout(300);
  check(shopNow().length===0 && !(await page.isVisible('text=Verstanden – prüfen')),'Verwerfen: nichts übernommen');

  // 2) GETIPPT: kurz tippen, sprechen, „Fertig“ -> Zwischenschritt; einen Posten abwählen, einen ändern, übernehmen
  await page.mouse.move(x,y); await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
  await page.waitForSelector('button:text-is("Fertig")',{timeout:5000}).catch(()=>{});
  check(await page.isVisible('button:text-is("Fertig")'),'Antippen: Aufnahme läuft weiter, Fertig-Knopf da');
  await page.screenshot({path:OUT+'voice-04-tippen.png'});
  await page.waitForTimeout(+process.env.HOLD_MS||8000);
  await page.click('button:text-is("Fertig")');
  await page.waitForSelector('text=Verstanden – prüfen und übernehmen',{timeout:30000}).catch(()=>{});
  const inputs=page.locator('div[aria-label="Erkannte Posten"] input');
  const n=await inputs.count();
  check(aiCalls.length===2 && n>=3,'Tippen + Fertig: zweite KI-Anfrage, Posten zum Prüfen',n);
  await page.locator('div[aria-label="Erkannte Posten"] button[aria-pressed]').last().click();
  await inputs.first().fill('3 l Milch');
  await page.click('div[aria-label="Erkannte Posten"] button:text-matches("übernehmen$")'); await page.waitForTimeout(400);
  const shop=shopNow();
  console.log('  Liste:', shop.map(i=>i.text).join(' | '));
  check(shop.length===n-1 && shop.some(i=>i.text==='3 l Milch') && shop.every(i=>i.src==='manuell'),'Übernehmen: abgewählter Posten fehlt, Änderung übernommen',shop.map(i=>i.text));
  await page.screenshot({path:OUT+'voice-03-liste.png'});
  await browser.close();

  // VORRAT-NETZ: sagen, was da ist -> Gerichtvorschlag (zweite Aufnahme VOICE_WAV2, z. B. „Hähnchen, zwei Paprika und Reis“)
  if(process.env.VOICE_WAV2){
    const b2=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+process.env.VOICE_WAV2]});
    const c2=await b2.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'de-DE',permissions:['microphone']});
    const p2=await c2.newPage();
    p2.on('pageerror',e=>{ fails.push('pageerror '+e.message); console.log('PAGEERROR',e.message); });
    await c2.route(/wochenessenplan-3d0e1-default-rtdb/,mockFb); await c2.route(/\/api\/gemini/,ai); await c2.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
    await p2.goto('http://127.0.0.1:5173/'); await p2.waitForSelector('text=Kochbuch starten',{timeout:15000});
    await p2.fill('input[placeholder="z.B. Anna"]','Test');
    const code2=(await p2.textContent('span[style*="letter-spacing: 6px"]')).trim();
    await p2.click('text=Kochbuch starten'); await p2.waitForSelector('button:text-is("Rezepte")',{timeout:10000});
    const day=new Date().toISOString().slice(0,10), now=Date.now();
    db.plans[code2].stock={items:{a1:{name:'Zwiebeln',sub:'Gemüse',date:day,src:'hand',createdAt:now},a2:{name:'Sahne',sub:'Milchprodukte',date:day,src:'hand',createdAt:now},a3:{name:'Nudeln',sub:'Trockenwaren',date:day,src:'hand',createdAt:now}}};
    await p2.reload(); await p2.waitForSelector('button:text-is("Rezepte")',{timeout:10000});
    await p2.click('button:text-matches("^Vorrat")'); await p2.waitForTimeout(300);
    await p2.click('button:text-is("Netz")'); await p2.waitForTimeout(500);
    const mic2=p2.locator('button[aria-label="Gedrückt halten und sagen, was da ist"]');
    check(await mic2.isVisible(),'Vorrat-Netz: Knopf „Halten und sagen, was da ist“');
    await mic2.scrollIntoViewIfNeeded(); const bb=await mic2.boundingBox(); await p2.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);
    const n0=aiCalls.length;
    await p2.mouse.down(); await p2.waitForTimeout(700);
    check(await p2.isVisible('text=Ich höre zu'),'Vorrat-Netz: Aufnahme läuft');
    await p2.screenshot({path:OUT+'voice-04-netz-aufnahme.png'});
    await p2.waitForTimeout(+process.env.HOLD2_MS||5000); await p2.mouse.up();
    await p2.waitForSelector('#ki-vorschlag',{timeout:60000}).catch(()=>{});
    const call=aiCalls[n0];
    check(aiCalls.length===n0+1 && call.mode==='suggest' && call.messages[0].content.some(p=>p.type==='audio'),'Vorrat-Netz: eine Vorschlags-Anfrage mit Aufnahme');
    check(await p2.isVisible('#ki-vorschlag'),'Vorrat-Netz: Gerichtvorschlag erscheint unter Rezepte');
    await p2.waitForTimeout(300);
    console.log('  Toast:', await p2.locator('div[role="status"]').last().textContent().catch(()=>''));
    await p2.screenshot({path:OUT+'voice-05-vorschlag.png'});
    await b2.close();
  }
  console.log(fails.length?'FEHLER: '+fails.length:'alles ok'); process.exit(fails.length?1:0);
})();
