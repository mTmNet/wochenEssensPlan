// PDF - HTML zum Drucken / als PDF speichern (jsPDF kommt in einer spaeteren Phase)
// Bilder: eigenes Foto, sonst Platzhalterband (Rubrik-Farbe, Anfangsbuchstabe); KI-Symbolbilder nur bei settings.aiImages
import { CATS, CAT_COLORS } from "./data.js";
import { recCat, recName, foodImg } from "./logic/recipes.js";

const esc = (s) => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
// Bild oder Platzhalterband zum Rezept
const imgHTML = (key, rec, title, customImg, aiImages, cls) => {
  const cl = cls ? ' class="'+cls+'"' : '';
  if(customImg) return '<img'+cl+' src="'+customImg+'" alt="'+esc(title)+'" onerror="this.style.display=\'none\'">';
  if(aiImages) return '<div class="symb"><img'+cl+' src="'+foodImg(key)+'" alt="'+esc(title)+'" onerror="this.parentNode.style.display=\'none\'"><span>Symbolbild</span></div>';
  const color = CAT_COLORS[recCat(rec)]||"#4A4A5A";
  return '<div class="band" style="background:'+color+'"><span class="initial">'+esc(String(title).trim().charAt(0).toUpperCase())+'</span><span class="band-cat">'+esc(recCat(rec))+'</span></div>';
};
const commonCss = `
    .band{height:120px;border-radius:4px;margin-bottom:20px;display:flex;align-items:center;gap:18px;padding:0 24px;color:#fff}
    .band .initial{width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center;font-size:34px}
    .band .band-cat{font-family:system-ui,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.75}
    .symb{position:relative}
    .symb span{position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);color:#fff;font-family:system-ui,sans-serif;font-size:10px;letter-spacing:1px;padding:3px 7px}
    .src{font-size:12px;color:#8A8780;margin:-10px 0 18px}
`;

export const makeRecipePDF = (name, rec, customImg, aiImages) => {
  const title = recName(rec, name);
  const ings = (rec.ingredients||[]).map(i=>"<li>"+esc(i)+"</li>").join("");
  const steps = (rec.steps||[]).map((s,i)=>'<div class="step"><span class="num">'+(i+1)+'</span><p>'+esc(s)+'</p></div>').join("");
  const desc = rec.description ? '<p class="desc">'+esc(rec.description)+'</p>' : '';
  const meta = [recCat(rec),rec.cuisine,rec.origin,(rec.servings>0?rec.servings:4)+" Portionen",rec.minutes>0?rec.minutes+" Min.":""].filter(Boolean).join(" · ");
  const src = [rec.source==="ki"?"KI-Vorschlag":rec.source==="import"?"Importiert":rec.source==="klassiker"?"Rezept-Basis":rec.source==="essensplan"?"Essensplan":"", rec.sourceNote?"Quelle: "+rec.sourceNote:""].filter(Boolean).join(" · ");
  const css = `
    @page{margin:2cm}
    body{font-family:Georgia,serif;color:#1A1917;max-width:760px;margin:0 auto;padding:0}
    .meta{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C17D3C;font-weight:700;margin-bottom:10px}
    h1{font-size:38px;font-weight:400;letter-spacing:-1px;margin:0 0 18px}
    img{width:100%;height:300px;object-fit:cover;border-radius:4px;margin-bottom:20px;display:block}
    .desc{font-style:italic;font-size:15px;line-height:1.8;color:#4A4843;margin:0 0 24px}
    .tag{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C17D3C;margin:24px 0 10px}
    ul{list-style:none;padding:0;margin:0}
    ul li{font-size:14px;padding:7px 0;border-bottom:1px solid #F0EEE9}
    .step{display:flex;gap:14px;margin-bottom:14px}
    .num{width:26px;height:26px;border-radius:50%;border:1px solid #1A1917;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;font-family:system-ui,sans-serif}
    .step p{font-size:14px;line-height:1.7;margin:0;padding-top:2px}
  `+commonCss;
  return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>'+css+'</style></head><body>'+
    '<div class="meta">'+esc(meta)+'</div>'+
    '<h1>'+esc(title)+'</h1>'+
    imgHTML(name, rec, title, customImg, aiImages)+
    (src?'<p class="src">'+esc(src)+'</p>':'')+
    desc+
    '<div class="tag">Zutaten</div><ul>'+ings+'</ul>'+
    '<div class="tag">Zubereitung</div>'+steps+
    '</body></html>';
};

