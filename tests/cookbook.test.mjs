// Kochbuch als Datei: Export, Pruefung einer Datei, Importplan
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportCookbook, parseCookbook, planImport, cookbookFileName, recipeFileName, COOKBOOK_FORMAT } from "../src/logic/cookbook.js";

const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const recipes = {
  "Pasta Bolognese": {name:"Pasta Bolognese", ingredients:["500 g Hackfleisch","Tomaten"], steps:["Anbraten.","Köcheln."], rating:5, notes:"Mehr Oregano", cooked:["2026-10-01"], category:"Hauptgericht", createdAt:1},
  "Geist": {},
};
const images = {"Pasta Bolognese": IMG, "Fremd": IMG, "Geist": "nicht-bild"};

test("exportCookbook: Format, nur echte Rezepte, nur Bilder zu vorhandenen Rezepten", () => {
  const out = exportCookbook(recipes, images, {now:1700000000000});
  assert.equal(out.format, COOKBOOK_FORMAT);
  assert.equal(out.count, 1);
  assert.deepEqual(Object.keys(out.recipes), ["Pasta Bolognese"]);
  assert.equal(out.recipes["Pasta Bolognese"].rating, 5);
  assert.equal(out.recipes["Pasta Bolognese"].lastCooked, "2026-10-01");
  assert.deepEqual(Object.keys(out.images), ["Pasta Bolognese"]);
  assert.equal(out.exportedAt, "2023-11-14T22:13:20.000Z");
  assert.match(cookbookFileName(1700000000000), /^wochenplan-kochbuch-2023-11-1[45]\.json$/);
});

test("parseCookbook: Export-Datei, rohe Rezeptsammlung, Fehler bei Unsinn", () => {
  const text = JSON.stringify(exportCookbook(recipes, images, {now:5}));
  const p = parseCookbook(text, 9);
  assert.equal(p.count, 1);
  assert.equal(p.recipes["Pasta Bolognese"].notes, "Mehr Oregano");
  assert.equal(p.images["Pasta Bolognese"], IMG);
  // rohe Sammlung (plans/<CODE>/recipes aus der Konsole) geht auch; Schluessel kommt aus dem Namen
  const raw = parseCookbook(JSON.stringify({"irgendein/key": {name:"Käsespätzle", ingredients:["Spätzle"], steps:["Schichten."]}}), 9);
  assert.deepEqual(Object.keys(raw.recipes), ["Käsespätzle"]);
  assert.throws(()=>parseCookbook("kein json"), /kein lesbares JSON/);
  assert.throws(()=>parseCookbook("[1,2]"), /kein Kochbuch/);
  assert.throws(()=>parseCookbook(JSON.stringify({format:"anderes-format",recipes:{}})), /Unbekanntes Dateiformat/);
  assert.throws(()=>parseCookbook(JSON.stringify({format:COOKBOOK_FORMAT,recipes:{a:{name:"Leer"}}})), /kein vollständiges Rezept/);
  assert.throws(()=>parseCookbook(JSON.stringify({hallo:"welt"})), /keine Rezepte/);
});

test("planImport: neu, ueberspringen oder ersetzen (createdAt bleibt), Bilder nur zu uebernommenen Rezepten", () => {
  const incoming = parseCookbook(JSON.stringify({format:COOKBOOK_FORMAT, recipes:{
    "Pasta Bolognese": {name:"Pasta Bolognese", ingredients:["Hack"], steps:["Neu."], rating:3, createdAt:99},
    "Neu": {name:"Neu", ingredients:["x"], steps:["y"]},
  }, images:{"Pasta Bolognese":IMG,"Neu":IMG}}), 9);
  const existing = {"Pasta Bolognese": {...recipes["Pasta Bolognese"], createdAt:1}};
  const skip = planImport(existing, incoming, "skip");
  assert.deepEqual(skip.added, ["Neu"]); assert.deepEqual(skip.skipped, ["Pasta Bolognese"]); assert.deepEqual(skip.replaced, []);
  assert.deepEqual(Object.keys(skip.images), ["Neu"]);
  const rep = planImport(existing, incoming, "replace");
  assert.deepEqual(rep.replaced, ["Pasta Bolognese"]); assert.deepEqual(rep.added, ["Neu"]);
  assert.equal(rep.recipes["Pasta Bolognese"].rating, 3);
  assert.equal(rep.recipes["Pasta Bolognese"].createdAt, 1);
  assert.deepEqual(Object.keys(rep.images).sort(), ["Neu","Pasta Bolognese"]);
});

test("Einzelnes Rezept: Dateiname lesbar, Datei laesst sich wieder einlesen", () => {
  assert.match(recipeFileName("Käsespätzle mit Röstzwiebeln", 1700000000000), /^rezept-kaesespaetzle-mit-roestzwiebeln-2023-11-1[45]\.json$/);
  assert.match(recipeFileName("Crème brûlée / à la Oma!", 5), /^rezept-creme-brulee-a-la-oma-1970-01-01\.json$/);
  assert.match(recipeFileName("???", 5), /^rezept-ohne-namen-1970-01-01\.json$/);
  assert.ok(recipeFileName("x".repeat(200), 5).length < 80);
  const one = exportCookbook({"Pasta Bolognese": recipes["Pasta Bolognese"]}, {"Pasta Bolognese": IMG}, {now:5});
  assert.equal(one.count, 1);
  const p = parseCookbook(JSON.stringify(one), 9);
  assert.deepEqual(Object.keys(p.recipes), ["Pasta Bolognese"]);
  assert.equal(p.images["Pasta Bolognese"], IMG);
});
