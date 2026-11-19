// Messung "zuletzt aktiv": Server-Speicher (api/_aktiv.js) mit simulierter Datenbank und Gerät-Seite (src/aktiv.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordActive, computeStats, cleanSource, berlinDay, addDays, activityPath, loadActivity, statsHtml, formHtml } from "../api/_aktiv.js";
import { createActivity } from "../src/aktiv.js";

const SECRET = "s".repeat(40);
const DB = "https://db.example";
const T0 = Date.UTC(2026, 10, 19, 12, 0, 0); // 19.11.2026 13:00 in Berlin

// Nachbau: flacher Speicher mit Pfaden; GET liefert Blatt oder zusammengesetztes Objekt, PATCH schreibt mehrere Pfade
const fakeDb = () => {
  const store = {};
  const calls = [];
  const read = (path) => {
    if (path in store) return store[path];
    const out = {}; let any = false;
    for (const [k, v] of Object.entries(store)) {
      if (!k.startsWith(path + "/")) continue;
      any = true; let o = out; const parts = k.slice(path.length + 1).split("/");
      parts.slice(0, -1).forEach((p) => { o = o[p] ||= {}; }); o[parts.at(-1)] = v;
    }
    return any ? out : null;
  };
  const write = (path, v) => {
    for (const k of Object.keys(store)) if (k === path || k.startsWith(path + "/")) delete store[k];
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) write(path + "/" + k, x);
    else store[path] = v;
  };
  const fetchImpl = async (url, o = {}) => {
    const method = o.method || "GET";
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\.json$/, "");
    calls.push(method + " " + path);
    if (method === "GET") return { ok: true, status: 200, json: async () => read(path) };
    if (method === "PATCH") { for (const [k, v] of Object.entries(JSON.parse(o.body))) write(path + "/" + k, v); return { ok: true, status: 200, json: async () => ({}) }; }
    throw new Error("unerwartet " + method);
  };
  return { store, calls, fetchImpl };
};

const ROOT = "/activity/" + activityPath(SECRET);

