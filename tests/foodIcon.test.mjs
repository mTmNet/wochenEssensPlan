// Emoji je Lebensmittel: genaue Begriffe vor allgemeinen, Umlaute, Rueckfall auf die Gruppe
import { test } from "node:test";
import assert from "node:assert/strict";
import { foodIcon, GROUP_ICON } from "../src/logic/foodIcon.js";

test("foodIcon: typische Kassenbon-Namen", () => {
  assert.equal(foodIcon("Brokkoli"), "🥦");
  assert.equal(foodIcon("Rinderhack 500g"), "🥩");
  assert.equal(foodIcon("Hähnchenbrustfilet"), "🍗");
  assert.equal(foodIcon("Kokosmilch"), "🥥");              // vor "milch"
  assert.equal(foodIcon("Vollmilch 3,5%"), "🥛");
  assert.equal(foodIcon("Eier 10er Bio"), "🥚");
  assert.equal(foodIcon("Spaghetti Barilla"), "🍝");
  assert.equal(foodIcon("Tellerlinsen"), "🫘");
  assert.equal(foodIcon("Paprika rot 3er"), "🫑");
  assert.equal(foodIcon("Möhren 1kg"), "🥕");
  assert.equal(foodIcon("Kartoffeln festk."), "🥔");
  assert.equal(foodIcon("Lachsfilet TK"), "🐟");
  assert.equal(foodIcon("Haferflocken kernig"), "🥣");
  assert.equal(foodIcon("Passata"), "🍅");
  assert.equal(foodIcon("Jogh Natur"), "🥛");
  assert.equal(foodIcon("Parmesan Stk"), "🧀");
  assert.equal(foodIcon("Bratwurst"), "🌭");
  assert.equal(foodIcon("Honig"), "🍯");
});

test("foodIcon: Rueckfall auf die Gruppe, sonst leer", () => {
  assert.equal(foodIcon("Dings", "Konserven"), "🥫");
  assert.equal(foodIcon("Dings", "Gemüse"), "🥬");
  assert.equal(foodIcon("Dings"), "");
  assert.equal(foodIcon("Dings", "Unbekannt"), "");
  Object.values(GROUP_ICON).forEach(e=>assert.ok(e.length>0));
});
