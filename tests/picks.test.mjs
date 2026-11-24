// Vormerken und Vorschlaege: node --test tests/picks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickList, groupPicks, dayLabel, dayChoices, addDays, picksForDay } from "../src/logic/picks.js";
import { suggestScore, rankSuggestions, suggestable, hash01 } from "../src/logic/suggest.js";
import { hbStock } from "../src/logic/stock.js";
import { normalizeRecipe } from "../src/logic/recipes.js";
import { todayISO } from "../src/logic/weeks.js";

const T = "2026-11-14";   // Samstag

test("pickList: Reihenfolge datiert vor demnaechst, Unsinn wird ignoriert", () => {
  const l = pickList({ a:{key:"X",day:"",createdAt:5}, b:{key:"Y",day:"2026-11-15",createdAt:1}, c:{key:"Z",day:"2026-11-14",createdAt:9}, d:{key:"",day:"2026-11-14"}, e:"kaputt", f:{key:"W",day:"heute",createdAt:2} });
  assert.deepEqual(l.map(p=>p.id), ["c","b","f","a"]);
  assert.equal(l[3].day, "", "ungueltiges Datum = demnaechst");
});

test("groupPicks und dayLabel: Heute, Morgen, Wochentag, vorbei, Demnaechst", () => {
  const l = pickList({ a:{key:"A",day:T,createdAt:1}, b:{key:"B",day:addDays(T,1),createdAt:1}, c:{key:"C",day:addDays(T,3),createdAt:1}, d:{key:"D",day:"",createdAt:1}, e:{key:"E",day:addDays(T,-2),createdAt:1} });
  const g = groupPicks(l, T);
  assert.deepEqual(g.map(x=>x.label), ["Do, 12.11. (vorbei)","Heute","Morgen","Dienstag, 17.11.","Demnächst"]);
  assert.equal(g[0].past, true);
  assert.equal(picksForDay(l, T).length, 1);
  assert.equal(dayChoices(T).length, 8);
  assert.equal(dayChoices(T)[7].day, "");
  assert.equal(dayLabel("", T), "Demnächst");
});

test("suggestScore: Vorrat und Dringlichkeit zaehlen, frisch Gekochtes wird gebremst, kein Haeufigkeitsbonus", () => {
  const T = todayISO();                 // hbStock rechnet mit dem echten Heute, darum hier kein festes Datum
  const d = (n) => addDays(T, -n);
  const book = { entries: { e1: { date: d(1), category:"Lebensmittel", items:[ { name:"Rinderhack 500g", amount:1, sub:"Fleisch" } ] }, e2: { date: d(1), category:"Lebensmittel", items:[ { name:"Spaghetti", amount:1, sub:"Trockenwaren" } ] } } };
  const stock = hbStock(book, "Lebensmittel");
  const bolo = normalizeRecipe("Bolognese", { ingredients:["Hackfleisch 300g","Pasta 200g","Salz"] }, 0);
  const a = suggestScore(bolo, stock, { today:T, key:"Bolognese" });
  assert.ok(a.cov > 0.6, "beides da: "+a.cov);
  assert.ok(a.urgent.length >= 1, "Hackfleisch verdirbt bald");
  assert.ok(a.reasons.some(r=>r.startsWith("verwendet")) && a.reasons.some(r=>r.includes("hält noch")), a.reasons.join(" | "));
  const often = normalizeRecipe("Oft", { ingredients:["Hackfleisch 300g","Pasta 200g"], cooked:["2026-01-01","2026-02-01","2026-03-01","2026-04-01"] }, 0);
  const once  = normalizeRecipe("Einmal", { ingredients:["Hackfleisch 300g","Pasta 200g"], cooked:["2026-03-01"] }, 0);
  const so = suggestScore(often, stock, { today:T, key:"Oft" }), si = suggestScore(once, stock, { today:T, key:"Einmal" });
  assert.ok(Math.abs(so.score - si.score) < 9, "Haeufigkeit bringt keinen Bonus (nur Streuung): "+so.score+" vs "+si.score);
  const fresh = normalizeRecipe("Frisch", { ingredients:["Hackfleisch 300g","Pasta 200g"], cooked:[d(2)] }, 0);
  const sf = suggestScore(fresh, stock, { today:T, key:"Frisch" });
  assert.ok(si.score - sf.score > 30, "vor 2 Tagen gekocht: deutlich gebremst");
  assert.equal(suggestScore(bolo, [], { today:T }).cov, 0, "ohne Vorrat keine Abdeckung");
});

