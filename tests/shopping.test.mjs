// Einkaufsliste: Migration, Posten aus dem Plan, Zutaten hinzufuegen, Zusammenfuehren (mergeShopping), Gruppierung, Teilen-Text
import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateShopping, addIngredients, mergeShopping, groupShopping, shoppingText, makeShopItem, shoppingList, uncheckedCount, orphanIds, addedSlotKeys, scaledIngredients, isListed, nextOrder, onlyNeeded } from "../src/logic/shopping.js";
import { normalizeRecipe } from "../src/logic/recipes.js";
import { pickItems } from "../src/logic/picks.js";
import { SHOP_ORDER } from "../src/data.js";

const T="2026-11-14";
const picks = () => [{id:"a",key:"Pasta Bolognese",day:T,createdAt:1},{id:"b",key:"Pasta Carbonara",day:"",createdAt:2},{id:"c",key:"Reste von gestern",day:"2026-11-16",createdAt:3},{id:"d",key:"Pasta Carbonara",day:"2026-11-01",createdAt:4}];
const recipes = {
  "Pasta Bolognese": normalizeRecipe("Pasta Bolognese", { ingredients:["Pasta 200g","Hackfleisch 300g","Zwiebel 1 St.","Olivenöl 2 EL","Salz"], servings:4 }, 0),
  "Pasta Carbonara": normalizeRecipe("Pasta Carbonara", { ingredients:["Pasta 200g","Speck 100g","Eier 2 St."], servings:4 }, 0),
};

test("migrateShopping: Array -> Objekt mit festen Ids, src plan, key, checked bleibt", () => {
  const out = migrateShopping([{ text:"Pasta 200 g", checked:false, cat:"Trockenwaren" },{ text:"Klopapier", checked:true },{ text:"" },null], 5);
  assert.deepEqual(Object.keys(out), ["alt000","alt001"]);
  assert.equal(out.alt000.src, "plan");
  assert.equal(out.alt000.key, "pasta|g");
  assert.equal(out.alt000.cat, "Trockenwaren");
  assert.equal(out.alt000.order, 1);
  assert.equal(out.alt001.checked, true);
  assert.equal(out.alt001.addedAt, 5);
  // deterministisch: zwei gleichzeitige Migrationen schreiben dasselbe (bis auf den Zeitstempel)
  assert.deepEqual(migrateShopping([{ text:"A" }], 1), migrateShopping([{ text:"A" }], 1));
  assert.deepEqual(migrateShopping(null), {});
});

test("pickItems: Zutaten ueber Rezepte addiert, skaliert auf servings, Gerichte ohne Rezept als (Zutaten pruefen), Grundvorrat markiert, Vergangenes bleibt weg", () => {
  const items = pickItems(picks(), recipes, 0, { servings:4, today:T });
  const texts = Object.values(items).map(i=>i.text);
  assert.ok(texts.includes("Pasta 400 g"), "Pasta aus zwei Rezepten addiert: "+texts);
  assert.ok(texts.includes("Hackfleisch 300 g"), texts);
  assert.ok(texts.includes("Reste von gestern (Zutaten prüfen)"));
  assert.ok(Object.values(items).every(i=>i.src==="plan"&&i.key&&i.order>0));
  const salz = Object.values(items).find(i=>i.text==="Salz"), oel = Object.values(items).find(i=>i.text.startsWith("Olivenöl"));
  assert.equal(salz.basic, true);
  assert.equal(oel.basic, true);
  assert.equal(Object.values(items).find(i=>i.text==="Pasta 400 g").basic, undefined);
  assert.equal(Object.values(items).find(i=>i.text.includes("Zutaten prüfen")).cat, "Sonstiges");
  // Haushalt mit 2 Personen: Mengen halbiert
  const half = pickItems(picks(), recipes, 0, { servings:2, today:T });
  const ht = Object.values(half).map(i=>i.text);
  assert.ok(ht.includes("Pasta 200 g"), ht);
  assert.ok(ht.includes("Hackfleisch 150 g"), ht);
  assert.ok(ht.includes("Eier 1 St."), ht);
});

