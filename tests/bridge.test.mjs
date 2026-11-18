// Brücke zum Haushaltsbuch (src/fb.js, hbLoad): erst der Einkaufsauszug, sonst im Übergang das Buch über den Code
import test from "node:test";
import assert from "node:assert/strict";
import { hbLoad, HB_KEY_RE } from "../src/fb.js";

const KEY = "abcdefghjkmnpqrstuvwxyz23456", EX = { cat: "Lebensmittel", entries: { e1: { date: "2026-06-10", category: "Lebensmittel", items: [{ name: "Bananen", sub: "Obst", amount: 1 }] } } };
const BOOK = { categories: ["Lebensmittel"], entries: { e1: { date: "2026-06-10", category: "Lebensmittel", amount: 6480, items: [{ name: "Bananen", sub: "Obst", amount: 189 }] } } };
// Nachgebautes Haushaltsbuch-Projekt: zählt, was gelesen wurde
const io = (o) => { const calls = []; return { calls,
  hbGet: async (c) => { calls.push("buch:" + c); return o.book; },
  hbKitchenKey: async (c) => { calls.push("tausch:" + c); return o.key; },
  hbKitchen: async (k) => { calls.push("auszug:" + k); return o.extract; } }; };

test("Schlüssel passt zur Regel", () => assert.ok(HB_KEY_RE.test(KEY)));

test("Verknüpfung mit Schlüssel liest nur den Auszug", async () => {
  const f = io({ extract: EX, book: BOOK });
  assert.deepEqual(await hbLoad({ key: KEY, cat: "Lebensmittel" }, f), { book: EX, key: KEY, cat: "Lebensmittel" });
  assert.deepEqual(f.calls, ["auszug:" + KEY]);
});

test("alte Verknüpfung mit Code: Code gegen Schlüssel tauschen, dann den Auszug lesen, das Buch nicht", async () => {
  const f = io({ key: KEY, extract: EX, book: BOOK });
  const r = await hbLoad({ code: "FAMILIE1", cat: "Lebensmittel" }, f);
  assert.equal(r.key, KEY); assert.equal(r.book, EX);
  assert.deepEqual(f.calls, ["tausch:FAMILIE1", "auszug:" + KEY]);
});

test("Übergang: gibt es noch keinen Auszug (null) oder keine Regeln dafür (undefined), wird wie bisher das Buch gelesen", async () => {
  for (const key of [null, undefined]) {
    const f = io({ key, book: BOOK });
    assert.deepEqual(await hbLoad({ code: "FAMILIE1" }, f), { book: BOOK });
    assert.deepEqual(f.calls, ["tausch:FAMILIE1", "buch:FAMILIE1"]);
  }
});

test("Schlüssel und Code vorhanden, Auszug fehlt: Rückfall auf das Buch", async () => {
  const f = io({ extract: null, book: BOOK });
  assert.deepEqual(await hbLoad({ key: KEY, code: "FAMILIE1" }, f), { book: BOOK });
});

test("nur Schlüssel: nicht erreichbar und nicht gefunden werden unterschieden, das Buch wird nie angefragt", async () => {
  const a = io({ extract: undefined }), b = io({ extract: null });
  assert.deepEqual(await hbLoad({ key: KEY }, a), { err: "offline" });
  assert.deepEqual(await hbLoad({ key: KEY }, b), { err: "missing" });
  assert.ok(![...a.calls, ...b.calls].some(c => c.startsWith("buch:")));
});

test("Code ohne Buch: nicht gefunden; Buch nicht erreichbar: offline", async () => {
  assert.deepEqual(await hbLoad({ code: "FALSCH99" }, io({ key: null, book: null })), { err: "missing" });
  assert.deepEqual(await hbLoad({ code: "FAMILIE1" }, io({ key: undefined, book: undefined })), { err: "offline" });
});
