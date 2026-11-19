// BILDER DER REZEPT-BASIS - feste Bilddateien unter public/rezepte/<slug>.webp, mit der App ausgeliefert.
// Jedes Gericht der Rezept-Basis (src/classics.js) hat genau ein Bild; andere Rezepte bekommen keins.
import { CLASSICS } from "../classics.js";

// Dateiname aus dem Rezeptnamen: klein, Umlaute ausgeschrieben, alles andere zu Bindestrich.
export const bildSlug = (name) => String(name||"").toLowerCase()
  .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
  .replace(/é/g,"e").replace(/ù/g,"u").replace(/ñ/g,"n")
  .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");

const NAMEN = new Set(CLASSICS.map(c=>c.name.trim().toLowerCase()));

// Pfad zum Bild, wenn der Name ein Gericht der Rezept-Basis ist, sonst "".
export const basisBild = (name) => {
  const n = String(name||"").trim().toLowerCase();
  return n && NAMEN.has(n) ? "/rezepte/"+bildSlug(n)+".webp" : "";
};
