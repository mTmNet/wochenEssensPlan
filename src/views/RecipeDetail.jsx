import { useEffect, useRef, useState } from "react";
import { C, SF, SER, column, btn, iconBtn, microMuted as lbl, chip } from "../theme.js";
import { CATS, CUISINE_LIST, DAYS, DAYFUL, MEALS, ML } from "../data.js";
import { recName, recCat, cookedLabel } from "../logic/recipes.js";
import { scaleIng } from "../logic/ingredients.js";
import { weekDates, shiftWeek, shortDate, todayDayKey, mealSlotNow, weekLabel } from "../logic/weeks.js";
import Stars from "../components/Stars.jsx";
import Modal from "../components/Modal.jsx";
import DishImage from "../components/DishImage.jsx";
import Toast from "../components/Toast.jsx";

const SRC_LABEL = { ki:"KI-Vorschlag", import:"Importiert", klassiker:"Rezept-Basis", eigen:"" };
const fmtDate = (iso) => { const m=String(iso||"").split("-"); return m.length===3 ? parseInt(m[2],10)+"."+parseInt(m[1],10)+"."+m[0] : iso; };
const inp = {width:"100%",border:"1px solid "+C.border,padding:"10px 12px",minHeight:"40px",fontSize:"13px",fontFamily:SF,color:C.text,outline:"none",boxSizing:"border-box",background:C.white};
const stepBtn = {width:"40px",height:"40px",border:"1px solid "+C.border,background:C.bg,color:C.text,fontSize:"20px",lineHeight:1,cursor:"pointer",fontFamily:SF,flexShrink:0};
const cardTitle = {fontSize:"11px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",marginBottom:"10px"};
const headBtn = {background:"rgba(0,0,0,0.45)",border:"none",color:"rgba(255,255,255,0.85)",padding:"10px 12px",minHeight:"40px",fontSize:"11px",letterSpacing:"1px",cursor:"pointer",fontFamily:SF};

