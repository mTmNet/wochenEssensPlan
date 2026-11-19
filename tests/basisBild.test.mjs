// Bilder der Rezept-Basis: node --test tests/basisBild.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSICS } from "../src/classics.js";
import { basisBild, bildSlug } from "../src/logic/basisBild.js";

const pub = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

test("jedes Gericht der Rezept-Basis hat eine Bilddatei", () => {
  const fehlt = CLASSICS.filter(c => !existsSync(pub + basisBild(c.name))).map(c => c.name);
  assert.deepEqual(fehlt, []);
});

test("Dateinamen sind eindeutig und es liegen keine überzähligen Bilder herum", () => {
  const slugs = CLASSICS.map(c => bildSlug(c.name));
  assert.equal(new Set(slugs).size, slugs.length);
  const dateien = readdirSync(pub + "/rezepte").map(f => f.replace(/\.webp$/, ""));
  assert.deepEqual(dateien.sort(), [...slugs].sort());
});

test("Dateiname aus dem Namen", () => {
  assert.equal(bildSlug("Königsberger Klopse"), "koenigsberger-klopse");
  assert.equal(bildSlug("Spaghetti alla Carbonara"), "spaghetti-alla-carbonara");
  assert.equal(bildSlug("  Béchamelsoße "), "bechamelsosse");
});

test("nur Gerichte der Rezept-Basis bekommen ein Bild", () => {
  const c = CLASSICS[0].name;
  assert.equal(basisBild(c), "/rezepte/" + bildSlug(c) + ".webp");
  assert.equal(basisBild(" " + c.toUpperCase() + " "), "/rezepte/" + bildSlug(c) + ".webp");
  assert.equal(basisBild("Omas Geheimrezept 123"), "");
  assert.equal(basisBild(""), "");
  assert.equal(basisBild(undefined), "");
});
