// Hilfsfunktionen der KI-Function: Erzeugungsparameter, Herkunftsprüfung, Drossel, Nachrichtenumwandlung
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickGeneration, originAllowed, makeRateLimiter, toGeminiContents, readErrorText, audioMime } from "../api/_shared.js";

test("pickGeneration: extract, suggest, unbekannt, fehlend", () => {
  assert.deepEqual(pickGeneration("extract"), { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } });
  assert.deepEqual(pickGeneration("suggest"), { temperature: 0.3, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 1024 } });
  assert.deepEqual(pickGeneration("irgendwas"), pickGeneration("extract"));
  assert.deepEqual(pickGeneration(undefined), pickGeneration("extract"));
});

test("originAllowed: Origin gleich Host", () => {
  assert.equal(originAllowed({ host: "plan.example.de", origin: "https://plan.example.de" }), true);
});

test("originAllowed: Referer gleich Host", () => {
  assert.equal(originAllowed({ host: "plan.example.de", referer: "https://plan.example.de/rezepte?x=1" }), true);
});

test("originAllowed: fremder Host wird abgelehnt", () => {
  assert.equal(originAllowed({ host: "plan.example.de", origin: "https://boese.example.com" }), false);
  assert.equal(originAllowed({ host: "plan.example.de", referer: "https://boese.example.com/plan.example.de" }), false);
  assert.equal(originAllowed({ host: "plan.example.de", origin: "kein-url" }), false);
});

test("originAllowed: localhost und 127.0.0.1 sind erlaubt", () => {
  assert.equal(originAllowed({ host: "plan.example.de", origin: "http://localhost:5173" }), true);
  assert.equal(originAllowed({ host: "localhost:3000", referer: "http://127.0.0.1:5173/" }), true);
});

test("originAllowed: Origin und Referer fehlen -> abgelehnt", () => {
  assert.equal(originAllowed({ host: "plan.example.de" }), false);
  assert.equal(originAllowed({}), false);
  assert.equal(originAllowed(undefined), false);
});

test("makeRateLimiter: 21. Anfrage in der Minute wird abgelehnt, nach Ablauf wieder erlaubt", () => {
  let t = 1_000_000;
  const allow = makeRateLimiter({ max: 20, windowMs: 60000, now: () => t });
  for (let i = 0; i < 20; i++) assert.equal(allow("1.2.3.4"), true, "Anfrage " + (i + 1));
  assert.equal(allow("1.2.3.4"), false);
  assert.equal(allow("5.6.7.8"), true, "andere IP ist unabhängig");
  t += 59_000;
  assert.equal(allow("1.2.3.4"), false, "Fenster noch nicht abgelaufen");
  t += 2_000;
  assert.equal(allow("1.2.3.4"), true, "nach Ablauf wieder erlaubt");
});

test("toGeminiContents: Text und Bild", () => {
  const out = toGeminiContents([
    { role: "user", content: "Hallo" },
    { role: "assistant", content: "Antwort" },
    { role: "user", content: [
      { type: "text", text: "Was ist das?" },
      { type: "image", source: { media_type: "image/png", data: "QUJD" } },
    ] },
  ]);
  assert.deepEqual(out, [
    { role: "user", parts: [{ text: "Hallo" }] },
    { role: "model", parts: [{ text: "Antwort" }] },
    { role: "user", parts: [{ text: "Was ist das?" }, { inlineData: { mimeType: "image/png", data: "QUJD" } }] },
  ]);
  assert.deepEqual(toGeminiContents(undefined), []);
});

test("toGeminiContents: Sprachaufnahme nur in bekannten Tonformaten", () => {
  const out = toGeminiContents([{ role: "user", content: [
    { type: "audio", source: { media_type: "audio/webm;codecs=opus", data: "QUJD" } },
    { type: "audio", source: { media_type: "audio/mp4", data: "REVG" } },
    { type: "audio", source: { media_type: "text/html", data: "R0hJ" } },
  ] }]);
  assert.deepEqual(out[0].parts, [
    { inlineData: { mimeType: "audio/webm", data: "QUJD" } },
    { inlineData: { mimeType: "audio/mp4", data: "REVG" } },
    { text: "" },
  ]);
  assert.equal(audioMime("Audio/MP4; codecs=mp4a.40.2"), "audio/mp4");
  assert.equal(audioMime(""), "");
  assert.equal(audioMime("video/mp4"), "audio/mp4", "iPhone");
});

test("readErrorText: deutsche Meldungen je Status", () => {
  assert.match(readErrorText(401, ""), /Schlüssel/);
  assert.match(readErrorText(403, ""), /Schlüssel/);
  assert.match(readErrorText(429, ""), /Kontingent/);
  assert.match(readErrorText(503, ""), /überlastet/);
  assert.match(readErrorText(500, "xyz"), /500.*xyz/);
});