test("rankSuggestions: Filter, Grundfilter, deterministische Streuung je Tag, 'Andere' mischt neu", () => {
  const mk = (name, extra) => ({ key:name, rec: normalizeRecipe(name, { ingredients:["Pasta 200g"], ...extra }, 0), basis:false });
  const pool = [ mk("A",{minutes:20}), mk("B",{tags:["kinder"],minutes:50}), mk("C",{category:"Beilagen & Salate"}), mk("D",{category:"Frühstück"}) ];
  const r = rankSuggestions(pool, [], { today:T, hour:12 });
  assert.deepEqual(r.map(x=>x.key).sort(), ["A","B"], "Beilage und Fruehstueck (mittags) fallen raus");
  assert.deepEqual(rankSuggestions(pool, [], { today:T, hour:12, filters:{quick:true} }).map(x=>x.key), ["A"]);
  assert.deepEqual(rankSuggestions(pool, [], { today:T, hour:12, filters:{kids:true} }).map(x=>x.key), ["B"]);
  assert.ok(suggestable({category:"Frühstück"}, "Frühstück", 8) && !suggestable({category:"Frühstück"}, "Frühstück", 13));
  const r1 = rankSuggestions(pool, [], { today:T, hour:12 }), r2 = rankSuggestions(pool, [], { today:T, hour:12 });
  assert.deepEqual(r1.map(x=>x.key), r2.map(x=>x.key), "gleicher Tag, gleiche Reihenfolge");
  assert.ok(hash01("a")!==hash01("b") && hash01("x")>=0 && hash01("x")<1);
  const seeds = new Set([0,1,2,3,4,5].map(seed=>rankSuggestions(pool, [], { today:T, hour:12, seed }).map(x=>x.key).join(",")));
  assert.ok(seeds.size > 1, "'Andere Vorschlaege' aendert die Reihenfolge mindestens einmal");
});

test("rankSuggestions: erster Vorschlag wechselt taeglich in der Spitzengruppe, bleibt am Tag gleich, Vorrat zaehlt weiter", () => {
  const mk = (name, ings) => ({ key:name, rec: normalizeRecipe(name, { ingredients:ings }, 0), basis:false });
  const pool = ["A","B","C","D"].map(n=>mk(n,["Pasta 200g"]));
  const days = ["2026-11-16","2026-11-17","2026-11-18","2026-11-19","2026-11-20"];
  const tops = days.map(d=>rankSuggestions(pool, [], { today:d, hour:12 })[0].key);
  for(let i=1;i<tops.length;i++) assert.notEqual(tops[i], tops[i-1], "Tag "+days[i]+": anderer erster Vorschlag als am Vortag ("+tops.join(",")+")");
  assert.ok(new Set(tops).size >= 3, "mehrere Gerichte kommen dran: "+tops.join(","));
  const d = "2026-11-19";
  assert.equal(rankSuggestions(pool, [], { today:d, hour:12 })[0].key, rankSuggestions(pool, [], { today:d, hour:12 })[0].key, "gleicher Tag, gleicher Vorschlag");
  assert.equal(rankSuggestions(pool, [], { today:d, hour:12 }).length, 4, "kein Gericht geht verloren");
  // Gericht mit deutlich mehr Vorrat bleibt vorne, andere schieben sich nicht davor
  const book = { entries: { e1: { date: todayISO(), category:"Lebensmittel", items:[ { name:"Rinderhack 500g", amount:1, sub:"Fleisch" }, { name:"Spaghetti", amount:1, sub:"Trockenwaren" } ] } } };
  const stock = hbStock(book, "Lebensmittel");
  const pool2 = [ mk("Bolognese",["Hackfleisch 300g","Pasta 200g"]), mk("Curry",["Kokosmilch 400ml","Linsen 200g"]), mk("Suppe",["Lauch 1","Karotten 300g"]) ];
  for(const day of days) assert.equal(rankSuggestions(pool2, stock, { today:day, hour:12 })[0].key, "Bolognese", "Vorrat schlaegt Abwechslung am "+day);
});
