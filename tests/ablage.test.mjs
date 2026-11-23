// Tests der Dateiablage (src/ablage.js) mit einem nachgebauten Speicher, ohne Netz
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAblage, randFileKey, FILE_KEY_RE, parseDataUrl, bytesToBase64, base64ToBytes, pathFromUrl, tokenUrl, isDataUrl } from "../src/ablage.js";

const BUCKET = "testprojekt.firebasestorage.app";
const authOn = { enabled: true, token: async () => "NACHWEIS" };

// Nachgebauter Speicher: merkt sich Objekte, verbietet Überschreiben wie die Speicher-Regeln
const fakeStorage = ({ status } = {}) => {
  const objs = new Map(); const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (status) return { ok: false, status, json: async () => ({}), text: async () => "" };
    assert.equal(init.headers && init.headers.Authorization, "Firebase NACHWEIS");
    const u = new URL(url);
    const pre = "/v0/b/" + BUCKET + "/o";
    assert.ok(u.pathname.startsWith(pre));
    const method = init.method || "GET";
    if (method === "POST") {
      const name = u.searchParams.get("name");
      if (objs.has(name)) return { ok: false, status: 403, json: async () => ({}) };
      objs.set(name, { bytes: new Uint8Array(init.body), type: init.headers["Content-Type"], token: "tok-" + objs.size });
      const o = objs.get(name);
      return { ok: true, status: 200, json: async () => ({ name, size: String(o.bytes.length), downloadTokens: o.token }) };
    }
    const name = decodeURIComponent(u.pathname.slice(pre.length + 1));
    const o = objs.get(name);
    if (method === "DELETE") { if (!o) return { ok: false, status: 404 }; objs.delete(name); return { ok: true, status: 204 }; }
    if (!o) return { ok: false, status: 404, json: async () => ({}) };
    if (u.searchParams.get("alt") === "media") return { ok: true, status: 200, arrayBuffer: async () => o.bytes.buffer.slice(0) };
    return { ok: true, status: 200, json: async () => ({ name, size: String(o.bytes.length), downloadTokens: o.token }) };
  };
  return { objs, calls, fetchImpl };
};

test("randFileKey: 32 Zeichen, passt zur Prüfung, jedes Mal anders", () => {
  const a = randFileKey(), b = randFileKey();
  assert.match(a, FILE_KEY_RE);
  assert.notEqual(a, b);
});

test("Base64, Data-URL und Links hin und zurück", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 7]);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  const p = parseDataUrl("data:image/jpeg;base64," + bytesToBase64(bytes));
  assert.equal(p.mime, "image/jpeg");
  assert.deepEqual(p.bytes, bytes);
  assert.equal(parseDataUrl("https://x"), null);
  assert.ok(isDataUrl("data:image/png;base64,AA"));
  const url = tokenUrl(BUCKET, "fotos/ABC/x y.jpg", "t1");
  assert.equal(pathFromUrl(url, BUCKET), "fotos/ABC/x y.jpg");
  assert.equal(pathFromUrl("https://andere.de/bild.jpg", BUCKET), "");
});

test("ohne Bucket oder ohne Anmeldung: aus, kein Netzaufruf", async () => {
  const st = fakeStorage();
  for (const a of [createAblage({ bucket: "", auth: authOn, fetchImpl: st.fetchImpl }), createAblage({ bucket: BUCKET, auth: { enabled: false, token: async () => "" }, fetchImpl: st.fetchImpl })]) {
    assert.equal(a.enabled(), false);
    assert.deepEqual(await a.upload("x/y", new Uint8Array([1]), "image/jpeg"), { ok: false, reason: "aus" });
    assert.equal(await a.download("x/y"), undefined);
  }
  assert.equal(st.calls.length, 0);
});

test("hochladen, Größe geprüft, laden, Link, löschen", async () => {
  const st = fakeStorage();
  const a = createAblage({ bucket: BUCKET, auth: authOn, fetchImpl: st.fetchImpl });
  const bytes = new Uint8Array([9, 8, 7, 6]);
  const up = await a.upload("belege/K/1.jpg", bytes, "image/jpeg");
  assert.equal(up.ok, true);
  assert.equal(up.size, 4);
  assert.equal(st.objs.get("belege/K/1.jpg").type, "image/jpeg");
  assert.deepEqual(await a.download("belege/K/1.jpg"), bytes);
  assert.equal(a.pathOf(a.url("belege/K/1.jpg", up.token)), "belege/K/1.jpg");
  assert.equal(await a.remove("belege/K/1.jpg"), true);
  assert.equal(await a.download("belege/K/1.jpg"), null);
  assert.equal(await a.remove("belege/K/1.jpg"), true, "fehlende Datei zählt als gelöscht");
});

test("zweites Gerät lädt denselben Altbestand: kein Überschreiben, vorhandene Datei gilt", async () => {
  const st = fakeStorage();
  const a = createAblage({ bucket: BUCKET, auth: authOn, fetchImpl: st.fetchImpl });
  const bytes = new Uint8Array([1, 2, 3]);
  assert.equal((await a.uploadOnce("belege/K/2.jpg", bytes, "image/jpeg")).ok, true);
  const again = await a.uploadOnce("belege/K/2.jpg", bytes, "image/jpeg");
  assert.equal(again.ok, true);
  assert.equal(again.existed, true);
  const other = await a.uploadOnce("belege/K/2.jpg", new Uint8Array([1, 2]), "image/jpeg");
  assert.equal(other.ok, false, "andere Größe: nicht als umgezogen werten");
});

test("Speicher nicht eingerichtet: Fehler 'fehlt' und danach Pause ohne Netzaufrufe", async () => {
  const st = fakeStorage({ status: 404 });
  let t = 1000;
  const a = createAblage({ bucket: BUCKET, auth: authOn, fetchImpl: st.fetchImpl, now: () => t });
  assert.deepEqual(await a.upload("x/1", new Uint8Array([1]), "image/jpeg"), { ok: false, reason: "fehlt" });
  assert.equal(a.ready(), false);
  assert.deepEqual(await a.upload("x/1", new Uint8Array([1]), "image/jpeg"), { ok: false, reason: "aus" });
  assert.equal(st.calls.length, 1);
  t += 5 * 60000 + 1;
  assert.equal(a.ready(), true);
});

test("Regeln lehnen ab: 'regeln'; falsche Größe in der Antwort: nicht als gespeichert werten", async () => {
  const st = fakeStorage({ status: 403 });
  const a = createAblage({ bucket: BUCKET, auth: authOn, fetchImpl: st.fetchImpl });
  assert.equal((await a.upload("x/1", new Uint8Array([1]), "image/jpeg")).reason, "regeln");
  const liar = async () => ({ ok: true, status: 200, json: async () => ({ size: "1" }) });
  const b = createAblage({ bucket: BUCKET, auth: authOn, fetchImpl: liar });
  assert.deepEqual(await b.upload("x/2", new Uint8Array([1, 2, 3]), "image/jpeg"), { ok: false, reason: "groesse" });
});
