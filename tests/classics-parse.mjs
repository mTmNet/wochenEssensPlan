// Parser-Prüfung für die Klassiker-Basis: node tests/classics-parse.mjs [--alle] [datei …]
// Zerlegt jede Zutatenzeile unter src/classics/*.js mit parseIng (src/logic/ingredients.js)
// und meldet Zeilen, die nicht sauber in {name, amount, unit} zerfallen, sowie häufige
// Zutaten ohne Treffer in den Einkaufs-Abteilungen (shopCat).
// Ohne Argumente werden alle Dateien unter src/classics/*.js geprüft.
// Exit-Code 1, sobald es mindestens einen Befund der Stufe "major" gibt.
import { readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "src", "classics");

// ---- Parser laden: echte Logik aus src/logic/ingredients.js, sonst Nachbau nach derselben Regel
let parseIng, shopCat, isBasic, normKey, quelle = "src/logic/ingredients.js";
try {
  const m = await import(pathToFileURL(join(ROOT, "src", "logic", "ingredients.js")).href);
  parseIng = m.parseIng; shopCat = m.shopCat; isBasic = m.isBasic; normKey = m.normKey;
  if (typeof parseIng !== "function") throw new Error("parseIng fehlt");
} catch (e) {
  quelle = "Nachbau (Import fehlgeschlagen: " + e.message + ")";
  const UNIT_RE = "(?:g|kg|mg|ml|cl|dl|l|el|tl|st(?:k|ück|ueck)?\\.?|bund|prisen?|zehen?|dosen?|pck\\.?|packung(?:en)?|p(?:ä|ae)ckchen|scheiben?|becher|gl(?:a|ä)s(?:er)?|tassen?|msp\\.?|liter|gramm|kilo)";
  const PRE = new RegExp("^([\\d]+(?:[.,][\\d]+)?|[½¼¾⅓⅔])\\s*(" + UNIT_RE + ")?\\s+(.+)$", "i");
  const FR = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
  parseIng = (t) => {
    const s = t.trim();
    let m = s.match(PRE);
    if (m) return { name: m[3].trim(), amount: FR[m[1]] !== undefined ? FR[m[1]] : parseFloat(m[1].replace(",", ".")), unit: (m[2] || "").trim(), pre: true };
    m = s.match(/^(.*?)\s*([\d]+(?:[.,][\d]+)?)\s*(.*)$/);
    if (!m || !m[1].trim()) return { name: s, amount: null, unit: "", pre: false };
    return { name: m[1].trim(), amount: parseFloat(m[2].replace(",", ".")), unit: m[3].trim(), pre: false };
  };
  shopCat = () => "Sonstiges"; isBasic = () => false; normKey = (t) => t.toLowerCase();
}

// ---- Wortlisten für die Prüfung
// Mengenwörter, die der Parser NICHT als Einheit kennt (landen im Namen -> major)
const PSEUDO_UNITS = ["stiel", "stiele", "stielen", "zweig", "zweige", "zweigen", "stange", "stangen", "handvoll", "hand voll",
  "blatt", "blätter", "kopf", "köpfe", "knolle", "knollen", "stück", "stücke", "würfel", "tüte", "tüten", "beutel", "schuss",
  "spritzer", "tropfen", "streifen", "portion", "portionen", "riegel", "flasche", "flaschen", "kugel", "kugeln", "cm", "mm",
  "esslöffel", "teelöffel", "messerspitze", "tasse", "pck", "päckchen", "blättchen", "röschen", "stangen", "zweiglein",
  "scheibe", "paar", "ring", "ringe", "kästchen", "schälchen", "kanne", "liter", "pfund", "lb", "oz", "cup", "cups"];