test("scaledIngredients rechnet auf die Haushaltsgroesse um", () => {
  assert.deepEqual(scaledIngredients(recipes["Pasta Carbonara"], 2), ["Pasta 100 g","Speck 50 g","Eier 1 St."]);
  assert.deepEqual(scaledIngredients(recipes["Pasta Carbonara"], 4), ["Pasta 200g","Speck 100g","Eier 2 St."]);
  assert.deepEqual(scaledIngredients(recipes["Pasta Carbonara"], 0), ["Pasta 200g","Speck 100g","Eier 2 St."]);
});

test("addIngredients: gleiche Zutat erhoeht die Menge (Feld-PATCH), neue kommen dazu, Plan-Zelle wird am Posten gemerkt", () => {
  const cur = { a: makeShopItem("Pasta 200 g", { src:"manuell", order:1, now:0 }) };
  const { next, patch } = addIngredients(cur, ["Pasta 100 g","Speck 100 g"], { src:"manuell", now:0, slot:"2026-W41|Mo|Ab|Pasta Carbonara" });
  assert.equal(next.a.text, "Pasta 300 g");
  assert.equal(patch["shopping/a/text"], "Pasta 300 g");
  assert.equal(patch["shopping/a/key"], "pasta|g");
  assert.equal(patch["shopping/a/slots/2026-W41|Mo|Ab|Pasta Carbonara"], true);
  const newIds = Object.keys(next).filter(id=>id!=="a");
  assert.equal(newIds.length, 1);
  assert.equal(next[newIds[0]].text, "Speck 100 g");
  assert.equal(next[newIds[0]].src, "manuell");
  assert.deepEqual(next[newIds[0]].slots, { "2026-W41|Mo|Ab|Pasta Carbonara":true });
  assert.ok(patch["shopping/"+newIds[0]]);
  assert.deepEqual(addedSlotKeys(next), { "2026-W41|Mo|Ab|Pasta Carbonara":true });
  // Einheit anders -> eigener Posten, keine Addition
  const r2 = addIngredients(cur, ["2 Pasta"], { now:0 });
  assert.equal(r2.next.a.text, "Pasta 200 g");
  assert.equal(Object.keys(r2.next).length, 2);
});

test("mergeShopping: Handeintraege bleiben, Haken bleibt bei gleichem key, Mengen neu, Veraltetes verschwindet, nur gezielte Pfade", () => {
  const cur = {
    p1: { text:"Pasta 200 g", checked:true, src:"plan", key:"pasta|g", order:1, cat:"Trockenwaren", addedAt:1 },
    p2: { text:"Zwiebel 1 St.", checked:false, src:"plan", key:"zwiebel|st", order:2, cat:"Obst & Gemüse", addedAt:1 },
    m1: { text:"Klopapier", checked:false, src:"manuell", key:"klopapier|st", order:3, cat:"Sonstiges", addedAt:1 },
    m2: { text:"Pasta 500 g", checked:false, src:"manuell", key:"pasta|g", order:4, cat:"Trockenwaren", addedAt:1 },
  };
  const items = {
    n1: makeShopItem("Pasta 400 g", { src:"plan", order:1, now:0 }),
    n2: makeShopItem("Hackfleisch 300 g", { src:"plan", order:2, now:0 }),
    n3: makeShopItem("Salz", { src:"plan", order:3, now:0 }),
  };
  const { next, patch } = mergeShopping(cur, items);
  // gleicher key: Id und Haken bleiben, Text neu
  assert.equal(next.p1.text, "Pasta 400 g");
  assert.equal(next.p1.checked, true);
  assert.equal(patch["shopping/p1/text"], "Pasta 400 g");
  assert.equal("shopping/p1" in patch, false, "Posten wird nicht als Ganzes geschrieben");
  // nicht mehr gebraucht -> weg
  assert.equal("p2" in next, false);
  assert.equal(patch["shopping/p2"], null);
  // manuell bleibt unangetastet (auch bei gleichem key)
  assert.deepEqual(next.m1, cur.m1);
  assert.deepEqual(next.m2, cur.m2);
  assert.equal(Object.keys(patch).some(k=>k.startsWith("shopping/m")), false);
  // neue Posten kommen hinten dazu, Grundvorrat markiert
  assert.equal(next.n2.text, "Hackfleisch 300 g");
  assert.equal(next.n3.basic, true);
  assert.ok(next.n2.order>4&&next.n3.order>next.n2.order);
  assert.ok(patch["shopping/n2"]&&patch["shopping/n3"]);
  // nie der Schluessel "shopping" als Ganzes
  assert.equal("shopping" in patch, false);
  assert.ok(Object.keys(patch).every(k=>k.startsWith("shopping/")));
});

