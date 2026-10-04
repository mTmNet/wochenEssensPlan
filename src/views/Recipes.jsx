import { useEffect, useRef, useState } from "react";
import { C, SF, SER, chip, btn, iconBtn, microMuted as lbl, input as inp } from "../theme.js";
import { CATS, CUISINE_LIST } from "../data.js";
import { recName, recCat, recKey, sortRecipeKeys, cookedLabel, cookedCount } from "../logic/recipes.js";
import { compressImageToBase64 } from "../ai.js";

const SORTS=[{id:"cooked",label:"Zuletzt gekocht"},{id:"best",label:"Beste"},{id:"new",label:"Neu"},{id:"az",label:"A–Z"}];

// REZEPTE - Import (Text/Foto per KI, Foto in zwei Modi), erkanntes Rezept pruefen, Suche, Rubrik-Filter, Sortierung,
// Klassiker-Basis einblenden, Kochbuch-PDF
export default function Recipes({state,api}){
  const {recipes,classics,importState}=state;
  const {importErr,extracting,extracted,savedMsg}=importState;
  const {extractRecipe,saveExtracted,setExtracted,setImportErr,openRecipe,adoptStarters,adoptClassic,downloadPDF}=api;
  // lokaler UI-Zustand: Importeingaben, Suche, Filter, Sortierung
  const [importMode,setImportMode]=useState("text");       // "text" | "photo"
  const [photoMode,setPhotoMode]=useState("page");         // "page" (Rezeptseite / Screenshot) | "dish" (Fertiges Gericht)
  const [recipeText,setRecipeText]=useState("");
  const [img,setImg]=useState(null);                       // {previewUrl, base64, mimeType}
  const [imgErr,setImgErr]=useState("");
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("all");
  const [sort,setSort]=useState("cooked");
  const [showClassics,setShowClassics]=useState(false);
  const [adopting,setAdopting]=useState("");
  const fileRef=useRef(null);
  useEffect(()=>()=>{ if(img&&img.previewUrl) URL.revokeObjectURL(img.previewUrl); },[img]);

  const dn=(k)=>recName(recipes[k],k);
  const total=Object.keys(recipes).length;
  const canExtract=!extracting&&(importMode==="text"?!!recipeText.trim():!!(img&&img.base64));
  const doExtract=()=>{
    if(!canExtract) return;
    if(importMode==="text") extractRecipe({mode:"text",text:recipeText});
    else extractRecipe({mode:photoMode==="dish"?"dish":"photo",image:{base64:img.base64,mimeType:img.mimeType}});
  };
  const clearImg=()=>{ setImg(null); setImgErr(""); };
  // Foto gewaehlt: verkleinern, Vorschau und Base64 merken
  const onFile=async e=>{
    const f=e.target.files[0]; if(e.target) e.target.value="";
    if(!f) return;
    setImgErr(""); setImportErr("");
    try{
      const c=await compressImageToBase64(f,{maxEdge:1600,quality:0.82});
      if(!c.base64) throw new Error("Bilddaten fehlen nach Komprimierung.");
      if(c.base64.length>3500000) throw new Error("413");
      setImg({previewUrl:c.previewUrl,base64:c.base64,mimeType:c.mimeType||"image/jpeg"});
    }catch(err){
      setImg(null);
      const m=err&&err.message?err.message:"Bild konnte nicht verarbeitet werden";
      setImgErr(m.includes("413")?"Bild weiterhin zu groß. Bitte ein kleineres Foto oder Screenshot verwenden.":"Bildfehler: "+m);
    }
  };
  const doSave=async(opts)=>{
    const r=await saveExtracted(opts);
    if(r===true){ setRecipeText(""); clearImg(); }
  };
  const doAdopt=async(c)=>{ setAdopting(c.name); await adoptClassic(c); setAdopting(""); };

  // Liste: Suche ueber Name und Zutaten, Rubrik-Chip, Sortierung
  const q=search.trim().toLowerCase();
  const matches=(name,ings)=>!q||name.toLowerCase().includes(q)||(ings||[]).some(i=>i.toLowerCase().includes(q));
  const keys=sortRecipeKeys(recipes,sort).filter(k=>(filterCat==="all"||recCat(recipes[k])===filterCat)&&matches(dn(k),recipes[k].ingredients));
  const classicList=showClassics?classics.filter(c=>!recipes[recKey(c.name)]&&(filterCat==="all"||c.category===filterCat)&&matches(c.name,c.ingredients)):[];
  const existsName=extracted&&!extracted.ai&&!!recipes[recKey(String(extracted.name||"").trim())];

  return(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {/* Importmodus */}
            <div style={{display:"flex",marginBottom:"12px",border:"1px solid "+C.border,background:C.white}}>
              {[{id:"text",label:"TEXT"},{id:"photo",label:"FOTO"}].map(m=>(
                <button key={m.id} onClick={()=>{setImportMode(m.id);setExtracted(null);setImportErr("");}} aria-pressed={importMode===m.id} style={{flex:1,padding:"11px",minHeight:"44px",background:importMode===m.id?C.dark:C.white,color:importMode===m.id?"#fff":C.muted,fontWeight:"700",fontSize:"11px",letterSpacing:"2px",cursor:"pointer",border:"none",fontFamily:SF}}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Importbereich */}
            <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px"}}>{importMode==="text"?"REZEPTTEXT EINFÜGEN":"REZEPTFOTO HOCHLADEN"}</div>
              {importMode==="text"
                ?<textarea value={recipeText} onChange={e=>setRecipeText(e.target.value)} placeholder="Füge hier einen Rezepttext ein. Zutaten und Schritte werden wörtlich übernommen; fehlt die Anleitung, wird sie ergänzt und als ergänzt gekennzeichnet." aria-label="Rezepttext" style={{width:"100%",minHeight:"110px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:"#16161C"}} />
                :(
                  <div>
                    {/* Zwei Fotomodi: Rezeptseite abschreiben oder fertiges Gericht erkennen lassen */}
                    <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                      <button onClick={()=>{setPhotoMode("page");setExtracted(null);}} aria-pressed={photoMode==="page"} style={{...chip(photoMode==="page"),flex:1}}>Rezeptseite / Screenshot</button>
                      <button onClick={()=>{setPhotoMode("dish");setExtracted(null);}} aria-pressed={photoMode==="dish"} style={{...chip(photoMode==="dish"),flex:1}}>Fertiges Gericht</button>
                    </div>
                    <div style={{fontSize:"12px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>{photoMode==="page"?"Die KI schreibt das Rezept von der Seite wörtlich ab.":"Die KI benennt das bekannte Gericht auf dem Foto und liefert ein typisches Rezept – gespeichert als KI-Vorschlag."}</div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{display:"none"}} aria-label="Foto auswählen" />
                    <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{width:"100%",padding:img?"12px":"28px 16px",minHeight:"48px",border:"1px dashed "+C.border,background:"#16161C",cursor:"pointer",color:C.muted,fontSize:"13px",display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",fontFamily:SF}}>
                      {img?<img src={img.previewUrl} alt="Rezept" style={{maxHeight:"140px",maxWidth:"100%",objectFit:"contain"}} />:<span style={{fontSize:"14px"}}>{photoMode==="page"?"Foto auswählen (Kochbuchseite, Screenshot)":"Foto des Gerichts auswählen"}</span>}
                    </button>
                    {img&&<button onClick={clearImg} style={{marginTop:"6px",background:"none",border:"none",color:C.err,cursor:"pointer",fontSize:"12px",fontFamily:SF,minHeight:"40px",padding:"8px 4px"}}>Bild entfernen</button>}
                    {imgErr&&<div style={{marginTop:"8px",fontSize:"12px",color:C.err}}>{imgErr}</div>}
                  </div>
                )
              }
              {importErr&&<div style={{marginTop:"8px",padding:"9px 12px",background:"#2A1E1E",border:"1px solid #5A2E2E",color:C.err,fontSize:"12px"}}>{importErr}</div>}
              <button disabled={!canExtract} onClick={doExtract} style={{...btn("dark"),width:"100%",marginTop:"10px",padding:"12px",letterSpacing:"2px",background:extracting?C.subtle:C.dark,cursor:canExtract?"pointer":"default",opacity:canExtract?1:0.4}}>
                {extracting?(importMode==="photo"&&photoMode==="dish"?"KI ERKENNT DAS GERICHT…":"KI LIEST DAS REZEPT…"):(importMode==="photo"&&photoMode==="dish"?"GERICHT ERKENNEN":"REZEPT MIT KI EXTRAHIEREN")}
              </button>
            </div>

            {/* Ergebnis */}
            {extracted&&(
              <div id="ki-vorschlag" style={{background:C.white,border:"1px solid "+C.accent,padding:"14px",marginBottom:"12px"}}>
                <div style={{fontSize:"11px",color:C.accent,fontWeight:"700",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"6px"}}>{extracted.ai?(extracted.freeCombo?"VORSCHLAG DER KI · FREIE KOMBINATION":"VORSCHLAG DER KI · BEKANNTES GERICHT"):"ERKANNTES REZEPT"}</div>
                {extracted.ai&&(
                  <div style={{fontSize:"12px",color:C.muted,lineHeight:"1.5",marginBottom:"8px"}}>
                    {extracted.freeCombo
                      ? <div style={{color:C.accent}}>Die KI hat keine Herkunft oder keinen gebräuchlichen Namen genannt – das ist kein Klassiker, sondern eine freie Kombination. Bitte prüfen.</div>
                      : <div>{extracted.bekanntAls&&extracted.bekanntAls!==extracted.name?"Bekannt als „"+extracted.bekanntAls+"“ · ":""}Herkunft: {extracted.origin}</div>}
                    {extracted.genutzt.length>0&&<div><span style={{color:C.ok}}>nutzt {extracted.genutzt.length} Zutat{extracted.genutzt.length===1?"":"en"} aus dem Haushaltsbuch</span>: {extracted.genutzt.join(", ")}</div>}
                    {extracted.fehlt.length>0&&<div><span style={{color:C.accent}}>fehlt evtl.</span>: {extracted.fehlt.join(", ")}</div>}
                  </div>
                )}
                {extracted.stepsGenerated&&<div style={{fontSize:"12px",color:C.accent,lineHeight:"1.5",marginBottom:"8px"}}>Anleitung fehlte in der Vorlage und wurde von der KI ergänzt, bitte prüfen.</div>}
                <input value={extracted.name} onChange={e=>setExtracted(r=>({...r,name:e.target.value}))} aria-label="Rezeptname" style={{fontSize:"20px",fontFamily:SER,color:C.text,border:"none",background:"transparent",outline:"none",width:"100%",padding:"4px 0 10px",borderBottom:"1px solid "+C.border,marginBottom:"10px"}} />
                <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                  <div style={{flex:1}}>
                    <label style={lbl}>Kategorie</label>
                    <select value={extracted.category||"Hauptgericht"} onChange={e=>setExtracted(r=>({...r,category:e.target.value}))} style={{...inp,background:C.white}}>
                      {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{flex:1}}>
                    <label style={lbl}>Küche</label>
                    <select value={extracted.cuisine||"International"} onChange={e=>setExtracted(r=>({...r,cuisine:e.target.value}))} style={{...inp,background:C.white}}>
                      {CUISINE_LIST.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                  <div style={{flex:1}}>
                    <label style={lbl}>Portionen</label>
                    <input type="number" min="1" max="24" inputMode="numeric" value={extracted.servings??4} onChange={e=>setExtracted(r=>({...r,servings:e.target.value}))} style={{...inp,background:C.white}} />
                  </div>
                  <div style={{flex:1}}>
                    <label style={lbl}>Minuten</label>
                    <input type="number" min="0" inputMode="numeric" placeholder="z.B. 35" value={extracted.minutes??""} onChange={e=>setExtracted(r=>({...r,minutes:e.target.value}))} style={{...inp,background:C.white}} />
                  </div>
                </div>
                <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                  <div style={{flex:1}}>
                    <label style={lbl}>Herkunft</label>
                    <input placeholder="z.B. Schwaben" value={extracted.origin||""} onChange={e=>setExtracted(r=>({...r,origin:e.target.value}))} style={{...inp,background:C.white}} />
                  </div>
                  <div style={{flex:1}}>
                    <label style={lbl}>Quelle</label>
                    <input placeholder="z.B. Kochbuch Oma S. 42" value={extracted.sourceNote||""} onChange={e=>setExtracted(r=>({...r,sourceNote:e.target.value}))} style={{...inp,background:C.white}} />
                  </div>
                </div>
                <div style={{marginBottom:"10px"}}>
                  <label style={lbl}>Beschreibung</label>
                  <textarea value={extracted.description||""} onChange={e=>setExtracted(r=>({...r,description:e.target.value}))} placeholder="Kurze Beschreibung / Geschichte zum Rezept..." style={{width:"100%",minHeight:"70px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:C.white}} />
                </div>
                <div style={{fontSize:"11px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"4px"}}>Zutaten</div>
                {(extracted.ingredients||[]).map((ing,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"2px 0",borderBottom:i<(extracted.ingredients||[]).length-1?"1px solid "+C.border:"none"}}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0}} />
                    <input value={ing} onChange={e=>setExtracted(r=>{const a=[].concat(r.ingredients);a[i]=e.target.value;return {...r,ingredients:a};})} aria-label={"Zutat "+(i+1)} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF,padding:"10px 0",minWidth:0}} />
                    <button onClick={()=>setExtracted(r=>({...r,ingredients:r.ingredients.filter((_,j)=>j!==i)}))} aria-label="Zutat entfernen" style={iconBtn}>×</button>
                  </div>
                ))}
                <button onClick={()=>setExtracted(r=>({...r,ingredients:(r.ingredients||[]).concat([""])}))} style={{...btn("ghost"),marginTop:"6px",padding:"8px 12px",letterSpacing:"0.5px"}}>+ Zutat</button>
                <div style={{fontSize:"11px",fontWeight:"700",color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase",margin:"14px 0 4px"}}>Schritte</div>
                {(extracted.steps||[]).map((step,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"7px",padding:"5px 0",borderBottom:i<(extracted.steps||[]).length-1?"1px solid "+C.border:"none"}}>
                    <span style={{color:C.accent,fontSize:"11px",fontWeight:"700",minWidth:"16px",paddingTop:"10px"}}>{i+1}.</span>
                    <textarea value={step} onChange={e=>setExtracted(r=>{const a=[].concat(r.steps);a[i]=e.target.value;return {...r,steps:a};})} aria-label={"Schritt "+(i+1)} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF,resize:"none",lineHeight:"1.5",minHeight:"40px",padding:"8px 0"}} />
                    <button onClick={()=>setExtracted(r=>({...r,steps:r.steps.filter((_,j)=>j!==i)}))} aria-label="Schritt entfernen" style={iconBtn}>×</button>
                  </div>
                ))}
                <button onClick={()=>setExtracted(r=>({...r,steps:(r.steps||[]).concat([""])}))} style={{...btn("ghost"),marginTop:"6px",padding:"8px 12px",letterSpacing:"0.5px"}}>+ Schritt</button>
                {/* Speichern; bei vorhandenem Namen: ersetzen (Bewertung, Notizen, Kochhistorie bleiben) oder als Kopie */}
                {existsName?(
                  <div style={{marginTop:"14px",padding:"10px 12px",border:"1px solid "+C.accent,background:C.abg}}>
                    <div style={{fontSize:"12px",color:C.text,lineHeight:"1.5",marginBottom:"8px"}}>Ein Rezept „{recName(recipes[recKey(String(extracted.name).trim())],recKey(String(extracted.name).trim()))}“ gibt es schon. Ersetzen behält Bewertung, Notizen und Kochhistorie; die Kopie bekommt den Zusatz „(Kopie)“.</div>
                    <div style={{display:"flex",gap:"8px"}}>
                      <button onClick={()=>doSave({replace:true})} style={{...btn("dark"),flex:1}}>{savedMsg?"GESPEICHERT":"ERSETZEN"}</button>
                      <button onClick={()=>doSave({copy:true})} style={{...btn("ghost"),flex:1}}>ALS KOPIE SPEICHERN</button>
                    </div>
                  </div>
                ):(
                  <button onClick={()=>doSave({})} style={{...btn("dark"),width:"100%",marginTop:"14px",padding:"12px",letterSpacing:"2px",background:savedMsg?C.ok:C.dark,transition:"background 0.3s"}}>{savedMsg?"GESPEICHERT":extracted.ai?"INS KOCHBUCH & ÖFFNEN":"REZEPT SPEICHERN"}</button>
                )}
                {extracted.ai&&<button onClick={()=>setExtracted(null)} style={{...btn("ghost"),width:"100%",marginTop:"6px",letterSpacing:"2px"}}>VERWERFEN</button>}
              </div>
            )}

            {/* Leeres Kochbuch: Startrezepte auf Wunsch uebernehmen (werden nie automatisch gespeichert) */}
            {total===0&&!extracted&&(
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"12px",textAlign:"center"}}>
                <div style={{fontSize:"14px",color:C.muted,lineHeight:"1.6",marginBottom:"12px"}}>Noch keine Rezepte in diesem Plan. Importiere oben ein Rezept, blende unten die Klassiker-Basis ein oder übernimm die Startrezepte als Grundstock.</div>
                <button onClick={adoptStarters} style={{...btn("primary"),letterSpacing:"2px",padding:"12px 20px"}}>STARTREZEPTE ÜBERNEHMEN</button>
              </div>
            )}

            {/* Suche */}
            <div style={{position:"relative",marginBottom:"10px"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rezept oder Zutat suchen..." aria-label="Rezept oder Zutat suchen" style={{...inp,padding:"11px 44px 11px 12px",borderColor:search?C.accent:C.border}} />
              {search&&<button onClick={()=>setSearch("")} aria-label="Suche löschen" style={{...iconBtn,position:"absolute",right:"2px",top:"50%",transform:"translateY(-50%)",fontSize:"18px"}}>×</button>}
            </div>

            {/* Rubrik-Filter */}
            <div style={{display:"flex",gap:"6px",marginBottom:"10px",flexWrap:"wrap"}}>
              {[{id:"all",label:"Alle"},...CATS.map(c=>({id:c,label:c}))].map(f=>(
                <button key={f.id} onClick={()=>setFilterCat(f.id)} aria-pressed={filterCat===f.id} style={chip(filterCat===f.id)}>{f.label}</button>
              ))}
            </div>
            {/* Sortierung + Klassiker-Schalter */}
            <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"12px",flexWrap:"wrap"}}>
              <span style={{fontSize:"11px",color:C.muted,fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",marginRight:"2px"}}>Sortieren</span>
              {SORTS.map(s=>(
                <button key={s.id} onClick={()=>setSort(s.id)} aria-pressed={sort===s.id} style={{...chip(sort===s.id),padding:"7px 10px",minHeight:"32px"}}>{s.label}</button>
              ))}
              <button onClick={()=>setShowClassics(v=>!v)} aria-pressed={showClassics} style={{...chip(showClassics),padding:"7px 10px",minHeight:"32px",marginLeft:"auto"}}>{showClassics?"✓ ":""}Klassiker-Basis einblenden</button>
            </div>

            {/* Rezeptliste */}
            {keys.length===0&&total>0&&<div style={{fontSize:"13px",color:C.muted,padding:"12px 4px"}}>Kein Rezept passt zur Suche.</div>}
            {keys.map(name=>{
              const rec=recipes[name];
              const ings=(rec&&rec.ingredients)||[];
              const sub=[recCat(rec),rec.cuisine,ings.length+" Zutaten",rec.minutes>0?rec.minutes+" Min.":"",cookedCount(rec)?cookedLabel(rec):""].filter(Boolean).join(" · ");
              return(
                <button key={name} onClick={()=>openRecipe(name)} style={{width:"100%",background:C.white,border:"1px solid "+C.border,padding:"11px 14px",minHeight:"56px",marginBottom:"5px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:"10px",fontFamily:SF}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"15px",fontFamily:SER,color:C.text,marginBottom:"2px"}}>{dn(name)}{rec.rating?<span style={{color:C.star,fontSize:"12px",marginLeft:"8px"}}>{"★".repeat(rec.rating)}</span>:null}</div>
                    <div style={{fontSize:"11px",color:C.muted}}>{sub}</div>
                  </div>
                  <span style={{color:C.subtle,fontSize:"16px"}} aria-hidden="true">›</span>
                </button>
              );
            })}

            {/* Klassiker-Basis (abgesetzt, mit Uebernehmen) */}
            {showClassics&&(
              <div style={{marginTop:"14px"}}>
                <div style={{fontSize:"11px",fontWeight:"700",color:C.accent,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px",paddingBottom:"6px",borderBottom:"1px dashed "+C.border}}>Klassiker-Basis · {classicList.length} noch nicht im Kochbuch</div>
                {classicList.length===0&&<div style={{fontSize:"13px",color:C.muted,padding:"8px 4px"}}>Kein Klassiker passt zur Suche – oder alle passenden sind schon im Kochbuch.</div>}
                {classicList.map(c=>(
                  <div key={c.name} style={{display:"flex",alignItems:"center",gap:"10px",background:"transparent",border:"1px dashed "+C.border,padding:"9px 14px",minHeight:"56px",marginBottom:"5px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"15px",fontFamily:SER,color:C.text,marginBottom:"2px"}}>{c.name}</div>
                      <div style={{fontSize:"11px",color:C.muted}}>{[c.category,c.cuisine,c.origin,c.minutes?c.minutes+" Min.":""].filter(Boolean).join(" · ")}</div>
                    </div>
                    <button onClick={()=>doAdopt(c)} disabled={adopting===c.name} style={{...btn("ghost"),color:C.accent,padding:"8px 10px",flexShrink:0}}>{adopting===c.name?"…":"ÜBERNEHMEN"}</button>
                  </div>
                ))}
              </div>
            )}

            {/* Kochbuch als PDF */}
            {total>0&&(
              <div style={{marginTop:"14px"}}>
                <button onClick={downloadPDF} style={{...btn("dark"),width:"100%",padding:"14px",fontSize:"12px",letterSpacing:"2px"}}>KOCHBUCH ALS PDF DRUCKEN / SPEICHERN</button>
                <div style={{fontSize:"11px",color:C.muted,textAlign:"center",marginTop:"8px",lineHeight:"1.5"}}>Ein neues Fenster öffnet sich. Dort „Als PDF speichern“ im Druckdialog wählen.</div>
              </div>
            )}
          </div>
  );
}