// Adjektive/Zubereitungswörter am Namensanfang (verhindern Zusammenführung, Abteilungstreffer meist ok -> minor)
const ADJ_SIZE = ["große", "großer", "großes", "grosse", "kleine", "kleiner", "kleines", "mittelgroße", "mittelgroßer", "mittlere",
  "mittlerer", "dicke", "dicker", "dünne", "dünner", "reife", "reifer", "feste", "festkochende", "mehlige", "mehligkochende",
  "vorwiegend", "frische", "frischer", "frisches", "junge", "junger", "halbe", "halber", "halbes", "ganze", "ganzer", "ganzes"];
const ADJ_PREP = ["gehackte", "gehackter", "gehacktes", "gewürfelte", "geriebene", "geriebener", "geriebenes", "gemahlene",
  "gemahlener", "gemahlenes", "getrocknete", "getrockneter", "getrocknetes", "stückige", "passierte", "gekochte", "gekochter",
  "geschälte", "geschälter", "geräucherte", "geräucherter", "gesalzene", "gesalzener", "ungesalzene", "weiche", "zerlassene",
  "flüssige", "zimmerwarme", "kalte", "kalter", "kaltes", "warme", "warmer", "heiße", "heißes", "lauwarme", "lauwarmes",
  "abgetropfte", "eingelegte", "eingelegter", "gemischte", "gemischtes", "gemischter", "fein", "feine", "feiner", "grob", "grobe",
  "grobes", "geröstete", "gerösteter", "altbackenes", "altbackene", "glatte", "glatter"];
// Sortenangaben (saure Sahne, trockener Weißwein, durchwachsener Speck): Hinweis, kein Fehler
const SORTE = ["saure", "saurer", "trockener", "trockene", "edelsüßes", "edelsüß", "griechischer", "griechisches", "helles", "helle",
  "dunkle", "dunkles", "chinesische", "vegetarische", "fermentierte", "süße", "süßer", "mittelscharfer", "durchwachsener",
  "kernige", "zarte", "fester", "festes", "mageres", "magerer", "junger", "alter", "italienische", "italienischer", "weißer"];
const COLOR = ["rote", "roter", "rotes", "grüne", "grüner", "grünes", "gelbe", "gelber", "gelbes", "weiße", "weißer", "weißes",
  "schwarze", "schwarzer", "schwarzes", "braune", "brauner", "braunes", "bunte", "bunter"];

const KNOWN_UNIT = /^(g|kg|mg|ml|cl|dl|l|el|tl|st(k|ück|ueck)?\.?|bund|prisen?|zehen?|dosen?|pck\.?|packung(en)?|p(ä|ae)ckchen|scheiben?|becher|gl(a|ä)s(er)?|tassen?|msp\.?|liter|gramm|kilo)$/i;

function firstWord(name) { return (name.split(/\s+/)[0] || "").toLowerCase().replace(/[.,;:]$/, ""); }

