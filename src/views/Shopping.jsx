import { useState, useRef } from "react";
import { C, SF, SER, btn, iconBtn, input, chip } from "../theme.js";
import { BASIC_LABEL } from "../data.js";
import { splitQty, joinQty, qtyUnits, readQty, applyQty, itemCat, QTY_UNITS } from "../logic/shopping.js";
import { shopCat } from "../logic/ingredients.js";

// MENGENAUSWAHL zu einem Posten: Zahl und Einheit antippen oder frei eintippen; jede Auswahl wird sofort gespeichert.
// Die Menge steht vorn im Text des Postens ("200 g Käse"), wie bei den Zutaten aus Rezepten.
function QtyPanel({item,onSave,onClose,framed}){
  const start=useRef(splitQty(item.text)).current;
  const saved=useRef(start);
  const [name,setName]=useState(start.name);
  const [qty,setQty]=useState(start.qty);
  const save=(n,q)=>{
    const nn=n.trim(), qq=q.trim();
    if(!nn){ setName(saved.current.name); return; }                  // leerer Name loescht nichts, dafuer gibt es das ×
    if(nn===saved.current.name&&qq===saved.current.qty) return;
    saved.current={name:nn,qty:qq};
    onSave(joinQty(nn,qq), nn===start.name?itemCat(item):shopCat(nn));
  };
  const cur=readQty(qty);
  const units=qtyUnits(name); if(cur&&!units.includes(cur.unit)) units.push(cur.unit);
  const nums=QTY_UNITS[cur?cur.unit:""].nums;
  const tap=(c)=>{ const q=(c.num!==undefined&&cur&&cur.num===c.num&&cur.unit==="")?"":applyQty(qty,c); setQty(q); save(name,q); };
  const done=()=>{ save(name,qty); onClose(); };
  const key=(e)=>{ if(e.key==="Enter") done(); if(e.key==="Escape") onClose(); };
  const lab={fontSize:"12px",color:C.muted,margin:"10px 0 6px"};
  const chips={display:"flex",flexWrap:"wrap",gap:"6px"};
  const ch=(on)=>({...chip(on),minHeight:"36px",minWidth:"40px"});
  return(
    <div role="group" aria-label={"Menge für "+name} style={{background:framed?C.white:C.bg,border:framed?"1px solid "+C.abgBorder:"none",borderTop:framed?"1px solid "+C.abgBorder:"1px solid "+C.border,borderRadius:framed?"8px":0,padding:"10px 12px 12px",marginBottom:framed?"10px":0}}>
      <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
        <input value={name} onChange={e=>setName(e.target.value)} onBlur={()=>save(name,qty)} onKeyDown={key} aria-label="Posten bearbeiten" style={{...input,flex:1,width:"auto",fontWeight:"700"}} />
        <button onClick={done} style={btn("primary")}>Fertig</button>
      </div>
      <input value={qty} onChange={e=>setQty(e.target.value)} onBlur={()=>save(name,qty)} onKeyDown={key} placeholder="Menge, z. B. 2 oder 500 g" aria-label="Menge" style={{...input,marginTop:"8px"}} />
      <div style={lab}>Einheit</div>
      <div style={chips}>{units.map(u=><button key={u||"st"} onClick={()=>tap({unit:u})} aria-pressed={!!cur&&cur.unit===u} style={ch(!!cur&&cur.unit===u)}>{QTY_UNITS[u].label}</button>)}</div>
      <div style={lab}>{cur&&["g","kg","ml","l"].includes(cur.unit)?"Menge":"Anzahl"}</div>
      <div style={chips}>{nums.map(n=><button key={n} onClick={()=>tap({num:n})} aria-pressed={!!cur&&cur.num===n} style={ch(!!cur&&cur.num===n)}>{n}</button>)}</div>
    </div>
  );
}

