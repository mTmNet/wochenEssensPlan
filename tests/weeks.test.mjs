// Wochen und Datum: ISO-8601-Wochen, Wochendaten, Migration der alten Planform
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeekKey, weekDates, shiftWeek, weekLabel, todayDay, todayDayKey, shortDate, daysSince, emptyWeek, migrateWeek, slotList, mealSlotNow, slotOrderNow, todayISO } from "../src/logic/weeks.js";
import { DAYS, MEALS } from "../src/data.js";

test("isoWeekKey: Jahreswechsel nach ISO 8601", () => {
  assert.equal(isoWeekKey("2026-01-01"), "2026-W01");   // Donnerstag
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");   // Freitag, gehoert noch zu 2026
  assert.equal(isoWeekKey("2024-12-30"), "2025-W01");   // Montag, gehoert schon zu 2025
  assert.equal(isoWeekKey("2026-10-04"), "2026-W40");   // Sonntag = letzter Tag der Woche
  assert.equal(isoWeekKey("2026-10-05"), "2026-W41");   // Montag danach
  assert.equal(isoWeekKey("2021-01-03"), "2020-W53");
  assert.equal(isoWeekKey("2021-01-04"), "2021-W01");
  assert.equal(isoWeekKey("2025-12-29"), "2026-W01");
  assert.equal(isoWeekKey("2026-12-28"), "2026-W53");
  assert.equal(isoWeekKey(new Date(2026, 9, 4, 23, 30)), "2026-W40");   // Date-Objekt, spaet abends
});

test("weekDates: sieben Tage ab Montag, auch ueber den Jahreswechsel", () => {
  assert.deepEqual(weekDates("2026-W41"), ["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09","2026-10-10","2026-10-11"]);
  assert.deepEqual(weekDates("2026-W01"), ["2025-12-29","2025-12-30","2025-12-31","2026-01-01","2026-01-02","2026-01-03","2026-01-04"]);
  assert.deepEqual(weekDates("2026-W53")[4], "2027-01-01");
  assert.deepEqual(weekDates("2025-W01")[0], "2024-12-30");
  // Rueckrichtung: jedes Datum der Woche liefert denselben Schluessel
  ["2026-W01","2026-W40","2026-W53","2025-W01","2020-W53"].forEach(k => weekDates(k).forEach(d => assert.equal(isoWeekKey(d), k, d)));
});

test("shiftWeek und weekLabel", () => {
  assert.equal(shiftWeek("2026-W40", 1), "2026-W41");
  assert.equal(shiftWeek("2026-W01", -1), "2025-W52");
  assert.equal(shiftWeek("2026-W53", 1), "2027-W01");
  assert.equal(shiftWeek("2026-W40", 0), "2026-W40");
  assert.match(weekLabel("2026-W41"), /^KW 41 · 5\.–11\. Okt/);
  assert.match(weekLabel("2026-W40"), /^KW 40 · 28\. Sept?\.?–4\. Okt/);
});

test("shiftWeek ueber den Jahreswechsel in beide Richtungen", () => {
  assert.equal(shiftWeek("2024-W52", 1), "2025-W01");
  assert.equal(shiftWeek("2025-W01", -1), "2024-W52");
  assert.equal(shiftWeek("2020-W53", 1), "2021-W01");
  assert.equal(shiftWeek("2021-W01", -1), "2020-W53");
  assert.equal(shiftWeek("2026-W40", 13), "2026-W53");   // 2026 hat 53 ISO-Wochen
  assert.equal(shiftWeek("2026-W40", 14), "2027-W01");
  assert.equal(shiftWeek("2027-W01", -14), "2026-W40");
  // Hin und zurueck landet immer beim Ausgangsschluessel
  ["2026-W01","2026-W53","2025-W52","2020-W53"].forEach(k => assert.equal(shiftWeek(shiftWeek(k, 3), -3), k, k));
});

test("weekDates: Jahreswechsel 2024/2025 und 2026/2027 vollstaendig", () => {
  assert.deepEqual(weekDates("2025-W01"), ["2024-12-30","2024-12-31","2025-01-01","2025-01-02","2025-01-03","2025-01-04","2025-01-05"]);
  assert.deepEqual(weekDates("2026-W53"), ["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"]);
  assert.deepEqual(weekDates("2027-W01"), ["2027-01-04","2027-01-05","2027-01-06","2027-01-07","2027-01-08","2027-01-09","2027-01-10"]);
});

test("todayDay: Montag = 0, Sonntag = 6; todayDayKey liefert das Kuerzel", () => {
  assert.equal(todayDay("2026-10-05"), 0);
  assert.equal(todayDay("2026-10-04"), 6);
  assert.equal(DAYS[todayDay("2026-10-07")], "Mi");
  assert.equal(todayDayKey("2026-10-05"), "Mo");
  assert.equal(todayDayKey("2026-10-04"), "So");
  assert.equal(todayDayKey("2026-10-07"), "Mi");
  assert.equal(todayDayKey(), DAYS[todayDay()]);
});

