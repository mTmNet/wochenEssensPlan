// Prüfung des Anmelde-Nachweises (api/_token.js) mit selbst erzeugtem Schlüsselpaar statt Googles Schlüsseln
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyIdToken, bearer, _resetKeyCache } from "../api/_token.js";

const PID = "projekt-test";
const T0 = Date.UTC(2026, 10, 19, 12, 0, 0);
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const makeToken = ({ head = {}, body = {}, key = privateKey } = {}) => {
  const t = Math.floor(T0 / 1000);
  const h = b64({ alg: "RS256", kid: "k1", typ: "JWT", ...head });
  const p = b64({ iss: "https://securetoken.google.com/" + PID, aud: PID, sub: "nutzer123", iat: t - 60, exp: t + 3000, ...body });
  return h + "." + p + "." + sign("RSA-SHA256", Buffer.from(h + "." + p), key).toString("base64url");
};
const keysFetch = (calls = { n: 0 }) => async () => { calls.n++; return { ok: true, status: 200, headers: { get: () => "public, max-age=600" }, json: async () => ({ keys: [jwk] }) }; };
const opts = (extra = {}) => ({ fetchImpl: keysFetch(), now: () => T0, ...extra });

test("gültiger Nachweis liefert die Nutzer-ID", async () => {
  _resetKeyCache();
  assert.equal(await verifyIdToken(makeToken(), PID, opts()), "nutzer123");
});

test("falsches Projekt, Aussteller, abgelaufen oder ohne Nutzer-ID: leer", async () => {
  _resetKeyCache();
  assert.equal(await verifyIdToken(makeToken({ body: { aud: "anderes" } }), PID, opts()), "");
  assert.equal(await verifyIdToken(makeToken({ body: { iss: "https://example.com" } }), PID, opts()), "");
  assert.equal(await verifyIdToken(makeToken({ body: { exp: Math.floor(T0 / 1000) - 1 } }), PID, opts()), "");
  assert.equal(await verifyIdToken(makeToken({ body: { iat: Math.floor(T0 / 1000) + 3600 } }), PID, opts()), "");
  assert.equal(await verifyIdToken(makeToken({ body: { sub: "" } }), PID, opts()), "");
});

test("fremde Signatur, falscher Algorithmus, Unsinn: leer", async () => {
  _resetKeyCache();
  assert.equal(await verifyIdToken(makeToken({ key: other.privateKey }), PID, opts()), "");
  assert.equal(await verifyIdToken(makeToken({ head: { alg: "none" } }), PID, opts()), "");
  assert.equal(await verifyIdToken("abc", PID, opts()), "");
  assert.equal(await verifyIdToken("", PID, opts()), "");
  const t = makeToken(); const [h, , s] = t.split(".");
  assert.equal(await verifyIdToken(h + "." + b64({ aud: PID, iss: "https://securetoken.google.com/" + PID, sub: "boese", exp: 9e9, iat: 0 }) + "." + s, PID, opts()), "");
});

test("Schlüssel werden zwischengespeichert; unbekannter Schlüssel holt höchstens einmal pro Minute neu", async () => {
  _resetKeyCache();
  const calls = { n: 0 };
  const o = { fetchImpl: keysFetch(calls), now: () => T0 };
  await verifyIdToken(makeToken(), PID, o);
  await verifyIdToken(makeToken(), PID, o);
  assert.equal(calls.n, 1);
  assert.equal(await verifyIdToken(makeToken({ head: { kid: "unbekannt" } }), PID, o), "");
  assert.equal(await verifyIdToken(makeToken({ head: { kid: "unbekannt" } }), PID, o), "");
  assert.equal(calls.n, 1);
});

test("Schlüssel nicht abrufbar: leer, wirft nicht", async () => {
  _resetKeyCache();
  assert.equal(await verifyIdToken(makeToken(), PID, { fetchImpl: async () => { throw new Error("offline"); }, now: () => T0 }), "");
  _resetKeyCache();
  assert.equal(await verifyIdToken(makeToken(), PID, { fetchImpl: async () => ({ ok: false, status: 500 }), now: () => T0 }), "");
});

test("bearer liest den Nachweis aus dem Kopf", () => {
  assert.equal(bearer({ authorization: "Bearer abc.def.ghi" }), "abc.def.ghi");
  assert.equal(bearer({ authorization: "Basic xyz" }), "");
  assert.equal(bearer({}), "");
  assert.equal(bearer(undefined), "");
});
