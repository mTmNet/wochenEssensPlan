// Prüft die zusammengeführte Klassiker-Basis (src/classics.js): node --test tests/classics.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { CLASSICS } = await import(pathToFileURL(join(ROOT, "src", "classics.js")).href);

const CATS = ["Frühstück", "Hauptgericht", "Kinderessen", "Schnelle Küche", "Beilagen & Salate", "Soßen & Dips", "Snacks"];
const CUISINES = ["Schwäbisch", "Italienisch", "Asiatisch", "Indisch", "Naher Osten", "Mediterran", "Klassisch", "International", "Vegetarisch", "Grillen", "Schnell"];

test("CLASSICS ist ein Array mit mindestens 100 Gerichten", () => {
  assert.ok(Array.isArray(CLASSICS));
  assert.ok(CLASSICS.length >= 100, `nur ${CLASSICS.length} Gerichte`);
});

test("Namen sind eindeutig (ohne Groß-/Kleinschreibung)", () => {
  const seen = new Map();
  for (const r of CLASSICS) {
    const k = String(r.name).trim().toLowerCase();
    assert.ok(!seen.has(k), `doppelter Name: "${r.name}" und "${seen.get(k)}"`);
    seen.set(k, r.name);
  }
});

test("Liste ist nach category und dann name sortiert", () => {
  for (let i = 1; i < CLASSICS.length; i++) {
    const a = CLASSICS[i - 1], b = CLASSICS[i];
    const c = a.category.localeCompare(b.category, "de") || a.name.localeCompare(b.name, "de");
    assert.ok(c <= 0, `Reihenfolge falsch bei "${a.name}" vor "${b.name}"`);
  }
});

test("jedes Gericht erfüllt die Pflichtfelder", () => {
  for (const r of CLASSICS) {
    const tag = `"${r.name}"`;
    assert.equal(typeof r.name, "string", tag);
    assert.ok(r.name.trim().length > 0, tag);
    assert.ok(CATS.includes(r.category), `${tag}: category "${r.category}"`);
    assert.ok(CUISINES.includes(r.cuisine), `${tag}: cuisine "${r.cuisine}"`);
    assert.equal(typeof r.origin, "string", `${tag}: origin`);
    assert.ok(r.origin.trim().length > 0, `${tag}: origin leer`);
    assert.equal(typeof r.veg, "boolean", `${tag}: veg`);
    assert.equal(r.servings, 4, `${tag}: servings`);
    assert.ok(Number.isFinite(r.minutes) && r.minutes >= 5, `${tag}: minutes ${r.minutes}`);
    assert.equal(r.source, "klassiker", `${tag}: source`);
    assert.ok(Array.isArray(r.ingredients), `${tag}: ingredients`);
    assert.ok(r.ingredients.length >= 3 && r.ingredients.length <= 25, `${tag}: ${r.ingredients.length} Zutaten`);
    assert.ok(r.ingredients.every((s) => typeof s === "string" && s.trim()), `${tag}: leere Zutat`);
    assert.ok(Array.isArray(r.steps), `${tag}: steps`);
    assert.ok(r.steps.length >= 4 && r.steps.length <= 8, `${tag}: ${r.steps.length} Schritte`);
    assert.ok(r.steps.every((s) => typeof s === "string" && s.trim()), `${tag}: leerer Schritt`);
    assert.equal(typeof r.description, "string", `${tag}: description`);
  }
});

test("Schemaregeln aus tests/classics-schema.mjs (falls vorhanden)", async (t) => {
  let schema;
  try { schema = await import(pathToFileURL(join(ROOT, "tests", "classics-schema.mjs")).href); }
  catch { t.skip("tests/classics-schema.mjs nicht vorhanden"); return; }
  if (typeof schema.checkList !== "function") { t.skip("checkList nicht exportiert"); return; }
  const errors = schema.checkList(CLASSICS);
  assert.deepEqual(errors, [], `${errors.length} Verstöße:\n` + errors.slice(0, 20).join("\n"));
});
