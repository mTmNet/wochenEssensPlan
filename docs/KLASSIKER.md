# Rezept-Basis

Die Rezept-Basis ist die kuratierte Sammlung etablierter Gerichte, die mit der App ausgeliefert wird (TESTBERICHT.md Abschnitt 5.2, Punkt 3). Sie enthält nur Gerichte, die es so in Kochbüchern gibt: schwäbische und deutsche Hausmannskost, italienische und mediterrane Küche, Gerichte aus dem Nahen Osten, Indien und Ostasien sowie moderne Alltagsstandards. Keine erfundenen Kombinationen, keine Fantasienamen.

Die Rubrik „Heute“ durchsucht die Basis, wenn das eigene Kochbuch nichts Passendes hat, und bietet die drei Einträge an, die zum Vorrat am besten passen und noch nicht im Kochbuch sind („Ins Kochbuch übernehmen“, docs/ARCHITEKTUR.md Abschnitt 7). Beim Übernehmen wird der Eintrag mit `source: "klassiker"` ins Kochbuch der Familie kopiert; die Basis selbst wird nie verändert.

## Dateien

| Datei | Inhalt |
|---|---|
| `src/classics/schwaebisch.js` | Schwäbische und süddeutsche Küche (cuisine „Schwäbisch“) |
| `src/classics/deutsch.js` | Deutsche Hausmannskost (cuisine „Klassisch“) |
| `src/classics/italienisch.js` | Italienische und mediterrane Küche |
| `src/classics/orient-asien.js` | Naher Osten, Indien, Südost- und Ostasien |
| `src/classics/modern-alltag.js` | Frühstück, Kinderessen, Schnelle Küche, Beilagen, Soßen, Snacks |
| `src/classics.js` | Führt alle Dateien zu `CLASSICS` zusammen (sortiert nach category, dann name) |

Jede Datei exportiert ein Array (`export default [ … ]`). `src/classics.js` enthält keine weitere Logik; die App bildet den Schlüssel eines Eintrags mit `recKey(name)`.

## Aufbau eines Eintrags

Die Felder entsprechen dem Recipe-Modell in docs/ARCHITEKTUR.md Abschnitt 3, ohne die Laufzeitfelder (rating, notes, cooked, createdAt, updatedAt), die erst beim Übernehmen ins Kochbuch entstehen.

```js
{
  name: "Käsespätzle",             // gebräuchlicher Name des Gerichts, höchstens ein Bindestrich
  category: "Hauptgericht",        // aus CATS
  cuisine: "Schwäbisch",           // aus CUISINE_LIST
  origin: "Schwaben",              // Herkunft oder Region, Pflicht
  veg: true,                       // vegetarisch
  servings: 4,                     // immer 4; die App skaliert
  minutes: 45,                     // Gesamtzeit in Minuten, 5 bis 240
  ingredients: ["400 g Spätzle", "200 g Bergkäse", "3 Zwiebeln", "Salz"],
  steps: ["…", "…", "…", "…"],     // 4 bis 8 Schritte, jeder ein ganzer Satz mit Punkt
  description: "…",                // 30 bis 240 Zeichen, mit Herkunft
  source: "klassiker",
}
```

Erlaubte Werte:

- `category`: Frühstück, Hauptgericht, Kinderessen, Schnelle Küche, Beilagen & Salate, Soßen & Dips, Snacks
- `cuisine`: Schwäbisch, Italienisch, Asiatisch, Indisch, Naher Osten, Mediterran, Klassisch, International, Vegetarisch, Grillen, Schnell

### Zutatenzeilen

Zutaten sind Strings in der Form `<Zahl> <Einheit> <Name>`, damit `parseIng` (src/logic/ingredients.js) sie zerlegen und die Einkaufsliste gleiche Zutaten zusammenführen kann.

