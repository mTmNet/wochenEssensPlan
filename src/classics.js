// Rezept-Basis (intern "classics"): zusammengeführte Liste aller Gerichte aus src/classics/*.js.
// Nur Daten, keine Logik. Aufbau der Einträge: docs/ARCHITEKTUR.md Abschnitt 3 ("Recipe") und docs/KLASSIKER.md.
// Den Schlüssel eines Eintrags bildet die App mit recKey(name) aus src/logic/recipes.js.
import deutsch from "./classics/deutsch.js";
import italienisch from "./classics/italienisch.js";
import modernAlltag from "./classics/modern-alltag.js";
import orientAsien from "./classics/orient-asien.js";
import schwaebisch from "./classics/schwaebisch.js";

const byCategoryThenName = (a, b) =>
  a.category.localeCompare(b.category, "de") || a.name.localeCompare(b.name, "de");

export const CLASSICS = [...schwaebisch, ...deutsch, ...italienisch, ...orientAsien, ...modernAlltag].sort(byCategoryThenName);
