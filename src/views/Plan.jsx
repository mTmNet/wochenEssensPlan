import { useEffect, useRef, useState } from "react";
import { C, SF, btn, iconBtn } from "../theme.js";
import { DAYS, DAYFUL, MEALS, ML, CATS, CATS_WITH_CUISINE } from "../data.js";
import { MEALPLANS, mealPlanById } from "../mealplans.js";
import { recName, recipesByCat, groupByCuisine } from "../logic/recipes.js";
import { slotList, weekDates, weekLabel, shiftWeek, shortDate } from "../logic/weeks.js";
import Modal from "../components/Modal.jsx";

const initials = (name) => name?name.split(" ").map(w=>w[0]||"").join("").toUpperCase().slice(0,2):"?";
const navBtn = {width:"40px",height:"40px",border:"1px solid "+C.border,background:C.white,color:C.text,fontSize:"22px",lineHeight:1,cursor:"pointer",fontFamily:SF,flexShrink:0};

// WOCHENPLAN - Wochennavigation, Tage mit Datum und Slots, Koch-Auswahl, Kategorie-Dropdown,
// "Letzte Woche uebernehmen" bei leerer Woche, "Woche abschliessen" (Kochhistorie), Einkaufsliste aus dem Plan
export default function Plan({state,api}){
  const {week,weekKey,curWeekKey,today,cookPicker,participants,activeCell,recipes,addedSlots,cellInput,openCat,household,mealPlanPicker}=state;
  const {setWeekKey,copyLastWeek,closeWeek,setCookPicker,cookRef,cellRef,setCook,addRecipeToShopping,openRecipe,removeDish,setCellInput,addDish,setActiveCell,setOpenCat,buildShoppingFromPlan,registerBackHandler,applyMealPlan,setMealPlanPicker}=api;
  const [planWeeks,setPlanWeeks]=useState("both");     // Dialog Essensplan: "this" | "next" | "both"
  const [planBusy,setPlanBusy]=useState(false);
  const [routinesOpen,setRoutinesOpen]=useState(false);
  const weekPlan=week&&week.planId?mealPlanById(week.planId):null;
  const pickerPlan=mealPlanPicker?mealPlanById(mealPlanPicker):null;
  const doApplyPlan=async()=>{
    if(!pickerPlan||planBusy) return;
    const keys=planWeeks==="this"?[weekKey]:planWeeks==="next"?[shiftWeek(weekKey,1)]:[weekKey,shiftWeek(weekKey,1)];
    setPlanBusy(true); await applyMealPlan(pickerPlan.id,keys); setPlanBusy(false);
  };
  const getDishes=(day,meal)=>slotList(week[day]&&week[day].meals&&week[day].meals[meal]);
  const getCook=(day)=>week[day]&&week[day].cook||"";
  const dn=(k)=>recName(recipes[k],k);   // Anzeigename: Rezeptname oder freier Text
  const dates=weekDates(weekKey);
  const isCurrent=weekKey===curWeekKey;
  const isEmpty=DAYS.every(d=>MEALS.every(m=>getDishes(d,m).length===0));
  const todayRef=useRef(null);
  const [closing,setClosing]=useState(null);     // Dialog "Woche abschliessen": {entries, picked}
  const [closedMsg,setClosedMsg]=useState("");
  const [busy,setBusy]=useState(false);

  // Zurueck-Taste schliesst den offenen Dialog
  useEffect(()=>{ if(!closing) return; return registerBackHandler(()=>{ setClosing(null); return true; }); },[!!closing]);

  // Heutigen Tag beim Oeffnen und beim Sprung in die aktuelle Woche anspringen
  const jumpToToday=()=>{ if(todayRef.current) todayRef.current.scrollIntoView({block:"start"}); };
  useEffect(()=>{ if(isCurrent) jumpToToday(); },[weekKey]);

  // Woche abschliessen: alle geplanten Gerichte mit Rezept bis heute, vorausgewaehlt
  const openClose=()=>{
    const entries=[];
    DAYS.forEach((day,di)=>{
      const iso=dates[di]; if(iso>today) return;
      MEALS.forEach(meal=>getDishes(day,meal).forEach(key=>{ if(recipes[key]) entries.push({id:day+"|"+meal+"|"+key,day,di,meal,key,iso}); }));
    });
    setClosing({entries,picked:new Set(entries.map(e=>e.id))});
  };
  const togglePick=(id)=>setClosing(c=>{ const p=new Set(c.picked); if(p.has(id)) p.delete(id); else p.add(id); return {...c,picked:p}; });
  const confirmClose=async()=>{
    const sel=closing.entries.filter(e=>closing.picked.has(e.id)).map(e=>({key:e.key,iso:e.iso}));
    setBusy(true);
    const ok=await closeWeek(sel);
    setBusy(false);
    setClosing(null);
    if(ok){ setClosedMsg(sel.length+(sel.length===1?" Gericht":" Gerichte")+" in die Kochhistorie eingetragen."); setTimeout(()=>setClosedMsg(""),4000); }
  };

  return(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {/* WOCHENNAVIGATION */}
            <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"10px"}}>
              <button onClick={()=>setWeekKey(shiftWeek(weekKey,-1))} aria-label="Vorige Woche" style={navBtn}>‹</button>
              <div style={{flex:1,textAlign:"center",minWidth:0}}>
                <div title="Kalenderwoche" style={{fontSize:"14px",fontWeight:"700",color:isCurrent?C.accent:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{weekLabel(weekKey)}</div>
                <div style={{fontSize:"11px",color:C.muted}}>{isCurrent?"diese Woche":weekKey<curWeekKey?"vergangene Woche":"kommende Woche"}</div>
              </div>
              <button onClick={()=>setWeekKey(shiftWeek(weekKey,1))} aria-label="Nächste Woche" style={navBtn}>›</button>
              <button onClick={()=>{ if(isCurrent) jumpToToday(); else setWeekKey(curWeekKey); }} title="Zur aktuellen Woche" style={{height:"40px",padding:"0 12px",border:"1px solid "+(isCurrent?C.border:C.accent),background:isCurrent?C.white:C.abg,color:isCurrent?C.muted:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"1px",cursor:"pointer",fontFamily:SF,flexShrink:0}}>HEUTE</button>
            </div>

            {/* LEERE WOCHE */}
            {isEmpty&&(
              <div style={{background:C.white,border:"1px dashed "+C.border,padding:"14px",marginBottom:"10px",textAlign:"center"}}>
                <div style={{fontSize:"13px",color:C.muted,marginBottom:"10px",lineHeight:"1.5"}}>Diese Woche ist noch leer.</div>
                <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap"}}>
                  <button onClick={copyLastWeek} style={{...btn("primary"),letterSpacing:"2px"}}>LETZTE WOCHE ÜBERNEHMEN</button>
                  <button onClick={()=>setMealPlanPicker(MEALPLANS[0].id)} style={{...btn("ghost"),color:C.accent,letterSpacing:"2px"}}>ESSENSPLAN</button>
                </div>
              </div>
            )}

            {/* ESSENSPLAN-BANNER: Woche stammt aus einer Vorlage, Routinen aufklappbar */}
            {weekPlan&&(
              <div style={{background:C.white,border:"1px solid "+C.accent,padding:"10px 14px",marginBottom:"10px"}}>
                <button onClick={()=>setRoutinesOpen(v=>!v)} aria-expanded={routinesOpen} style={{width:"100%",display:"flex",alignItems:"center",gap:"8px",background:"none",border:"none",padding:"4px 0",cursor:"pointer",fontFamily:SF,textAlign:"left",minHeight:"36px"}}>
                  <span style={{fontSize:"11px",fontWeight:"700",letterSpacing:"2px",color:C.accent,textTransform:"uppercase",flexShrink:0}}>Essensplan</span>
                  <span style={{flex:1,fontSize:"14px",color:C.text,minWidth:0}}>{weekPlan.name}</span>
                  <span style={{fontSize:"12px",color:C.accent,flexShrink:0}}>Routinen {routinesOpen?"▴":"▾"}</span>
                </button>
                {routinesOpen&&(
                  <ol style={{margin:"6px 0 2px",paddingLeft:"18px",fontSize:"13px",color:C.muted,lineHeight:"1.55"}}>
                    {weekPlan.routines.map((r,i)=><li key={i} style={{marginBottom:"4px"}}>{r}</li>)}
                  </ol>
                )}
              </div>
            )}

            {/* DIALOG: ESSENSPLAN ÜBERNEHMEN */}
            {pickerPlan&&(
              <Modal title="Essensplan übernehmen" micro={pickerPlan.subtitle||""} onClose={()=>setMealPlanPicker(null)}>
                {MEALPLANS.length>1&&(
                  <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"10px"}}>
                    {MEALPLANS.map(p=><button key={p.id} onClick={()=>setMealPlanPicker(p.id)} aria-pressed={p.id===pickerPlan.id} style={{padding:"8px 10px",border:"1px solid "+(p.id===pickerPlan.id?C.accent:C.border),background:p.id===pickerPlan.id?C.abg:C.white,color:p.id===pickerPlan.id?C.accent:C.muted,fontSize:"11px",fontWeight:"700",cursor:"pointer",fontFamily:SF}}>{p.name}</button>)}
                  </div>
                )}
                <div style={{fontSize:"18px",color:C.text,fontFamily:"Georgia,serif",marginBottom:"4px"}}>{pickerPlan.name}</div>
                <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>{pickerPlan.description}</div>
                <div style={{fontSize:"11px",fontWeight:"700",letterSpacing:"1px",color:C.muted,textTransform:"uppercase",marginBottom:"4px"}}>Tägliche Routinen</div>
                <ol style={{margin:"0 0 12px",paddingLeft:"18px",fontSize:"13px",color:C.text,lineHeight:"1.55"}}>
                  {pickerPlan.routines.map((r,i)=><li key={i} style={{marginBottom:"4px"}}>{r}</li>)}
                </ol>
                <div style={{fontSize:"11px",fontWeight:"700",letterSpacing:"1px",color:C.muted,textTransform:"uppercase",marginBottom:"6px"}}>Eintragen für</div>
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"10px"}}>
                  {[{id:"this",label:weekLabel(weekKey)},{id:"next",label:weekLabel(shiftWeek(weekKey,1))},{id:"both",label:"Beide Wochen"}].map(o=>(
                    <button key={o.id} onClick={()=>setPlanWeeks(o.id)} aria-pressed={planWeeks===o.id} style={{padding:"9px 12px",minHeight:"36px",border:"1px solid "+(planWeeks===o.id?C.accent:C.border),background:planWeeks===o.id?C.abg:C.white,color:planWeeks===o.id?C.accent:C.muted,fontSize:"12px",fontWeight:planWeeks===o.id?"700":"400",cursor:"pointer",fontFamily:SF}}>{o.label}</button>
                  ))}
                </div>
                <div style={{fontSize:"12px",color:C.subtle,lineHeight:"1.5",marginBottom:"12px"}}>{pickerPlan.recipes.length} Rezepte des Plans kommen ins Kochbuch (schon vorhandene bleiben unverändert). Belegte Felder der gewählten Wochen werden ersetzt, „Wer kocht?“ bleibt.</div>
                <button onClick={doApplyPlan} disabled={planBusy} style={{...btn("primary"),width:"100%",letterSpacing:"2px",opacity:planBusy?0.6:1}}>{planBusy?"…":"ÜBERNEHMEN"}</button>
              </Modal>
            )}

            {DAYS.map((day,di)=>{
              const cookName=getCook(day);
              const isToday=isCurrent&&dates[di]===today;
              return(
                <div key={day} ref={isToday?todayRef:null} style={{marginBottom:"10px",background:C.white,border:isToday?"2px solid "+C.accent:"1px solid "+C.border,scrollMarginTop:"8px"}}>
                  {/* Tageskopf */}
                  <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:"10px",borderBottom:"1px solid "+C.border,background:isToday?C.abg:"transparent"}}>
                    <div>
                      <div style={{fontSize:"11px",fontWeight:"700",color:isToday?C.accent:C.muted,letterSpacing:"0.5px"}}>{day} {shortDate(dates[di])}{isToday?" · Heute":""}</div>
                      <div style={{fontSize:"13px",fontWeight:"600",color:C.text}}>{DAYFUL[di]}</div>
                    </div>
                    <div style={{flex:1}} />
                    {/* Koch-Auswahl */}
                    <div style={{position:"relative"}} ref={cookPicker===day?cookRef:null}>
                      <button onClick={()=>setCookPicker(cookPicker===day?null:day)} aria-expanded={cookPicker===day} style={{display:"flex",alignItems:"center",gap:"7px",padding:"5px 10px",minHeight:"36px",background:cookName?C.abg:C.bg,border:"1px solid "+(cookName?C.accent:C.border),cursor:"pointer",fontFamily:SF}}>
                        {cookName?(
                          <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                            <span style={{width:"22px",height:"22px",borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"800",color:"#fff",flexShrink:0}}>{initials(cookName)}</span>
                            <span style={{fontSize:"11px",color:C.accent,fontWeight:"600",maxWidth:"70px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cookName}</span>
                          </span>
                        ):(
                          <span style={{fontSize:"11px",color:C.muted}}>Wer kocht?</span>
                        )}
                      </button>
                      {cookPicker===day&&(
                        <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:999,background:C.white,border:"1px solid "+C.border,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",minWidth:"160px"}}>
                          {participants.map(p=>(
                            <button key={p} onMouseDown={e=>{e.preventDefault();setCook(day,p);}} style={{width:"100%",padding:"10px 14px",minHeight:"44px",textAlign:"left",background:cookName===p?C.abg:C.white,color:cookName===p?C.accent:C.text,fontSize:"13px",display:"flex",alignItems:"center",gap:"9px",borderBottom:"1px solid "+C.border,border:"none",cursor:"pointer",fontFamily:SF}}>
                              <span style={{width:"22px",height:"22px",borderRadius:"50%",background:cookName===p?C.accent:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"800",color:cookName===p?"#fff":C.muted,flexShrink:0}}>{initials(p)}</span>
                              {p}
                              {cookName===p&&<span style={{marginLeft:"auto",color:C.accent,fontSize:"12px"}}>✓</span>}
                            </button>
                          ))}
                          {cookName&&<button onMouseDown={e=>{e.preventDefault();setCook(day,"");}} style={{width:"100%",padding:"8px 14px",minHeight:"40px",textAlign:"center",background:"none",color:C.muted,fontSize:"11px",border:"none",cursor:"pointer",fontFamily:SF}}>Auswahl entfernen</button>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Slots */}
                  {MEALS.map(meal=>{
                    const key=day+"-"+meal;
                    const isActive=activeCell===key;
                    const dishes=getDishes(day,meal);

                    return(
                      <div key={meal} style={{position:"relative"}} ref={isActive?cellRef:null}>
                        <div style={{display:"flex",alignItems:"stretch",background:isActive?C.abg:"transparent",transition:"background 0.15s"}}>
                          <div style={{width:"100px",padding:"10px 10px",flexShrink:0}}>
                            <div style={{fontSize:"11px",fontWeight:"700",color:isActive?C.accent:C.subtle,letterSpacing:"0.5px",textTransform:"uppercase",lineHeight:"1.2",whiteSpace:"nowrap"}}>{ML[meal]}</div>
                          </div>
                          <div style={{width:"1px",background:C.border,alignSelf:"stretch"}} />
                          <div style={{flex:1,padding:"4px 10px",minWidth:0}}>
                            {/* zugewiesene Rezepte */}
                            {dishes.map(d=>{
                              const hasR=!!recipes[d];
                              const slotKey=weekKey+"|"+day+"|"+meal+"|"+d;
                              const isAdded=!!addedSlots[slotKey];
                              return(
                                <div key={d} style={{display:"flex",alignItems:"center",gap:"2px",padding:"2px 0",borderBottom:"1px solid "+C.border}}>
                                  <span onClick={hasR?()=>openRecipe(d):undefined} style={{flex:1,fontSize:"13px",color:C.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",padding:"8px 0",cursor:hasR?"pointer":"default"}}>{dn(d)}</span>
                                  {hasR&&(isAdded
                                    ? <span title="bereits zur Einkaufsliste hinzugefügt" aria-label="bereits zur Einkaufsliste hinzugefügt" style={{color:C.ok,fontSize:"18px",minWidth:"40px",minHeight:"40px",display:"flex",alignItems:"center",justifyContent:"center",opacity:0.85}}>✓</span>
                                    : <button onClick={()=>addRecipeToShopping(d,household,{slot:slotKey})} title="Zutaten zur Einkaufsliste" aria-label="Zutaten zur Einkaufsliste" style={{...iconBtn,color:C.ok}}>+</button>
                                  )}
                                  {hasR&&<button onClick={()=>openRecipe(d)} style={{color:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"0.5px",background:"none",border:"none",cursor:"pointer",padding:"8px 6px",minHeight:"40px",fontFamily:SF,flexShrink:0}}>REZEPT</button>}
                                  <button onClick={()=>removeDish(day,meal,d)} title="Entfernen" aria-label={dn(d)+" entfernen"} style={iconBtn}>×</button>
                                </div>
                              );
                            })}
                            {/* Hinzufuegen-Zeile */}
                            {isActive
                              ?<input autoFocus value={cellInput} onChange={e=>setCellInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&cellInput.trim()){addDish(day,meal,cellInput);setCellInput("");setActiveCell(null);setOpenCat(null);}if(e.key==="Escape"){setActiveCell(null);setOpenCat(null);}}} placeholder="Suchen oder eingeben..." style={{width:"100%",border:"none",background:"transparent",fontSize:"13px",color:C.text,outline:"none",padding:"10px 0",fontFamily:SF}} />
                              :<button onClick={()=>{setActiveCell(key);setCellInput("");setOpenCat(null);}} style={{width:"100%",textAlign:"left",padding:"10px 0",minHeight:"40px",fontSize:"13px",color:C.subtle,fontStyle:"italic",background:"none",border:"none",cursor:"pointer",fontFamily:SF}}>+ Hinzufügen...</button>
                            }
                          </div>
                        </div>
                        {meal!==MEALS[MEALS.length-1]&&<div style={{height:"1px",background:C.border,marginLeft:"100px"}} />}

                        {/* KATEGORIE-DROPDOWN */}
                        {isActive&&(()=>{
                          const byCat=recipesByCat(recipes);
                          const catsToShow=openCat?[openCat]:CATS;
                          const flt=(names)=>names.filter(s=>!cellInput||dn(s).toLowerCase().includes(cellInput.toLowerCase()));
                          const itemBtn=(s)=>(
                            <button key={s} onMouseDown={e=>{e.preventDefault();addDish(day,meal,s);setCellInput("");setActiveCell(null);setOpenCat(null);}} onMouseEnter={e=>e.currentTarget.style.background=C.abg} onMouseLeave={e=>e.currentTarget.style.background=C.white} style={{width:"100%",padding:"10px 14px",minHeight:"40px",border:"none",borderBottom:"1px solid "+C.border,background:dishes.includes(s)?C.abg:C.white,textAlign:"left",cursor:"pointer",fontSize:"13px",color:C.text,display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:SF}}>
                              <span>{dishes.includes(s)?"✓ ":""}{dn(s)}</span>
                              {recipes[s]&&<span style={{fontSize:"11px",color:C.accent,fontWeight:"700",letterSpacing:"0.5px"}}>REZEPT</span>}
                            </button>
                          );
                          return(
                          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,background:C.white,border:"2px solid "+C.accent,borderRadius:"4px",boxShadow:"0 14px 36px rgba(0,0,0,0.55)"}}>
                            {/* Kategorie-Tabs */}
                            <div style={{display:"flex",gap:"0",overflowX:"auto",borderBottom:"1px solid "+C.border,background:C.bg}}>
                              <button onMouseDown={e=>{e.preventDefault();setOpenCat(null);}} style={{padding:"9px 10px",minHeight:"36px",border:"none",background:openCat===null?C.white:"transparent",color:openCat===null?C.accent:C.muted,fontSize:"11px",fontWeight:"700",letterSpacing:"0.5px",cursor:"pointer",fontFamily:SF,flexShrink:0,whiteSpace:"nowrap",borderBottom:openCat===null?"2px solid "+C.accent:"2px solid transparent"}}>ALLE</button>
                              {CATS.map(c=>(
                                <button key={c} onMouseDown={e=>{e.preventDefault();setOpenCat(openCat===c?null:c);}} style={{padding:"9px 10px",minHeight:"36px",border:"none",background:openCat===c?C.white:"transparent",color:openCat===c?C.accent:C.muted,fontSize:"11px",fontWeight:"700",letterSpacing:"0.5px",cursor:"pointer",fontFamily:SF,flexShrink:0,whiteSpace:"nowrap",borderBottom:openCat===c?"2px solid "+C.accent:"2px solid transparent"}}>{c.toUpperCase()}</button>
                              ))}
                            </div>
                            <div style={{maxHeight:"360px",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                              {catsToShow.map(cat=>{
                                const names=flt(byCat[cat]||[]);
                                if(!names.length)return null;
                                return(
                                  <div key={cat}>
                                    <div style={{padding:"7px 14px 5px",fontSize:"11px",fontWeight:"700",color:C.accent,letterSpacing:"1.5px",textTransform:"uppercase",background:C.bg,borderTop:"1px solid "+C.border,borderBottom:"1px solid "+C.border}}>{cat}</div>
                                    {CATS_WITH_CUISINE.includes(cat)
                                      ? groupByCuisine(recipes,names).map(g=>(
                                          <div key={g.cuisine}>
                                            <div style={{padding:"5px 14px 3px 22px",fontSize:"11px",fontWeight:"700",color:C.subtle,letterSpacing:"1.5px",textTransform:"uppercase"}}>{g.cuisine}</div>
                                            {g.items.map(itemBtn)}
                                          </div>
                                        ))
                                      : names.map(itemBtn)
                                    }
                                  </div>
                                );
                              })}
                            </div>
                            {cellInput&&(
                              <div style={{padding:"4px 14px",borderTop:"1px solid "+C.border,background:C.bg}}>
                                <button onMouseDown={e=>{e.preventDefault();addDish(day,meal,cellInput);setCellInput("");setActiveCell(null);setOpenCat(null);}} style={{background:"none",border:"none",color:C.accent,fontSize:"12px",fontWeight:"700",cursor:"pointer",fontFamily:SF,minHeight:"40px",padding:"8px 0"}}>+ "{cellInput}" hinzufügen</button>
                              </div>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <button onClick={buildShoppingFromPlan} style={{...btn("dark"),width:"100%",padding:"14px",fontSize:"12px",letterSpacing:"2px",marginTop:"4px"}}>GESAMTE EINKAUFSLISTE GENERIEREN</button>
            <div style={{fontSize:"11px",color:C.subtle,textAlign:"center",marginTop:"6px",lineHeight:"1.5"}}>Führt die Zutaten aller geplanten Gerichte (für {household} Personen) mit der bestehenden Liste zusammen – Handeinträge und Haken bleiben.</div>
            <button onClick={openClose} style={{...btn("ghost"),width:"100%",letterSpacing:"2px",marginTop:"10px"}}>WOCHE ABSCHLIESSEN</button>
            <div style={{fontSize:"11px",color:C.subtle,textAlign:"center",marginTop:"6px",lineHeight:"1.5"}}>Trägt die gekochten Gerichte dieser Woche in die Kochhistorie der Rezepte ein.</div>
            {closedMsg&&<div style={{fontSize:"12px",color:C.ok,textAlign:"center",marginTop:"8px"}}>{closedMsg}</div>}

            {/* DIALOG: WOCHE ABSCHLIESSEN */}
            {closing&&(
              <Modal title="Woche abschließen" micro={weekLabel(weekKey)} onClose={()=>setClosing(null)}>
                {closing.entries.length===0
                  ? <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.6"}}>Bis heute ist in dieser Woche kein Gericht mit Rezept geplant. Es gibt nichts in die Kochhistorie einzutragen.</div>
                  : (
                    <div>
                      <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"6px"}}>Welche Gerichte wurden gekocht? Ausgewählte bekommen ihr Datum in die Kochhistorie.</div>
                      {closing.entries.map(e=>{
                        const on=closing.picked.has(e.id);
                        return(
                          <label key={e.id} style={{display:"flex",alignItems:"center",gap:"12px",padding:"9px 0",borderBottom:"1px solid "+C.border,cursor:"pointer",minHeight:"44px"}}>
                            <input type="checkbox" checked={on} onChange={()=>togglePick(e.id)} aria-label={dn(e.key)+" gekocht"} style={{width:"22px",height:"22px",margin:0,accentColor:C.accent,flexShrink:0}} />
                            <span style={{flex:1,minWidth:0}}>
                              <span style={{display:"block",fontSize:"14px",color:on?C.text:C.muted}}>{dn(e.key)}</span>
                              <span style={{display:"block",fontSize:"11px",color:C.muted}}>{DAYFUL[e.di]} {shortDate(e.iso)} · {ML[e.meal]}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
                  {closing.entries.length>0&&<button onClick={confirmClose} disabled={!closing.picked.size||busy} style={{...btn("ok"),flex:2,letterSpacing:"2px",opacity:closing.picked.size&&!busy?1:0.5}}>{busy?"…":"GEKOCHT EINTRAGEN"}</button>}
                  <button onClick={()=>setClosing(null)} style={{...btn("ghost"),flex:1}}>ABBRECHEN</button>
                </div>
              </Modal>
            )}
          </div>
  );
}
