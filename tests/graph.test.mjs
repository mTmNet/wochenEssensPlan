// Graph des Vorrats: Gruppen, Wolken auf dem Ring, Simulation ohne Zufall, Rezept-Kanten, Rangliste zur Auswahl
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOf, graphNodes, clusterList, clusterCenters, clusterRadius, createSim, settle, clusterHull, boundsOf, recipeLinks, missingPositions, rankForSelection, nodeRadius } from "../src/logic/graph.js";
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

test("clusterList/clusterCenters: feste Reihenfolge, eine Wolke in der Mitte, mehrere auf dem Ring ohne Ueberlappung", () => {
  const nodes = graphNodes([item("Reis",0.8,{sub:"Trockenwaren"}), item("Apfel",0.8,{sub:"Obst"}), item("Birne",0.7,{sub:"Obst"}), item("Lachs",0.9,{sub:"Fisch"})]);
  const cl = clusterList(nodes);
  assert.deepEqual(cl.map(c=>c.name), ["Obst","Fisch","Trockenwaren"]);
  assert.equal(cl[0].n, 2);
  assert.deepEqual(clusterCenters([cl[0]]), {Obst:{x:0,y:0}});
  const centers = clusterCenters(cl);
  const names = Object.keys(centers);
  assert.equal(names.length, 3);
  for(let i=0;i<names.length;i++) for(let j=i+1;j<names.length;j++){
    const a=centers[names[i]], b=centers[names[j]];
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y) >= clusterRadius(cl[i].n)+clusterRadius(cl[j].n), names[i]+"/"+names[j]+" ueberlappen");
  }
  // Mitte bleibt frei: kein Mittelpunkt naeher als 150 am Ursprung
  names.forEach(n=>assert.ok(Math.hypot(centers[n].x,centers[n].y)>=150));
});

test("Simulation: deterministisch, ohne NaN, kommt zur Ruhe, Punkte einer Wolke bleiben zusammen und ueberlappen nicht", () => {
  const stock = ["Apfel","Birne","Banane","Trauben","Kiwi","Mango"].map(n=>item(n,0.8,{sub:"Obst"})).concat(["Reis","Linsen","Nudeln"].map(n=>item(n,0.6,{sub:"Trockenwaren"})));
  const nodes = graphNodes(stock), cl = clusterList(nodes), centers = clusterCenters(cl);
  const a = settle(createSim(nodes,centers)), b = settle(createSim(nodes,centers));
  assert.deepEqual(a.nodes.map(n=>[n.x,n.y]), b.nodes.map(n=>[n.x,n.y]));
  assert.ok(a.ticks<200, "kommt vor 200 Schritten zur Ruhe: "+a.ticks);
  a.nodes.forEach(n=>{ assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y)); });
  for(let i=0;i<a.nodes.length;i++) for(let j=i+1;j<a.nodes.length;j++){
    const p=a.nodes[i], q=a.nodes[j];
    assert.ok(Math.hypot(p.x-q.x,p.y-q.y) >= p.r+q.r, p.name+"/"+q.name+" ueberlappen");
  }
  const hull = clusterHull(a.nodes, cl[0], centers.Obst);
  a.nodes.filter(n=>n.group==="Obst").forEach(n=>assert.ok(Math.hypot(n.x-hull.x,n.y-hull.y)+n.r<=hull.r+0.01));
  const bb = boundsOf([hull]);
  assert.ok(bb.w>0&&bb.h>0&&bb.x<hull.x-hull.r);
});

test("recipeLinks: vorhandene Zutaten als Kanten, fehlende getrennt, Grundvorrat zaehlt nicht", () => {
  const stock = [item("Hackfleisch",0.8), item("Tomaten",0.5), item("Zwiebeln",0.1)];
  const rec = normalizeRecipe("Bolo", {ingredients:["300 g Hackfleisch","1 Dose Tomaten","2 Zwiebeln","Salz","200 g Spaghetti"]}, 0);
  const l = recipeLinks(rec, stock);
  assert.deepEqual(l.present.map(x=>x.key), ["hackfleisch","tomaten"]);
  assert.deepEqual(l.missing.map(x=>x.name), ["Zwiebeln","Spaghetti"]);
  assert.ok(Math.abs(l.cov-(0.8+0.5)/4)<1e-9);
  assert.equal(missingPositions(3,0,0).length, 3);
  assert.equal(missingPositions(0,0,0).length, 0);
  const one = missingPositions(1,10,20,100)[0];
  assert.ok(one.y>20, "fehlende Zutaten haengen unter dem Rezept");
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
