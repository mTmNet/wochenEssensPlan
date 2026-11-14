import { useState } from "react";
import { C, SF, SER, micro as label, btn, input, iconBtn } from "../theme.js";
import { daysSince } from "../logic/weeks.js";
import { STOCK_MIN, fadeTable } from "../logic/stock.js";

// VORRAT - Haushaltsbuch verbinden, Liste "Was wahrscheinlich da ist" mit Resttagen und x, Verblassen-Hinweis
const pColor=(p)=>p>=0.6?C.ok:p>=0.25?C.accent:C.subtle;

export default function Vorrat({state,api}){
  const {stock,hbLink,hbLoading,hbErr,hbBook}=state;
  const {connectHb,reloadHb,disconnectHb,markGone,clearGone}=api;
  const [hbInput,setHbInput]=useState("");
  const visible=stock.filter(s=>s.p>=STOCK_MIN);
  const goneCount=hbLink&&hbLink.gone?Object.keys(hbLink.gone).length:0;
  const fades=fadeTable();
  const doConnect=async()=>{ if(await connectHb(hbInput)) setHbInput(""); };
  const tile={...btn("ghost"),minHeight:"44px",padding:"10px 6px",fontSize:"12px",letterSpacing:"1px",whiteSpace:"nowrap"};
  return(
  <div style={{padding:"12px",paddingBottom:"80px"}}>
    <div style={{margin:"4px 2px 12px"}}>
      <div style={{fontFamily:SER,fontSize:"26px",color:C.text,lineHeight:1.15}}>Vorrat</div>
      <div style={{fontSize:"12px",color:C.muted,marginTop:"3px"}}>Was wahrscheinlich da ist – aus den Einkäufen im Haushaltsbuch.</div>
    </div>

    {!hbLink?(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"14px"}}>
        <div style={label}>Haushaltsbuch verbinden</div>
        <div style={{fontSize:"13px",color:C.muted,lineHeight:"1.5",marginBottom:"10px"}}>Mit dem Code eures Haushaltsbuchs kennt die App eure Lebensmittel-Einkäufe: Frisches verblasst nach Tagen, Vorräte nach Wochen. Es wird nur gelesen, nie etwas geändert.</div>
        <div style={{display:"flex",gap:"6px"}}>
          <input value={hbInput} onChange={e=>setHbInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")doConnect();}} placeholder="BUCH-CODE" aria-label="Buch-Code" style={{...input,flex:1,width:"auto",letterSpacing:"2px"}} />
          <button onClick={doConnect} disabled={hbLoading||!hbInput.trim()} style={{...btn("primary"),letterSpacing:"2px",opacity:hbLoading||!hbInput.trim()?0.5:1}}>{hbLoading?"…":"VERBINDEN"}</button>
        </div>
        {hbErr&&<div style={{marginTop:"8px",fontSize:"12px",color:C.err}}>{hbErr}</div>}
      </div>
    ):(
      <div style={{background:C.white,border:"1px solid "+C.border,padding:"14px",marginBottom:"14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
          <span style={{width:"8px",height:"8px",borderRadius:"50%",background:hbErr?C.err:visible.length?C.ok:C.subtle,flexShrink:0}} />
          <span style={{...label,marginBottom:0}}>Haushaltsbuch</span>
        </div>
        <div style={{fontSize:"20px",fontWeight:"700",letterSpacing:"3px",color:C.text,marginBottom:"4px"}}>{hbLink.code}</div>
        <div style={{fontSize:"15px",color:hbErr?C.err:C.muted,lineHeight:"1.5"}}>
          {hbLoading?"Wird geladen…":hbErr?hbErr:hbBook?(hbLink.cat+" · "+visible.length+" wahrscheinlich da"):"verbunden"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginTop:"12px"}}>
          <button onClick={()=>reloadHb()} disabled={hbLoading} style={{...tile,color:C.accent,opacity:hbLoading?0.5:1}}>↻ AKTUALISIEREN</button>
          <button onClick={disconnectHb} style={tile}>TRENNEN</button>
        </div>
      </div>
    )}

    {hbLink&&hbBook&&(
      <div style={{background:C.white,border:"1px solid "+C.border,marginBottom:"14px"}}>
        <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:"8px"}}>
          <span style={{...label,marginBottom:0,flex:1}}>Wahrscheinlich da ({visible.length})</span>
        </div>
        {visible.length===0&&<div style={{padding:"14px",fontSize:"13px",color:C.muted,lineHeight:"1.5"}}>In den letzten 90 Tagen wurden keine Lebensmittel in der Rubrik „{hbLink.cat}“ gebucht – oder alles ist schon verblasst.</div>}
        {visible.map((s,i)=>{
          const d=daysSince(s.last);
          const when=d===null?"":d===0?"heute gekauft":d===1?"gestern gekauft":"vor "+d+" Tagen gekauft";
          const left=s.left<=0?"läuft heute aus":s.left===1?"noch 1 Tag":"noch "+s.left+" Tage";
          return(
            <div key={s.key} style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 4px 8px 14px",borderTop:i?"1px solid "+C.border:"none",minHeight:"54px",boxSizing:"border-box"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"17px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                <div style={{fontSize:"13px",color:C.muted}}>{[when,left].filter(Boolean).join(" · ")}</div>
              </div>
              <span style={{fontSize:"16px",fontWeight:"700",color:pColor(s.p),flexShrink:0,minWidth:"46px",textAlign:"right"}}>{Math.round(s.p*100)} %</span>
              <button onClick={()=>markGone(s.key)} aria-label={s.name+" ist nicht mehr da"} title="Nicht mehr da – aus der Liste streichen" style={{...iconBtn,color:C.muted}}>×</button>
            </div>
          );
        })}
        <div style={{padding:"10px 14px",fontSize:"13px",color:C.subtle,borderTop:"1px solid "+C.border,lineHeight:"1.5"}}>
          <div style={{marginBottom:"4px"}}><span style={{color:C.muted,fontWeight:"700"}}>Verblasst nach:</span> {fades.map(f=>f.labels.join(", ")+" "+f.days+" Tage").join(" · ")}.</div>
          <div>Danach gilt eine Sache als aufgebraucht (unter {Math.round(STOCK_MIN*100)} %). Grundvorrat wie Salz, Öl und Mehl zählt immer als vorhanden.</div>
          {goneCount>0&&<div style={{marginTop:"6px",display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span>{goneCount===1?"1 Position von Hand gestrichen.":goneCount+" Positionen von Hand gestrichen."}</span><button onClick={clearGone} style={{background:"none",border:"none",color:C.accent,fontSize:"12px",cursor:"pointer",padding:"6px 4px",fontFamily:SF}}>wieder einblenden</button></div>}
        </div>
      </div>
    )}
  </div>
  );
}
