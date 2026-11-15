// Graph des Vorrats: Gruppen, Wolken auf dem Ring, Simulation ohne Zufall, Rezept-Kanten, Rangliste zur Auswahl
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOf, graphNodes, clusterList, radialLayout, sectorPath, recipeLinks, rankForSelection, nodeRadius, groupColor, R_IN, R_CENTER } from "../src/logic/graph.js";
import { normalizeRecipe } from "../src/logic/recipes.js";

const item = (name,p,extra={}) => ({key:name.toLowerCase(),toks:[name.toLowerCase()],name,p,left:10,sub:"",...extra});

test("groupOf: Gruppenname, Haushaltsbuch-Unterrubrik, sonst aus dem Namen", () => {
  assert.equal(groupOf({name:"Linsen",sub:"Trockenwaren"}), "Trockenwaren");
  assert.equal(groupOf({name:"Hackfleisch",sub:"Fleisch & Geflügel"}), "Fleisch");
  assert.equal(groupOf({name:"Joghurt",sub:"Molkerei"}), "Milchprodukte");
  assert.equal(groupOf({name:"Kokosmilch",sub:""}), "Konserven");
  assert.equal(groupOf({name:"Dings",sub:"Irgendwas"}), "Sonstiges");
});

test("graphNodes: ab STOCK_MIN oder Dauervorrat; Radius waechst mit p; auslaufend bei <=2 Tagen", () => {
  const nodes = graphNodes([item("Milch",0.9,{left:1}), item("Alt",0.1), item("Salz",0.05,{permanent:true,left:Infinity}), item("Reis",0.5,{sub:"Trockenwaren"})]);
  assert.deepEqual(nodes.map(n=>n.name), ["Milch","Salz","Reis"]);
  assert.equal(nodes[0].expiring, true);
  assert.equal(nodes[1].p, 1);
  assert.equal(nodes[1].permanent, true);
  assert.ok(nodeRadius(1)>nodeRadius(0.3));
  assert.equal(nodes[2].group, "Trockenwaren");
});

test("clusterList: feste Reihenfolge der Gruppen; groupColor hat fuer jede Gruppe einen Akzent", () => {
  const nodes = graphNodes([item("Reis",0.8,{sub:"Trockenwaren"}), item("Apfel",0.8,{sub:"Obst"}), item("Birne",0.7,{sub:"Obst"}), item("Lachs",0.9,{sub:"Fisch"})]);
  const cl = clusterList(nodes);
  assert.deepEqual(cl.map(c=>c.name), ["Obst","Fisch","Trockenwaren"]);
  assert.equal(cl[0].n, 2);
  assert.ok(/^#/.test(groupColor("Obst")) && groupColor("Unbekannt")===groupColor("Sonstiges"));
});

test("radialLayout: Kuchenstuecke fuellen den Kreis, Winkel nach Anzahl (+1), Punkte im eigenen Stueck ausserhalb des Rezeptkreises, ohne Ueberlappung", () => {
  const stock = ["Apfel","Birne","Banane","Trauben","Kiwi","Mango","Pflaume","Feige"].map(n=>item(n,0.8,{sub:"Obst"}))
    .concat(["Reis","Linsen","Nudeln"].map(n=>item(n,0.6,{sub:"Trockenwaren"})), [item("Lachs",0.9,{sub:"Fisch"})]);
  const nodes = graphNodes(stock);
  const {sectors,placed,rOut} = radialLayout(nodes);
  assert.deepEqual(sectors.map(s=>s.name), ["Obst","Fisch","Trockenwaren"]);
  const total = sectors.reduce((a,s)=>a+(s.a1-s.a0),0);
  assert.ok(Math.abs(total-2*Math.PI)<1e-9);
  assert.ok(Math.abs(sectors[0].a0+Math.PI/2)<1e-9, "beginnt oben");
  const span = (s)=>s.a1-s.a0;
  assert.ok(Math.abs(span(sectors[0])/span(sectors[2]) - 9/4) < 1e-9, "Obst (8+1) zu Trockenwaren (3+1)");
  assert.equal(placed.length, nodes.length);
  const sameAngle = (a,b)=>{ let d=(a-b)%(2*Math.PI); if(d<0) d+=2*Math.PI; return d; };
  placed.forEach(n=>{
    const sec = sectors.find(s=>s.name===n.group);
    const rel = sameAngle(n.ang, sec.a0);
    assert.ok(rel>=0 && rel<=span(sec)+1e-9, n.name+" liegt in seinem Stueck");
    assert.ok(Math.hypot(n.x,n.y) > R_IN && Math.hypot(n.x,n.y) < rOut, n.name+" liegt zwischen innerem Rand und aussen");
    assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));
  });
  for(let i=0;i<placed.length;i++) for(let j=i+1;j<placed.length;j++){
    const p=placed[i], q=placed[j];
    assert.ok(Math.hypot(p.x-q.x,p.y-q.y) >= p.r+q.r+20, p.name+"/"+q.name+" zu nah");
  }
  // wahrscheinlichste innen: Apfel (0.8) ist nicht weiter aussen als ein schwaecherer Obst-Punkt
  const obst = placed.filter(n=>n.group==="Obst");
  assert.ok(obst.every(n=>n.ring<=2));
  assert.ok(rOut > R_IN + 60 && R_CENTER < R_IN);
  // zugeklappt: ein Kreis statt der Punkte, Stueck wird schmal
  const col = radialLayout(nodes, new Set(["Obst"]));
  assert.equal(col.placed.filter(n=>n.group==="Obst").length, 0);
  assert.ok(col.sectors[0].collapsed && col.sectors[0].r>20 && span(col.sectors[0]) < span(sectors[0]));
  // eine einzige Gruppe = voller Ring
  const one = radialLayout(graphNodes([item("Lachs",0.9,{sub:"Fisch"})]));
  assert.ok(Math.abs(span(one.sectors[0])-2*Math.PI)<1e-9);
  assert.ok(sectorPath(one.sectors[0].a0,one.sectors[0].a1,100,200).startsWith("M 200 0 A"));
  assert.ok(/^M .* Z$/.test(sectorPath(0,1,100,200)));
});

