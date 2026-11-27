// HALTBARKEIT JE ZUTAT - feste Startwerte fuer frische Lebensmittel, getrennt vom gelernten Verbrauch.
// Eine Sache ist aus zwei Gruenden weg: aufgegessen (Halbwertszeit, wird je Plan gelernt) oder verdorben (Haltbarkeit, fest).
// Die Wahrscheinlichkeit "noch da" ist das Produkt aus beidem; die Haltbarkeit wirkt wie eine Obergrenze.
//
// Je Eintrag: [Wort, s, hl, ganz]
//   s    = Tage, nach denen die Sache im Kuehlschrank bzw. in der Kueche zur Haelfte fraglich ist (haushaltsueblich, eher geoeffnet)
//   hl   = Startwert fuer den Verbrauch (Halbwertszeit in Tagen), nur wenn er von der Gruppe deutlich abweicht (Kartoffeln halten laenger als Paprika)
//   ganz = beim Kochen meist ganz verbraucht (true) oder nur teilweise (false); fehlt die Angabe, entscheidet die Gruppe
// Werte: grob nach den Lagerzeiten der US-Lebensmittelbehoerde (FoodKeeper) und ueblichen deutschen Kuehlschrank-Angaben, von Hand gerundet.
// Die Woerter sind normierte Schluessel-Woerter (normKey: klein, Umlaute aufgeloest, Synonyme wie hack -> hackfleisch).
import { fold } from "./ingredients.js";

export const SHELF = [
  // Fleisch und Fisch: kurz haltbar, beim Kochen ganz weg
  ["hackfleisch",2,null,true],["haehnchen",3,null,true],["haehnchenbrust",3,null,true],["pute",3,null,true],["putenbrust",3,null,true],
  ["schnitzel",3,null,true],["gulasch",3,null,true],["geschnetzeltes",2,null,true],["rind",3,null,true],["rindfleisch",3,null,true],
  ["schwein",3,null,true],["schweinefleisch",3,null,true],["steak",3,null,true],["lamm",3,null,true],["hackbaellchen",2,null,true],
  ["lachs",3,null,true],["lachsfilet",3,null,true],["fisch",3,null,true],["fischfilet",3,null,true],["kabeljau",3,null,true],["forelle",3,null,true],
  ["garnelen",2,null,true],["matjes",5,null,true],
  ["wuerstchen",7,5,true],["bratwurst",4,null,true],["speck",14,10,false],["schinken",5,null,false],["salami",21,10,false],["chorizo",21,10,false],
  // Milch, Eier, Kaese
  ["milch",8,null,false],["sahne",5,5,false],["schmand",7,null,false],["creme",7,null,false],["joghurt",8,null,false],["quark",6,null,false],
  ["butter",30,21,false],["eier",21,10,false],["frischkaese",10,null,false],["mascarpone",4,null,true],["ricotta",4,null,true],
  ["mozzarella",3,null,true],["feta",5,null,true],["burrata",2,null,true],["halloumi",7,null,true],["paneer",5,null,true],["tofu",4,null,true],
  ["parmesan",60,30,false],["pecorino",60,30,false],["kaese",14,null,false],["gouda",21,null,false],["emmentaler",21,null,false],
  ["bergkaese",30,null,false],["cheddar",21,null,false],
  // Gemuese
  ["kartoffeln",30,14,false],["zwiebeln",30,14,false],["knoblauch",30,21,false],["karotte",21,10,false],["kuerbis",30,14,false],
  ["sellerie",14,7,false],["ingwer",21,14,false],["kohl",21,10,false],["weisskohl",21,10,false],["rotkohl",21,10,false],["lauch",10,7,true],
  ["paprika",7,null,true],["zucchini",7,null,true],["tomaten",6,null,true],["gurke",7,null,true],["aubergine",7,null,true],["fenchel",7,null,true],
  ["brokkoli",5,null,true],["blumenkohl",7,null,true],["spinat",3,null,true],["salat",4,null,true],["rucola",3,null,true],
  ["champignons",4,null,true],["pilze",4,null,true],["avocado",4,null,true],["fruehlingszwiebeln",5,null,true],["lauchzwiebeln",5,null,true],["schalotten",30,14,false],
  ["petersilie",5,null,true],["basilikum",4,null,true],["koriander",4,null,true],["dill",4,null,true],["schnittlauch",4,null,true],
  ["minze",4,null,true],["kraeuter",4,null,true],["salbei",5,null,true],
  // Obst
  ["aepfel",30,10,false],["apfel",30,10,false],["zitrone",21,14,false],["zitronen",21,14,false],["limette",14,10,false],["limetten",14,10,false],
  ["orangen",14,null,false],["banane",5,null,false],["bananen",5,null,false],["beeren",3,null,true],["erdbeeren",3,null,true],
  // Brot
  ["brot",4,null,false],["broetchen",2,null,true],["baguette",1,null,true],["toast",7,null,false],["tortilla",14,null,false],["wraps",14,null,false],
];