- Zahl mit Punkt als Dezimaltrenner (`1.5 kg`) oder als Bruch (`½`, `¼`, `¾`, `⅓`, `⅔`); keine Bereiche („2 bis 3“), kein „ca.“, keine Klammern.
- Einheiten, die der Parser kennt: g, kg, ml, l, EL, TL, Prise(n), Bund, Zehe(n), Dose(n), Glas, Scheibe(n), Päckchen, Stück, Becher, Tasse, Msp. Zutaten ohne Menge (Salz, Pfeffer, Öl zum Braten) stehen nur mit dem Namen.
- Mengenwörter, die keine Einheit sind (Stiel, Zweig, Stange, Handvoll, Blatt, Kopf, Schuss), gehören nicht an die Einheitenstelle. Stattdessen Stückzahl im Namen („2 Rosmarinzweige“, „1 Selleriestange“) oder eine Verpackungseinheit („1 Bund Dill“).
- Adjektive und Zubereitungswörter nicht vor den Namen, sondern mit Komma dahinter: „1 kg Kartoffeln, mehligkochend“, „1 Dose Tomaten, gehackt“, „600 g Hackfleisch, gemischt“, „1 TL Oregano, getrocknet“. Reife, Temperatur und Konsistenz (reif, kalt, weich, lauwarm) gehören in die Schritte.
- Verpackung als Einheit nach vorn: „2 Dosen Tomaten, geschält“ statt „800 g geschälte Tomaten aus der Dose“, „1 Glas Bambussprossen“, „2 Dosen Thunfisch“.
- Keine Ziffern im Namen („600 g Weizenmehl“; die Mehltype steht im ersten Schritt).
- Kommt eine Zutat mehrfach vor (Teig und Soße), wird der Zweck mit Komma angegeben: „500 ml Milch, für die Vanillesoße“.

### Zeiten

`minutes` ist die Gesamtzeit. Lange Wartezeiten (über Nacht einweichen, stundenlang durchziehen) dürfen fehlen, wenn die Beschreibung das ausdrücklich sagt (Overnight Oats, Falafel, Matjes). Geh- und Backzeiten, die zum Kochen gehören, zählen mit (Pizza Margherita: 110 Minuten).

## Ein Gericht ergänzen

1. Passende Datei unter `src/classics/` wählen und den Eintrag in der Form oben anhängen. Innerhalb der Datei sind die Einträge nach Rubrik gruppiert.
2. Nur etablierte Gerichte mit gebräuchlichem Namen und Herkunft; Beschreibungsnamen mit Bindestrichkette („Milde Gemüse-Reispfanne“) gelten nicht. Vor dem Anlegen prüfen, ob dasselbe Gericht unter anderem Namen schon vorhanden ist (Pasta al pomodoro deckt „Nudeln mit Tomatensoße“ ab).
3. Mengen für 4 Personen, plausibel geprüft (Flüssigkeit zu Hülsenfrüchten, Füllmenge zu Stückzahl).
4. Prüfen:
   - `node tests/classics-schema.mjs` prüft Felder, Wertebereiche und das Zutatenformat je Datei.
   - `node tests/classics-parse.mjs` zerlegt jede Zutatenzeile mit dem Parser der App und meldet Mengenwörter, Adjektive und Zusätze im Namen (Ziel: 0 major, 0 minor).
   - `node --test tests/classics.test.mjs` prüft die zusammengeführte Liste (Anzahl, eindeutige Namen, Sortierung, Schemaregeln). Läuft auch mit `npm test`.

## Gerichte nach Rubrik

Stand: 133 Gerichte in 7 Rubriken. Angaben: Küche, Herkunft, vegetarisch, Gesamtzeit.

### Frühstück (6)

- Arme Ritter (Klassisch, Deutschland, vegetarisch, 25 Min.)
- Birchermüsli (Klassisch, Schweiz, vegetarisch, 15 Min.)
- Omelett mit Kräutern (Klassisch, Frankreich, vegetarisch, 20 Min.)
- Overnight Oats (International, International, vegetarisch, 10 Min.)
- Pancakes (International, USA, vegetarisch, 30 Min.)
- Porridge (International, Schottland, vegetarisch, 15 Min.)

