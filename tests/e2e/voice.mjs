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
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text: audio&&audio.source.data.length>1000 ? '{"items":["2 l Milch","1 kg Zwiebeln","Butter"]}' : '{"items":[]}' })});
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
  const mic=page.locator('button[aria-label="Gedrückt halten und sprechen"]');
  check(await mic.isVisible(),'Einkauf: Mikrofon-Knopf neben dem Plus');

  // Zu kurz gedrückt: Hinweis, kein KI-Aufruf
  const box=await mic.boundingBox(); const x=box.x+box.width/2, y=box.y+box.height/2;
  await page.mouse.move(x,y); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(800);
  check(aiCalls.length===0 && await page.isVisible('text=/Zu kurz|Jetzt den Knopf gedrückt halten/'),'Kurz getippt: Hinweis, nichts an die KI');

  // Halten und sprechen
  await page.mouse.down(); await page.waitForTimeout(600);
  check(await page.isVisible('text=Ich höre zu'),'Halten: „Ich höre zu“ und Datenschutz-Hinweis');
  await page.screenshot({path:OUT+'voice-01-aufnahme.png'});
  await page.waitForTimeout(+process.env.HOLD_MS||8000); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({path:OUT+'voice-02-ki.png'});
  await page.waitForSelector('text=/auf der Liste:/',{timeout:30000}).catch(()=>{});
  const shop=Object.values(db.plans?.[code]?.shopping||{});
  const a=aiCalls[0]?.messages?.[0]?.content?.find(p=>p.type==='audio');
  check(aiCalls.length===1 && a && /^audio\/(webm|mp4|ogg)/.test(a.source.media_type) && a.source.data.length>1000,'Eine KI-Anfrage mit Aufnahme',a&&{type:a.source.media_type,len:a.source.data.length});
  check(shop.length>=3 && shop.every(i=>i.src==='manuell'),'Posten stehen in der Liste (in der Datenbank)',shop.map(i=>i.text));
  console.log('  Liste:', shop.map(i=>i.text).join(' | '));
  await page.screenshot({path:OUT+'voice-03-liste.png'});
  await browser.close();
  console.log(fails.length?'FEHLER: '+fails.length:'alles ok'); process.exit(fails.length?1:0);
})();
