// Namen normieren: Bereinigung, Vokabular aus Rezepten, Regelabgleich, gespeicherte Zuordnung, KI-Antwort pruefen
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, vocabulary, ruleMatch, resolveName, unmappedNames, parseAliasAnswer, aliasKey } from "../src/logic/alias.js";

const recipes = {
  Bolo: {ingredients:["500 g Hackfleisch","1 Dose Tomaten","2 Zwiebeln","400 g Spaghetti","Parmesan, gerieben","Salz"]},
  Curry: {ingredients:["400 ml Kokosmilch","2 Paprika","300 g Hähnchenbrust","200 g Reis","1 EL Tomatenmark"]},
  Pfanne: {ingredients:["Tomaten 3 Stück","Zwiebeln 1 St.","Joghurt 150 g","Eier 2 St."]},
};
const vocab = vocabulary(recipes, [{name:"Linsensuppe",ingredients:["250 g Linsen","2 Karotten","1 Stange Lauch"]}]);

test("cleanName: Mengen, Prozent, Marken, Kuerzel und Fuellwoerter weg, Schreibweise bleibt", () => {
  assert.equal(cleanName("Bio Strauchtomaten 500g"), "Strauchtomaten");
  assert.equal(cleanName("Vollmilch 3,5%"), "Vollmilch");
  assert.equal(cleanName("Paprika rot 3er"), "Paprika");
  assert.equal(cleanName("Spaghetti Barilla"), "Spaghetti");
  assert.equal(cleanName("Kartoffeln festk."), "Kartoffeln");
  assert.equal(cleanName("Eier 10er Bio"), "Eier");
  assert.equal(cleanName("Jogh Natur"), "Jogh");
  assert.equal(cleanName("Lachsfilet TK"), "Lachsfilet");
  assert.equal(cleanName("Ja! Haferflocken kernig 500 g"), "Haferflocken");
  assert.equal(cleanName("500g"), "500g");                       // nichts uebrig: Rohname bleibt
});

test("vocabulary: je Schluessel die haeufigste Schreibweise, ohne Mengen, Klammern, Zusatz nach Komma, ohne Grundvorrat", () => {
  const names = vocab.map(v=>v.name);
  assert.ok(names.includes("Hackfleisch") && names.includes("Tomaten") && names.includes("Zwiebeln") && names.includes("Parmesan") && names.includes("Kokosmilch"));
  assert.ok(!names.includes("Salz"), "Grundvorrat nicht im Vokabular");
  assert.equal(vocab.find(v=>v.key==="zwiebeln").n, 2);
  assert.equal(vocab.find(v=>v.key==="tomaten").name, "Tomaten");
  assert.ok(names.includes("Linsen") && names.includes("Karotten"), "Rezept-Basis zaehlt mit");
});

test("ruleMatch: genauer Schluessel, Teilwoerter, Mehrdeutiges bleibt offen", () => {
  assert.equal(ruleMatch("Bio Strauchtomaten 500g", vocab).name, "Tomaten");      // Kompositum-Kopf
  assert.equal(ruleMatch("Paprika rot 3er", vocab).name, "Paprika");
  assert.equal(ruleMatch("Spaghetti Barilla", vocab).name, "Spaghetti");
  assert.equal(ruleMatch("Hähnchenbrustfilet", vocab).name, "Hähnchenbrust");
  assert.equal(ruleMatch("Rinderhack 500g", vocab).name, "Hackfleisch");          // Synonym aus KEY_SYN
  assert.equal(ruleMatch("Möhren 1kg", vocab).name, "Karotten");
  assert.equal(ruleMatch("Tellerlinsen", vocab).name, "Linsen");
  assert.equal(ruleMatch("Kokosmilch", vocab).name, "Kokosmilch");                // nicht "Milch"
  assert.equal(ruleMatch("Jogh Natur", vocab).name, "Joghurt");                   // Bon-Kuerzel
  assert.equal(ruleMatch("Spülmittel", vocab), null);
  assert.equal(ruleMatch("Bratwurst", vocab), null);
});

test("resolveName/unmappedNames: Hand vor KI vor Regel, leerer Name = kein Lebensmittel, Rest bereinigt und ungeklaert", () => {
  const alias = { [aliasKey("Bratwurst")]: {name:"Bratwurst",src:"ki"}, [aliasKey("Spülmittel")]: {name:"",src:"ki"}, [aliasKey("Paprika rot 3er")]: {name:"Spitzpaprika",src:"hand"} };
  const ctx = {alias, vocab};
  assert.deepEqual(resolveName("Bratwurst", ctx), {name:"Bratwurst",key:"bratwurst",src:"ki"});
  assert.equal(resolveName("Spülmittel", ctx), null);
  assert.equal(resolveName("Paprika rot 3er", ctx).name, "Spitzpaprika");
  assert.equal(resolveName("Paprika rot 3er", ctx).src, "hand");
  assert.equal(resolveName("Rinderhack 500g", ctx).src, "regel");
  const u = resolveName("Kichererbsen Dose 400g", ctx);
  assert.equal(u.src, ""); assert.equal(u.name, "Kichererbsen"); assert.equal(u.key, "kichererbsen");
  assert.deepEqual(unmappedNames(["Rinderhack 500g","Kichererbsen Dose 400g","Bratwurst","Honig","Honig 500g"], ctx), ["Kichererbsen Dose 400g","Honig"]);
  // KI-Zuordnung auf ein Vokabular-Wort nimmt dessen Schreibweise
  assert.equal(resolveName("Hack gemischt", {alias:{[aliasKey("Hack gemischt")]:{name:"hackfleisch",src:"ki"}}, vocab}).name, "Hackfleisch");
});

test("parseAliasAnswer: nur angefragte Namen, null = kein Lebensmittel, Vokabular-Schreibweise, Unsinn verworfen", () => {
  const raws = ["Kichererbsen Dose 400g","Spülmittel","Jogh Natur","Honig"];
  const out = parseAliasAnswer({zuordnung:[
    {roh:"Kichererbsen Dose 400g",name:"kichererbsen"},{roh:"Spülmittel",name:null},{roh:"Jogh Natur",name:"joghurt"},
    {roh:"Honig",name:"Ein viel zu langer Name mit vielen Woertern"},{roh:"Fremd",name:"Egal"}]}, raws, vocab);
  assert.deepEqual(out, {"Kichererbsen Dose 400g":"Kichererbsen","Spülmittel":"","Jogh Natur":"Joghurt"});
  assert.deepEqual(parseAliasAnswer({}, raws, vocab), {});
});