// Prüft eine Zutatenzeile, liefert Liste {sev, code, msg, vorschlag}
function checkLine(s) {
  const out = [];
  const p = parseIng(s);
  const push = (sev, code, msg, vorschlag) => out.push({ sev, code, msg, vorschlag });

  // Rohform: Bereiche, Klammern, "ca.", Dezimalkomma, Bruch mit Schrägstrich
  if (/\d\s*(–|-|—|bis)\s*\d/.test(s)) push("major", "bereich", "Zahlenbereich wird nicht als Menge erkannt (Parser nimmt nur die erste Zahl oder gar keine)", "eine Menge angeben, z. B. die größere");
  if (/\(|\)/.test(s)) push("minor", "klammer", "Klammern landen im Namen", "Klammerinhalt in die Schritte verschieben");
  if (/\bca\.?\s/i.test(s)) push("minor", "ca", "\"ca.\" landet im Namen", "\"ca.\" weglassen");
  if (/\d,\d/.test(s)) push("minor", "komma", "Dezimalkomma (wird zwar gelesen, verstößt aber gegen das Schema)", "Punkt statt Komma oder kleinere Einheit (z. B. 1500 g)");
  if (/\d\s*\/\s*\d/.test(s)) push("major", "bruch", "Bruch mit Schrägstrich wird nicht als Menge erkannt (nur ½ ¼ ¾ ⅓ ⅔)", "Unicode-Bruch oder Dezimalzahl verwenden");
  if (/\d\s*[x×]\s*\d/i.test(s)) push("major", "mal", "\"2 x 400 g\" wird nicht als Gesamtmenge erkannt", "Gesamtmenge angeben, z. B. 800 g");

  if (/\d/.test(s) && !p.pre) {
    push("major", "format-b", `Format B/kein Treffer: name="${p.name}" amount=${p.amount} unit="${p.unit}"`, "Zeile als \"<Zahl> <Einheit> <Name>\" schreiben");
    return out;
  }
  if (p.pre) {
    const fw = firstWord(p.name);
    if (!p.name) push("major", "leer", "Name leer nach dem Zerlegen");
    if (PSEUDO_UNITS.includes(fw)) {
      const vs = {
        stiel: /sellerie/i.test(p.name) ? "Stückzahl, z. B. \"1 Selleriestange\"" : "z. B. \"1 Bund …\" oder nur den Namen",
        stiele: /sellerie/i.test(p.name) ? "Stückzahl, z. B. \"2 Selleriestangen\"" : "z. B. \"1 Bund …\" oder nur den Namen",
        zweig: "Stückzahl im Namen, z. B. \"1 Rosmarinzweig\", oder \"1 Bund …\"", zweige: "Stückzahl im Namen, z. B. \"2 Rosmarinzweige\", oder \"1 Bund …\"", stange: "Stückzahl, z. B. \"1 Lauch\" / \"1 Zimtstange\"", stangen: "Stückzahl, z. B. \"2 Lauch\" / \"2 Zimtstangen\"",
        handvoll: "Gewicht, z. B. \"30 g …\"", blatt: "Stückzahl ohne Blatt, z. B. \"4 Gelatineblätter\"", blätter: "Stückzahl, z. B. \"4 Lorbeerblätter\"",
        kopf: "\"1 Blumenkohl\" / \"1 Salat\"", knolle: "\"1 Sellerie\" oder Gewicht in g", cm: "Gewicht, z. B. \"20 g Ingwer\"", stück: "Stückzahl oder Gewicht",
        schuss: "Menge in ml oder EL", spritzer: "Menge in TL/EL", prise: "\"1 Prise …\"", tasse: "\"1 Tasse …\" (wird erkannt)",
      }[fw] || "bekannte Einheit (g, ml, EL, TL, Bund, Stück, Dose, Glas, Scheiben, Zehen, Prise) oder nur Stückzahl";
      push("major", "pseudo-einheit", `"${fw}" ist keine bekannte Einheit, landet im Namen: name="${p.name}" unit="${p.unit || "-"}"`, vs);
    } else if (ADJ_SIZE.includes(fw)) {
      const rest = p.name.split(/\s+/).slice(1).join(" ");
      const adj = fw.replace(/e[rs]?$/, "");
      push("minor", "adjektiv", `Adjektiv landet im Namen: name="${p.name}"`, `"${fmt(p.amount)}${p.unit ? " " + p.unit : ""} ${rest}, ${adj}"`);
    } else if (ADJ_PREP.includes(fw)) {
      push("minor", "zubereitung", `Zubereitungswort am Namensanfang verhindert Zusammenführen: name="${p.name}"`, "Zubereitung in die Schritte, Zutat ohne Partizip");
    } else if (COLOR.includes(fw)) {
      push("info", "farbe", `Farbwort am Namensanfang: name="${p.name}"`, "ok, wenn es die Sorte ist (rote Linsen); sonst nach hinten");
    } else if (SORTE.includes(fw)) {
      push("info", "sorte", `Sortenangabe am Namensanfang: name="${p.name}"`, "ok; verhindert aber Zusammenführen mit der Grundzutat");
    }
    if (/\b(aus der Dose|aus dem Glas|in Öl|in Lake|aus der Packung)$/i.test(p.name)) push("minor", "zusatz-hinten", `Herkunftszusatz im Namen: name="${p.name}"`, "als Einheit vorn: z. B. \"2 Dosen …\" / \"1 Glas …\"");
    if (p.unit && !KNOWN_UNIT.test(p.unit)) push("major", "einheit-unbekannt", `Einheit "${p.unit}" nicht in der Einheitenliste`);
    if (/\d/.test(p.name) && !/\d\s*%/.test(p.name)) push("minor", "ziffer-im-namen", `Ziffer im Namen: name="${p.name}"`, "zweite Mengenangabe entfernen");
    if (/\d\s*%/.test(p.name)) push("info", "prozent", `Prozentangabe im Namen: name="${p.name}"`, "ok (Bon-Abgleich entfernt Prozentangaben)");
    if (p.amount !== null && p.amount === 0) push("minor", "null", "Menge 0");
    if (/^(und|oder|mit|zum|zur|nach|für|aus|je)\b/i.test(p.name)) push("major", "wortfetzen", `Name beginnt mit Füllwort: name="${p.name}"`);
  } else {
    // reiner Name ohne Zahl: zulässig (Salz, Pfeffer, Öl zum Braten)
    if (p.name.length > 40) push("info", "lang", `langer Freitext ohne Menge: "${p.name}"`, "kürzen oder in die Schritte");
  }
  return out;
}
function fmt(a) { return a === null ? "" : Number.isInteger(a) ? String(a) : String(a); }