const BY_WORD = new Map(SHELF.map(([w,s,hl,ganz])=>[w,{s,hl,ganz}]));
// Gleiches Wort oder Mehrzahl/Einzahl ("zwiebel"/"zwiebeln", "karotte"/"karotten"), aber kein Kompositum ("dosentomaten" bleibt eigen)
export const sameWord = (a,b) => {
  if(a===b) return true;
  const [s,l] = a.length<=b.length?[a,b]:[b,a];
  return s.length>=4&&l.startsWith(s)&&l.length-s.length<=2;
};
// Eintrag zu einem normierten Schluessel: das letzte passende Wort zaehlt ("rote zwiebeln" -> zwiebeln, "gekochter schinken" -> schinken).
// Erst gleiches Wort oder Mehrzahl, dann Zusammensetzungen ("kirschtomaten" -> tomaten, "knoblauchzehen" -> knoblauch).
export const shelfOf = (key) => {
  const toks = String(key||"").split(" ").filter(Boolean);
  for(let i=toks.length-1;i>=0;i--){
    const t=toks[i]; if(BY_WORD.has(t)) return BY_WORD.get(t);
    for(const [w,e] of BY_WORD) if(sameWord(t,w)) return e;
  }
  for(let i=toks.length-1;i>=0;i--){
    const t=toks[i]; let best=null, bl=0;
    for(const [w,e] of BY_WORD) if(w.length>bl&&w.length<t.length&&((w.length>=4&&t.endsWith(w))||(w.length>=5&&t.startsWith(w)))){ best=e; bl=w.length; }
    if(best) return best;
  }
  return null;
};
// Die Tabelle gilt nur fuer Frisches: bei Tiefkuehl, Konserven und Trockenwaren (lange Gruppenzeit) bleibt es bei der Gruppe,
// damit "Tomaten" aus der Dose nicht nach 6 Tagen verderben.
export const FRESH_MAX_HL = 10;
export const freshEntry = (key, groupHl) => (groupHl<=FRESH_MAX_HL ? shelfOf(key) : null);
// Wahrscheinlichkeit, dass die Sache nach age Tagen noch nicht verdorben ist: lange fast sicher, um s herum steil abwaerts
// (bei age = s genau 50 %, bei s/2 rund 92 %, bei 1,5*s rund 10 %)
export const freshP = (age, s) => (s>0 ? Math.pow(0.5, Math.pow(Math.max(0,age)/s, 3)) : 1);

// Beim Kochen: wie viel bleibt uebrig? 0 = ganz verbraucht, 0.5 = etwa die Haelfte da.
// Ohne Tabelleneintrag entscheidet die Gruppe: Fleisch, Fisch, Obst, Gemuese und Konserven ganz, alles andere zur Haelfte.
const GANZ_GROUPS = ["fleisch","fisch","obst","gemuese","konserve"];
export const cookLeft = (key, sub) => {
  const e = shelfOf(key);
  if(e&&typeof e.ganz==="boolean") return e.ganz?0:0.5;
  const g = fold(sub);
  return GANZ_GROUPS.some(k=>g.includes(k)) ? 0 : 0.5;
};