### Hauptgericht (81)

- Aloo Gobi (Indisch, Punjab, Nordindien, vegetarisch, 40 Min.)
- Apfelküchle (Schwäbisch, Schwaben, vegetarisch, 40 Min.)
- Backfisch mit Kartoffelsalat (Klassisch, Norddeutschland, 60 Min.)
- Bibimbap (Asiatisch, Korea, 60 Min.)
- Bowl mit Hähnchen, Quinoa und Gemüse (International, International, 40 Min.)
- Bratkartoffeln mit Spiegelei (Klassisch, Deutschland, 50 Min.)
- Burger (International, USA, 35 Min.)
- Butter Chicken (Indisch, Delhi, Nordindien, 70 Min.)
- Chana Masala (Indisch, Punjab, Nordindien, vegetarisch, 40 Min.)
- Chicken Tikka Masala (Indisch, Britisch-indische Küche, 70 Min.)
- Chili con Carne (International, Texas, 60 Min.)
- Chili sin Carne (Vegetarisch, International, vegetarisch, 45 Min.)
- Dal Tadka (Indisch, Nordindien, vegetarisch, 45 Min.)
- Dampfnudeln mit Vanillesoße (Schwäbisch, Süddeutschland, vegetarisch, 120 Min.)
- Eierkuchen mit Speck (Klassisch, Deutschland, 40 Min.)
- Erbsensuppe (Klassisch, Deutschland, 90 Min.)
- Falafel mit Tahinsoße (Naher Osten, Levante, vegetarisch, 45 Min.)
- Frikadellen mit Kartoffelpüree (Klassisch, Deutschland, 50 Min.)
- Gaisburger Marsch (Schwäbisch, Schwaben, 165 Min.)
- Gemüseeintopf (Klassisch, Deutschland, vegetarisch, 45 Min.)
- Gnocchi mit Salbeibutter (Italienisch, Norditalien, vegetarisch, 60 Min.)
- Grünes Thai-Curry mit Hähnchen (Asiatisch, Zentralthailand, 35 Min.)
- Hackbraten (Klassisch, Deutschland, 80 Min.)
- Hühnerfrikassee (Klassisch, Deutschland, 100 Min.)
- Hühnersuppe mit Nudeln (Klassisch, Deutschland, 120 Min.)
- Jägerschnitzel (Klassisch, Deutschland, 40 Min.)
- Kaiserschmarrn (Klassisch, Österreich, vegetarisch, 30 Min.)
- Kartoffelgratin (Klassisch, Frankreich, in Deutschland fest etabliert, vegetarisch, 75 Min.)
- Kartoffelpuffer mit Apfelmus (Klassisch, Deutschland, vegetarisch, 50 Min.)
- Kartoffelsuppe (Klassisch, Deutschland, 45 Min.)
- Käsespätzle (Schwäbisch, Schwaben, vegetarisch, 50 Min.)
- Köfte (Naher Osten, Türkei, 40 Min.)
- Kohlrouladen (Klassisch, Deutschland, 90 Min.)
- Königsberger Klopse (Klassisch, Ostpreußen, 60 Min.)
- Krautkrapfen (Schwäbisch, Schwaben, 90 Min.)
- Kung Pao Hühnchen (Asiatisch, Sichuan, China, 35 Min.)
- Lasagne al forno (Italienisch, Emilia-Romagna, 120 Min.)
- Linsen mit Spätzle und Saitenwürstle (Schwäbisch, Schwaben, 75 Min.)
- Linseneintopf (Klassisch, Deutschland, 60 Min.)
- Mapo Tofu (Asiatisch, Sichuan, China, 30 Min.)
- Matjes nach Hausfrauenart (Klassisch, Norddeutschland, 40 Min.)
- Maultaschen in der Brühe (Schwäbisch, Schwaben, 100 Min.)
- Melanzane alla parmigiana (Italienisch, Süditalien, vegetarisch, 90 Min.)
- Minestrone (Italienisch, Norditalien, vegetarisch, 60 Min.)
- Moussaka (Mediterran, Griechenland, 110 Min.)
- Nasi Goreng (Asiatisch, Indonesien, 30 Min.)
- Nudelauflauf mit Schinken (Klassisch, Deutschland, 50 Min.)
- Ofengemüse mit Feta (Vegetarisch, Mediterran, vegetarisch, 50 Min.)
- Ofenschlupfer (Schwäbisch, Schwaben, vegetarisch, 70 Min.)
- Pad Thai (Asiatisch, Thailand, 35 Min.)
- Paella (Mediterran, Valencia, Spanien, 60 Min.)
- Palak Paneer (Indisch, Punjab, Nordindien, vegetarisch, 40 Min.)
- Pasta alla norma (Italienisch, Catania, Sizilien, vegetarisch, 40 Min.)
- Pasta e fagioli (Italienisch, Venetien und Mittelitalien, vegetarisch, 50 Min.)
- Pizza Margherita (Italienisch, Neapel, Kampanien, vegetarisch, 110 Min.)
- Pollo alla cacciatora (Italienisch, Toskana und Mittelitalien, 75 Min.)
- Quiche Lorraine (Mediterran, Lothringen, Frankreich, 75 Min.)
- Ragù alla bolognese (Italienisch, Bologna, Emilia-Romagna, 150 Min.)
- Ratatouille (Mediterran, Nizza, Provence, vegetarisch, 60 Min.)
- Rinderbraten mit Spätzle (Schwäbisch, Schwaben, 190 Min.)
- Rindergulasch (Klassisch, Deutschland, nach ungarischem Vorbild, 150 Min.)
- Rinderrouladen mit Rotkohl (Klassisch, Deutschland, 120 Min.)
- Risotto ai funghi (Italienisch, Norditalien, vegetarisch, 45 Min.)
- Risotto alla milanese (Italienisch, Mailand, Lombardei, vegetarisch, 40 Min.)
- Saltimbocca alla romana (Italienisch, Rom, Latium, 30 Min.)
- Satay-Spieße mit Erdnusssoße (Asiatisch, Indonesien und Malaysia, 55 Min.)
- Schupfnudeln mit Sauerkraut (Schwäbisch, Schwaben, 90 Min.)
- Schwäbischer Zwiebelkuchen (Schwäbisch, Schwaben, 100 Min.)
- Schweinebraten mit Semmelknödel (Klassisch, Bayern, 180 Min.)
- Schweinegeschnetzeltes mit Champignons (Klassisch, Deutschland, 35 Min.)
- Semmelknödel mit Pilzrahmsoße (Klassisch, Bayern, vegetarisch, 50 Min.)
- Senfeier (Klassisch, Norddeutschland, vegetarisch, 35 Min.)
- Shakshuka (Naher Osten, Nordafrika und Israel, vegetarisch, 35 Min.)
- Souvlaki mit Tzatziki (Mediterran, Griechenland, 45 Min.)
- Spaghetti alla carbonara (Italienisch, Rom, Latium, 25 Min.)
- Tacos mit Hackfleisch (International, Mexiko, 35 Min.)
- Tafelspitz (Klassisch, Österreich, 200 Min.)
- Tortilla española (Mediterran, Spanien, vegetarisch, 40 Min.)
- Türkische Linsensuppe (Naher Osten, Türkei, vegetarisch, 40 Min.)
- Wiener Schnitzel (Klassisch, Österreich, 40 Min.)
- Zwiebelrostbraten (Schwäbisch, Schwaben, 45 Min.)

