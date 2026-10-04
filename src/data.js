// KONSTANTEN UND LISTEN - keine Logik, darf von logic/* importiert werden

export const APP_VERSION = "2.0.0";

export const DAYS   = ["Mo","Di","Mi","Do","Fr","Sa","So"];
export const DAYFUL = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
// PLAN-SLOTS - wann gegessen wird (pro Tag)
export const MEALS  = ["Fr","Mi","Ab","Zw"];
export const ML     = { Fr:"Frühstück", Mi:"Mittagessen", Ab:"Abendessen", Zw:"Snacks" };

// REZEPT-KATEGORIEN (Rubriken) - was fuer ein Gericht (unabhaengig vom Plan-Slot)
export const CATS = ["Frühstück","Hauptgericht","Kinderessen","Schnelle Küche","Beilagen & Salate","Soßen & Dips","Snacks"];
// Kategorien, die im Dropdown zusaetzlich nach Kueche untergruppiert werden
export const CATS_WITH_CUISINE = ["Hauptgericht","Kinderessen","Schnelle Küche"];
// KUECHEN - nur fuer Hauptgericht relevant (Untergruppen im Dropdown)
export const CUISINE_LIST = ["Schwäbisch","Italienisch","Asiatisch","Indisch","Naher Osten","Mediterran","Klassisch","International","Vegetarisch","Grillen","Schnell"];
// Rubrik-Farben fuer die Platzhalterkachel (DishImage)
export const CAT_COLORS = { "Frühstück":"#6B5A3A","Hauptgericht":"#5A3A2E","Kinderessen":"#3A4F5A","Schnelle Küche":"#5A4A2A","Beilagen & Salate":"#3E5A3A","Soßen & Dips":"#5A3A4F","Snacks":"#4A4A5A" };

// SUPERMARKT-ABTEILUNGEN (Stichwortsuche, erster Treffer gewinnt; Konserven vor Obst & Gemuese, damit "Tomaten Dose" richtig landet;
// Kuehlregal vor Fleisch, damit "Flammkuchenteig" nicht ueber "lamm" stolpert)
export const SHOP_CATS = [
  { label:"Konserven & Gläser", keys:["dose","dosen","passiert","kokosmilch","konserv","kichererbsen","mais","oliven","kapern","sardellen","fond","pesto","erdnussbutter","marmelade","tomatenmark"] },
  { label:"Kräuter & Frisches", keys:["petersilie","basilikum","schnittlauch","koriander","dill","minze","rosmarin","salbei","kräuter","kraeuter","estragon","liebstöckel"] },
  { label:"Obst & Gemüse",  keys:["karott","möhre","moehre","brokkoli","tomat","salat","zwiebel","knoblauch","lauch","sellerie","kartoffel","ingwer","avocado","zitrone","limette","beere","frucht","früchte","paprika","spinat","gurk","pilz","champignon","kohl","apfel","banane","zucchini","aubergine","kürbis","kuerbis","fenchel","rettich","radies","bohnen","erbsen","orange","birne","trauben","mango","chili","frühlingszwiebel"] },
  { label:"Kühlregal",      keys:["spätzle","spaetzle","maultaschen","schupfnudeln","gnocchi","tofu","feta","frischkäse","frischkaese","halloumi","hummus","knödel","knoedel","blätterteig","pizzateig","flammkuchenteig","tortellini","ravioli","schmand","crème fraîche","creme fraiche"] },
  { label:"Fleisch & Fisch", keys:["hackfleisch","haehnchen","hähnchen","hühnchen","speck","lachs","fleisch","fisch","wurst","rind","schwein","thun","garnele","schinken","putenbrust","pute","lamm","bratwurst","kabeljau","forelle","ente","hack"] },
  { label:"Milch & Käse",   keys:["milch","butter","eier","joghurt","parmesan","kaese","käse","sahne","quark","mozzarella","ricotta","creme","schlagobers","mascarpone","gouda","emmentaler","bergkäse"] },
  { label:"Tiefkühl",       keys:["tiefkühl","tiefkuehl","gefroren"] },
  { label:"Backwaren",      keys:["brot","tortilla","brötchen","toast","croissant","mehl","vollkornbrot","backpulver","hefe","vanill","kakao","puderzucker","speisestärke","speisestaerke","semmel","fladenbrot","baguette","paniermehl","grieß","griess"] },
  { label:"Trockenwaren",   keys:["pasta","reis","haferflocken","linsen","granola","zucker","risotto","bulgur","couscous","quinoa","nudel","müsli","spaghetti","penne","tagliatelle","lasagne","kartoffelchips","nüsse","nuesse","mandeln","walnüsse","rosinen","polenta","hirse"] },
  { label:"Gewürze & Öle", keys:["olivenoel","olivenöl","öl","oel","curry","honig","essig","senf","soja","mayonnaise","ketchup","dressing","gewürz","gewuerz","kreuzküm","kreuzkümmel","brühe","bruehe","salz","pfeffer","paprikapulver","zimt","muskat","oregano","thymian","lorbeer","sesam","ahornsirup","tahin"] },
  { label:"Getränke",       keys:["weisswein","weißwein","rotwein","wein","bier","saft","wasser"] },
];
// Ausnahmen fuer Komposita und kurze Woerter: ganzes Wort entscheidet, bevor die Stichwortsuche greift
export const SHOP_CAT_EXCEPTIONS = {
  kokosmilch:"Konserven & Gläser", hafermilch:"Milch & Käse", mandelmilch:"Milch & Käse", sojamilch:"Milch & Käse",
  erdnussbutter:"Konserven & Gläser", kartoffelchips:"Trockenwaren", apfelsaft:"Getränke", orangensaft:"Getränke",
  tomatenmark:"Konserven & Gläser", glas:"Konserven & Gläser", gemüsebrühe:"Gewürze & Öle", gemuesebruehe:"Gewürze & Öle",
  olivenöl:"Gewürze & Öle", olivenoel:"Gewürze & Öle", kokosöl:"Gewürze & Öle", kokosoel:"Gewürze & Öle",
  chiliflocken:"Gewürze & Öle", chilipulver:"Gewürze & Öle",
  ei:"Milch & Käse", eigelb:"Milch & Käse", eiweiß:"Milch & Käse", eis:"Tiefkühl", tk:"Tiefkühl",
};
// Reihenfolge der Abteilungen in der Einkaufsliste
export const SHOP_ORDER = ["Obst & Gemüse","Kräuter & Frisches","Fleisch & Fisch","Milch & Käse","Kühlregal","Tiefkühl","Backwaren","Trockenwaren","Konserven & Gläser","Gewürze & Öle","Getränke","Sonstiges"];
// Alte Abteilungsnamen aus gespeicherten Posten
export const SHOP_CAT_ALIAS = { "Konserven":"Konserven & Gläser" };

