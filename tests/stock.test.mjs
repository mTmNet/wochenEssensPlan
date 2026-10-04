// Punktzahl fuer "Heute" (Bauplan Abschnitt 7) und Bestand aus dem Haushaltsbuch
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreRecipe, hbStock, ingStatus, pickFoodCat, goneKey, fadeDays, fadeTable, STOCK_MIN } from "../src/logic/stock.js";
import { normalizeRecipe } from "../src/logic/recipes.js";

const NOW = "2026-10-04";

test("scoreRecipe ohne Haushaltsbuch: Abdeckung 0, Bewertung*4, gekocht*3 (max 5), -25 wenn frisch gekocht", () => {
  const plain = scoreRecipe(normalizeRecipe("A", { ingredients:["Pasta 200g","Hackfleisch 300g"] }, 0), [], NOW);
  assert.equal(plain.cov, 0);
  assert.equal(plain.score, 0);
  assert.equal(plain.ds, null);
  const rated = scoreRecipe(normalizeRecipe("B", { ingredients:["Pasta 200g"], rating:4 }, 0), [], NOW);
  assert.equal(rated.score, 16);
  const cooked = scoreRecipe(normalizeRecipe("C", { ingredients:["Pasta 200g"], rating:4, cooked:["2026-08-01","2026-08-10","2026-09-01"] }, 0), [], NOW);
  assert.equal(cooked.times, 3);
  assert.equal(cooked.score, 16+9);
  const many = scoreRecipe(normalizeRecipe("D", { ingredients:["Pasta 200g"], cooked:["2026-01-01","2026-02-01","2026-03-01","2026-04-01","2026-05-01","2026-06-01","2026-07-01"] }, 0), [], NOW);
  assert.equal(many.score, 15);                                   // hoechstens 5 Kochvorgaenge zaehlen
  const recent = scoreRecipe(normalizeRecipe("E", { ingredients:["Pasta 200g"], rating:5, cooked:["2026-10-01"] }, 0), [], NOW);
  assert.equal(recent.recent, true);
  assert.equal(recent.ds, 3);
  assert.equal(recent.score, 20+3-25);
  const week = scoreRecipe(normalizeRecipe("F", { ingredients:["Pasta 200g"], cooked:["2026-09-27"] }, 0), [], NOW);
  assert.equal(week.recent, false);                                // genau 7 Tage her zaehlt nicht mehr als frisch
});

test("scoreRecipe mit Bestand: Abdeckung zaehlt nur Nicht-Basics", () => {
  const book = { entries: { e1: { date: NOW, category:"Lebensmittel", items:[
    { name:"Spaghetti Barilla", amount:1.79, sub:"Trockenwaren" },
    { name:"Rinderhack 500g", amount:4.99, sub:"Fleisch" },
  ]}}};
  const stock = hbStock(book, "Lebensmittel");
  assert.ok(stock.length>=2);
  const r = scoreRecipe(normalizeRecipe("G", { ingredients:["Pasta 200g","Salz","Olivenoel 2 EL"] }, 0), stock, NOW);
  assert.equal(r.core.length, 1);                                   // Salz und Oel sind Basics
  assert.ok(r.cov>0.9, "Pasta ist frisch gekauft: "+r.cov);
  assert.ok(r.score>90);
  assert.equal(ingStatus("Salz", stock).basic, true);
});

test("hbStock liefert das juengste Einkaufsdatum je Lebensmittel (last)", () => {
  const d = (n) => { const x = new Date(Date.now() - n * 86400000); return x.toISOString().slice(0, 10); };
  const book = { entries: {
    a: { date: d(10), category: "Lebensmittel", items: [{ name: "Milch", amount: 1, sub: "Milchprodukte" }] },
    b: { date: d(2),  category: "Lebensmittel", items: [{ name: "Vollmilch", amount: 1, sub: "Milchprodukte" }] },
  } };
  const st = hbStock(book, "Lebensmittel");
  const milch = st.find((s) => s.key.includes("milch"));
  assert.ok(milch, "Milch im Vorrat");
  assert.equal(milch.last, d(2), "juengstes Datum gewinnt");
});