### Kinderessen (8)

- Fischstäbchen mit Kartoffelpüree und Erbsen (Klassisch, Deutschland, 35 Min.)
- Gemüsereis (Klassisch, Deutschland, vegetarisch, 35 Min.)
- Grießbrei (Klassisch, Deutschland, vegetarisch, 15 Min.)
- Kartoffelbrei mit Würstchen (Klassisch, Deutschland, 35 Min.)
- Milchreis mit Zimt und Zucker (Klassisch, Deutschland, vegetarisch, 40 Min.)
- Pfannkuchen (Klassisch, Deutschland, vegetarisch, 40 Min.)
- Pizzabrötchen (Klassisch, Deutschland, 25 Min.)
- Spaghetti mit Butter und Parmesan (Italienisch, Italien, vegetarisch, 20 Min.)

### Schnelle Küche (14)

- Caesar Salad mit Hähnchen (International, USA, 30 Min.)
- Flädlesuppe (Schwäbisch, Schwaben, 30 Min.)
- Flammkuchen (Schnell, Elsass, 25 Min.)
- Gazpacho (Mediterran, Andalusien, Spanien, vegetarisch, 20 Min.)
- Gebratene Nudeln mit Gemüse (Asiatisch, Südchina, vegetarisch, 25 Min.)
- Gemüse-Omelett (Schnell, International, vegetarisch, 25 Min.)
- Geröstete Maultaschen mit Ei (Schwäbisch, Schwaben, 20 Min.)
- Miso-Suppe (Asiatisch, Japan, vegetarisch, 15 Min.)
- Pasta al pomodoro (Italienisch, Italien, vegetarisch, 30 Min.)
- Pasta mit Tomaten und Mozzarella (Schnell, Italien, vegetarisch, 20 Min.)
- Quesadillas (Schnell, Mexiko, vegetarisch, 25 Min.)
- Spaghetti aglio e olio (Italienisch, Neapel, Kampanien, vegetarisch, 20 Min.)
- Teriyaki-Lachs mit Reis (Asiatisch, Japan, 30 Min.)
- Thunfisch-Pasta (Schnell, Italien, 20 Min.)

