// Rezept-Logik: Schluessel, Normalform, Kochhistorie
import { test } from "node:test";
import assert from "node:assert/strict";
import { recKey, recName, normalizeRecipe, normalizeRecipes, addCooked, cookedCount, cookedLabel, isProven, starterRecipes, DR, isGhostRecipe, ghostKeys, stepMinutes, sortRecipeKeys } from "../src/logic/recipes.js";

test("cookedLabel: Anzahl und Abstand zum letzten Kochen", () => {
  assert.equal(cookedLabel(normalizeRecipe("A", {}, 0)), "noch nie gekocht");
  assert.equal(cookedLabel(normalizeRecipe("B", { cooked:["2026-09-12","2026-09-20","2026-09-22"] }, 0), "2026-10-04"), "3× gekocht, zuletzt vor 12 Tagen");
  assert.equal(cookedLabel(normalizeRecipe("C", { lastCooked:"2026-10-04" }, 0), "2026-10-04"), "1× gekocht, zuletzt heute");
  assert.equal(cookedLabel(normalizeRecipe("D", { cooked:["2026-10-03"] }, 0), new Date(2026, 9, 4, 7)), "1× gekocht, zuletzt gestern");
  // Doppelte Daten zaehlen nur einmal
  assert.equal(cookedLabel(normalizeRecipe("E", { cooked:["2026-10-01","2026-10-01"], lastCooked:"2026-10-01" }, 0), "2026-10-02"), "1× gekocht, zuletzt gestern");
});

test("recKey ersetzt verbotene Zeichen . # $ [ ] / durch Leerzeichen und fasst zusammen", () => {
  assert.equal(recKey("Omas Nudeln. Mit Soße"), "Omas Nudeln Mit Soße");
  assert.equal(recKey("Pizza #1 [scharf] / Nr$2"), "Pizza 1 scharf Nr 2");
  assert.equal(recKey("  Käsespätzle   "), "Käsespätzle");
  assert.equal(recKey("a.b#c$d[e]f/g"), "a b c d e f g");
  assert.equal(recKey(""), "");
  assert.equal(recKey(null), "");
  // Umlaute und Bindestriche bleiben erhalten
  assert.equal(recKey("Hähnchen-Wrap"), "Hähnchen-Wrap");
});

test("normalizeRecipe ergaenzt Felder fuer Altbestand mit meal:'Fr' und lastCooked", () => {
  const raw = { ingredients:["Haferflocken 100g","Milch 200ml"], steps:["Kochen."], cuisine:"Klassisch", meal:"Fr", rating:4, lastCooked:"2026-09-12" };
  const r = normalizeRecipe("Haferflocken mit Beeren", raw, 1000);
  assert.equal(r.name, "Haferflocken mit Beeren");
  assert.equal(r.category, "Frühstück");
  assert.equal(r.cuisine, "Klassisch");
  assert.equal(r.servings, 4);
  assert.equal(r.minutes, null);
  assert.equal(r.source, "eigen");
  assert.equal(r.origin, "");
  assert.equal(r.sourceNote, "");
  assert.equal(r.stepsGenerated, false);
  assert.equal(r.rating, 4);
  assert.equal(r.notes, "");
  assert.deepEqual(r.cooked, ["2026-09-12"]);
  assert.equal(r.lastCooked, "2026-09-12");
  assert.equal(r.createdAt, 1000);
  assert.equal(r.updatedAt, 1000);
  assert.deepEqual(r.ingredients, ["Haferflocken 100g","Milch 200ml"]);
  assert.equal("meal" in r, false);
});

test("normalizeRecipe: meal Mi/Ab wird Hauptgericht, alte Schluessel bekommen den Umlaut-Namen", () => {
  assert.equal(normalizeRecipe("Pasta Bolognese", { meal:"Ab" }, 0).category, "Hauptgericht");
  assert.equal(normalizeRecipe("Pasta Bolognese", { meal:"Mi" }, 0).category, "Hauptgericht");
  assert.equal(normalizeRecipe("Ruehreier", { meal:"Fr" }, 0).name, "Rühreier");
  assert.equal(recName({}, "Gemuesesuppe"), "Gemüsesuppe");
  assert.equal(recName({name:"Eigener Name"}, "Gemuesesuppe"), "Eigener Name");
});

test("normalizeRecipe: vorhandene Felder bleiben, cooked und lastCooked werden zusammengefuehrt", () => {
  const r = normalizeRecipe("X", { name:"X", servings:2, minutes:25, source:"ki", origin:"Toskana", cooked:["2026-10-01","2026-09-01"], lastCooked:"2026-10-03", rating:5.4, createdAt:5, updatedAt:9 }, 100);
  assert.equal(r.servings, 2);
  assert.equal(r.minutes, 25);
  assert.equal(r.source, "ki");
  assert.equal(r.origin, "Toskana");
  assert.deepEqual(r.cooked, ["2026-09-01","2026-10-01","2026-10-03"]);
  assert.equal(r.lastCooked, "2026-10-03");
  assert.equal(r.rating, 5);
  assert.equal(r.createdAt, 5);
  assert.equal(r.updatedAt, 9);
});

