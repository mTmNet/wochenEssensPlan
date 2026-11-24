// Vorrat schlauer: Haltbarkeit je Zutat, Lernen ohne Haushaltsbuch, Kochen zieht Zutaten ab
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStock, learnHalfLives, cookUse, goneUse, staleUsed, productStart, stockP, goneDays, usedFactor, STOCK_MIN } from "../src/logic/stock.js";
import { shelfOf, freshP, cookLeft } from "../src/logic/shelf.js";

const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const TODAY = d(0);

test("Haltbarkeitstabelle: Wort, Mehrzahl und Zusammensetzung; nur fuer Frisches", () => {
  assert.equal(shelfOf("zwiebel").hl, 14);
  assert.equal(shelfOf("zwiebeln").hl, 14);
  assert.equal(shelfOf("kirschtomaten").s, 6, "Kompositum findet Tomaten");
  assert.equal(shelfOf("knoblauchzehen").hl, 21);
  assert.equal(shelfOf("pasta"), null);
  assert.deepEqual(productStart("kartoffeln", "Gemüse"), { hl:14, s:30 }, "Kartoffeln halten laenger als die Gemuese-Gruppe");
  assert.deepEqual(productStart("paprika", "Gemüse"), { hl:4, s:7 }, "Paprika: Gruppenzeit, dazu Haltbarkeit");
  assert.deepEqual(productStart("tomaten", "Konserven"), { hl:45, s:0 }, "Tomaten aus der Dose verderben nicht nach 6 Tagen");
  assert.deepEqual(productStart("tiefkuehlerbsen", "Tiefkühl"), { hl:60, s:0 });
});

test("Haltbarkeit wirkt als Obergrenze: lange fast sicher, um s herum steil", () => {
  assert.ok(freshP(1, 2) > 0.85);
  assert.equal(freshP(2, 2), 0.5);
  assert.ok(freshP(4, 2) < 0.01);
  assert.equal(freshP(100, 0), 1, "ohne Haltbarkeit kein Abzug");
  assert.ok(stockP(1, 3, 2) < Math.pow(0.5, 1/3), "Hack nach einem Tag etwas unter dem reinen Verblassen");
  assert.ok(stockP(3, 3, 2) < STOCK_MIN, "Hack nach drei Tagen weg");
  assert.equal(goneDays(2, 0), 4, "ohne Haltbarkeit wie bisher zwei Halbwertszeiten");
  assert.equal(goneDays(3, 2), 3);
});

test("buildStock: Hackfleisch faellt nach 3 Tagen raus, Kartoffeln bleiben laenger als frueher", () => {
  const items = { a:{ name:"Hackfleisch", sub:"Fleisch", date:d(3), src:"einkauf" }, b:{ name:"Kartoffeln", sub:"Gemüse", date:d(10), src:"einkauf" } };
  const st = buildStock({ items });
  assert.equal(st.find(s=>s.key==="hackfleisch").p < STOCK_MIN, true);
  const k = st.find(s=>s.key==="kartoffeln");
  assert.ok(k.p > 0.5, "Kartoffeln nach 10 Tagen noch eher da: "+k.p);
  assert.ok(k.left > 10, "noch viele Tage: "+k.left);
});

test("Verbrauch (stock/used): ganz weg, halb da, neuer Kauf zaehlt wieder voll", () => {
  const items = {
    h:{ name:"Hackfleisch", sub:"Fleisch", date:TODAY, src:"einkauf", createdAt:1000 },
    k:{ name:"Gouda", sub:"Käse", date:TODAY, src:"einkauf", createdAt:1000 },
  };
  const used = { hackfleisch:{ d:TODAY, f:0, at:2000 }, gouda:{ d:TODAY, f:0.5, at:2000 } };
  const st = buildStock({ items, used });
  assert.equal(st.find(s=>s.key==="hackfleisch"), undefined, "Hack nach dem Kochen weg");
  const g = st.find(s=>s.key==="gouda");
  assert.ok(g && g.p > 0.4 && g.p <= 0.5, "Gouda halb: "+(g&&g.p));
  const again = buildStock({ items:{ ...items, n:{ name:"Hackfleisch", sub:"Fleisch", date:TODAY, src:"einkauf", createdAt:3000 } }, used });
  assert.ok(again.find(s=>s.key==="hackfleisch").p > 0.9, "nach dem Kochen neu gekauft: wieder da");
  assert.equal(usedFactor({ d:d(2), f:0 }, d(1)), 1, "Kauf nach dem Verbrauch zaehlt voll (ohne Zeitstempel nach Datum)");
  assert.equal(usedFactor({ d:d(1), f:0 }, d(2)), 0);
  assert.equal(usedFactor(null, TODAY), 1);
});

