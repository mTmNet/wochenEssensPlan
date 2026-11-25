import test from "node:test";
import assert from "node:assert/strict";
import { pickAudioType, spokenItems, addedText } from "../src/logic/voice.js";

test("pickAudioType: erstes Format, das der Browser kann", () => {
  assert.equal(pickAudioType(() => true), "audio/webm;codecs=opus");
  assert.equal(pickAudioType((t) => t === "audio/mp4"), "audio/mp4", "iPhone");
  assert.equal(pickAudioType(() => false), "");
  assert.equal(pickAudioType(() => { throw new Error("alt"); }), "");
});

test("spokenItems: säubert die Antwort der KI", () => {
  assert.deepEqual(spokenItems({ items: ["2 l Milch", "  Zwiebeln ", "", "zwiebeln", { text: "Butter" }, null] }), ["2 l Milch", "Zwiebeln", "Butter"]);
  assert.deepEqual(spokenItems(["Brot"]), ["Brot"]);
  assert.deepEqual(spokenItems({}), []);
  assert.deepEqual(spokenItems(null), []);
  assert.equal(spokenItems({ items: Array.from({ length: 60 }, (_, i) => "P" + i) }).length, 40);
});

test("addedText: kurzer Hinweis", () => {
  assert.equal(addedText(["Milch"]), "1 Posten auf der Liste: Milch");
  assert.equal(addedText(["A", "B", "C", "D", "E"]), "5 Posten auf der Liste: A, B, C, D …");
});