test("mergeShopping: unveraenderte Menge laesst einen von Hand ergaenzten Zusatz stehen; leere Liste; nichts zu tun", () => {
  const cur = { p1: { text:"Pasta 200 g (Bio)", checked:false, src:"plan", key:"pasta|g", order:1, cat:"Trockenwaren", addedAt:1 } };
  const same = mergeShopping(cur, { n1: makeShopItem("Pasta 200 g", { src:"plan", order:1, now:0 }) });
  assert.equal(same.next.p1.text, "Pasta 200 g (Bio)");
  assert.deepEqual(same.patch, {});
  const empty = mergeShopping({}, { n1: makeShopItem("Pasta 200 g", { src:"plan", order:1, now:0 }) });
  assert.equal(Object.keys(empty.next).length, 1);
  const cleared = mergeShopping(cur, {});
  assert.deepEqual(cleared.next, {});
  assert.deepEqual(cleared.patch, { "shopping/p1": null });
  // Altbestand als Array wird ignoriert statt zu brechen
  assert.deepEqual(mergeShopping([{ text:"x" }], {}).next, {});
});

test("groupShopping: Abteilungsreihenfolge, Sonstiges, alte Namen uebersetzt, abgehakte ans Ende", () => {
  const cur = {
    a: makeShopItem("Klopapier", { order:1, now:0 }),
    b: makeShopItem("Pasta 200 g", { order:2, now:0, checked:true }),
    c: makeShopItem("Reis 200 g", { order:3, now:0 }),
    d: { text:"Tomaten Dose 1 St.", checked:false, src:"plan", key:"tomaten|st", order:4, cat:"Konserven", addedAt:0 },
    e: makeShopItem("Karotten 3 St.", { order:5, now:0 }),
  };
  const g = groupShopping(cur);
  const cats = g.map(x=>x.cat);
  assert.deepEqual(cats, ["Obst & Gemüse","Trockenwaren","Konserven & Gläser","Sonstiges"]);
  assert.ok(cats.every(c=>SHOP_ORDER.includes(c)));
  assert.deepEqual(g.find(x=>x.cat==="Trockenwaren").items.map(i=>i.text), ["Reis 200 g","Pasta 200 g"], "abgehakt rutscht ans Ende");
  // auch eine fertige Liste wird angenommen
  assert.equal(groupShopping(shoppingList(cur)).length, 4);
});

test("shoppingList, uncheckedCount, orphanIds, isListed, nextOrder", () => {
  const cur = {
    a: makeShopItem("Pasta 200 g", { order:2, now:0 }),
    b: makeShopItem("Salz", { src:"plan", order:1, now:0 }),
    c: { checked:true },                      // Waise (Feld-PATCH auf geloeschten Posten)
    d: makeShopItem("Öl", { src:"plan", order:3, now:0, forceBuy:true }),
  };
  assert.deepEqual(shoppingList(cur).map(i=>i.id), ["b","a","d"]);
  assert.deepEqual(orphanIds(cur), ["c"]);
  assert.equal(isListed(cur.b), false, "Grundvorrat steht nicht in der Liste");
  assert.equal(isListed(cur.d), true, "forceBuy holt ihn in die Liste");
  assert.equal(uncheckedCount(cur), 2);
  assert.equal(nextOrder(cur), 4);
});