// ---- Dateien laden
const args = process.argv.slice(2);
const alle = args.includes("--alle");
const fileArgs = args.filter((a) => !a.startsWith("--"));
const files = fileArgs.length ? fileArgs.map((a) => resolve(a)) : readdirSync(DIR).filter((f) => f.endsWith(".js")).sort().map((f) => join(DIR, f));

console.log(`Parser: ${quelle}`);
const stats = { zeilen: 0, rezepte: 0, major: 0, minor: 0, info: 0 };
const byCode = new Map();
const nameCount = new Map(); // normierter Name -> {n, beispiel, cat, basic}
const catCount = new Map();

for (const f of files) {
  let list;
  try { list = (await import(pathToFileURL(f).href)).default; } catch (e) { console.log(`${f}: Import fehlgeschlagen: ${e.message}`); stats.major++; continue; }
  if (!Array.isArray(list)) { console.log(`${f}: export default ist kein Array`); stats.major++; continue; }
  const rows = [];
  list.forEach((r) => {
    stats.rezepte++;
    (r.ingredients || []).forEach((s) => {
      stats.zeilen++;
      const p = parseIng(s);
      const key = normKey(p.name) || p.name.toLowerCase();
      const cat = shopCat(p.name);
      catCount.set(cat, (catCount.get(cat) || 0) + 1);
      const e = nameCount.get(key) || { n: 0, beispiel: p.name, cat, basic: isBasic(key), roh: new Set() };
      e.n++; e.roh.add(p.name); nameCount.set(key, e);
      for (const b of checkLine(s)) {
        stats[b.sev] = (stats[b.sev] || 0) + 1;
        byCode.set(b.code, (byCode.get(b.code) || 0) + 1);
        rows.push({ rezept: r.name, zeile: s, ...b });
      }
    });
  });
  const shown = rows.filter((r) => alle || r.sev !== "info");
  console.log(`\n${f.replace(ROOT + "/", "")}: ${list.length} Rezepte, ${rows.filter((r) => r.sev === "major").length} major, ${rows.filter((r) => r.sev === "minor").length} minor, ${rows.filter((r) => r.sev === "info").length} info`);
  for (const r of shown) console.log(`  [${r.sev}] ${r.rezept}: "${r.zeile}" -> ${r.msg}${r.vorschlag ? " | Vorschlag: " + r.vorschlag : ""}`);
}

