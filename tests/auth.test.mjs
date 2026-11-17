// Anonyme Anmeldung (src/auth.js): anmelden, merken, erneuern, Ausfall, Wiederholung nach abgelehntem Nachweis
import test from "node:test";
import assert from "node:assert/strict";
import { createAuth, authedFetch, AUTH_KEY } from "../src/auth.js";

const memStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), clone() { return this; } });
// Nachgebauter Anmeldedienst: zählt Aufrufe, Verhalten je Test einstellbar
const fakeGoogle = (opt = {}) => {
  const calls = { signUp: 0, refresh: 0 };
  const fetchImpl = async (url, init) => {
    if (opt.offline) throw new Error("offline");
    if (url.includes("accounts:signUp")) {
      calls.signUp++;
      if (opt.signUpStatus) return res(opt.signUpStatus, { error: { message: "ADMIN_ONLY_OPERATION" } });
      return res(200, { idToken: "id-" + calls.signUp, refreshToken: "rt-" + calls.signUp, localId: "uid-" + calls.signUp, expiresIn: "3600" });
    }
    if (url.includes("securetoken")) {
      calls.refresh++;
      assert.match(String(init.body), /grant_type=refresh_token&refresh_token=/);
      if (opt.refreshDead) return res(400, { error: { message: "TOKEN_EXPIRED" } });
      if (opt.refreshStatus) return res(opt.refreshStatus, "kaputt");
      return res(200, { id_token: "idr-" + calls.refresh, refresh_token: "rtr-" + calls.refresh, user_id: "uid-alt", expires_in: "3600" });
    }
    throw new Error("unerwartete Adresse " + url);
  };
  return { fetchImpl, calls, opt };
};

test("ohne Web-Schlüssel ist die Anmeldung aus und es geht kein Aufruf hinaus", async () => {
  const g = fakeGoogle();
  const a = createAuth({ apiKey: "", fetchImpl: g.fetchImpl, storage: memStorage() });
  assert.equal(a.enabled, false);
  assert.equal(await a.token(), "");
  assert.deepEqual(g.calls, { signUp: 0, refresh: 0 });
});

test("erster Start meldet anonym an und merkt sich nur Nutzer-ID und Erneuerungs-Schlüssel", async () => {
  const g = fakeGoogle(), st = memStorage();
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: st });
  assert.equal(await a.token(), "id-1");
  assert.equal(a.uid(), "uid-1");
  assert.deepEqual(JSON.parse(st.getItem(AUTH_KEY)), { uid: "uid-1", refreshToken: "rt-1" });
  assert.equal(await a.token(), "id-1");
  assert.equal(g.calls.signUp, 1, "gültiger Nachweis wird wiederverwendet");
});

test("gleichzeitige Aufrufe lösen nur eine Anmeldung aus", async () => {
  const g = fakeGoogle();
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: memStorage() });
  const all = await Promise.all([a.token(), a.token(), a.token()]);
  assert.deepEqual(all, ["id-1", "id-1", "id-1"]);
  assert.equal(g.calls.signUp, 1);
});

test("nächster Start erneuert mit dem gespeicherten Schlüssel und behält die Nutzer-ID", async () => {
  const g = fakeGoogle(), st = memStorage({ [AUTH_KEY]: JSON.stringify({ uid: "uid-alt", refreshToken: "rt-alt" }) });
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: st });
  assert.equal(a.uid(), "uid-alt");
  assert.equal(await a.token(), "idr-1");
  assert.deepEqual(g.calls, { signUp: 0, refresh: 1 });
  assert.equal(JSON.parse(st.getItem(AUTH_KEY)).refreshToken, "rtr-1");
});

test("abgelaufener Nachweis wird vor Ablauf erneuert", async () => {
  let t = 1000000;
  const g = fakeGoogle();
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: memStorage(), now: () => t });
  assert.equal(await a.token(), "id-1");
  t += 3500 * 1000;
  assert.equal(await a.token(), "idr-1");
  assert.equal(a.uid(), "uid-alt");
});

test("endgültig ungültige Anmeldung führt zu einer neuen Nutzer-ID", async () => {
  const g = fakeGoogle({ refreshDead: true }), st = memStorage({ [AUTH_KEY]: JSON.stringify({ uid: "uid-alt", refreshToken: "rt-alt" }) });
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: st });
  assert.equal(await a.token(), "id-1");
  assert.equal(a.uid(), "uid-1");
});