test("berlinDay und addDays", () => {
  assert.equal(berlinDay(Date.UTC(2026, 10, 19, 23, 30)), "2026-11-20"); // 0:30 Uhr in Berlin
  assert.equal(addDays("2026-11-19", 28), "2026-12-17");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("cleanSource lässt nur einfache Kürzel durch", () => {
  assert.equal(cleanSource(" Rewe-Nord "), "rewe-nord");
  assert.equal(cleanSource("<script>"), "");
  assert.equal(cleanSource("a".repeat(25)), "");
  assert.equal(cleanSource(undefined), "");
});

test("recordActive: erster Tag mit Herkunft, gleicher Tag nur ein Lesen, späterer Tag setzt nur l", async () => {
  const db = fakeDb();
  const r1 = await recordActive({ dbUrl: DB, secret: SECRET, uid: "nutzer1", src: "rewe-nord", fetchImpl: db.fetchImpl, now: () => T0 });
  assert.deepEqual(r1, { ok: true, neu: true });
  const u = Object.entries(db.store).filter(([k]) => k.startsWith(ROOT + "/u/"));
  assert.equal(u.length, 3); // f, l, s
  assert.ok(!JSON.stringify(db.store).includes("nutzer1"), "Nutzer-ID steht nicht im Klartext");
  db.calls.length = 0;
  assert.deepEqual(await recordActive({ dbUrl: DB, secret: SECRET, uid: "nutzer1", fetchImpl: db.fetchImpl, now: () => T0 + 3600000 }), { ok: true });
  assert.deepEqual(db.calls.map((c) => c.split(" ")[0]), ["GET"]);
  await recordActive({ dbUrl: DB, secret: SECRET, uid: "nutzer1", src: "anderer", fetchImpl: db.fetchImpl, now: () => T0 + 2 * 86400000 });
  const data = await loadActivity({ dbUrl: DB, secret: SECRET, fetchImpl: db.fetchImpl, now: () => T0 + 2 * 86400000 });
  const rec = Object.values(data.users)[0];
  assert.deepEqual(rec, { f: "2026-11-19", l: "2026-11-21", s: "rewe-nord" });
  assert.deepEqual(Object.keys(data.days).sort(), ["2026-11-19", "2026-11-21"]);
});

test("recordActive ohne Geheimnis, ohne Nutzer-ID oder bei abgelehnter Regel: ok false, wirft nicht", async () => {
  const db = fakeDb();
  assert.equal((await recordActive({ dbUrl: DB, secret: "kurz", uid: "u", fetchImpl: db.fetchImpl })).ok, false);
  assert.equal((await recordActive({ dbUrl: DB, secret: SECRET, uid: "", fetchImpl: db.fetchImpl })).ok, false);
  const denied = async () => ({ ok: false, status: 401, json: async () => ({ error: "Permission denied" }) });
  assert.deepEqual(await recordActive({ dbUrl: DB, secret: SECRET, uid: "u", fetchImpl: denied }), { ok: false, grund: "Lesen 401" });
  assert.equal((await recordActive({ dbUrl: DB, secret: SECRET, uid: "u", fetchImpl: async () => { throw new Error("offline"); } })).ok, false);
});

test("computeStats: heute, 7 Tage, gesamt, Treue nach 4 Wochen, Herkunft", () => {
  const today = "2026-12-31";
  const users = {
    a: { f: "2026-11-01", l: "2026-12-31", s: "rewe-nord" }, // alt genug, geblieben
    b: { f: "2026-11-01", l: "2026-11-20", s: "rewe-nord" }, // alt genug, weg
    c: { f: "2026-11-10", l: "2026-12-08" },                 // genau Tag 28: geblieben
    d: { f: "2026-12-20", l: "2026-12-30" },                 // zu neu für die Treue
    kaputt: { f: "x" },
  };
  const days = { "2026-12-31": { a: 1 }, "2026-12-30": { d: 1 }, "2026-12-20": { d: 1 }, "2026-12-08": { c: 1 } };
  const st = computeStats({ users, days }, today);
  assert.equal(st.heute, 1);
  assert.equal(st.woche, 2);
  assert.equal(st.gesamt, 4);
  assert.deepEqual(st.treue, { kohorte: 3, geblieben: 2, quote: 67 });
  assert.equal(st.verlauf.length, 30);
  assert.deepEqual(st.verlauf.find((v) => v.tag === "2026-12-20"), { tag: "2026-12-20", aktiv: 1, neu: 1 });
  assert.deepEqual(st.herkunft.find((h) => h.herkunft === "rewe-nord"), { herkunft: "rewe-nord", geraete: 2, kohorte: 2, geblieben: 1, quote: 50 });
  const html = statsHtml("Test", st);
  assert.ok(html.includes("67 %") && html.includes("rewe-nord") && html.includes("31.12.2026"));
});

test("computeStats ohne Daten und Seiten ohne eingeschleustes HTML", () => {
  const st = computeStats({}, "2026-11-19");
  assert.equal(st.gesamt, 0);
  assert.equal(st.treue.quote, null);
  assert.ok(statsHtml("Test", st).includes("–"));
  assert.ok(!formHtml("<b>", "<i>").includes("<i>"));
});

// Gerät-Seite
const memStore = () => { const m = {}; return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const fakeAuth = (token = "tok") => ({ enabled: true, token: async () => token });

test("Gerät: Herkunft aus ?von= merken, erste zählt", () => {
  const s = memStore();
  createActivity({ prefix: "t", auth: fakeAuth(), storage: s, search: "?von=Rewe-Nord&x=1" }).capture();
  createActivity({ prefix: "t", auth: fakeAuth(), storage: s, search: "?von=edeka" }).capture();
  createActivity({ prefix: "t", auth: fakeAuth(), storage: s, search: "?von=<b>" }).capture();
  assert.equal(s.m["t-herkunft"], "rewe-nord");
});

test("Gerät: einmal am Tag melden, mit Nachweis und Herkunft; nach Fehlschlag zehn Minuten Pause", async () => {
  const s = memStore(); s.setItem("t-herkunft", "rewe-nord");
  const sent = []; let status = 500; let t = T0;
  const a = createActivity({ prefix: "t", auth: fakeAuth("abc"), storage: s, now: () => t, fetchImpl: async (url, o) => { sent.push({ url, o }); return { ok: status === 200 }; } });
  assert.equal(await a.ping(), false);
  assert.equal(await a.ping(), false); // Pause
  assert.equal(sent.length, 1);
  t += 11 * 60000; status = 200;
  assert.equal(await a.ping(), true);
  assert.equal(await a.ping(), false); // heute schon gemeldet
  assert.equal(sent.length, 2);
  assert.equal(sent[1].url, "/api/aktiv");
  assert.equal(sent[1].o.headers.Authorization, "Bearer abc");
  assert.deepEqual(JSON.parse(sent[1].o.body), { von: "rewe-nord" });
  t += 86400000;
  assert.equal(await a.ping(), true);
});

test("Gerät: Anmeldung aus oder kein Nachweis: keine Meldung", async () => {
  let n = 0; const f = async () => { n++; return { ok: true }; };
  assert.equal(await createActivity({ prefix: "t", auth: { enabled: false }, storage: memStore(), fetchImpl: f }).ping(), false);
  assert.equal(await createActivity({ prefix: "t", auth: fakeAuth(""), storage: memStore(), fetchImpl: f }).ping(), false);
  assert.equal(n, 0);
});
