// Punktzahl fuer "Heute" (Bauplan Abschnitt 7) und Bestand aus dem Haushaltsbuch
import { test } from "node:test";
import assert from "node:assert/strict";
import { stockLevel, scoreRecipe, hbStock, ingStatus, pickFoodCat, goneKey, fadeDays, fadeTable, STOCK_MIN, learnHalfLives, buildStock, guessGroup, shopStockId, shopStockItem } from "../src/logic/stock.js";
import { normalizeRecipe } from "../src/logic/recipes.js";

const NOW = "2026-10-04";                                   // fester Bezugstag fuer die Kochhistorie-Rechnung
const TODAY = new Date().toISOString().slice(0, 10);       // echter Tag fuer hbStock (rechnet mit Date.now())

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
  const book = { entries: { e1: { date: TODAY, category:"Lebensmittel", items:[
    { name:"Spaghetti Barilla", amount:1.79, sub:"Trockenwaren" },
    { name:"Rinderhack 500g", amount:4.99, sub:"Fleisch" },
  ]}}};
  const stock = hbStock(book, "Lebensmittel");
  assert.ok(stock.length>=2);
  const r = scoreRecipe(normalizeRecipe("G", { ingredients:["Pasta 200g","Salz","Olivenoel 2 EL"] }, 0), stock, TODAY);
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

test("learnHalfLives: Kaufabstaende und x-Streichung lernen die Halbwertszeit je Produkt", () => {
  const d = (n) => { const x = new Date(Date.now() - n * 86400000); return x.toISOString().slice(0, 10); };
  const book = { entries: {
    a: { date: d(20), category:"L", items:[{ name:"Vollmilch", amount:1, sub:"Milchprodukte" }] },
    b: { date: d(15), category:"L", items:[{ name:"Vollmilch", amount:1, sub:"Milchprodukte" }] },
    c: { date: d(10), category:"L", items:[{ name:"Vollmilch", amount:1, sub:"Milchprodukte" }, { name:"Brokkoli", amount:1, sub:"Gemüse" }] },
    e: { date: d(5),  category:"L", items:[{ name:"Vollmilch", amount:1, sub:"Milchprodukte" }] },
  } };
  const L = learnHalfLives(book, "L", {});
  assert.ok(L.vollmilch && L.vollmilch.n === 3, "drei Abstaende");
  assert.ok(L.vollmilch.hl < 7 && L.vollmilch.hl > 3, "Milch alle 5 Tage -> Halbwertszeit unter dem Startwert 7: "+L.vollmilch.hl);
  assert.equal(L.brokkoli, undefined, "ein Kauf = kein Signal");
  const Lg = learnHalfLives(book, "L", { brokkoli: d(7) });   // 3 Tage nach dem Kauf gestrichen
  assert.ok(Lg.brokkoli && Lg.brokkoli.n === 1 && Lg.brokkoli.hl < 4, "x-Streichung nach 3 Tagen verkuerzt: "+JSON.stringify(Lg.brokkoli));
  const st = buildStock({ book, cat:"L", learned:L });
  assert.ok(st.find(s=>s.key==="vollmilch").learnedN === 3, "Liste traegt die Anzahl der Lernsignale");
});

test("buildStock: Haushaltsbuch, eigene Positionen und Dauervorrat in einer Liste", () => {
  const d = (n) => { const x = new Date(Date.now() - n * 86400000); return x.toISOString().slice(0, 10); };
  const book = { entries: { a: { date: d(3), category:"L", items:[{ name:"Brokkoli", amount:1, sub:"Gemüse" }, { name:"Vollmilch", amount:1, sub:"Milchprodukte" }] } } };
  const items = { x:{ name:"Spaghetti", sub:"Trockenwaren", date:d(1), src:"foto" }, y:{ name:"Brokkoli", sub:"Gemüse", date:d(0), src:"hand" }, z:{ name:"Salz", sub:"Sonstiges", date:d(0), src:"hand" } };
  const perm = { spaghetti:{ name:"Spaghetti", sub:"Trockenwaren" }, pfeffer:{ name:"Pfeffer" }, reis:{ name:"Reis", sub:"Trockenwaren" } };
  const st = buildStock({ book, cat:"L", items, perm });
  const by = Object.fromEntries(st.map(s=>[s.key,s]));
  assert.equal(by.salz, undefined, "Grundvorrat wird nicht gefuehrt");
  assert.equal(by.pfeffer, undefined, "Dauervorrat ignoriert Grundvorrat");
  assert.ok(by.pasta && by.pasta.permanent && by.pasta.p===1 && by.pasta.ownIds.length===1, "Spaghetti: eigene Position + Dauervorrat");
  assert.ok(by.reis && by.reis.permanent && by.reis.srcs.includes("perm") && by.reis.ownIds.length===0, "Reis nur als Dauervorrat, ohne Kauf");
  assert.ok(by.brokkoli && by.brokkoli.srcs.includes("hb") && by.brokkoli.srcs.includes("hand") && by.brokkoli.last===d(0) && by.brokkoli.ownIds.length===1, "Brokkoli: Haushaltsbuch + Hand, juengstes Datum");
  assert.ok(by.vollmilch && by.vollmilch.srcs.length===1 && by.vollmilch.ownIds.length===0, "Milch nur aus dem Haushaltsbuch");
  assert.ok(st[0].permanent && st[st.length-1].p<=st[1].p, "Dauervorrat zuerst, dann absteigend");
  const gone = buildStock({ book, cat:"L", items, perm, gone:{ brokkoli:d(0) } });
  assert.equal(gone.find(s=>s.key==="brokkoli"), undefined, "x heute streicht Kauf und Handeintrag von heute");
  assert.equal(guessGroup("Kokosmilch"), "Konserven");
  assert.equal(guessGroup("Hähnchenbrust"), "Fleisch");
});

