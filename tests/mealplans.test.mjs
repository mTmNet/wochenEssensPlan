// Prüft die Essensplan-Vorlagen (src/mealplans.js): node --test tests/mealplans.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { MEALPLANS, mealPlanById, mealPlanNames } from "../src/mealplans.js";
import { DAYS, MEALS, CATS } from "../src/data.js";
import { recKey, normalizeRecipe } from "../src/logic/recipes.js";

test("Essensplan: Tage, Slots und Rezeptbezug sind vollständig", () => {
  assert.ok(MEALPLANS.length >= 1);
  MEALPLANS.forEach((p) => {
    assert.ok(p.id && p.name && Array.isArray(p.routines) && p.routines.length >= 1, p.id);
    assert.equal(mealPlanById(p.id), p);
    const names = new Set(p.recipes.map((r) => r.name));
    assert.equal(names.size, p.recipes.length, "keine doppelten Rezeptnamen");
    DAYS.forEach((d) => {
      assert.ok(p.days[d], "Tag " + d);
      MEALS.forEach((m) => (p.days[d][m] || []).forEach((n) => assert.ok(names.has(n), "Rezept fehlt: " + n)));
      assert.ok((p.days[d].Fr || []).length && (p.days[d].Mi || []).length && (p.days[d].Ab || []).length, "Frühstück, Mittag, Abend belegt: " + d);
    });
    const used = mealPlanNames(p);
    p.recipes.forEach((r) => {
      assert.ok(used.includes(r.name), "Rezept ohne Tag: " + r.name);
      assert.ok(CATS.includes(r.category), r.name + ": Kategorie");
      assert.ok(r.ingredients.length >= 3 && r.steps.length >= 2 && r.servings > 0 && r.minutes > 0, r.name + ": Zutaten, Schritte, Portionen, Zeit");
      assert.ok(recKey(r.name), r.name + ": Schlüssel");
      const n = normalizeRecipe(recKey(r.name), { ...r, source: "essensplan", plan: p.id }, 0);
      assert.equal(n.plan, p.id); assert.equal(n.source, "essensplan");
    });
  });
});