test("shortDate fuer den Tageskopf", () => {
  assert.equal(shortDate("2026-10-06"), "6.10.");
  assert.equal(shortDate("2027-01-01"), "1.1.");
  assert.equal(shortDate("2026-12-31"), "31.12.");
});

test("daysSince ist nie negativ und rechnet in ganzen Tagen", () => {
  assert.equal(daysSince("2026-10-04", "2026-10-04"), 0);
  assert.equal(daysSince("2026-10-04", new Date(2026, 9, 4, 8, 0)), 0);    // vormittags am Kochtag
  assert.equal(daysSince("2026-10-04", new Date(2026, 9, 4, 0, 5)), 0);    // kurz nach Mitternacht
  assert.equal(daysSince("2026-10-04", new Date(2026, 9, 5, 0, 5)), 1);    // am Folgetag frueh = 1
  assert.equal(daysSince("2026-10-01", "2026-10-04"), 3);
  assert.equal(daysSince("2026-10-05", "2026-10-04"), 0);                  // Zukunft -> 0, nicht -1
  assert.equal(daysSince("2026-03-28", "2026-03-30"), 2);                  // Sommerzeit-Umstellung dazwischen
  assert.equal(daysSince(todayISO()), 0);                                  // heute = 0, egal zu welcher Uhrzeit
  assert.equal(daysSince(""), null);
  assert.equal(daysSince(null), null);
});

test("mealSlotNow: vor 11 Fruehstueck, 11-14 Mittag, danach Abend", () => {
  assert.equal(mealSlotNow(new Date(2026, 9, 4, 8)), "Fr");
  assert.equal(mealSlotNow(new Date(2026, 9, 4, 10, 59)), "Fr");
  assert.equal(mealSlotNow(new Date(2026, 9, 4, 11)), "Mi");
  assert.equal(mealSlotNow(new Date(2026, 9, 4, 12)), "Mi");
  assert.equal(mealSlotNow(new Date(2026, 9, 4, 14)), "Ab");
  assert.equal(mealSlotNow(new Date(2026, 9, 4, 19)), "Ab");
});

test("slotOrderNow: aktueller Slot zuerst, Snacks immer zuletzt", () => {
  assert.deepEqual(slotOrderNow(new Date(2026, 9, 4, 8)), ["Fr","Mi","Ab","Zw"]);
  assert.deepEqual(slotOrderNow(new Date(2026, 9, 4, 12)), ["Mi","Ab","Fr","Zw"]);
  assert.deepEqual(slotOrderNow(new Date(2026, 9, 4, 19)), ["Ab","Fr","Mi","Zw"]);
  assert.deepEqual([...slotOrderNow()].sort(), [...MEALS].sort());
});

test("emptyWeek und slotList", () => {
  const w = emptyWeek();
  assert.deepEqual(Object.keys(w).filter(k=>k!=="planId"), DAYS);
  assert.equal(w.planId, "", "kein Essensplan");
  assert.equal(migrateWeek({ planId:"eisen-postpartal" }).planId, "eisen-postpartal", "planId bleibt beim Normalisieren erhalten");
  DAYS.forEach(d => { assert.equal(w[d].cook, ""); MEALS.forEach(m => assert.deepEqual(w[d].meals[m], [])); });
  assert.deepEqual(slotList(""), []);
  assert.deepEqual(slotList("Pasta"), ["Pasta"]);
  assert.deepEqual(slotList(["A","","B"]), ["A","B"]);
  assert.deepEqual(slotList({0:"A",1:"B"}), ["A","B"]);
  assert.deepEqual(slotList(null), []);
});

test("migrateWeek: Einzel-Strings werden Arrays, leere Slots leere Arrays, Koch bleibt", () => {
  const old = {
    Mo: { meals: { Fr:"", Mi:"Reste", Ab:"Pasta Bolognese", Zw:"" }, cook:"Anna" },
    Di: { meals: { Ab:["Risotto","Salat"] } },
    Fr: { Ab:"Pizza" },                       // ganz alte Form ohne meals
  };
  const w = migrateWeek(old);
  assert.deepEqual(w.Mo.meals, { Fr:[], Mi:["Reste"], Ab:["Pasta Bolognese"], Zw:[] });
  assert.equal(w.Mo.cook, "Anna");
  assert.deepEqual(w.Di.meals.Ab, ["Risotto","Salat"]);
  assert.deepEqual(w.Di.meals.Fr, []);
  assert.equal(w.Di.cook, "");
  assert.deepEqual(w.Fr.meals.Ab, ["Pizza"]);
  assert.deepEqual(w.So.meals, { Fr:[], Mi:[], Ab:[], Zw:[] });
  assert.deepEqual(migrateWeek(null), emptyWeek());
  assert.deepEqual(migrateWeek("kaputt"), emptyWeek());
});