test("Störung beim Erneuern: kein Nachweis, Nutzer-ID bleibt, nächster Versuch erst nach der Pause", async () => {
  let t = 5000000;
  const g = fakeGoogle({ refreshStatus: 503 }), st = memStorage({ [AUTH_KEY]: JSON.stringify({ uid: "uid-alt", refreshToken: "rt-alt" }) });
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: st, now: () => t });
  assert.equal(await a.token(), "");
  assert.equal(await a.token(), "");
  assert.deepEqual(g.calls, { signUp: 0, refresh: 1 }, "keine neue Anmeldung, kein Dauerfeuer");
  assert.equal(a.uid(), "uid-alt");
  g.opt.refreshStatus = 0; t += 31000;
  assert.equal(await a.token(), "idr-2");
});

test("ohne Netz und bei abgeschalteter Anmeldung liefert token() leer und wirft nicht", async () => {
  const off = createAuth({ apiKey: "K", fetchImpl: fakeGoogle({ offline: true }).fetchImpl, storage: memStorage() });
  assert.equal(await off.token(), "");
  const aus = createAuth({ apiKey: "K", fetchImpl: fakeGoogle({ signUpStatus: 400 }).fetchImpl, storage: memStorage() });
  assert.equal(await aus.token(), "");
});

test("gesperrter oder fehlender Gerätespeicher stört die Anmeldung nicht", async () => {
  const kaputt = { getItem() { throw new Error("gesperrt"); }, setItem() { throw new Error("gesperrt"); } };
  assert.equal(await createAuth({ apiKey: "K", fetchImpl: fakeGoogle().fetchImpl, storage: kaputt }).token(), "id-1");
  assert.equal(await createAuth({ apiKey: "K", fetchImpl: fakeGoogle().fetchImpl, storage: null }).token(), "id-1");
});

test("authedFetch hängt den Nachweis an und lässt ihn ohne Anmeldung weg", async () => {
  const seen = []; const db = async (url) => { seen.push(url); return res(200, {}); };
  const a = createAuth({ apiKey: "K", fetchImpl: fakeGoogle().fetchImpl, storage: memStorage() });
  await authedFetch(a, db, "https://db/plans/X.json", {}, 1);
  await authedFetch(a, db, "https://db/plans.json?shallow=true", {}, 1);
  await authedFetch(createAuth({ apiKey: "" }), db, "https://db/plans/X.json", {}, 1);
  assert.deepEqual(seen, ["https://db/plans/X.json?auth=id-1", "https://db/plans.json?shallow=true&auth=id-1", "https://db/plans/X.json"]);
});

test("abgelehnter Nachweis: einmal mit frischem Nachweis wiederholen", async () => {
  const seen = []; const db = async (url) => { seen.push(url); return url.endsWith("auth=id-1") ? res(401, { error: "Auth token is expired" }) : res(200, {}); };
  const a = createAuth({ apiKey: "K", fetchImpl: fakeGoogle().fetchImpl, storage: memStorage() });
  const r = await authedFetch(a, db, "https://db/p.json", {}, 1);
  assert.equal(r.status, 200);
  assert.deepEqual(seen, ["https://db/p.json?auth=id-1", "https://db/p.json?auth=idr-1"]);
});

test("abgelehnter Nachweis bei gestörter Anmeldung: Anfrage geht ohne Nachweis hinaus", async () => {
  const g = fakeGoogle(); const seen = [];
  const db = async (url) => { seen.push(url); return url.includes("auth=") ? res(401, { error: "Could not parse auth token." }) : res(200, {}); };
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: memStorage() });
  await a.token(); g.opt.refreshStatus = 503;
  const r = await authedFetch(a, db, "https://db/p.json", {}, 1);
  assert.equal(r.status, 200);
  assert.equal(seen.at(-1), "https://db/p.json");
});

test("von den Regeln verboten (Permission denied): keine Wiederholung, kein neuer Nachweis", async () => {
  const g = fakeGoogle(); let n = 0; const db = async () => { n++; return res(401, { error: "Permission denied" }); };
  const a = createAuth({ apiKey: "K", fetchImpl: g.fetchImpl, storage: memStorage() });
  const r = await authedFetch(a, db, "https://db/p.json", {}, 1);
  assert.equal(r.status, 401); assert.equal(n, 1);
  assert.deepEqual(g.calls, { signUp: 1, refresh: 0 });
});