test("pickFoodCat waehlt Lebensmittel, sonst die Rubrik mit den meisten Positionen", () => {
  assert.equal(pickFoodCat({ categories: ["Drogerie", "Lebensmittel", "Sonstiges"] }), "Lebensmittel");
  assert.equal(pickFoodCat({ categories: ["Essen & Trinken", "Drogerie"] }), "Essen & Trinken");
  const book = { categories: ["Haushalt", "Einkauf"], entries: {
    a: { date: "2026-10-01", category: "Haushalt", items: [{ name: "Spülmittel", amount: 1 }] },
    b: { date: "2026-10-01", category: "Einkauf", items: [{ name: "Brot", amount: 1 }, { name: "Milch", amount: 1 }] },
  } };
  assert.equal(pickFoodCat(book), "Einkauf");
  assert.equal(pickFoodCat(null), "Lebensmittel");
});

test("hbStock: gone-Markierung streicht eine Position, bis nach dem Datum neu gekauft wurde", () => {
  const d = (n) => { const x = new Date(Date.now() - n * 86400000); return x.toISOString().slice(0, 10); };
  const book = { entries: {
    a: { date: d(3), category: "Lebensmittel", items: [{ name: "Milch", amount: 1, sub: "Milchprodukte" }, { name: "Tomaten", amount: 1, sub: "Gemüse" }] },
  } };
  const all = hbStock(book, "Lebensmittel");
  assert.equal(all.length, 2);
  const gone = { [goneKey(all.find((s) => s.key.includes("milch")).key)]: d(1) };   // gestern gestrichen, Einkauf war davor
  const st = hbStock(book, "Lebensmittel", gone);
  assert.deepEqual(st.map((s) => s.key), all.filter((s) => !s.key.includes("milch")).map((s) => s.key), "Milch ist weg");
  const again = hbStock(book, "Lebensmittel", { [Object.keys(gone)[0]]: d(5) });   // Streichung aelter als der Einkauf
  assert.equal(again.length, 2, "neuer Einkauf nach der Streichung bringt die Position zurueck");
  assert.equal(goneKey("tomaten dose.1 #x/y"), "tomaten_dose1_xy", "Schluessel ohne Firebase-Sonderzeichen");
});

test("hbStock: left = Tage bis zum Verblassen (zwei Halbwertszeiten, hoechstens 90)", () => {
  const d = (n) => { const x = new Date(Date.now() - n * 86400000); return x.toISOString().slice(0, 10); };
  const book = { entries: {
    a: { date: d(2), category: "Lebensmittel", items: [{ name: "Lachs", amount: 1, sub: "Fisch" }, { name: "Kokosmilch", amount: 1, sub: "Konserven" }] },
  } };
  const st = hbStock(book, "Lebensmittel");
  const fisch = st.find((s) => s.key.includes("lachs")), nudeln = st.find((s) => s.key.includes("kokos"));
  assert.equal(fadeDays(2), 4, "Fisch: Halbwertszeit 2 Tage -> nach 4 Tagen unter 25 %");
  assert.equal(fisch.left, 2, "Lachs vor 2 Tagen gekauft: noch 2 Tage");
  assert.equal(fadeDays(45), 90, "uebrige Vorraete: 90 Tage (Fenster)");
  assert.equal(nudeln.left, 88);
  assert.ok(Math.abs(Math.pow(0.5, fadeDays(2) / 2) - STOCK_MIN) < 1e-9, "fadeDays trifft genau STOCK_MIN");
  const tbl = fadeTable();
  assert.equal(tbl[0].days, 4); assert.deepEqual(tbl[0].labels, ["Fisch"]);
  assert.ok(tbl[tbl.length - 1].labels.includes("übrige Vorräte"));
  assert.ok(tbl.every((r, i) => i === 0 || r.days > tbl[i - 1].days), "aufsteigend, keine doppelten Tage");
});