test("shoppingText: Abteilungen als Ueberschriften, Haken als [x]", () => {
  const cur = { a: makeShopItem("Pasta 200 g", { order:1, now:0, checked:true }), b: makeShopItem("Klopapier", { order:2, now:0 }) };
  assert.equal(shoppingText(cur), "TROCKENWAREN\n[x] Pasta 200 g\n\nSONSTIGES\n[ ] Klopapier");
  assert.equal(shoppingText({}), "");
});

test("mergeShopping: ein per + aus einer Plan-Zelle gekommener Posten wird bei gleichem key Plan-Posten (kein Doppel, keine doppelte Menge)", () => {
  const cur = {
    x1: { text:"Beeren 75 g", checked:true, src:"manuell", key:"beeren|g", order:1, cat:"Obst & Gemüse", addedAt:1, slots:{ "2026-W41|Mo|Fr|Haferflocken mit Beeren":true } },
    m1: { text:"Milch 1 l", checked:false, src:"manuell", key:"milch|ml", order:2, cat:"Milch & Käse", addedAt:1 },
  };
  const items = { n1: makeShopItem("Beeren 150 g", { src:"plan", order:1, now:0 }), n2: makeShopItem("Milch 100 ml", { src:"plan", order:2, now:0 }) };
  const { next, patch } = mergeShopping(cur, items);
  assert.equal(next.x1.text, "Beeren 150 g");
  assert.equal(next.x1.src, "plan");
  assert.equal(next.x1.checked, true);
  assert.deepEqual(next.x1.slots, cur.x1.slots);
  assert.equal(patch["shopping/x1/text"], "Beeren 150 g");
  assert.equal(patch["shopping/x1/src"], "plan");
  assert.equal("n1" in next, false, "kein zweiter Beeren-Posten");
  // von Hand getippte Milch bleibt, Plan-Milch kommt zusaetzlich (bewusst andere Menge)
  assert.deepEqual(next.m1, cur.m1);
  assert.equal(next.n2.text, "Milch 100 ml");
});

test("fmtIng und scaleIng schreiben Dezimalzahlen einheitlich mit Komma", () => {
  const { next } = addIngredients({}, ["Honig 0,5 EL","Honig 0,5 EL"], { now:0 });
  assert.deepEqual(Object.values(next).map(i=>i.text), ["Honig 1 EL"]);
  const r = addIngredients({}, ["Zitrone 0,5 St.","Zitrone 1 St."], { now:0 });
  assert.deepEqual(Object.values(r.next).map(i=>i.text), ["Zitrone 1,5 St."]);
});

test("onlyNeeded: Vorhandenes kommt nicht neu auf die Liste; Grundvorrat und schon gelistete Posten bleiben", () => {
  const items = pickItems(picks(), recipes, 0, { servings:4, today:T });
  const inStock = (text) => /^(Pasta|Speck)/.test(text);
  const texts = (o) => Object.values(o).map(i=>i.text);
  const fresh = onlyNeeded(items, {}, inStock);
  assert.ok(!texts(fresh).some(t=>/^(Pasta|Speck)/.test(t)), "Pasta und Speck sind da und fallen weg");
  assert.ok(texts(fresh).some(t=>/^Hackfleisch/.test(t)) && texts(fresh).some(t=>/^Salz/.test(t)), "Fehlendes und Grundvorrat bleiben");
  // Pasta steht schon auf der Liste: bleibt im Satz, damit mergeShopping den Posten nicht entfernt
  const pasta = Object.values(items).find(i=>/^Pasta/.test(i.text));
  const kept = onlyNeeded(items, { x1:{ ...pasta, checked:true } }, inStock);
  assert.ok(texts(kept).some(t=>/^Pasta/.test(t)) && !texts(kept).some(t=>/^Speck/.test(t)));
  const { next } = mergeShopping({ x1:{ ...pasta, checked:true } }, kept);
  assert.equal(next.x1.checked, true);
  assert.deepEqual(onlyNeeded(null, null, inStock), {});
});

