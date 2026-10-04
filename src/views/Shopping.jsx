import { useState } from "react";
import { C, SF, SER, micro, btn, iconBtn, input } from "../theme.js";
import { BASIC_LABEL } from "../data.js";

// EINKAUFSLISTE - Eingabe oben, Fortschritt, Abteilungen (abgehakte ans Ende), Bloecke "Wahrscheinlich da" und "Vorrat pruefen", Teilen
export default function Shopping({state,api}){
  const {shopMain,shopLikely,shopBasics,unchecked,shopGroups,editShopId,editShopText,hbLink}=state;
  const {setView,toggleShopItem,setEditShopText,saveShopEdit,setEditShopId,removeShopItem,addShopItem,clearShopping,forceBuy,shareShopping}=api;
  const [customItem,setCustomItem]=useState("");
  const [showLikely,setShowLikely]=useState(false);
  const [showBasics,setShowBasics]=useState(false);
  const total=shopMain.length;
  const addCustom=()=>{ if(customItem.trim()){ addShopItem(customItem); setCustomItem(""); } };
  const header=(label,count,open,toggle)=>(
    <button onClick={toggle} aria-expanded={open} style={{width:"100%",display:"flex",alignItems:"center",gap:"8px",padding:"10px 14px",minHeight:"44px",background:C.bg,border:"1px solid "+C.border,borderBottom:open?"none":"1px solid "+C.border,color:C.accent,fontSize:"11px",fontWeight:"700",letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer",fontFamily:SF,textAlign:"left"}}>
      <span style={{flex:1}}>{label} ({count})</span><span style={{fontSize:"14px"}}>{open?"▴":"▾"}</span>
    </button>
  );
  const row=(item,gi,len,extra)=>(
    <div key={item.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"6px 10px 6px 14px",minHeight:"48px",borderBottom:gi<len-1?"1px solid "+C.border:"none",background:C.white}}>
      <button onClick={()=>toggleShopItem(item.id)} aria-label={item.checked?"Haken entfernen":"Abhaken"} style={{width:"28px",height:"28px",border:"2px solid "+(item.checked?C.ok:C.border),background:item.checked?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",borderRadius:"4px",padding:0}}>
        {item.checked&&<span style={{color:"#fff",fontSize:"15px",fontWeight:"800"}}>✓</span>}
      </button>
      {editShopId===item.id
        ?<input autoFocus value={editShopText} onChange={e=>setEditShopText(e.target.value)} onBlur={saveShopEdit} onKeyDown={e=>{if(e.key==="Enter")saveShopEdit();if(e.key==="Escape"){setEditShopId(null);setEditShopText("");}}} aria-label="Posten bearbeiten" style={{flex:1,fontSize:"14px",color:C.text,background:"#16161C",border:"1px solid "+C.accent,padding:"6px 8px",outline:"none",fontFamily:SF,minWidth:0}} />
        :<span onClick={()=>{setEditShopId(item.id);setEditShopText(item.text);}} title="Tippen zum Bearbeiten" style={{flex:1,fontSize:"14px",color:item.checked?C.muted:C.text,textDecoration:item.checked?"line-through "+C.err:"none",textDecorationThickness:"2px",cursor:"pointer",minWidth:0,padding:"8px 0"}}>{item.text}</span>
      }
      {extra}
      <button onClick={()=>removeShopItem(item.id)} aria-label="Entfernen" style={iconBtn}>×</button>
    </div>
  );
  return(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {/* EINGABE OBEN */}
            <div style={{background:C.white,border:"1px solid "+C.border,padding:"9px",display:"flex",gap:"8px",marginBottom:"10px"}}>
              <input value={customItem} onChange={e=>setCustomItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()} placeholder="Produkt hinzufügen..." aria-label="Produkt hinzufügen" style={{...input,flex:1,width:"auto"}} />
              <button onClick={addCustom} aria-label="Hinzufügen" style={{...btn("dark"),minWidth:"48px",fontSize:"20px",padding:"6px 14px"}}>+</button>
            </div>

            {total===0&&shopLikely.length===0&&shopBasics.length===0?(
              <div style={{textAlign:"center",padding:"48px 24px",color:C.muted}}>
                <div style={{fontFamily:SER,fontSize:"22px",color:C.text,marginBottom:"10px"}}>Die Einkaufsliste ist leer.</div>
                <div style={{fontSize:"14px",marginBottom:"20px",lineHeight:"1.6"}}>Trag oben etwas ein, erzeuge die Liste aus dem Wochenplan oder füge Zutaten einzelner Gerichte über das + im Plan hinzu.</div>
                <button onClick={()=>setView("plan")} style={btn("dark")}>ZUM WOCHENPLAN</button>
              </div>
            ):(
              <div>
                {/* Fortschritt + Teilen */}
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"10px 14px",marginBottom:"10px",display:"flex",alignItems:"center",gap:"12px"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"7px"}}>
                      <span style={{fontSize:"11px",color:C.muted,letterSpacing:"0.5px",textTransform:"uppercase"}}>Erledigt</span>
                      <span style={{fontSize:"11px",fontWeight:"700",color:C.ok}}>{total-unchecked} / {total}</span>
                    </div>
                    <div style={{background:C.border,height:"2px"}}>
                      <div style={{height:"100%",width:(total?(total-unchecked)/total*100:0)+"%",background:C.ok,transition:"width 0.4s"}} />
                    </div>
                  </div>
                  <button onClick={shareShopping} aria-label="Einkaufsliste teilen" style={{...btn("ghost"),color:C.accent,padding:"9px 12px"}}>TEILEN</button>
                </div>

                {/* Abteilungen */}
                {shopGroups.map(group=>(
                  <div key={group.cat} style={{marginBottom:"10px"}}>
                    <div style={{fontSize:"11px",fontWeight:"700",color:C.accent,letterSpacing:"2px",textTransform:"uppercase",padding:"8px 14px",background:C.bg,border:"1px solid "+C.border,borderBottom:"none"}}>{group.cat}</div>
                    <div style={{background:C.white,border:"1px solid "+C.border}}>
                      {group.items.map((item,gi)=>row(item,gi,group.items.length,null))}
                    </div>
                  </div>
                ))}

                {/* WAHRSCHEINLICH DA (laut Haushaltsbuch) */}
                {shopLikely.length>0&&(
                  <div style={{marginBottom:"10px"}}>
                    {header("Wahrscheinlich da",shopLikely.length,showLikely,()=>setShowLikely(v=>!v))}
                    {showLikely&&(
                      <div style={{background:C.white,border:"1px solid "+C.border}}>
                        <div style={{padding:"8px 14px",fontSize:"12px",color:C.muted,lineHeight:"1.5",borderBottom:"1px solid "+C.border}}>Laut Haushaltsbuch vermutlich noch vorrätig. Ein Tipp auf „Kaufen“ holt den Posten in die Liste.</div>
                        {shopLikely.map((item,gi)=>row(item,gi,shopLikely.length,(
                          <>
                            <span style={{fontSize:"11px",color:C.ok,flexShrink:0}}>{Math.round(item.stockP*100)} %</span>
                            <button onClick={()=>forceBuy(item.id)} style={{...btn("ghost"),color:C.accent,padding:"6px 10px",minHeight:"36px"}}>KAUFEN</button>
                          </>
                        )))}
                      </div>
                    )}
                  </div>
                )}

                {/* VORRAT PRUEFEN (Grundvorrat) */}
                {shopBasics.length>0&&(
                  <div style={{marginBottom:"10px"}}>
                    {header("Vorrat prüfen",shopBasics.length,showBasics,()=>setShowBasics(v=>!v))}
                    {showBasics&&(
                      <div style={{background:C.white,border:"1px solid "+C.border}}>
                        <div style={{padding:"8px 14px",fontSize:"12px",color:C.muted,lineHeight:"1.5",borderBottom:"1px solid "+C.border}}>Grundvorrat ({BASIC_LABEL}) zählt nicht im Fortschritt. Fehlt etwas, holt „Kaufen“ es in die Liste.</div>
                        {shopBasics.map((item,gi)=>row(item,gi,shopBasics.length,(
                          <button onClick={()=>forceBuy(item.id)} style={{...btn("ghost"),color:C.accent,padding:"6px 10px",minHeight:"36px"}}>KAUFEN</button>
                        )))}
                      </div>
                    )}
                  </div>
                )}
                {!hbLink&&<div style={{fontSize:"11px",color:C.subtle,margin:"4px 2px 10px",lineHeight:"1.5"}}>Mit verknüpftem Haushaltsbuch (Reiter „Heute“) wandern wahrscheinlich vorrätige Zutaten in einen eigenen Block.</div>}
                <button onClick={clearShopping} style={{...btn("danger"),width:"100%",marginTop:"6px"}}>EINKAUFSLISTE KOMPLETT LÖSCHEN</button>
              </div>
            )}
          </div>
  );
}