// KOCHBUCH-PDF
export const makeCookbookPDF = (recipes, customImgs, aiImages) => {
  const sections = [];
  CATS.forEach(cat=>{
    const items = Object.entries(recipes).filter(([k,v])=>recCat(v)===cat);
    if(items.length) sections.push({title:cat, items});
  });

  const recipeHTML = ([key,rec])=>{
    const name=recName(rec, key);
    const ings=(rec.ingredients||[]).map(i=>"<li>"+esc(i)+"</li>").join("");
    const steps=(rec.steps||[]).map((s,i)=>'<div class="step"><span class="num">'+(i+1)+"</span><p>"+esc(s)+"</p></div>").join("");
    const desc=rec.description?'<p class="desc">'+esc(rec.description)+'</p>':'';
    const meta=[rec.cuisine,rec.origin,(rec.servings>0?rec.servings:4)+" Portionen",rec.minutes>0?rec.minutes+" Min.":"",rec.sourceNote?"Quelle: "+rec.sourceNote:""].filter(Boolean).join(" · ");
    return '<div class="recipe"><h2>'+esc(name)+'</h2><div class="rmeta">'+esc(meta)+'</div>'+imgHTML(key, rec, name, customImgs&&customImgs[key], aiImages)+desc+'<div class="tag">Zutaten</div><ul>'+ings+'</ul><div class="tag">Zubereitung</div>'+steps+'</div>';
  };

  const sectionsHTML = sections.map(sec=>'<div class="section"><h1 class="section-title">'+esc(sec.title)+'</h1>'+sec.items.map(recipeHTML).join("")+'</div>').join("");

  const css = `
    @page{margin:2cm}
    body{font-family:Georgia,serif;color:#1A1917;max-width:900px;margin:0 auto;padding:0}
    .cover{text-align:center;padding:120px 40px;border-bottom:1px solid #E8E6E1;page-break-after:always}
    .cover h1{font-size:52px;font-weight:400;letter-spacing:-2px;margin-bottom:12px}
    .cover p{color:#8A8780;font-size:15px}
    .toc{padding:40px;page-break-after:always}
    .toc h2{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C17D3C;margin-bottom:24px}
    .toc-section{font-weight:700;font-size:13px;margin:14px 0 4px;color:#1A1917}
    .toc-item{font-size:13px;color:#8A8780;padding:2px 0}
    .section{page-break-before:always}
    .section-title{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C17D3C;margin-bottom:40px;padding-bottom:10px;border-bottom:1px solid #E8E6E1;font-weight:700}
    .recipe{margin-bottom:60px;padding-bottom:60px;border-bottom:1px solid #E8E6E1;page-break-inside:avoid}
    .recipe h2{font-size:28px;font-weight:400;margin-bottom:6px}
    .rmeta{font-size:12px;color:#8A8780;margin-bottom:14px}
    .recipe img{width:100%;height:260px;object-fit:cover;border-radius:4px;margin-bottom:20px;display:block}
    .recipe .desc{font-style:italic;font-size:14px;line-height:1.8;color:#4A4843;margin:0 0 16px}
    .tag{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C17D3C;margin:20px 0 10px}
    ul{list-style:none;padding:0}
    ul li{font-size:14px;padding:7px 0;border-bottom:1px solid #F0EEE9}
    .step{display:flex;gap:14px;margin-bottom:14px}
    .num{width:26px;height:26px;border-radius:50%;border:1px solid #1A1917;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;font-family:system-ui,sans-serif}
    .step p{font-size:14px;line-height:1.7;margin:0;padding-top:2px}
    @media print{.section{page-break-before:always}.recipe{page-break-inside:avoid}}
  `+commonCss;

  const tocHTML = sections.map(sec=>'<div class="toc-section">'+esc(sec.title)+'</div>'+sec.items.map(([k])=>'<div class="toc-item">'+esc(recName(recipes[k], k))+'</div>').join("")).join("");

  return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Kochbuch</title><style>'+css+'</style></head><body>'+
    '<div class="cover"><h1>Mein Kochbuch</h1><p>'+new Date().toLocaleDateString("de-DE")+" - "+Object.keys(recipes).length+' Rezepte</p></div>'+
    '<div class="toc"><h2>Inhalt</h2>'+tocHTML+'</div>'+
    sectionsHTML+'</body></html>';
};