// ANZEIGENAMEN fuer alte Schluessel ohne Umlaute
export const DNAMES = {
  "Ruehreier":"Rühreier","Joghurt und Granola":"Joghurt & Granola",
  "Gemuesesuppe":"Gemüsesuppe","Haehnchen-Wrap":"Hähnchen-Wrap","Lachs mit Gemuese":"Lachs mit Gemüse",
};

// BON-ABGLEICH: Stoppwoerter, Synonyme, Grundvorrat
export const KEY_STOP = new Set(["bio","frisch","frische","frischer","frisches","ja","gut","guenstig","packung","pack","stk","st","ca","etwa","und","oder","mit","von","fuer","zum","zur","nach","in","im","aus","geschmack","belieben","etwas","prise","prisen","bund","dose","dosen","glas","becher","beutel","netz","schale","klein","kleine","kleiner","gross","grosse","grosser","mittelgross","mittelgrosse","fein","feine","grob","gehackt","gehackte","gewuerfelt","geschnitten","gerieben","geriebener","gemahlen","gemahlener","getrocknet","getrocknete","gerebelt","tk","xxl","classic","natur","stueck","scheibe","scheiben","zehe","zehen","handvoll","msp","rot","rote","roter","gruen","gruene","gelb","gelbe","weiss","weisse","schwarz","schwarzer","hell","dunkel","mild","scharf","jung","light","vollkorn","natives","nativ","extra","edelsuess","gew","lose","fri","g","kg","ml","l","el","tl","x"]);
export const KEY_SYN = {hack:"hackfleisch",gehacktes:"hackfleisch",rinderhack:"hackfleisch",schlagsahne:"sahne",kochsahne:"sahne",zucchino:"zucchini",huehnchen:"haehnchen",moehre:"karotte",moehren:"karotte",ei:"eier",paprikaschote:"paprika",paprikaschoten:"paprika",nudel:"pasta",nudeln:"pasta",spaghetti:"pasta",penne:"pasta",fusilli:"pasta",farfalle:"pasta",tagliatelle:"pasta",passata:"tomaten"};
// Basics gelten immer als vorhanden (alle Woerter der Zutat muessen Basics sein)
export const BASIC_END = ["salz","pfeffer","oel","zucker","mehl","wasser","essig","bruehe"];
export const BASIC_WORDS = new Set(["paprikapulver","muskat","muskatnuss","oregano","thymian","zimt","kreuzkuemmel","currypulver","chili","chiliflocken","lorbeer","lorbeerblatt","lorbeerblaetter","backpulver","natron","speisestaerke","senf"]);
export const BASIC_LABEL = "Salz, Pfeffer, Öl, Zucker, Mehl, Essig, Brühe, Senf, Gewürze";

// HAUSHALTSBUCH: Halbwertszeit in Tagen je Unterkategorie, ausgeschlossene Unterkategorien, Zeitfenster
export const HALF_LIFE = [["obst",4],["gemuese",4],["fleisch",3],["wurst",4],["fisch",2],["backwaren",3],["brot",3],["milch",7],["kaese",10],["getraenk",21],["suess",30],["tiefkuehl",60]];
export const HB_SKIP_SUB = ["reinigung","hygiene","tierbedarf","kraftstoff","pfand","drogerie","kosmetik","haushalt","sonstig","non-food","nonfood","elektro","garten","deko","kleidung","schreibwaren","pflanzen","blumen"];
export const HB_DAYS = 90;
