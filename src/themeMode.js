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
