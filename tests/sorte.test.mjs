// Sorte und Grundzutat: genaue Vorratsnamen (Cocktailtomaten, Parmesan, Schalotten), die trotzdem zu den Rezepten passen
import { test } from "node:test";
import assert from "node:assert/strict";
import { vocabulary, resolveName, unmappedNames, parseSortAnswer, aliasKey, recentHidden, sortKey } from "../src/logic/alias.js";
import { buildStock, ingStatus, cookUse, learnHalfLives } from "../src/logic/stock.js";

const recipes = {
  Bolo: {ingredients:["500 g Hackfleisch","1 Dose Tomaten","2 Zwiebeln","400 g Spaghetti","Parmesan, gerieben","Salz"]},
  Auflauf: {ingredients:["200 g Käse","2 Paprika","Joghurt 150 g","150 g Bergkäse"]},
};
const vocab = vocabulary(recipes, []);
const today = new Date().toISOString().slice(0,10);
const v2 = (name, base, extra={}) => ({name, base, src:"ki", v:2, at:Date.now(), ...extra});

test("Regeltreffer mit Sorte gehen an die KI, schlichte Treffer nicht", () => {
  const ctx = {vocab, alias:{}};
  assert.equal(resolveName("Bio Strauchtomaten 500g", ctx).rough, true);
  assert.equal(resolveName("Rote Zwiebeln 1kg", ctx).rough, true);
  assert.equal(resolveName("Bergkäse", ctx).name, "Bergkäse");          // steht im Vokabular: genau
  assert.equal(resolveName("Zwiebeln 2kg", ctx).rough, undefined);
  assert.equal(resolveName("Spaghetti Barilla", ctx).rough, undefined);
  assert.deepEqual(unmappedNames(["Bio Strauchtomaten 500g","Zwiebeln 2kg","Schalotten"], ctx), ["Bio Strauchtomaten 500g","Schalotten"]);
});

test("Neusortieren: alte KI-Zuordnungen einmal neu, Hand-Zuordnungen und neue nie", () => {
  const alias = {
    [aliasKey("Cherrytom.")]: {name:"Tomaten",src:"ki"},
    [aliasKey("Gouda jung")]: {name:"Gouda",src:"hand"},
    [aliasKey("Schalotten")]: v2("Schalotten","Zwiebeln"),
    [aliasKey("Spülmittel")]: {name:"",src:"ki"},
  };
  assert.deepEqual(unmappedNames(["Cherrytom.","Gouda jung","Schalotten","Spülmittel"], {vocab, alias, resort:true}), ["Cherrytom."]);
  assert.deepEqual(unmappedNames(["Cherrytom.","Gouda jung","Schalotten","Spülmittel"], {vocab, alias}), []);
});

test("resolveName v2: Sorte als Zeile, Farbe bleibt im Schluessel, Grundzutat und Vorschlaege", () => {
  const alias = {
    [aliasKey("ROTE ZWIEB.")]: v2("Rote Zwiebeln","Zwiebeln"),
    [aliasKey("KAESE GER.")]: v2("Käse","Käse",{ask:["Parmesan","Emmentaler"]}),
  };
  const r = resolveName("ROTE ZWIEB.", {vocab, alias});
  assert.equal(r.name, "Rote Zwiebeln"); assert.equal(r.key, "rote zwiebeln"); assert.deepEqual(r.toks, ["zwiebeln"]); assert.equal(r.base, undefined);
  const k = resolveName("KAESE GER.", {vocab, alias});
  assert.equal(k.key, "kaese"); assert.deepEqual(k.ask, ["Parmesan","Emmentaler"]);
  assert.equal(sortKey("Weiße Schokolade"), "weisse schokolade");
});

test("parseSortAnswer: Sorte, Grundzutat in Vokabular-Schreibweise, Vorschlaege nur ab zwei, null = kein Lebensmittel", () => {
  const raws = ["Cherrytom. 250g","Spülmittel","KAESE GER.","Zwiebeln 2kg"];
  const out = parseSortAnswer({zuordnung:[
    {roh:"Cherrytom. 250g",name:"cocktailtomaten",grund:"tomaten"},
    {roh:"Spülmittel",name:null},
    {roh:"KAESE GER.",name:"Käse",grund:"Käse",frage:["parmesan","Emmentaler","Gouda","Feta"]},
    {roh:"Zwiebeln 2kg",name:"Zwiebeln",grund:"Zwiebeln",frage:["Schalotten"]},
    {roh:"Fremd",name:"Egal"}]}, raws, vocab);
  assert.deepEqual(out, {
    "Cherrytom. 250g":{name:"Cocktailtomaten",base:"Tomaten"},
    "Spülmittel":"",
    "KAESE GER.":{name:"Käse",ask:["Parmesan","Emmentaler","Gouda"]},
    "Zwiebeln 2kg":{name:"Zwiebeln"},
  });
});