test("cookUse: Frisches ganz, Kaese halb, Grundvorrat und Dauervorrat bleiben, nur eindeutige Treffer", () => {
  const items = {
    h:{ name:"Hackfleisch", sub:"Fleisch", date:d(1), src:"einkauf" },
    k:{ name:"Gouda", sub:"Käse", date:d(1), src:"einkauf" },
    z:{ name:"Zwiebeln", sub:"Gemüse", date:d(1), src:"einkauf" },
    t:{ name:"Dosentomaten", sub:"Konserven", date:d(1), src:"einkauf" },
  };
  const perm = { pasta:{ name:"Spaghetti", sub:"Trockenwaren" } };
  const stock = buildStock({ items, perm });
  const r = cookUse(["Hackfleisch 400 g","Spaghetti 300 g","Gouda gerieben 100 g","2 Zwiebeln","Tomaten 3","Salz","Olivenöl 2 EL"], stock, {}, TODAY, 5000);
  assert.deepEqual(Object.keys(r.entries).sort(), ["gouda","hackfleisch","zwiebeln"]);
  assert.equal(r.entries.hackfleisch.f, 0);
  assert.equal(r.entries.gouda.f, 0.5);
  assert.equal(r.entries.zwiebeln.f, 0.5);
  assert.equal(r.entries.hackfleisch.via, "koch");
  assert.equal(r.entries.hackfleisch.from, d(1));
  assert.equal(r.prev.gouda, null);
  assert.deepEqual(r.names.map(n=>n.name).sort(), ["Gouda","Hackfleisch","Zwiebeln"]);
  // Zweimal mit Kaese gekocht, ohne neu zu kaufen: ein Viertel
  const r2 = cookUse(["Gouda 100 g"], stock, { gouda:{ d:TODAY, f:0.5, at:5000 } }, TODAY, 6000);
  assert.equal(r2.entries.gouda.f, 0.25);
  assert.deepEqual(r2.prev.gouda, { d:TODAY, f:0.5, at:5000 });
  // Nach dem Abzug ist es aus dem Vorrat
  const after = buildStock({ items:{ ...items, h:{ ...items.h, createdAt:1 } }, perm, used:r.entries });
  assert.equal(after.find(s=>s.key==="hackfleisch"), undefined);
  assert.ok(after.find(s=>s.key==="pasta").p === 1, "Dauervorrat bleibt");
  assert.equal(cookLeft("lachs","Fisch"), 0);
  assert.equal(cookLeft("joghurt","Milchprodukte"), 0.5);
  assert.equal(cookLeft("unbekannt","Gemüse"), 0, "ohne Tabelle entscheidet die Gruppe");
});

test("cookUse: mehrdeutig ohne genauen Treffer zieht nichts ab", () => {
  const items = { a:{ name:"rote Paprika", date:d(1), src:"einkauf" }, b:{ name:"Paprika gelb", date:d(1), src:"einkauf" } };
  const stock = [
    { key:"paprika rot", toks:["paprika","rot"], p:0.9, name:"Paprika rot", sub:"Gemüse", last:d(1) },
    { key:"paprika gelb", toks:["paprika","gelb"], p:0.9, name:"Paprika gelb", sub:"Gemüse", last:d(1) },
  ];
  assert.deepEqual(cookUse(["Paprika 2"], stock, {}, TODAY).names, []);
  assert.ok(items);
});

test("learnHalfLives ohne Haushaltsbuch: abgehakte Einkaeufe, Kochen und x lernen", () => {
  const items = {
    a:{ name:"Milch", sub:"Milchprodukte", date:d(12), src:"einkauf" },
    b:{ name:"Milch", sub:"Milchprodukte", date:d(8), src:"einkauf" },
    c:{ name:"Milch", sub:"Milchprodukte", date:d(4), src:"einkauf" },
    h:{ name:"Hackfleisch", sub:"Fleisch", date:d(6), src:"einkauf" },
    f:{ name:"Feta", sub:"Käse", date:d(9), src:"foto" },
  };
  const L = learnHalfLives(null, null, null, undefined, undefined, { items, used:{ hackfleisch:{ d:d(5), f:0, at:1, from:d(6) } } });
  assert.ok(L.milch && L.milch.n === 2, "zwei Kaufabstaende aus der Einkaufsliste");
  assert.ok(L.milch.hl < 7, "Milch alle 4 Tage: kuerzer als der Startwert: "+L.milch.hl);
  assert.ok(L.hackfleisch && L.hackfleisch.n === 1 && L.hackfleisch.hl < 3, "einen Tag nach dem Kauf verkocht: "+JSON.stringify(L.hackfleisch));
  assert.equal(L.feta, undefined, "Foto ist kein Kauf");
  // x bei eigener Position: der Einkauf ist geloescht, das Kaufdatum steht im Verbrauch
  const Lx = learnHalfLives(null, null, null, undefined, undefined, { items:{}, used:{ brokkoli:goneUse({ last:d(9), sub:"Gemüse" }, d(1), 1) } });
  assert.ok(Lx.brokkoli && Lx.brokkoli.n === 1 && Lx.brokkoli.hl === 4, "8 Tage gehalten, Startwert 4: "+JSON.stringify(Lx.brokkoli));
  // Halbes Abziehen beim Kochen ist kein Ende
  const Lh = learnHalfLives(null, null, null, undefined, undefined, { items:{ k:{ name:"Gouda", sub:"Käse", date:d(6), src:"einkauf" } }, used:{ gouda:{ d:d(3), f:0.5, at:1 } } });
  assert.equal(Lh.gouda, undefined);
});

test("learnHalfLives: 'ist noch da' verlaengert, ohne ein Ende zu behaupten", () => {
  const items = {
    a:{ name:"Brokkoli", sub:"Gemüse", date:d(30), src:"einkauf" },
    b:{ name:"Brokkoli", sub:"Gemüse", date:d(20), src:"einkauf" },
    c:{ name:"Brokkoli", sub:"Gemüse", date:d(12), src:"check" },
  };
  const L = learnHalfLives(null, null, null, undefined, undefined, { items });
  assert.equal(L.brokkoli.n, 2, "ein Abstand und eine Bestaetigung");
  const ohne = learnHalfLives(null, null, null, undefined, undefined, { items:{ a:items.a, b:items.b } });
  assert.ok(L.brokkoli.hl > ohne.brokkoli.hl, "Bestaetigung nach 8 Tagen hebt die Halbwertszeit: "+L.brokkoli.hl+" > "+ohne.brokkoli.hl);
});

test("staleUsed: Eintraege aelter als 90 Tage fallen weg", () => {
  assert.deepEqual(staleUsed({ a:{ d:d(100), f:0 }, b:{ d:d(3), f:0 }, c:null }), ["a","c"]);
});