### Beilagen & Salate (11)

- Brezenknödel (Klassisch, Bayern, vegetarisch, 55 Min.)
- Griechischer Bauernsalat (Mediterran, Griechenland, vegetarisch, 20 Min.)
- Grüner Salat mit Vinaigrette (Klassisch, Frankreich, vegetarisch, 15 Min.)
- Gurkensalat mit Dill (Klassisch, Deutschland, vegetarisch, 15 Min.)
- Insalata caprese (Italienisch, Capri, Kampanien, vegetarisch, 15 Min.)
- Kartoffelpüree (Klassisch, Deutschland, vegetarisch, 30 Min.)
- Krautsalat (Klassisch, Süddeutschland, 25 Min.)
- Ofenkartoffeln (Klassisch, International, vegetarisch, 45 Min.)
- Panzanella (Italienisch, Toskana, vegetarisch, 25 Min.)
- Schwäbischer Kartoffelsalat (Schwäbisch, Schwaben, vegetarisch, 60 Min.)
- Tabouleh (Naher Osten, Libanon, vegetarisch, 30 Min.)

### Soßen & Dips (7)

- Béchamelsoße (Klassisch, Frankreich, vegetarisch, 20 Min.)
- Guacamole (International, Mexiko, vegetarisch, 15 Min.)
- Hummus (Naher Osten, Levante, vegetarisch, 15 Min.)
- Kräuterquark (Klassisch, Deutschland, vegetarisch, 15 Min.)
- Pesto alla genovese (Italienisch, Genua, Ligurien, vegetarisch, 15 Min.)
- Tomatensoße (Italienisch, Italien, vegetarisch, 35 Min.)
- Tzatziki (Mediterran, Griechenland, vegetarisch, 15 Min.)

### Snacks (6)

- Bananenbrot (International, USA, vegetarisch, 70 Min.)
- Bruschetta (Italienisch, Mittelitalien, vegetarisch, 20 Min.)
- Gebackene Frühlingsrollen (Asiatisch, China, vegetarisch, 50 Min.)
- Gemüsesticks mit Dip (Vegetarisch, International, vegetarisch, 20 Min.)
- Gyoza (Asiatisch, Japan, 50 Min.)
- Obatzda (Klassisch, Bayern, vegetarisch, 45 Min.)
  'Schwäbisch': 15,
  'Naher Osten': 6,