test("Liste kein Lebensmittel verblasst nach 7 Tagen ohne neuen Einkauf", () => {
  const now = Date.now(), day = 86400000;
  const iso = (t) => new Date(t).toISOString().slice(0,10);
  const alias = {
    alt: {name:"",src:"ki",at:now-30*day,raw:"Spülmittel"},
    neu: {name:"",src:"ki",at:now-30*day,raw:"Pfand"},
    hand: {name:"",src:"hand",at:now-2*day,raw:"Tüte"},
    lm: {name:"Tomaten",src:"ki",at:now},
  };
  const out = recentHidden(alias, {alt:iso(now-21*day), neu:iso(now-1*day)}, now);
  assert.deepEqual(out.map(h=>h.label).sort(), ["Pfand","Tüte"]);
});

test("Rezeptabgleich: Schalotten und rote Zwiebeln fuer Zwiebeln, Parmesan nicht fuer Bergkäse, Lauchzwiebeln keine Zwiebeln", () => {
  const alias = {
    [aliasKey("Schalotten")]: v2("Schalotten","Zwiebeln"),
    [aliasKey("Parmesan Stück")]: v2("Parmesan","Käse"),
    [aliasKey("Lauchzwiebeln Bund")]: v2("Lauchzwiebeln","Frühlingszwiebeln"),
  };
  const ctx = {vocab, alias};
  const resolve = (raw) => resolveName(raw, ctx);
  const items = {a:{name:"Schalotten",sub:"Gemüse",date:today,src:"hand"},b:{name:"Parmesan Stück",sub:"Käse",date:today,src:"hand"},c:{name:"Lauchzwiebeln Bund",sub:"Gemüse",date:today,src:"hand"}};
  const stock = buildStock({items, resolve});
  assert.deepEqual(stock.map(s=>s.name).sort(), ["Lauchzwiebeln","Parmesan","Schalotten"]);
  assert.equal(ingStatus("2 Zwiebeln", stock).src, "Schalotten");
  assert.equal(ingStatus("200 g Käse", stock).src, "Parmesan");
  assert.equal(ingStatus("Parmesan, gerieben", stock).src, "Parmesan");
  assert.equal(ingStatus("150 g Bergkäse", stock).p, 0);
  const onlyLauch = buildStock({items:{c:items.c}, resolve});
  assert.equal(ingStatus("2 Zwiebeln", onlyLauch).p, 0);
  // Kochen nimmt die passende Sorte
  const r = cookUse(["2 Zwiebeln","200 g Käse"], stock, {}, today, Date.now());
  assert.deepEqual(Object.keys(r.entries).sort(), ["parmesan","schalotten"]);
});

test("Nach dem Neusortieren gilt ein frueheres Streichen des alten Namens weiter", () => {
  const at = Date.now();
  const alias = {[aliasKey("Cherrytom.")]: v2("Cocktailtomaten","Tomaten",{alt:"tomaten",at})};
  const resolve = (raw) => resolveName(raw, {vocab, alias});
  const book = {entries:{e1:{date:"2000-01-01",category:"Lebensmittel",items:[]}}};
  const d = new Date(at-3*86400000).toISOString().slice(0,10);
  book.entries.e1 = {date:d,category:"Lebensmittel",items:[{name:"Cherrytom.",sub:"Gemüse",amount:1}]};
  assert.equal(buildStock({book,cat:"Lebensmittel",resolve}).length, 1);
  assert.equal(buildStock({book,cat:"Lebensmittel",resolve,gone:{tomaten:today}}).length, 0);
  // Gelerntes vom alten Schluessel wird uebernommen
  const learned = {tomaten:{hl:9,n:3}};
  assert.equal(buildStock({book,cat:"Lebensmittel",resolve,learned})[0].hl, 9);
  assert.ok(learnHalfLives(book,"Lebensmittel",{},undefined,resolve) !== null);
});

test("Farbe bleibt auch in der KI-Antwort", () => {
  const out = parseSortAnswer({zuordnung:[{roh:"ROTE ZWIEB.",name:"Rote Zwiebeln",grund:"Zwiebeln"}]}, ["ROTE ZWIEB."], vocab);
  assert.deepEqual(out, {"ROTE ZWIEB.":{name:"Rote Zwiebeln"}});
});
