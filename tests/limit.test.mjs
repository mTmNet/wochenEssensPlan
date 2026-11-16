// Kostendeckel der KI-Function: Tageszähler mit simuliertem Zählerspeicher (Realtime Database per REST)
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAndCount, limitsFrom, cleanCode, validSecret, dayKey, hashId, limitMessage, DEFAULT_LIMITS } from "../api/_limit.js";

const SECRET = "a".repeat(40);
const DB = "https://db.example";
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);

// Nachbau der Datenbank: GET liest Zahl oder null, PATCH mit {".sv":{increment:1}} zählt hoch, DELETE räumt einen Tag weg
const fakeDb = (store = {}) => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    const u = new URL(url);
    const path = u.pathname.replace(/\.json$/, "");
    calls.push(method + " " + path);
    if (method === "GET" && u.searchParams.get("shallow")) {
      const out = {};
      for (const k of Object.keys(store)) if (k.startsWith(path + "/")) out[k.slice(path.length + 1).split("/")[0]] = true;
      return { ok: true, status: 200, json: async () => out };
    }
    if (method === "GET") return { ok: true, status: 200, json: async () => store[path] ?? null };
    if (method === "PATCH") {
      for (const [k, v] of Object.entries(JSON.parse(opts.body))) {
        assert.deepEqual(v, { ".sv": { increment: 1 } });
        store[path + "/" + k] = (store[path + "/" + k] || 0) + 1;
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (method === "DELETE") {
      for (const k of Object.keys(store)) if (k.startsWith(path + "/")) delete store[k];
      return { ok: true, status: 200, json: async () => null };
    }
    throw new Error("unerwartet: " + method);
  };
  return { store, calls, fetchImpl };
};

const run = (db, over = {}) => checkAndCount({
  dbUrl: DB, secret: SECRET, limits: { total: 5, ip: 3, code: 4 }, fetchImpl: db.fetchImpl, now: () => T0,
  subjects: [{ kind: "ip", id: "1.2.3.4" }, { kind: "code", id: "ABCDEF1234" }], ...over,
});

test("limitsFrom: Standardwerte und Umgebungsvariablen", () => {
  assert.deepEqual(limitsFrom({}), DEFAULT_LIMITS);
  assert.deepEqual(limitsFrom({ AI_LIMIT_TOTAL: "10", AI_LIMIT_IP: "x", AI_LIMIT_CODE: " 7 " }), { total: 10, ip: DEFAULT_LIMITS.ip, code: 7 });
});

test("cleanCode, validSecret, dayKey, hashId", () => {
  assert.equal(cleanCode(" abcdef1234 "), "ABCDEF1234");
  assert.equal(cleanCode("kurz"), "");
  assert.equal(cleanCode("../../boese"), "");
  assert.equal(cleanCode(undefined), "");
  assert.equal(validSecret(SECRET), true);
  assert.equal(validSecret("zu-kurz"), false);
  assert.equal(validSecret("a".repeat(31) + "/"), false);
  assert.equal(dayKey(T0), "2026-11-16");
  assert.match(hashId("1.2.3.4", SECRET), /^[0-9a-f]{24}$/);
  assert.notEqual(hashId("1.2.3.4", SECRET), hashId("1.2.3.4", "b".repeat(40)));
});

test("ohne Geheimnis ist der Deckel aus und fragt den Speicher nicht", async () => {
  const db = fakeDb();
  const r = await run(db, { secret: "" });
  assert.equal(r.ok, true);
  assert.ok(r.skipped);
  assert.equal(db.calls.length, 0);
});

test("zählt insgesamt, je IP und je Code; IP und Code stehen nicht im Klartext im Speicher", async () => {
  const db = fakeDb();
  assert.deepEqual(await run(db), { ok: true });
  const base = "/aiUsage/" + SECRET + "/2026-11-16";
  assert.equal(db.store[base + "/total"], 1);
  assert.equal(db.store[base + "/ip/" + hashId("1.2.3.4", SECRET)], 1);
  assert.equal(db.store[base + "/code/" + hashId("ABCDEF1234", SECRET)], 1);
  assert.ok(!Object.keys(db.store).some((k) => k.includes("1.2.3.4") || k.includes("ABCDEF1234")));
});

test("IP-Grenze greift, andere IP läuft weiter, dann greift die Code-Grenze, dann die Gesamtgrenze", async () => {
  const db = fakeDb();
  for (let i = 0; i < 3; i++) assert.equal((await run(db)).ok, true);
  assert.deepEqual(await run(db), { ok: false, reason: "ip" });
  const other = (ip, code) => ({ subjects: [{ kind: "ip", id: ip }, { kind: "code", id: code }] });
  assert.equal((await run(db, other("5.6.7.8", "ABCDEF1234"))).ok, true); // 4. Anfrage dieses Codes
  assert.deepEqual(await run(db, other("9.9.9.9", "ABCDEF1234")), { ok: false, reason: "code" });
  assert.equal((await run(db, other("9.9.9.9", "ZZZZZZ9999"))).ok, true); // 5. Anfrage insgesamt
  assert.deepEqual(await run(db, other("7.7.7.7", "YYYYYY8888")), { ok: false, reason: "total" });
  assert.equal(db.store["/aiUsage/" + SECRET + "/2026-11-16/total"], 5); // abgelehnte Anfragen zählen nicht
});

test("ohne Code gelten nur IP und Gesamtgrenze (alte App-Version im Cache)", async () => {
  const db = fakeDb();
  const r = await run(db, { subjects: [{ kind: "ip", id: "1.2.3.4" }, { kind: "code", id: "" }] });
  assert.equal(r.ok, true);
  assert.ok(!Object.keys(db.store).some((k) => k.includes("/code/")));
});

test("neuer Tag beginnt bei null und räumt alte Tage weg", async () => {
  const db = fakeDb();
  for (let i = 0; i < 3; i++) await run(db);
  assert.equal((await run(db)).ok, false);
  const r = await run(db, { now: () => T0 + 24 * 3600 * 1000 });
  assert.equal(r.ok, true);
  assert.ok(!Object.keys(db.store).some((k) => k.includes("2026-11-16")));
  assert.equal(db.store["/aiUsage/" + SECRET + "/2026-11-17/total"], 1);
});

test("gestörter Speicher: Anfrage wird durchgelassen und als übersprungen gemeldet", async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const down = await run({ fetchImpl: async () => { throw new Error("Netz weg"); } });
    assert.equal(down.ok, true);
    assert.ok(down.skipped);
    const denied = await run({ fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
    assert.equal(denied.ok, true);
    assert.ok(denied.skipped);
  } finally { console.warn = warn; }
});

test("limitMessage: je Grund eine deutsche Meldung, Zusatz wird angehängt", () => {
  assert.match(limitMessage("total"), /Tageskontingent/);
  assert.match(limitMessage("ip"), /Anschluss/);
  assert.match(limitMessage("code", "Bitte von Hand eintragen."), /von Hand eintragen\.$/);
});