// Mengenauswahl im Einkauf
import { splitQty, joinQty, qtyUnits, readQty, applyQty } from "../src/logic/shopping.js";
import { ingKey, parseIng, shopCat } from "../src/logic/ingredients.js";
test("Mengenauswahl: Posten in Name und Menge trennen und wieder zusammensetzen", () => {
  assert.deepEqual(splitQty("Käse"), {name:"Käse",qty:""});
  assert.deepEqual(splitQty("200 g Käse"), {name:"Käse",qty:"200 g"});
  assert.deepEqual(splitQty("2 Käse"), {name:"Käse",qty:"2"});
  assert.deepEqual(splitQty("Zucchini 750 g"), {name:"Zucchini",qty:"750 g"});
  assert.deepEqual(splitQty("1,5 l Milch"), {name:"Milch",qty:"1,5 l"});
  assert.equal(joinQty("Käse","200 g"), "200 g Käse");
  assert.equal(joinQty("Käse",""), "Käse");
  assert.equal(joinQty("","2"), "");
  ["Käse","200 g Käse","2 Packungen Käse","1,5 l Milch","3 Dosen Tomaten","2 Gläser Pesto","1 Bund Petersilie"].forEach(t=>{ const s=splitQty(t); assert.equal(joinQty(s.name,s.qty), t); });
});
test("Mengenauswahl: Zahl und Einheit antippen", () => {
  assert.equal(applyQty("",{num:"2"}), "2");
  assert.equal(applyQty("2",{num:"3"}), "3");
  assert.equal(applyQty("2",{unit:"Packung"}), "2 Packungen");
  assert.equal(applyQty("2 Packungen",{num:"1"}), "1 Packung");
  assert.equal(applyQty("",{unit:"g"}), "200 g");
  assert.equal(applyQty("2",{unit:"g"}), "200 g");
  assert.equal(applyQty("200 g",{num:"500"}), "500 g");
  assert.equal(applyQty("500 g",{unit:"kg"}), "1 kg");
  assert.equal(applyQty("500 g",{unit:"ml"}), "500 ml");
  assert.equal(applyQty("200 g",{unit:""}), "1");
  assert.equal(applyQty("3 Dosen",{unit:"Glas"}), "3 Gläser");
  assert.equal(applyQty("Bio",{num:"2"}), "2");
  assert.deepEqual(readQty("2 Pck."), {num:"2",unit:"Packung"});
  assert.equal(readQty("2 große"), null);
  assert.equal(readQty("Bio"), null);
});
test("Mengenauswahl: Einheiten je Abteilung, Posten mit Menge bleibt dieselbe Zutat in derselben Abteilung", () => {
  assert.equal(qtyUnits("Käse")[0], "");
  assert.ok(qtyUnits("Käse").includes("g")&&qtyUnits("Käse").includes("Scheiben"));
  assert.ok(qtyUnits("Tomaten Dose").includes("Dose"));
  assert.ok(qtyUnits("Wasser").includes("l"));
  assert.ok(qtyUnits("Klopapier").includes("Packung"));
  // jede angebotene Einheit wird vom Zutaten-Parser als Einheit erkannt (Name bleibt "Käse")
  ["","g","kg","ml","l","Packung","Dose","Glas","Becher","Bund","Scheiben"].forEach(u=>{
    ["1","2"].forEach(n=>{ const t=joinQty("Käse",applyQty(n,{unit:u}).replace(/^\S+/,n)); const p=parseIng(t); assert.equal(p.name,"Käse",t); if(u!=="Dose"&&u!=="Glas") assert.equal(shopCat(t),"Milch & Käse",t); assert.equal(ingKey(t).split("|")[0],ingKey("Käse").split("|")[0],t); });
  });
});