test("normalizeRecipe: kaputte Werte werden abgefangen", () => {
  const r = normalizeRecipe("Leer", null, 0);
  assert.equal(r.name, "Leer");
  assert.deepEqual(r.ingredients, []);
  assert.deepEqual(r.steps, []);
  assert.deepEqual(r.cooked, []);
  assert.equal(r.lastCooked, "");
  assert.equal(r.servings, 4);
  // Firebase liefert Arrays manchmal als Objekt mit Indexschluesseln
  const o = normalizeRecipe("Obj", { ingredients:{0:"a",1:"b"}, cooked:{0:"2026-01-02"} }, 0);
  assert.deepEqual(o.ingredients, ["a","b"]);
  assert.deepEqual(o.cooked, ["2026-01-02"]);
});

test("addCooked, cookedCount, isProven", () => {
  const rec = normalizeRecipe("R", { lastCooked:"2026-10-01", rating:3 }, 0);
  assert.deepEqual(addCooked(rec, "2026-10-03"), { cooked:["2026-10-01","2026-10-03"], lastCooked:"2026-10-03" });
  assert.deepEqual(addCooked(rec, "2026-10-01"), { cooked:["2026-10-01"], lastCooked:"2026-10-01" });
  assert.equal(cookedCount(rec), 1);
  assert.equal(isProven(rec), true);
  assert.equal(isProven(normalizeRecipe("S", { rating:5 }, 0)), false);
  assert.equal(isProven(normalizeRecipe("T", { lastCooked:"2026-01-01", rating:2 }, 0)), false);
});

test("normalizeRecipes und starterRecipes liefern Sammlungen in Normalform", () => {
  // Geister (Reste eines geloeschten Rezepts: nur rating/updatedAt, ohne name, ingredients, steps) werden verworfen
  const all = normalizeRecipes({ A:{ ingredients:["Eier 3 St."], meal:"Fr" }, B:null, C:"kaputt", G:{ rating:5, updatedAt:1 } }, 0);
  assert.deepEqual(Object.keys(all), ["A"]);
  assert.equal(isGhostRecipe({ rating:5, updatedAt:1 }), true);
  assert.equal(isGhostRecipe({ name:"X" }), false);
  assert.equal(isGhostRecipe({ steps:["Kochen."] }), false);
  assert.deepEqual(ghostKeys({ A:{ name:"A" }, G:{ rating:5 }, H:{ cooked:["2026-01-01"] } }), ["G","H"]);
  const st = starterRecipes(0);
  assert.equal(Object.keys(st).length, Object.keys(DR).length);
  assert.equal(st["Ruehreier"].name, "Rühreier");
  assert.equal(st["Pasta Bolognese"].category, "Hauptgericht");
  assert.equal(st["Haferflocken mit Beeren"].category, "Frühstück");
  Object.values(st).forEach(r => { assert.equal(r.servings, 4); assert.equal(r.source, "eigen"); });
});

test("Startrezepte: Zutaten mit echten Umlauten", () => {
  const all = Object.values(DR).flatMap(r => r.ingredients).join(" ");
  assert.equal(/Olivenoel|Haehnchenbrust|Roemersalat|Weisswein/.test(all), false);
  assert.match(all, /Olivenöl/);
  assert.match(all, /Hähnchenbrust/);
  assert.match(all, /Römersalat/);
  assert.match(all, /Weißwein/);
});

test("stepMinutes erkennt Zeitangaben fuer Timer-Knoepfe", () => {
  assert.deepEqual(stepMinutes("Dosentomaten unterrühren, 20 Min. köcheln lassen."), [20]);
  assert.deepEqual(stepMinutes("Je 2 Min. pro Seite, 10-15 Minuten ruhen, 1 Stunde garen."), [2, 15, 60]);
  assert.deepEqual(stepMinutes("30 Sekunden rühren."), [0.5]);
  assert.deepEqual(stepMinutes("Kochen."), []);
  assert.deepEqual(stepMinutes("Mindestens 3 Stück nehmen."), []);
});

test("sortRecipeKeys: Zuletzt gekocht, Beste, Neu, A–Z", () => {
  const r = {
    B:normalizeRecipe("B", { name:"Bravo", rating:5, createdAt:1, cooked:["2026-09-01"] }, 0),
    A:normalizeRecipe("A", { name:"Alpha", rating:2, createdAt:3, cooked:["2026-10-01"] }, 0),
    C:normalizeRecipe("C", { name:"Charlie", rating:0, createdAt:2 }, 0),
  };
  assert.deepEqual(sortRecipeKeys(r, "az"), ["A","B","C"]);
  assert.deepEqual(sortRecipeKeys(r, "best"), ["B","A","C"]);
  assert.deepEqual(sortRecipeKeys(r, "new"), ["A","C","B"]);
  assert.deepEqual(sortRecipeKeys(r, "cooked"), ["A","B","C"]);
});
