// DESIGN-UMSCHALTER: System, Hell oder Dunkel. Gespeichert wie der Schriftzoom im Browser, nicht im Plan.
// index.html setzt dasselbe schon vor dem ersten Bild; hier nur Lesen und Umschalten aus dem Menue.
export const THEME_KEY = "wochenplan_theme";
export const getThemeMode = () => { try{ const v=localStorage.getItem(THEME_KEY); return v==="light"||v==="dark"?v:"system"; }catch(e){ return "system"; } };
export const applyThemeMode = (mode) => {
  const sysDark = typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode==="dark"||(mode!=="light"&&sysDark);
  document.documentElement.setAttribute("data-theme",dark?"dark":"light");
  const t=document.querySelector('meta[name="theme-color"]'); if(t) t.setAttribute("content",dark?"#171512":"#FFFEFB");
};
export const setThemeMode = (mode) => {
  try{ if(mode==="system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY,mode); }catch(e){}
  applyThemeMode(mode);
};

// AKZENTFARBE: Petrol (Grundzustand) oder eine von vier weiteren Farben. Nur im Browser gespeichert, nicht im Plan.
// Die Werte stehen in index.html unter [data-accent="…"]; hier nur Namen und Musterfarben fuers Menue (hell, dunkel).
export const ACCENT_KEY = "wochenplan_farbe";
export const ACCENTS = [
  ["petrol","Petrol","#0B6466","#62C6C0"],
  ["blau","Tintenblau","#2F4FA0","#8FA8F0"],
  ["pflaume","Pflaume","#7A3B6E","#D99BCB"],
  ["olive","Olive","#566114","#B9C66A"],
  ["graphit","Graphit","#3A3631","#D8D2C9"],
];
export const getAccent = () => { try{ const v=localStorage.getItem(ACCENT_KEY); return ACCENTS.some(a=>a[0]===v)?v:"petrol"; }catch(e){ return "petrol"; } };
export const setAccent = (id) => {
  try{ if(id==="petrol") localStorage.removeItem(ACCENT_KEY); else localStorage.setItem(ACCENT_KEY,id); }catch(e){}
  if(id==="petrol") document.documentElement.removeAttribute("data-accent"); else document.documentElement.setAttribute("data-accent",id);
};
