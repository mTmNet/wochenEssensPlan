// Zutaten-Logik: Mengen skalieren (Portionen-Stepper), Parser in beiden Formaten
import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleIng, parseIng, ingKey } from "../src/logic/ingredients.js";

test("scaleIng: Faktor 1, fehlende Menge und Prozentangaben bleiben unveraendert", () => {
  assert.equal(scaleIng("Pasta 200g", 1), "Pasta 200g");
  assert.equal(scaleIng("Salz und Pfeffer", 2), "Salz und Pfeffer");
  assert.equal(scaleIng("Schnittlauch", 0.5), "Schnittlauch");
  assert.equal(scaleIng("Milch 3,5% 200 ml", 2), "Milch 3,5% 200 ml");
  assert.equal(scaleIng("", 2), "");
  assert.equal(scaleIng("200 g Reis", 0), "200 g Reis");
  assert.equal(scaleIng("200 g Reis", NaN), "200 g Reis");
});

test("scaleIng: Gramm und Milliliter in 5er-Schritten unter 100, sonst in 10er-Schritten", () => {
  assert.equal(scaleIng("200 g Reis", 0.5), "100 g Reis");
  assert.equal(scaleIng("Pasta 200g", 1.25), "Pasta 250 g");
  assert.equal(scaleIng("Haferflocken 100g", 0.75), "Haferflocken 75 g");
  assert.equal(scaleIng("Hackfleisch 300g", 0.25), "Hackfleisch 75 g");
  assert.equal(scaleIng("Butter 10g", 0.5), "Butter 5 g");
  assert.equal(scaleIng("Butter 10g", 0.25), "Butter 5 g");           // nie unter einen Schritt
  assert.equal(scaleIng("Parmesan 60g", 1.5), "Parmesan 90 g");
  assert.equal(scaleIng("Parmesan 60g", 1.75), "Parmesan 110 g");     // 105 -> 10er-Schritt ab 100
  assert.equal(scaleIng("Weisswein 100ml", 0.5), "Weisswein 50 ml");
  assert.equal(scaleIng("Gemüsebrühe 700ml", 1.5), "Gemüsebrühe 1050 ml");
  assert.equal(scaleIng("Milch 200ml", 0.75), "Milch 150 ml");
});

test("scaleIng: Kilogramm und Liter mit Bruchzahlen, Komma als Dezimaltrenner", () => {
  assert.equal(scaleIng("Gemüsebrühe 1L", 1.5), "Gemüsebrühe 1,5 L");
  assert.equal(scaleIng("1 kg Kartoffeln", 0.75), "0,75 kg Kartoffeln");
  assert.equal(scaleIng("1 kg Kartoffeln", 2), "2 kg Kartoffeln");
});

test("scaleIng: Stueck werden ganz, unter 1 halbe Stuecke", () => {
  assert.equal(scaleIng("2 Eier", 1.5), "3 Eier");
  assert.equal(scaleIng("Eier 3 St.", 0.5), "Eier 2 St.");
  assert.equal(scaleIng("Zitrone 0.5 St.", 2), "Zitrone 1 St.");
  assert.equal(scaleIng("1 Zwiebel", 0.5), "0,5 Zwiebel");
  assert.equal(scaleIng("1 Zwiebel", 0.25), "0,5 Zwiebel");
  assert.equal(scaleIng("Tomaten Dose 1 St.", 1.5), "Tomaten Dose 2 St.");
  assert.equal(scaleIng("Vollkornbrot 2 Scheiben", 0.5), "Vollkornbrot 1 Scheiben");
});

test("scaleIng: Loeffel, Bund, Zehen in halben Schritten; Bruchzeichen werden verstanden", () => {
  assert.equal(scaleIng("Olivenoel 2 EL", 0.75), "Olivenoel 1,5 EL");
  assert.equal(scaleIng("2 EL Butter", 0.5), "1 EL Butter");
  assert.equal(scaleIng("Honig 1 EL", 0.25), "Honig 0,5 EL");
  assert.equal(scaleIng("Knoblauch 2 Zehen", 0.5), "Knoblauch 1 Zehen");
  assert.equal(scaleIng("½ Bund Minze", 2), "1 Bund Minze");
  assert.equal(scaleIng("1 TL Salz", 3), "3 TL Salz");
});

test("parseIng und ingKey (Grundlage fuer das Skalieren)", () => {
  assert.deepEqual(parseIng("750 g Zucchini"), { name:"Zucchini", amount:750, unit:"g", pre:true });
  assert.deepEqual(parseIng("Haferflocken 100g"), { name:"Haferflocken", amount:100, unit:"g", pre:false });
  assert.deepEqual(parseIng("Salz"), { name:"Salz", amount:null, unit:"", pre:false });
  assert.equal(ingKey("2 EL Olivenöl"), ingKey("Olivenoel 2 EL"));
  assert.equal(ingKey("200 g Spaghetti"), ingKey("Pasta 200g"));
  assert.equal(ingKey("Tomaten Dose 1 St. (Bio)"), ingKey("Tomaten Dose 1 St."));   // Zusatz in Klammern aendert den Schluessel nicht
  assert.equal(ingKey("1 Zwiebel"), ingKey("Zwiebel 1 St."));
  assert.notEqual(ingKey("Milch 200 ml"), ingKey("Milch 1 St."));
});