// REZEPTDETAIL - Kopfbild (DishImage), Rubrik/Kueche/Herkunft/Portionen/Zeit, Aktionen (Kochmodus, Zum Wochenplan, Auf die Einkaufsliste,
// Bearbeiten, Als PDF), Bewertung, Notizen, Zutaten mit Portionen-Stepper, Zubereitung, Kochhistorie, Loeschen; Bearbeiten; Bewertungsdialog mit Foto
export default function RecipeDetail({state,api}){
  const {rateAfterCook,detailRecipe,ratingDraft,noteDraft,images,curRec,editMode,editData,settings,household,curWeekKey,today,toast}=state;
  const {setRateAfterCook,setRatingDraft,setNoteDraft,saveRating,rateRecipe,noteRecipe,closeRecipe,uploadImage,resetImage,setCookStep,setCookMode,startEdit,setEditData,saveEdit,cancelEdit,
         downloadRecipePDF,deleteRecipe,addDish,addRecipeToShopping,registerBackHandler,showToast,setView}=api;
  const imgFileRef=useRef(null), dishPhotoRef=useRef(null);
  const name=recName(curRec,detailRecipe);
  // Portionen-Stepper: skaliert nur die Anzeige, das Rezept bleibt bei seinen servings
  const base=curRec.servings>0?curRec.servings:4;
  const [portions,setPortions]=useState(base);
  useEffect(()=>{ setPortions(base); },[detailRecipe,base]);
  const factor=portions/base;
  const ings=curRec.ingredients||[], steps=curRec.steps||[];
  const metaLine=[recCat(curRec),curRec.cuisine,curRec.origin,base+" Portionen",curRec.minutes>0?curRec.minutes+" Min.":""].filter(Boolean).join(" · ");
  const srcLine=[SRC_LABEL[curRec.source]||"",curRec.sourceNote?"Quelle: "+curRec.sourceNote:""].filter(Boolean).join(" · ");
  const cooked=Array.isArray(curRec.cooked)?curRec.cooked:[];
  // "Zum Wochenplan": Woche (diese/naechste), Tag, Slot - Standard heute und aktueller Slot
  const [picker,setPicker]=useState(null);   // {wk, day, slot}
  const [shopDone,setShopDone]=useState(false);
  useEffect(()=>{ if(!picker) return; return registerBackHandler(()=>{ setPicker(null); return true; }); },[!!picker]);
  const openPicker=()=>setPicker({wk:curWeekKey,day:todayDayKey(),slot:mealSlotNow()});
  const confirmPicker=async()=>{
    const p=picker; setPicker(null);
    await addDish(p.day,p.slot,detailRecipe,p.wk);
    showToast("„"+name+"“ für "+DAYFUL[DAYS.indexOf(p.day)]+" ("+ML[p.slot]+") eingeplant.");
  };
  const toShopping=()=>{
    if(addRecipeToShopping(detailRecipe,portions)){ setShopDone(true); showToast("Zutaten für "+portions+" Portionen auf der Einkaufsliste."); setTimeout(()=>setShopDone(false),2500); }
    else showToast("Keine Zutaten zum Hinzufügen.");
  };
  return(
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:SF}}>
        <Toast text={toast} />
        {/* BEWERTUNGS-DIALOG nach dem Kochen, mit "Foto vom Gericht" */}
        {rateAfterCook&&(
          <Modal title={"Wie war "+name+"?"} micro="Guten Appetit!" onClose={()=>setRateAfterCook(false)}>
            <Stars value={ratingDraft} onRate={setRatingDraft} size={32} />
            <textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Notiz fürs nächste Mal... (optional)" aria-label="Notiz" style={{width:"100%",minHeight:"80px",marginTop:"14px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:"#16161C"}} />
            <input ref={dishPhotoRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)uploadImage(detailRecipe,f);e.target.value="";}} />
            <button onClick={()=>dishPhotoRef.current&&dishPhotoRef.current.click()} style={{...btn("ghost"),width:"100%",marginTop:"10px",color:C.accent}}>{images[detailRecipe]?"FOTO VOM GERICHT ERSETZEN":"FOTO VOM GERICHT"}</button>
            <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
              <button onClick={saveRating} style={{...btn("ok"),flex:2,letterSpacing:"2px"}}>SPEICHERN</button>
              <button onClick={()=>setRateAfterCook(false)} style={{...btn("ghost"),flex:1}}>ÜBERSPRINGEN</button>
            </div>
          </Modal>
        )}
        {/* ZUM WOCHENPLAN: Woche, Tag, Slot waehlen */}
        {picker&&(
          <Modal title="Zum Wochenplan" micro={name} onClose={()=>setPicker(null)}>
            <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
              {[curWeekKey,shiftWeek(curWeekKey,1)].map((wk,i)=>(
                <button key={wk} onClick={()=>setPicker(p=>({...p,wk}))} aria-pressed={picker.wk===wk} style={{...chip(picker.wk===wk),flex:1}}>{i===0?"Diese Woche":"Nächste Woche"} · {weekLabel(wk).split(" · ")[0]}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:"4px",marginBottom:"10px",flexWrap:"wrap"}}>
              {DAYS.map((d,i)=>{ const iso=weekDates(picker.wk)[i]; const past=iso<today; return(
                <button key={d} onClick={()=>setPicker(p=>({...p,day:d}))} aria-pressed={picker.day===d} style={{...chip(picker.day===d),flex:"1 1 44px",padding:"8px 4px",textAlign:"center",opacity:past?0.55:1}}>{d}<br/><span style={{fontSize:"11px"}}>{shortDate(iso)}</span></button>
              );})}
            </div>
            <div style={{display:"flex",gap:"6px",marginBottom:"14px",flexWrap:"wrap"}}>
              {MEALS.map(m=><button key={m} onClick={()=>setPicker(p=>({...p,slot:m}))} aria-pressed={picker.slot===m} style={{...chip(picker.slot===m),flex:"1 1 40%"}}>{ML[m]}</button>)}
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button onClick={confirmPicker} style={{...btn("primary"),flex:2,letterSpacing:"2px"}}>EINTRAGEN</button>
              <button onClick={()=>setPicker(null)} style={{...btn("ghost"),flex:1}}>ABBRECHEN</button>
            </div>
          </Modal>
        )}
        <div style={column}>
        <DishImage name={name} rec={curRec} img={images[detailRecipe]} aiImages={settings.aiImages} height={260} dim compact>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 30%,"+C.dark+")"}} />
          <button onClick={closeRecipe} style={{...headBtn,position:"absolute",top:12,left:12}}>ZURÜCK</button>
          {/* Eigenes Bild hochladen / Standard wiederherstellen */}
          <input ref={imgFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)uploadImage(detailRecipe,f);e.target.value="";}} />
          <div style={{position:"absolute",top:12,right:12,display:"flex",gap:"6px"}}>
            <button onClick={()=>imgFileRef.current&&imgFileRef.current.click()} style={headBtn}>{images[detailRecipe]?"BILD ÄNDERN":"FOTO HINZUFÜGEN"}</button>
            {images[detailRecipe]&&<button onClick={()=>resetImage(detailRecipe)} style={{...headBtn,color:"rgba(255,255,255,0.65)"}}>STANDARD</button>}
          </div>
          <div style={{position:"absolute",bottom:20,left:20,right:20}}>
            <div style={{color:C.accent,fontSize:"12px",fontWeight:"600",letterSpacing:"0.5px",marginBottom:"6px",lineHeight:"1.5"}}>{metaLine}</div>
            <div style={{color:"#fff",fontSize:"28px",fontFamily:SER,lineHeight:"1.2"}}>{name}</div>
            {srcLine&&<div style={{color:"rgba(255,255,255,0.7)",fontSize:"11px",marginTop:"4px"}}>{srcLine}</div>}
          </div>
        </DishImage>

        <div style={{padding:"16px 16px 60px"}}>
          {!editMode?(
            <div>
              {/* AKTIONEN */}
              <div style={{display:"flex",gap:"8px",marginBottom:"8px",flexWrap:"wrap"}}>
                {steps.length>0&&<button onClick={()=>{setCookStep(0);setCookMode(true);}} style={{...btn("dark"),flex:"2 1 140px",letterSpacing:"2px"}}>KOCHMODUS</button>}
                <button onClick={openPicker} style={{...btn("ghost"),flex:"1 1 140px",color:C.accent}}>ZUM WOCHENPLAN</button>
                <button onClick={toShopping} style={{...btn("ghost"),flex:"1 1 140px",color:shopDone?C.ok:C.accent}}>{shopDone?"✓ AUF DER LISTE":"AUF DIE EINKAUFSLISTE"}</button>
              </div>
              <div style={{display:"flex",gap:"8px",marginBottom:"14px"}}>
                <button onClick={()=>startEdit(detailRecipe)} style={{...btn("ghost"),flex:1,color:C.text}}>BEARBEITEN</button>
                <button onClick={()=>downloadRecipePDF(detailRecipe)} style={{...btn("ghost"),flex:1,color:C.accent}}>ALS PDF</button>
              </div>
              {curRec.description&&(
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                  <div style={cardTitle}>Beschreibung</div>
                  <div style={{fontSize:"14px",color:C.text,lineHeight:"1.7",fontFamily:SER,fontStyle:"italic"}}>{curRec.description}</div>
                </div>
              )}
              {curRec.stepsGenerated&&<div style={{fontSize:"12px",color:C.accent,lineHeight:"1.5",marginBottom:"14px",padding:"0 2px"}}>Die Anleitung fehlte in der Vorlage und wurde von der KI ergänzt – bitte beim ersten Kochen prüfen.</div>}
              {/* BEWERTUNG & NOTIZEN */}
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                <div style={cardTitle}>Bewertung & Notizen</div>
                <Stars value={curRec.rating||0} onRate={r=>rateRecipe(detailRecipe,r)} />
                <textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} onBlur={()=>{if(noteDraft!==(curRec.notes||""))noteRecipe(detailRecipe,noteDraft);}} placeholder="Notizen zum Rezept... (z.B. weniger Salz, 10 Min. länger backen)" aria-label="Notizen" style={{width:"100%",minHeight:"70px",marginTop:"10px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:"#16161C"}} />
              </div>
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}>
                  <div style={{...cardTitle,marginBottom:0}}>Zutaten</div>
                  {/* Portionen-Stepper "− 4 +": rechnet die Mengen um */}
                  <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"2px"}}>
                    <button onClick={()=>setPortions(p=>Math.max(1,p-1))} aria-label="Portion weniger" style={stepBtn}>−</button>
                    <span style={{minWidth:"92px",textAlign:"center",fontSize:"12px",color:portions===base?C.muted:C.accent,fontWeight:"700"}}>{portions} {portions===1?"Portion":"Portionen"}</span>
                    <button onClick={()=>setPortions(p=>Math.min(24,p+1))} aria-label="Portion mehr" style={stepBtn}>+</button>
                  </div>
                </div>
                {factor!==1&&<div style={{fontSize:"11px",color:C.muted,marginBottom:"6px"}}>Mengen umgerechnet von {base} auf {portions} Portionen.</div>}
                {ings.map((ing,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<ings.length-1?"1px solid "+C.border:"none"}}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0}} />
                    <span style={{fontSize:"14px",color:C.text}}>{scaleIng(ing,factor)}</span>
                  </div>
                ))}
                {household!==base&&portions===base&&<button onClick={()=>setPortions(household)} style={{...btn("ghost"),marginTop:"10px",padding:"8px 12px",letterSpacing:"0.5px"}}>Auf {household} Personen umrechnen</button>}
              </div>
              {steps.length>0&&(
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                  <div style={{...cardTitle,marginBottom:"16px"}}>Zubereitung</div>
                  {steps.map((step,i)=>(
                    <div key={i} style={{display:"flex",gap:"14px",marginBottom:i<steps.length-1?"18px":"0"}}>
                      <div style={{width:"26px",height:"26px",borderRadius:"50%",border:"1px solid "+(i===0?C.accent:C.border),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"11px",fontWeight:"700",color:i===0?C.accent:C.muted}}>{i+1}</div>
                      <div style={{paddingTop:"4px",fontSize:"14px",color:C.text,lineHeight:"1.7"}}>{step}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* KOCHHISTORIE */}
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"16px",marginBottom:"14px"}}>
                <div style={{...cardTitle,marginBottom:"8px"}}>Kochhistorie</div>
                <div style={{fontSize:"14px",color:C.text}}>{cookedLabel(curRec)}</div>
                {cooked.length>0&&<div style={{fontSize:"11px",color:C.muted,marginTop:"6px"}}>{cooked.slice(-6).reverse().map(fmtDate).join(" · ")}{cooked.length>6?" · …":""}</div>}
              </div>
              <button onClick={()=>deleteRecipe(detailRecipe)} style={{...btn("danger"),width:"100%"}}>REZEPT LÖSCHEN</button>
            </div>
          ):(
            <div>
              <div style={cardTitle}>REZEPT BEARBEITEN</div>
              <div style={{marginBottom:"10px"}}>
                <label style={lbl}>Name</label>
                <input value={editData.name} onChange={e=>setEditData(d=>({...d,name:e.target.value}))} aria-label="Name" style={{...inp,fontSize:"15px",fontFamily:SER}} />
              </div>
              <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                <div style={{flex:1}}>
                  <label style={lbl}>Kategorie</label>
                  <select value={editData.category} onChange={e=>setEditData(d=>({...d,category:e.target.value}))} style={inp}>
                    {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <label style={lbl}>Küche</label>
                  <select value={editData.cuisine} onChange={e=>setEditData(d=>({...d,cuisine:e.target.value}))} style={inp}>
                    {CUISINE_LIST.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {/* Portionen, Zeit, Herkunft, Quelle */}
              <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                <div style={{flex:1}}>
                  <label style={lbl}>Portionen</label>
                  <input type="number" min="1" max="24" inputMode="numeric" value={editData.servings??4} onChange={e=>setEditData(d=>({...d,servings:e.target.value}))} style={inp} />
                </div>
                <div style={{flex:1}}>
                  <label style={lbl}>Minuten</label>
                  <input type="number" min="0" inputMode="numeric" placeholder="z.B. 35" value={editData.minutes??""} onChange={e=>setEditData(d=>({...d,minutes:e.target.value}))} style={inp} />
                </div>
              </div>
              <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                <div style={{flex:1}}>
                  <label style={lbl}>Herkunft</label>
                  <input placeholder="z.B. Schwaben" value={editData.origin||""} onChange={e=>setEditData(d=>({...d,origin:e.target.value}))} style={inp} />
                </div>
                <div style={{flex:1}}>
                  <label style={lbl}>Quelle</label>
                  <input placeholder="z.B. Kochbuch Oma S. 42" value={editData.sourceNote||""} onChange={e=>setEditData(d=>({...d,sourceNote:e.target.value}))} style={inp} />
                </div>
              </div>
              <div style={{marginBottom:"10px"}}>
                <label style={lbl}>Beschreibung</label>
                <textarea value={editData.description||""} onChange={e=>setEditData(d=>({...d,description:e.target.value}))} placeholder="Kurze Beschreibung / Geschichte zum Rezept..." style={{width:"100%",minHeight:"70px",border:"1px solid "+C.border,padding:"10px",fontSize:"13px",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text,lineHeight:"1.6",fontFamily:SF,background:C.white}} />
              </div>
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"10px"}}>
                <div style={{...cardTitle,color:C.muted}}>Zutaten</div>
                {editData.ingredients.map((ing,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"2px 0",borderBottom:i<editData.ingredients.length-1?"1px solid "+C.border:"none"}}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:C.accent,flexShrink:0}} />
                    <input value={ing} onChange={e=>setEditData(d=>{const a=[...d.ingredients];a[i]=e.target.value;return{...d,ingredients:a};})} aria-label={"Zutat "+(i+1)} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF,padding:"10px 0",minWidth:0}} />
                    <button onClick={()=>setEditData(d=>({...d,ingredients:d.ingredients.filter((_,j)=>j!==i)}))} aria-label="Zutat entfernen" style={iconBtn}>×</button>
                  </div>
                ))}
                <button onClick={()=>setEditData(d=>({...d,ingredients:[...d.ingredients,""]}))} style={{...btn("ghost"),marginTop:"8px",padding:"8px 12px",letterSpacing:"0.5px"}}>+ Zutat</button>
              </div>
              <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"14px"}}>
                <div style={{...cardTitle,color:C.muted}}>Schritte</div>
                {editData.steps.map((step,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"8px",padding:"6px 0",borderBottom:i<editData.steps.length-1?"1px solid "+C.border:"none"}}>
                    <span style={{color:C.accent,fontSize:"11px",fontWeight:"700",minWidth:"16px",paddingTop:"12px"}}>{i+1}.</span>
                    <textarea value={step} onChange={e=>setEditData(d=>{const a=[...d.steps];a[i]=e.target.value;return{...d,steps:a};})} aria-label={"Schritt "+(i+1)} style={{flex:1,border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",fontFamily:SF,resize:"none",lineHeight:"1.5",minHeight:"40px",padding:"8px 0"}} />
                    <button onClick={()=>setEditData(d=>({...d,steps:d.steps.filter((_,j)=>j!==i)}))} aria-label="Schritt entfernen" style={iconBtn}>×</button>
                  </div>
                ))}
                <button onClick={()=>setEditData(d=>({...d,steps:[...d.steps,""]}))} style={{...btn("ghost"),marginTop:"8px",padding:"8px 12px",letterSpacing:"0.5px"}}>+ Schritt</button>
              </div>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={saveEdit} style={{...btn("dark"),flex:2,letterSpacing:"2px"}}>SPEICHERN</button>
                <button onClick={cancelEdit} style={{...btn("ghost"),flex:1}}>ABBRECHEN</button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
  );
}
