// EMOJI JE LEBENSMITTEL - Stichwort (gefaltet: ae/oe/ue/ss, klein) -> Emoji; sonst Emoji der Gruppe; sonst "".
// Erst die genaueren Begriffe (Kokosmilch vor Milch, Hackfleisch vor Fleisch), darum ist die Reihenfolge der Liste wichtig.
import { fold } from "./ingredients.js";

const T = [
  // Konserven, Fertiges, Spezielles (vor den allgemeinen Woertern)
  ["kokosmilch","🥥"],["kokos","🥥"],["passata","🍅"],["tomatenmark","🍅"],["dosentomat","🍅"],["mais","🌽"],["kichererbs","🫘"],["bohne","🫘"],["linse","🫘"],["erbse","🫛"],
  ["thunfisch","🐟"],["lachs","🐟"],["forelle","🐟"],["garnele","🦐"],["shrimp","🦐"],["fisch","🐟"],["kabeljau","🐟"],["hering","🐟"],
  // Fleisch, Wurst
  ["haehnchen","🍗"],["huehnchen","🍗"],["huhn","🍗"],["pute","🍗"],["gefluegel","🍗"],["hack","🥩"],["rind","🥩"],["steak","🥩"],["schwein","🥩"],["lamm","🥩"],["schnitzel","🥩"],["fleisch","🥩"],
  ["bratwurst","🌭"],["wuerst","🌭"],["wurst","🥓"],["speck","🥓"],["bacon","🥓"],["schinken","🥓"],["salami","🥓"],
  // Milch, Eier, Kaese
  ["butter","🧈"],["ei ","🥚"],["eier","🥚"],["joghurt","🥛"],["jogh","🥛"],["quark","🥛"],["skyr","🥛"],["sahne","🥛"],["schmand","🥛"],["milch","🥛"],
  ["parmesan","🧀"],["mozzarella","🧀"],["feta","🧀"],["gouda","🧀"],["emmentaler","🧀"],["frischkaese","🧀"],["kaese","🧀"],
  // Obst
  ["apfel","🍎"],["aepfel","🍎"],["banane","🍌"],["birne","🍐"],["orange","🍊"],["mandarine","🍊"],["clementine","🍊"],["zitrone","🍋"],["limette","🍋"],["erdbeer","🍓"],["himbeer","🍓"],["heidelbeer","🫐"],["blaubeer","🫐"],["beere","🫐"],
  ["trauben","🍇"],["weintraub","🍇"],["melone","🍉"],["wassermelone","🍉"],["kirsch","🍒"],["pfirsich","🍑"],["nektarine","🍑"],["mango","🥭"],["ananas","🍍"],["kiwi","🥝"],["avocado","🥑"],["pflaume","🍑"],["feige","🍑"],["obst","🍎"],
  // Gemuese
  ["tomate","🍅"],["paprika","🫑"],["chili","🌶"],["gurke","🥒"],["zucchini","🥒"],["zwiebel","🧅"],["lauch","🧅"],["porree","🧅"],["knoblauch","🧄"],["karotte","🥕"],["moehre","🥕"],["brokkoli","🥦"],["blumenkohl","🥦"],["kohl","🥬"],["salat","🥬"],["spinat","🥬"],["rucola","🥬"],["mangold","🥬"],
  ["kartoffel","🥔"],["suesskartoffel","🍠"],["pilz","🍄"],["champignon","🍄"],["aubergine","🍆"],["kuerbis","🎃"],["fenchel","🥬"],["sellerie","🥬"],["spargel","🥬"],["radies","🥬"],["rote bete","🥬"],["gemuese","🥬"],
  // Brot, Trockenwaren, Grundnahrung
  ["spaghetti","🍝"],["pasta","🍝"],["nudel","🍝"],["penne","🍝"],["lasagne","🍝"],["spaetzle","🍝"],["reis","🍚"],["couscous","🍚"],["bulgur","🍚"],["quinoa","🍚"],["hirse","🍚"],
  ["haferflocken","🥣"],["muesli","🥣"],["cornflakes","🥣"],["granola","🥣"],["mehl","🌾"],["gries","🌾"],["hefe","🍞"],["brot","🍞"],["broetchen","🥐"],["croissant","🥐"],["toast","🍞"],["baguette","🥖"],["wrap","🌯"],["tortilla","🌯"],["pizza","🍕"],
  ["nuss","🥜"],["nuesse","🥜"],["mandel","🥜"],["erdnuss","🥜"],["walnuss","🥜"],["cashew","🥜"],["sesam","🌾"],["tofu","🧊"],
  // Suesses, Getraenke
  ["schokolade","🍫"],["schoko","🍫"],["keks","🍪"],["cookie","🍪"],["kuchen","🍰"],["eis","🍦"],["gummib","🍬"],["bonbon","🍬"],["honig","🍯"],["marmelade","🍯"],["konfit","🍯"],["nutella","🍫"],["zucker","🍬"],["chips","🥨"],["brezel","🥨"],["popcorn","🍿"],
  ["kaffee","☕"],["espresso","☕"],["tee","🍵"],["kakao","☕"],["saft","🧃"],["apfelschorle","🧃"],["cola","🥤"],["limo","🥤"],["wasser","💧"],["sprudel","💧"],["bier","🍺"],["wein","🍷"],["sekt","🍾"],
  // Sonstiges
  ["oel","🫒"],["olive","🫒"],["essig","🫙"],["senf","🫙"],["ketchup","🍅"],["mayo","🫙"],["sojasauce","🫙"],["sauce","🫙"],["sosse","🫙"],["brueh","🍲"],["suppe","🍲"],["gewuerz","🧂"],["salz","🧂"],["pfeffer","🧂"],["curry","🧂"],["kraeuter","🌿"],["basilikum","🌿"],["petersil","🌿"],["schnittlauch","🌿"],["dill","🌿"],["ingwer","🌿"],
];
// Emoji -> Gruppe: dieselbe Stichworttabelle ordnet damit auch Kassenbon-Namen einer Gruppe zu (Brokkoli -> Gemuese, nicht Obst)
export const EMOJI_GROUP = {
  "🍅":"Gemüse","🫑":"Gemüse","🌶":"Gemüse","🥒":"Gemüse","🧅":"Gemüse","🧄":"Gemüse","🥕":"Gemüse","🥦":"Gemüse","🥬":"Gemüse","🥔":"Gemüse","🍠":"Gemüse","🍄":"Gemüse","🍆":"Gemüse","🎃":"Gemüse","🫛":"Gemüse","🌽":"Gemüse",
  "🍎":"Obst","🍌":"Obst","🍐":"Obst","🍊":"Obst","🍋":"Obst","🍓":"Obst","🫐":"Obst","🍇":"Obst","🍉":"Obst","🍒":"Obst","🍑":"Obst","🥭":"Obst","🍍":"Obst","🥝":"Obst","🥑":"Obst",
  "🍗":"Fleisch","🥩":"Fleisch","🌭":"Wurst","🥓":"Wurst","🐟":"Fisch","🦐":"Fisch",
  "🧈":"Milchprodukte","🥚":"Milchprodukte","🥛":"Milchprodukte","🧀":"Käse",
  "🍝":"Trockenwaren","🍚":"Trockenwaren","🥣":"Trockenwaren","🌾":"Trockenwaren","🥜":"Trockenwaren","🫘":"Trockenwaren",
  "🍞":"Brot & Backwaren","🥐":"Brot & Backwaren","🥖":"Brot & Backwaren","🌯":"Brot & Backwaren","🍕":"Tiefkühl",
  "🍫":"Süßes","🍪":"Süßes","🍰":"Süßes","🍦":"Tiefkühl","🍬":"Süßes","🍯":"Süßes","🥨":"Süßes","🍿":"Süßes",
  "☕":"Getränke","🍵":"Getränke","🧃":"Getränke","🥤":"Getränke","💧":"Getränke","🍺":"Getränke","🍷":"Getränke","🍾":"Getränke",
  "🥥":"Konserven","🥫":"Konserven","🧊":"Tiefkühl",
};
export const GROUP_ICON = {"Obst":"🍎","Gemüse":"🥬","Fleisch":"🥩","Wurst":"🥓","Fisch":"🐟","Brot & Backwaren":"🍞","Milchprodukte":"🥛","Käse":"🧀","Getränke":"🧃","Süßes":"🍬","Tiefkühl":"🧊","Konserven":"🥫","Trockenwaren":"🌾","Sonstiges":"🛒"};

// Emoji nur aus dem Namen (ohne Gruppen-Rueckfall)
export const nameIcon = (name) => { const n=" "+fold(name)+" "; for(const [k,e] of T) if(n.includes(k)) return e; return ""; };
// Emoji zum Produktnamen; group = Gruppe als Rueckfall. Liefert "" wenn nichts passt.
export const foodIcon = (name, group) => nameIcon(name) || GROUP_ICON[group] || "";
// Gruppe nur aus dem Namen ueber das Emoji ("" wenn unbekannt)
export const nameGroup = (name) => EMOJI_GROUP[nameIcon(name)] || "";