test("recipeLinks: vorhandene Zutaten als Kanten, fehlende getrennt, Grundvorrat zaehlt nicht", () => {
  const stock = [item("Hackfleisch",0.8), item("Tomaten",0.5), item("Zwiebeln",0.1)];
  const rec = normalizeRecipe("Bolo", {ingredients:["300 g Hackfleisch","1 Dose Tomaten","2 Zwiebeln","Salz","200 g Spaghetti"]}, 0);
  const l = recipeLinks(rec, stock);
  assert.deepEqual(l.present.map(x=>x.key), ["hackfleisch","tomaten"]);
  assert.deepEqual(l.missing.map(x=>x.name), ["Zwiebeln","Spaghetti"]);
  assert.ok(Math.abs(l.cov-(0.8+0.5)/4)<1e-9);
});

test("rankForSelection: ohne Auswahl nach Abdeckung, mit Auswahl nach Treffern; Rezepte ohne Treffer fallen weg", () => {
  const stock = [item("Hackfleisch",0.9), item("Tomaten",0.8), item("Reis",0.7)];
  const pool = [
    {key:"Bolo",rec:normalizeRecipe("Bolo",{ingredients:["Hackfleisch","Tomaten","Spaghetti"]},0)},
    {key:"Reispfanne",rec:normalizeRecipe("Reispfanne",{ingredients:["Reis","Paprika","Ei"]},0)},
    {key:"Chili",rec:normalizeRecipe("Chili",{ingredients:["Hackfleisch","Tomaten","Bohnen","Reis"]},0)},
  ];
  const free = rankForSelection(pool, stock, new Set());
  assert.equal(free.length, 3);
  assert.equal(free[0].key, "Chili");                 // 3 von 4 da
  const sel = rankForSelection(pool, stock, new Set(["reis"]));
  assert.deepEqual(sel.map(e=>e.key), ["Chili","Reispfanne"]);
  assert.equal(sel[0].hits, 1); assert.equal(sel[0].of, 1);
  const two = rankForSelection(pool, stock, ["hackfleisch","reis"]);
  assert.equal(two[0].key, "Chili"); assert.equal(two[0].hits, 2);
});