console.log(`\nSumme: ${stats.rezepte} Rezepte, ${stats.zeilen} Zutatenzeilen, ${stats.major} major, ${stats.minor} minor, ${stats.info} info`);
console.log("Befunde je Art: " + [...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", "));

// ---- Abteilungen
console.log("\nVerteilung der Abteilungen (shopCat über den geparsten Namen):");
for (const [c, n] of [...catCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);

const sonst = [...nameCount.entries()].filter(([, e]) => e.cat === "Sonstiges").sort((a, b) => b[1].n - a[1].n);
const sonstBasic = sonst.filter(([, e]) => e.basic);
const sonstFrei = sonst.filter(([, e]) => !e.basic);
console.log(`\nZutaten ohne Abteilungstreffer: ${sonst.length} verschiedene Namen (${sonst.reduce((a, [, e]) => a + e.n, 0)} Zeilen), davon ${sonstBasic.length} Grundvorrat (isBasic)`);
console.log("Häufigste ohne Treffer, kein Grundvorrat (Top 30):");
sonstFrei.slice(0, 30).forEach(([k, e], i) => console.log(`  ${String(i + 1).padStart(2)}. ${e.beispiel} (${e.n}x; Schlüssel "${k}"${e.roh.size > 1 ? "; Schreibweisen: " + [...e.roh].join(" / ") : ""})`));
console.log("Grundvorrat ohne Treffer (landet im Block \"Vorrat prüfen\"):");
sonstBasic.slice(0, 15).forEach(([k, e]) => console.log(`  ${e.beispiel} (${e.n}x)`));

// Verdächtige Treffer: Stichwort passt, Abteilung passt vermutlich nicht
const VERDACHT = [
  [/kokosmilch|mandelmilch|hafermilch|sojamilch|reismilch/, "Milch & Käse", "Konserven/Trockenwaren"],
  [/erdnussbutter|mandelmus|tahin|sesammus/, "Milch & Käse", "Gewürze & Öle"],
  [/tomatenmark|passierte tomaten|stückige tomaten|gehackte tomaten|dosentomaten|pizzatomaten/, "Obst & Gemüse", "Konserven"],
  [/fischsauce|fischsoße|austernsauce|austernsoße/, "Fleisch & Fisch", "Gewürze & Öle"],
  [/fleischbrühe|rinderbrühe|hühnerbrühe|hühnerfond|rinderfond|fischfond/, "Fleisch & Fisch", "Konserven"],
  [/reisessig|reiswein|apfelessig|balsamico/, /Trockenwaren|Obst & Gemüse/, "Gewürze & Öle"],
  [/kartoffelstärke|speisestärke|maisstärke/, "Obst & Gemüse", "Backwaren/Trockenwaren"],
  [/zitronensaft|limettensaft|orangensaft/, "Obst & Gemüse", "ok, wenn frisch gepresst"],
  [/kräuterbutter|butterschmalz/, "Milch & Käse", "ok"],
  [/eiernudeln|reisnudeln|glasnudeln/, /Milch & Käse|Trockenwaren/, "Trockenwaren"],
  [/knoblauchzehen?/, "Obst & Gemüse", "ok"],
];
console.log("\nVerdächtige Abteilungstreffer (Name -> Abteilung heute | vermutlich besser):");
const seen = new Set();
for (const [k, e] of nameCount) {
  const l = e.beispiel.toLowerCase();
  for (const [re, bad, besser] of VERDACHT) {
    if (re.test(l) && (bad instanceof RegExp ? bad.test(e.cat) : e.cat === bad) && !seen.has(k)) {
      seen.add(k); console.log(`  ${e.beispiel} (${e.n}x) -> ${e.cat} | ${besser}`);
    }
  }
}

process.exit(stats.major ? 1 : 0);