// EINKAUFSLISTE - Eingabe oben, Fortschritt, Abteilungen (abgehakte ans Ende), Block "Vorrat pruefen", Teilen
export default function Shopping({state,api}){
  const {shopMain,shopBasics,unchecked,shopGroups,hbLink}=state;
  const {setView,toggleShopItem,editShopItem,removeShopItem,addShopItem,clearShopping,clearCheckedShopping,forceBuy,shareShopping}=api;
  const [qtyOpen,setQtyOpen]=useState(null);   // {id, top}: Mengenauswahl offen; top = gerade eingetippt, steht unter der Eingabe
  const [customItem,setCustomItem]=useState("");
  const [showBasics,setShowBasics]=useState(false);
  const total=shopMain.length;
  const checkedCount=shopMain.filter(x=>x.checked).length+shopBasics.filter(x=>x.checked).length;
  // Eingetipptes landet sofort in der Liste; dazu geht die Mengenauswahl auf (ausser die Menge wurde schon mitgetippt)
  const addCustom=()=>{ if(customItem.trim()){ const id=addShopItem(customItem); setQtyOpen(id&&!splitQty(customItem).qty?{id,top:true}:null); setCustomItem(""); } };
  const panel=(item,framed)=><QtyPanel key={item.id} item={item} framed={framed} onSave={(text,cat)=>editShopItem(item.id,text,cat)} onClose={()=>setQtyOpen(null)} />;
  const topItem=qtyOpen&&qtyOpen.top?shopMain.find(x=>x.id===qtyOpen.id):null;
  const header=(label,count,open,toggle)=>(
    <button onClick={toggle} aria-expanded={open} style={{width:"100%",display:"flex",alignItems:"center",gap:"8px",padding:"10px 14px",minHeight:"44px",background:C.bg,border:"1px solid "+C.border,borderBottom:open?"none":"1px solid "+C.border,color:C.accent,fontSize:"12px",fontWeight:"700",letterSpacing:"0.5px",textTransform:"uppercase",cursor:"pointer",fontFamily:SF,textAlign:"left",borderRadius:"6px"}}>
      <span style={{flex:1}}>{label} ({count})</span><span style={{fontSize:"14px"}}>{open?"▴":"▾"}</span>
    </button>
  );
  const row=(item,gi,len,extra)=>{
    const open=!!qtyOpen&&!qtyOpen.top&&qtyOpen.id===item.id;
    return(
    <div key={item.id} style={{borderBottom:gi<len-1?"1px solid "+C.border:"none",background:C.white}}>
      <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"6px 10px 6px 14px",minHeight:"48px"}}>
        <button onClick={()=>toggleShopItem(item.id)} aria-label={item.checked?"Haken entfernen":"Abhaken"} style={{width:"28px",height:"28px",border:"2px solid "+(item.checked?C.ok:C.border),background:item.checked?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",borderRadius:"4px",padding:0}}>
          {item.checked&&<span style={{color:C.onAccent,fontSize:"15px",fontWeight:"800"}}>✓</span>}
        </button>
        <span onClick={()=>setQtyOpen(open?null:{id:item.id,top:false})} role="button" aria-expanded={open} title="Tippen für Menge und Name" style={{flex:1,fontSize:"14px",color:item.checked?C.muted:C.text,textDecoration:item.checked?"line-through "+C.err:"none",textDecorationThickness:"2px",cursor:"pointer",minWidth:0,padding:"8px 0"}}>{item.text}</span>
        {extra}
        <button onClick={()=>removeShopItem(item.id)} aria-label="Entfernen" style={iconBtn}>×</button>
      </div>
      {open&&panel(item,false)}
    </div>
    );
  };
  return(
          <div style={{padding:"12px",paddingBottom:"80px"}}>
            {/* EINGABE OBEN */}
            <div style={{background:C.white,border:"1px solid "+C.border,padding:"9px",display:"flex",gap:"8px",marginBottom:"10px"}}>
              <input value={customItem} onChange={e=>setCustomItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()} placeholder="Produkt hinzufügen..." aria-label="Produkt hinzufügen" style={{...input,flex:1,width:"auto"}} />
              <button onClick={addCustom} aria-label="Hinzufügen" style={{...btn("dark"),minWidth:"48px",fontSize:"20px",padding:"6px 14px",borderRadius:"6px"}}>+</button>
            </div>
            {topItem&&panel(topItem,true)}

            {total===0&&shopBasics.length===0?(
              <div style={{textAlign:"center",padding:"48px 24px",color:C.muted}}>
                <div style={{fontFamily:SER,fontSize:"22px",color:C.text,marginBottom:"10px"}}>Die Einkaufsliste ist leer.</div>
                <div style={{fontSize:"14px",marginBottom:"20px",lineHeight:"1.6"}}>Trag oben etwas ein, erzeuge die Liste aus dem Vorgemerkten oder füge an einem Rezept „Auf die Einkaufsliste“ die Zutaten hinzu.</div>
                <button onClick={()=>setView("plan")} style={btn("dark")}>Zum Vorgemerkten</button>
              </div>
            ):(
              <div>
                {/* Fortschritt + Teilen */}
                <div style={{background:C.white,border:"1px solid "+C.border,padding:"10px 14px",marginBottom:"10px",display:"flex",alignItems:"center",gap:"12px"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"7px"}}>
                      <span style={{fontSize:"12px",color:C.muted,letterSpacing:"0.5px",textTransform:"uppercase"}}>Erledigt</span>
                      <span style={{fontSize:"13px",fontWeight:"700",color:C.ok}}>{total-unchecked} / {total}</span>
                    </div>
                    <div style={{background:C.border,height:"2px"}}>
                      <div style={{height:"100%",width:(total?(total-unchecked)/total*100:0)+"%",background:C.ok,transition:"width 0.4s"}} />
                    </div>
                  </div>
                  <button onClick={shareShopping} aria-label="Einkaufsliste teilen" style={{...btn("ghost"),color:C.accent,padding:"9px 12px",borderRadius:"6px"}}>Teilen</button>
                </div>

                {/* Abteilungen */}
                {shopGroups.map(group=>(
                  <div key={group.cat} style={{marginBottom:"10px"}}>
                    <div style={{fontSize:"12px",fontWeight:"700",color:C.accent,letterSpacing:"0.5px",textTransform:"uppercase",padding:"8px 14px",background:C.bg,border:"1px solid "+C.border,borderBottom:"none"}}>{group.cat}</div>
                    <div style={{background:C.white,border:"1px solid "+C.border}}>
                      {group.items.map((item,gi)=>row(item,gi,group.items.length,null))}
                    </div>
                  </div>
                ))}

                {/* VORRAT PRUEFEN (Grundvorrat) */}
                {shopBasics.length>0&&(
                  <div style={{marginBottom:"10px"}}>
                    {header("Vorrat prüfen",shopBasics.length,showBasics,()=>setShowBasics(v=>!v))}
                    {showBasics&&(
                      <div style={{background:C.white,border:"1px solid "+C.border}}>
                        <div style={{padding:"8px 14px",fontSize:"13px",color:C.muted,lineHeight:"1.5",borderBottom:"1px solid "+C.border}}>Grundvorrat ({BASIC_LABEL}) zählt nicht im Fortschritt. Fehlt etwas, holt „Kaufen“ es in die Liste.</div>
                        {shopBasics.map((item,gi)=>row(item,gi,shopBasics.length,(
                          <button onClick={()=>forceBuy(item.id)} style={{...btn("ghost"),color:C.accent,padding:"6px 10px",minHeight:"36px",borderRadius:"6px"}}>Kaufen</button>
                        )))}
                      </div>
                    )}
                  </div>
                )}
                {!hbLink&&<div style={{fontSize:"13px",color:C.subtle,margin:"4px 2px 10px",lineHeight:"1.5"}}>Abgehakte Posten gelten als gekauft und kommen in den Vorrat (Reiter „Vorrat“).</div>}
                <button onClick={clearShopping} style={{...btn("danger"),width:"100%",marginTop:"6px",borderRadius:"6px"}}>Einkaufsliste komplett löschen</button>
                {checkedCount>0&&<button onClick={clearCheckedShopping} style={{...btn("danger"),width:"100%",marginTop:"8px",borderRadius:"6px"}}>Nur abgehakte Posten löschen ({checkedCount})</button>}
              </div>
            )}
          </div>
  );
}
