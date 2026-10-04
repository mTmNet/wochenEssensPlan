// Schemaprüfung für die Klassiker-Basis: node tests/classics-schema.mjs [datei …]
// Ohne Argumente werden alle Dateien unter src/classics/*.js geprüft.
// Die Regeln sind als checkRecipe/checkList exportiert und laufen auch in tests/classics.test.mjs mit.
import { readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "src", "classics");

export const CATS = ["Frühstück", "Hauptgericht", "Kinderessen", "Schnelle Küche", "Beilagen & Salate", "Soßen & Dips", "Snacks"];
export const CUISINES = ["Schwäbisch", "Italienisch", "Asiatisch", "Indisch", "Naher Osten", "Mediterran", "Klassisch", "International", "Vegetarisch", "Grillen", "Schnell"];
export const FIELDS = ["name", "category", "cuisine", "origin", "veg", "servings", "minutes", "ingredients", "steps", "description", "source"];

// Einheitenliste aus dem Parser der App, damit Schema und parseIng dieselben Einheiten kennen.
// Fällt der Import aus (Datei gerade im Umbau), gilt eine Kopie derselben Liste.
let UNIT_RE = "(?:g|kg|mg|ml|cl|dl|l|el|tl|st(?:k|ück|ueck)?\\.?|bund|prisen?|zehen?|dosen?|pck\\.?|packung(?:en)?|p(?:ä|ae)ckchen|scheiben?|becher|gl(?:a|ä)s(?:er)?|tassen?|msp\\.?|liter|gramm|kilo)";
try {
  const m = await import(pathToFileURL(join(ROOT, "src", "logic", "ingredients.js")).href);
  if (typeof m.UNIT_RE === "string" && m.UNIT_RE) UNIT_RE = m.UNIT_RE;
} catch { /* Kopie oben bleibt */ }
export const ING_RE = new RegExp("^(\\d+(?:\\.\\d+)?|[½¼¾⅓⅔])\\s*(" + UNIT_RE + ")?\\s+\\S", "i");
// Mengenwörter, die der Parser nicht als Einheit kennt und die deshalb im Namen landen würden.
export const PSEUDO_UNIT_RE = /^(\d+(?:\.\d+)?|[½¼¾⅓⅔])\s+(Stiele?|Zweige?|Stangen?|Handvoll|Blatt|Blätter|Kopf|Köpfe|Knollen?|Schuss|Spritzer|Tropfen|Würfel|Tüten?|Beutel|Portion(?:en)?|cm|mm|Pfund|Esslöffel|Teelöffel|Messerspitzen?)\b/i;

export function checkRecipe(r, i, names, out) {
  const tag = `#${i + 1} ${r && typeof r.name === "string" ? r.name : "(ohne Namen)"}`;
  const err = (m) => out.push(`${tag}: ${m}`);
  if (!r || typeof r !== "object" || Array.isArray(r)) return err("kein Objekt");
  for (const k of Object.keys(r)) if (!FIELDS.includes(k)) err(`unbekanntes Feld "${k}"`);
  for (const k of FIELDS) if (!(k in r)) err(`Pflichtfeld "${k}" fehlt`);

  if (typeof r.name !== "string" || !r.name.trim()) err("name muss nicht-leerer String sein");
  else {
    const key = r.name.trim().toLowerCase();
    if (names.has(key)) err("name doppelt (Groß-/Kleinschreibung zählt nicht)");
    names.add(key);
    if ((r.name.match(/-/g) || []).length > 1) err("name enthält mehr als einen Bindestrich");
  }
  if (!CATS.includes(r.category)) err(`category "${r.category}" nicht erlaubt`);
  if (!CUISINES.includes(r.cuisine)) err(`cuisine "${r.cuisine}" nicht erlaubt`);
  if (typeof r.origin !== "string" || !r.origin.trim()) err("origin muss nicht-leerer String sein");
  if (typeof r.veg !== "boolean") err("veg muss boolean sein");
  if (r.servings !== 4) err(`servings muss 4 sein (ist ${r.servings})`);
  if (typeof r.minutes !== "number" || !Number.isFinite(r.minutes) || r.minutes < 5 || r.minutes > 240) err(`minutes muss Zahl 5..240 sein (ist ${r.minutes})`);
  if (r.source !== "klassiker") err(`source muss "klassiker" sein (ist ${r.source})`);

  if (!Array.isArray(r.ingredients)) err("ingredients muss Array sein");
  else {
    if (r.ingredients.length < 3 || r.ingredients.length > 25) err(`ingredients: ${r.ingredients.length} Einträge (erlaubt 3..25)`);
    r.ingredients.forEach((s, j) => {
      if (typeof s !== "string" || !s.trim()) return err(`ingredients[${j}] ist kein String`);
      if (/\(|\)|\bca\.|\d,\d/.test(s)) err(`ingredients[${j}] "${s}": Klammern, "ca." oder Dezimalkomma`);
      if (!ING_RE.test(s) && /\d/.test(s)) err(`ingredients[${j}] "${s}": Format "<Zahl> <Einheit> <Name>" verletzt`);
      if (PSEUDO_UNIT_RE.test(s)) err(`ingredients[${j}] "${s}": Mengenwort ist keine bekannte Einheit und landet im Namen (z. B. "2 Rosmarinzweige" oder "1 Bund Rosmarin" schreiben)`);
    });
  }
  if (!Array.isArray(r.steps)) err("steps muss Array sein");
  else {
    if (r.steps.length < 4 || r.steps.length > 8) err(`steps: ${r.steps.length} Schritte (erlaubt 4..8)`);
    r.steps.forEach((s, j) => {
      if (typeof s !== "string") return err(`steps[${j}] ist kein String`);
      if (s.trim().length < 25) err(`steps[${j}] kürzer als 25 Zeichen`);
      if (!/\.$/.test(s.trim())) err(`steps[${j}] endet nicht mit Punkt`);
    });
  }
  if (typeof r.description !== "string") err("description muss String sein");
  else if (r.description.length < 30 || r.description.length > 240) err(`description: ${r.description.length} Zeichen (erlaubt 30..240)`);
}

// Prüft eine ganze Liste; liefert die Verstöße als Strings.
export function checkList(list) {
  const out = [];
  if (!Array.isArray(list)) return ["Liste ist kein Array"];
  const names = new Set();
  list.forEach((r, i) => checkRecipe(r, i, names, out));
  return out;
}

async function checkFile(file) {
  let mod;
  try { mod = await import(pathToFileURL(file).href); } catch (e) { return { file, count: 0, errors: [`Import fehlgeschlagen: ${e.message}`] }; }
  const list = mod.default;
  if (!Array.isArray(list)) return { file, count: 0, errors: ["export default ist kein Array"] };
  return { file, count: list.length, errors: checkList(list) };
}

// Kommandozeile nur, wenn die Datei direkt gestartet wird (nicht beim Import aus dem Test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.length ? args.map((a) => resolve(a)) : readdirSync(DIR).filter((f) => f.endsWith(".js")).sort().map((f) => join(DIR, f));
  let total = 0;
  for (const f of files) {
    const res = await checkFile(f);
    total += res.errors.length;
    console.log(`${res.file}: ${res.count} Rezepte, ${res.errors.length} Verstöße`);
    for (const e of res.errors) console.log("  - " + e);
  }
  process.exit(total ? 1 : 0);
}