test("guessGroup: Emoji-Tabelle sortiert Gemuese und Obst richtig, Tiefkuehl und Dosen zuerst", () => {
  assert.equal(guessGroup("Brokkoli"), "Gemüse");
  assert.equal(guessGroup("Paprika rot 3er"), "Gemüse");
  assert.equal(guessGroup("Bananen"), "Obst");
  assert.equal(guessGroup("Avocado"), "Obst");
  assert.equal(guessGroup("TK Brokkoli"), "Tiefkühl");
  assert.equal(guessGroup("Erbsen tiefgefroren"), "Tiefkühl");
  assert.equal(guessGroup("Tomaten Dose"), "Konserven");
  assert.equal(guessGroup("Rinderhack 500g"), "Fleisch");
  assert.equal(guessGroup("Jogh Natur"), "Milchprodukte");
  assert.equal(guessGroup("Parmesan Stk"), "Käse");
  assert.equal(guessGroup("Irgendwas"), "Sonstiges");
});

// EINKAUF OHNE HAUSHALTSBUCH: abgehakter Posten der Einkaufsliste wird Vorratseintrag
test("shopStockItem: Name ohne Menge, Gruppe geraten, Herkunft einkauf; Grundvorrat und leere Posten liefern null", () => {
  const a = shopStockItem({ text:"500 g Cocktailtomaten" }, "2026-11-17", 1);
  assert.deepEqual(a, { name:"Cocktailtomaten", sub:"Gemüse", date:"2026-11-17", src:"einkauf", createdAt:1 });
  assert.equal(shopStockItem({ text:"Tomaten 500 g" }, "2026-11-17", 1).name, "Tomaten");
  assert.equal(shopStockItem({ text:"Salz" }, "2026-11-17", 1), null);
  assert.equal(shopStockItem({ text:"Olivenöl 2 EL" }, "2026-11-17", 1), null);
  assert.equal(shopStockItem({ text:"  " }, "2026-11-17", 1), null);
  assert.equal(shopStockItem(null, "2026-11-17", 1), null);
});

test("shopStockId: fest je Posten (zwei Geraete schreiben denselben Eintrag), Firebase-tauglich", () => {
  assert.equal(shopStockId("mabc12xyz"), "ek_mabc12xyz");
  assert.equal(shopStockId("mabc12xyz"), shopStockId("mabc12xyz"));
  assert.ok(!/[.#$\[\]\/\s]/.test(shopStockId("a.b/c d#e")));
});

test("buildStock: abgehakter Einkauf zaehlt ohne Haushaltsbuch als Vorrat und deckt die Rezeptzutat", () => {
  const items = { [shopStockId("p1")]: shopStockItem({ text:"250 g Cocktailtomaten" }, TODAY, 1) };
  const resolve = (raw) => /tomate/i.test(raw) ? { name:"Tomaten", key:"tomaten", src:"regel" } : { name:raw, key:raw.toLowerCase(), src:"" };
  const stock = buildStock({ items, resolve });
  assert.equal(stock.length, 1);
  assert.equal(stock[0].name, "Tomaten");
  assert.deepEqual(stock[0].srcs, ["einkauf"]);
  assert.equal(stock[0].unsorted, false);
  assert.ok(scoreRecipe(normalizeRecipe("T", { ingredients:["400 g Tomaten"] }, 0), stock, TODAY).cov > 0.9);
  const un = buildStock({ items:{ x:{ name:"Klopapier", date:TODAY, src:"einkauf" } }, resolve });
  assert.equal(un[0].unsorted, true);                               // ohne Zuordnung: Hinweis "nicht einsortiert"
});

test("stockLevel: Stufen in Worten an den Grenzen 85, 70 und 50 Prozent", () => {
  assert.equal(stockLevel(1).label, "ist da");
  assert.equal(stockLevel(0.85).label, "ist da");
  assert.equal(stockLevel(0.849).label, "vermutlich da");
  assert.equal(stockLevel(0.7).label, "vermutlich da");
  assert.equal(stockLevel(0.699).label, "eventuell da");
  assert.equal(stockLevel(0.5).label, "eventuell da");
  assert.equal(stockLevel(0.499).label, "eher nicht mehr da");
  assert.equal(stockLevel(0.25).label, "eher nicht mehr da");
  assert.equal(stockLevel(undefined).label, "eher nicht mehr da");
  assert.equal(stockLevel(0.6).tone, "warn");
});
