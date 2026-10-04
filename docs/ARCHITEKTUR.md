# Architektur und Datenmodell (Zielbild ab Version 2)

Dieses Dokument ist der verbindliche Bauplan für den Umbau nach dem Testbericht (`TESTBERICHT.md`). Es beschreibt Modulaufteilung, Datenmodell, Synchronisation und die Verträge zwischen `App.jsx` und den Ansichten. Wer an einem Teil arbeitet, hält sich an die hier festgelegten Namen und Pfade.

## 1. Grundsätze

- Technik bleibt: React 18 + Vite, Inline-Styles, Firebase Realtime Database per REST, Vercel-Function `api/gemini.js`. Keine UI-Bibliothek, kein State-Framework.
- Oberfläche auf Deutsch mit echten Umlauten (ZURÜCK, LÖSCHEN, Nochmal „Zurück“ drücken).
- Keine Modellnamen oder KI-Anbieter in Texten der Oberfläche, Commit-Nachrichten oder Kommentaren. Die KI heißt in der App „KI“.
- Keine Firebase-Regeländerung nötig: Alles Neue liegt unter `plans/<CODE>/…` (bereits per Code lesbar/schreibbar) und `recipeImages/<CODE>/…` (offen). `globalRecipes` und `recipeImages/<Name>` werden nur noch gelesen (Migration).
- Jede Änderung wird gezielt geschrieben (Multi-Path-PATCH auf `plans/<CODE>`), nie ganze Sammlungen. Vorbild: Haushaltsbuch (`entries/<id>` einzeln).
- Schreibfehler werden gemeldet: alle Schreibhelfer liefern `true/false`, bei `false` wird die Sync-Leiste rot und ein Text gesetzt.

## 2. Modulaufteilung

```
src/
  main.jsx
  App.jsx                  Zustand, Sync, Migration, Aktionen (api-Objekt), wählt die Ansicht
  theme.js                 C (Farben), SF, SER, MAXW/column (Desktop-Spalte), gemeinsame Style-Helfer (btn, card, micro, chip, iconBtn, input)
  data.js                  APP_VERSION, DAYS, DAYFUL, MEALS, ML, CATS, CATS_WITH_CUISINE, CUISINE_LIST, CAT_COLORS, SHOP_CATS,
                           SHOP_CAT_EXCEPTIONS (Komposita), SHOP_CAT_ALIAS (alte Abteilungsnamen), SHOP_ORDER,
                           BASIC_END, BASIC_WORDS, BASIC_LABEL, KEY_STOP, KEY_SYN, HALF_LIFE, HB_SKIP_SUB, HB_DAYS, DNAMES
  fb.js                    FB, HB_FB, fbGet (undefined bei Fehler, null wenn leer), fbPut, fbPatch (liefert ok), hbGet;
                           jeder Aufruf mit Zeitgrenze (15 s, groessere Koerper laenger), damit kein haengender Aufruf den Poll blockiert
  ai.js                    callAI({mode, system, messages}), buildExtractPrompt(), buildSuggestPrompt(), parseJsonBlock(), kiErrText()
  pdf.js                   makeRecipePDF(), makeCookbookPDF() (zunächst HTML/Druck, später jsPDF)
  classics.js              CLASSICS: kuratierte Basis etablierter Gerichte (Array von Recipe-Objekten, source "klassiker")
  logic/
    ingredients.js         parseIng, fmtIng, scaleIng, normKey, tokMatch, isBasic, ingKey, aggregateIngs, shopCat
    stock.js               fold, hbStock, ingStatus, scoreRecipe, hbCats
    weeks.js               todayISO, todayDay, isoWeekKey, weekDates, shiftWeek, weekLabel, daysSince, mealSlotNow, emptyWeek, migrateWeek
    shopping.js            planItems, mergeShopping, addIngredients, groupShopping, shoppingText, newShopId, migrateShopping,
                           isListed, orphanIds, addedSlotKeys, scaledIngredients
    recipes.js             recKey, recName, normalizeRecipe, isProven, cookedCount, isGhostRecipe/ghostKeys, sortRecipeKeys, stepMinutes,
                           DR (Startrezepte, nur als Fallback-Anzeige)
  views/
    Join.jsx               Startbildschirm
    Shell.jsx              Kopf (Titel, Name, Code), Menü, Sync-Leiste, Tabs
    Heute.jsx              „Was kochen wir heute?“
    Plan.jsx               Wochenplan mit Wochennavigation
    Shopping.jsx           Einkaufsliste
    Recipes.jsx            Rezeptliste, Suche, Filter, Import (Text/Foto), Kochbuch-PDF
    RecipeDetail.jsx       Rezeptdetail und Bearbeiten
    CookMode.jsx           Kochmodus
  components/
    Stars.jsx, DishImage.jsx (Platzhalterkachel oder eigenes Foto), Modal.jsx, Toast.jsx (kurzer Hinweis)
tests/                     node --test, reine Logik (ingredients, stock, weeks, shopping, recipes)
public/                    manifest.json, sw.js, icon-192.png, icon-512.png, icon-maskable-512.png
api/gemini.js              Vercel-Function, Modus-abhängige Temperatur, Origin-Prüfung, Drossel
docs/ARCHITEKTUR.md        dieses Dokument
```

Die `logic/*`-Module sind reine Funktionen ohne React, ohne `window`, ohne Firebase, damit sie mit `node --test` getestet werden können. `data.js` darf von `logic/*` importiert werden.

## 3. Datenmodell in Firebase

```
plans/<CODE>
  participants: ["Anna", "Mero"]
  hb: { code, cat } | null                    Verknüpfung zum Haushaltsbuch (gilt für den Plan)
  settings: { aiImages: false }               KI-Symbolbilder anzeigen (Standard aus)
  meta: {
    createdAt, updatedAt,                     ms seit Epoche
    weeksUpdatedAt, shoppingUpdatedAt, recipesUpdatedAt, peopleUpdatedAt,
    imagesMigrated: true                      Altbilder vollstaendig kopiert (sonst holt der naechste Beitritt es nach)
  }
  weeks: {
    "2026-W41": { Mo: { meals: { Fr: [], Mi: [], Ab: [], Zw: [] }, cook: "" }, Di: …, So: … }
  }
  shopping: {
    "<id>": { text, checked, cat, src: "plan" | "manuell", key, order, addedAt,
              basic: true,                    nur bei Grundvorrat (Block „Vorrat prüfen“)
              forceBuy: true,                 trotzdem kaufen (holt basic/„Wahrscheinlich da“ in die Liste)
              slots: { "<wk>|<Tag>|<Slot>|<recKey>": true } }   Plan-Zellen, deren Zutaten per „+“ hier gelandet sind („+“-Sperre liegt im Plan)
  }
  recipes: {
    "<recKey>": Recipe
  }
  plan, shopping (Array), updatedAt            ALT: werden nur noch bei der Migration gelesen, bleiben als Sicherung stehen

recipeImages/<CODE>/<recKey>: "data:image/jpeg;base64,…"

globalRecipes/<Name>                            ALT: nur lesen (Migration), nie mehr schreiben
recipeImages/<Name>                             ALT: nur lesen (Migration)
```

### Recipe

```
{
  name: "Käsespätzle",            Anzeigename (Schlüssel ist recKey(name))
  ingredients: ["400 g Spätzle", "200 g Bergkäse", …],   Menge zuerst bevorzugt, Name-zuerst wird weiter verstanden
  steps: ["…"],
  description: "",
  category: "Hauptgericht",       aus CATS
  cuisine: "Schwäbisch",          aus CUISINE_LIST
  servings: 4,                    Portionen, auf die sich die Mengen beziehen
  minutes: 35 | null,             Gesamtzeit
  source: "eigen" | "import" | "klassiker" | "ki",
  origin: "Schwaben",             Herkunft/Region, Pflicht bei "klassiker" und "ki"
  sourceNote: "Kochbuch Oma S. 42" | "",
  stepsGenerated: false,          true, wenn die Schritte von der KI ergänzt wurden
  rating: 0..5,
  notes: "",
  cooked: ["2026-09-12", "2026-10-03"],   Kochhistorie, aufsteigend, keine Doppelungen
  lastCooked: "2026-10-03",       abgeleitet = letztes Element von cooked (wegen Altbestand mitgeführt)
  createdAt, updatedAt
}
```

`recKey(name)`: Firebase erlaubt in Schlüsseln kein `. # $ [ ] /`. `recKey` ersetzt diese Zeichen durch Leerzeichen, fasst Leerzeichen zusammen und trimmt. Anzeige immer über `recName(rec, key)` = `rec.name || DNAMES[key] || key`. Planzellen speichern den `recKey` (oder freien Text, der zu keinem Rezept gehört).

`normalizeRecipe(key, raw)` ergänzt fehlende Felder (servings 4, source "eigen", cooked aus lastCooked, category aus altem `meal`), damit Altbestand und neue Einträge gleich aussehen.

### Einkaufsposten

- `key` = `ingKey(text)` (normierter Name + Einheitenklasse), dient dem Zusammenführen.
- `src: "plan"` entsteht aus „Einkaufsliste aus dem Plan“, `"manuell"` aus Handeingabe oder „+“ am Rezept. Das „+“ merkt sich die Plan-Zelle am Posten (`slots`), daraus leitet die Plan-Ansicht die „+“-Sperre ab (auf allen Geräten).
- `basic: true` kennzeichnet Grundvorrat (Salz, Öl, Mehl …), wird in einem eingeklappten Block „Vorrat prüfen“ gezeigt und zählt nicht im Fortschritt.
- `stockP` (0..1, nur lokal berechnet, nicht gespeichert) = Wahrscheinlichkeit laut Haushaltsbuch; ab 0,6 landet der Posten im eingeklappten Block „Wahrscheinlich da“, ein Tipp holt ihn in die Liste (`forceBuy: true` wird gespeichert).

## 4. Synchronisation

- Alle 10 s: `GET plans/<CODE>/meta`. Nur wenn sich ein Zeitstempel geändert hat, wird der zugehörige Teil geladen: `weeks/<sichtbareWoche>` (und die aktuelle Woche, falls anders), `shopping`, `recipes`, `participants` + `hb` + `settings`.
- Beim Start und bei `meta === null`: Migrationspfad (Abschnitt 5).
- Schreiben: `writePlan(patch)` = `fbPatch("plans/"+code, {...patch, "meta/<teil>UpdatedAt": now, "meta/updatedAt": now})`. Beispiele:
  - Gericht in Slot: `{"weeks/2026-W41/Mo/meals/Ab": ["Pasta Bolognese"], "meta/weeksUpdatedAt": now}`
  - Haken: `{"shopping/<id>/checked": true, "meta/shoppingUpdatedAt": now}`
  - Bewertung: `{"recipes/<key>/rating": 4, "recipes/<key>/updatedAt": now, "meta/recipesUpdatedAt": now}`
  - Rezept löschen: `{"recipes/<key>": null, …}`; Bild separat `fbPatch("recipeImages/"+code, {[key]: null})`
- Lokaler Zustand wird sofort aktualisiert (optimistisch), dann geschrieben. Scheitert das Schreiben, wird `syncErr` gesetzt, die Sync-Leiste rot, der betroffene Teil als „dirty“ gemerkt; der nächste Poll lädt ihn unabhängig vom Zeitstempel nach und löscht den Fehler erst mit diesem Abgleich. Ein laufendes eigenes Schreiben bricht den Poll nicht ab, es verhindert nur das Übernehmen (`canApply`).
- Wochen: der Poll hält nur die sichtbare und die aktuelle Woche im Cache, andere werden beim Öffnen (`selectWeek`) immer frisch geladen. Ein Slot wird vor dem Schreiben gegen den Serverstand der Zelle abgeglichen (`writeSlot`: Funktion auf Server-Array anwenden), damit zwei Geräte in derselben Zelle nichts verlieren. „Letzte Woche übernehmen“ liest Vor- und Zielwoche frisch und füllt nur leere Slots.
- Feld-PATCHes auf Rezepte (Bewertung, Notiz, Kochdatum) und Posten (Haken, Text) prüfen vorher per GET, ob der Eintrag noch existiert; sonst wird er lokal entfernt und ein Hinweis gezeigt. Reste solcher Schreibvorgänge (Rezept ohne `name`/`ingredients`/`steps`, Posten ohne `text`) werden beim Laden verworfen und per `null` aufgeräumt. Der Rezept-Editor schreibt nur die editierten Felder; beim Umbenennen wird das alte Rezept frisch gelesen, unter dem neuen Schlüssel geschrieben, das alte gelöscht und alle Planzellen (frisch gelesen) im selben PATCH umgestellt.
- Schutz lokaler Eingaben: Solange eine Planzelle, eine Einkaufszeile oder ein Rezept-Editor offen ist (`editingRef`), wird der betroffene Teil nicht vom Server überschrieben.
- Rezepte werden **nicht** mehr bei jedem Push mitgeschickt. `pushSync` in alter Form entfällt.
- Bilder: `recipeImages/<CODE>` wird einmal beim Start geladen (nicht im Poll) und nach eigenem Upload lokal ergänzt.

## 5. Migration (idempotent, beim Beitritt)

1. `meta` vorhanden → nichts tun.
2. `meta` fehlt, aber `plans/<CODE>/plan` existiert (Altbestand):
   - `weeks[isoWeekKey(heute)] = migrateWeek(plan)` (Einzel-Strings zu Arrays, `""` zu `[]`).
   - `shopping` (Array) → Objekt mit festen Ids (`alt000`, `alt001`, …), `src: "plan"`, `key` berechnet – deterministisch, damit zwei gleichzeitig beitretende Geräte dasselbe schreiben.
   - `recipes` fehlt → `globalRecipes` lesen, jedes Rezept mit `normalizeRecipe` übernehmen (Schlüssel `recKey(name)`).
   - `recipeImages` (Wurzel) lesen; Werte, die mit `data:` beginnen und zu einem übernommenen Rezept gehören, einzeln (ein PATCH je Bild) nach `recipeImages/<CODE>/<key>` kopieren – vor dem meta-PATCH. Nur wenn alle Kopien gelangen, steht `meta/imagesMigrated`; sonst holt der nächste Beitritt die fehlenden nach.
   - Unmittelbar vor dem Schreiben `meta` noch einmal lesen: ist es inzwischen da (anderes Gerät war schneller), wird nur geladen.
   - `meta` schreiben. `plan`, `updatedAt` (alt) und `globalRecipes` bleiben unverändert stehen.
3. Weder `meta` noch `plan` → der Code existiert nicht. Beitreten meldet „Kein Plan mit diesem Code“. Nur „Plan starten“ legt einen Plan an (`participants`, `meta`, `settings`, leere `weeks`).
4. Sitzung wiederherstellen (localStorage) darf nie einen Plan anlegen.

Neue Codes: 10 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` mit `crypto.getRandomValues`. Eingabe akzeptiert 6 bis 16 Zeichen, normalisiert Groß-/Kleinschreibung und Bindestriche. Alte 6-stellige Codes bleiben gültig.

## 6. Wochen

- Schlüssel ISO-Woche `YYYY-Www` (Montag bis Sonntag). `weekDates(key)` liefert die sieben ISO-Daten.
- Plan-Ansicht zeigt eine Woche mit Navigation `‹ KW 41 · 6.–12. Okt. ›`, Sprung „Heute“. Der heutige Tag ist hervorgehoben und wird beim Öffnen angesprungen.
- Leere Woche bietet „Letzte Woche übernehmen“.
- „Woche abschließen“: Dialog mit allen geplanten Gerichten der Woche (vorausgewählt, nur Tage bis heute), Bestätigen trägt das jeweilige Datum in `recipes/<key>/cooked` ein (ohne Doppelungen) und setzt `lastCooked`.
- Kochmodus „Fertig“ trägt das heutige Datum in `cooked` ein.

## 7. Heute

Reihenfolge der Quellen:
1. **Heute im Plan**: alle Slots des heutigen Tages aus der aktuellen Woche, sortiert nach Tageszeit (`mealSlotNow()`: vor 11 Uhr Frühstück, 11–14 Uhr Mittag, danach Abend). Tipp öffnet das Rezept.
2. **Vorschläge aus dem Kochbuch**: Chips `Alle · Bewährt · Hauptgericht · Schnell · Kinderessen · Frühstück`. „Bewährt“ = mindestens einmal gekocht und Bewertung ≥ 3. „Schnell“ = `minutes ≤ 30` oder Rubrik „Schnelle Küche“. Ohne Chip „Frühstück“ erscheint die Rubrik Frühstück nach 11 Uhr nicht. Punktzahl: `cov*100 + rating*4 + min(cookedCount,5)*3 − (vor < 7 Tagen gekocht ? 25 : 0)`. Ohne Haushaltsbuch gilt `cov = 0`.
3. **Aus der Klassiker-Basis**: die drei Einträge aus `CLASSICS`, die zum Vorrat am besten passen und noch nicht im Kochbuch sind, mit „Ins Kochbuch übernehmen“.
4. **Bekanntes Gericht finden (KI)**: siehe Abschnitt 8. Der Knopf heißt nicht mehr „erfinden“.

## 8. KI

- `callAI({mode, system, messages})`, `mode` ist `"extract"` oder `"suggest"`. `api/gemini.js` setzt `temperature` 0,1 für `extract` und 0,3 für `suggest`, prüft `Origin`/`Referer` gegen den eigenen Host (plus localhost), begrenzt die Körpergröße und drosselt pro IP (einfacher Zähler je Instanz).
- **Extraktion** (Text/Foto einer Rezeptseite): Prompt verlangt wörtliche Übernahme von Zutaten und Schritten; fehlen Schritte, darf die KI sie ergänzen, muss aber `"stepsGenerated": true` liefern. Das Ergebnis zeigt ergänzte Schritte markiert („Anleitung fehlte in der Vorlage und wurde ergänzt, bitte prüfen“). Fotoimport hat zwei Modi: „Rezeptseite / Screenshot“ (Extraktion) und „Fertiges Gericht“ (Vorschlag, als KI-Vorschlag gekennzeichnet).
- **Vorschlag**: Prompt verlangt ein **bekanntes, etabliertes Gericht** der klassischen oder modernen Küche, keine neuen Kombinationen und keine Fantasienamen, Felder `name`, `bekanntAls` (gebräuchlicher Name), `origin` (Region/Küche), `servings` (4), `minutes`, `ingredients` (Menge zuerst), `steps`, `description`, `cuisine`, `category`, `genutzt`, `fehlt`. Fehlt `origin` oder `bekanntAls`, wird der Vorschlag als „freie Kombination“ gekennzeichnet und nicht als Klassiker. Gespeichert wird mit `source: "ki"`.

## 9. Einkaufsliste

- „Einkaufsliste aus dem Plan“ führt zusammen statt zu ersetzen (`mergeShopping(shopping, planItems(...))` liefert `{next, patch}` mit gezielten Pfaden): Posten mit `src: "plan"`, die nicht mehr gebraucht werden, verschwinden (`shopping/<id>: null`); Mengen werden neu berechnet (bei gleicher Menge bleibt ein von Hand ergänzter Zusatz stehen); `checked` und Id bleiben, wenn der `key` gleich bleibt; `src: "manuell"` bleibt immer. `ingKey` ignoriert Zusätze in Klammern („(Bio)“).
- Portionen: Rezeptmengen werden mit `servings` des Plans skaliert (Standard: Haushaltsgröße = Anzahl `participants`, mindestens 2; überschreibbar pro Rezept beim Hinzufügen).
- `aggregateIngs` führt über `ingKey` zusammen: Name per `normKey` (Synonyme, Plural, Stoppwörter), Einheitenklasse (`g/kg` → Gramm, `ml/l` → Milliliter, `St./Stück/leer` → Stück, sonst Einheit wörtlich), Mengen werden auf die Basiseinheit umgerechnet und beim Anzeigen passend formatiert (1 500 g → 1,5 kg).
- Grundvorrat (`isBasic`) kommt in den Block „Vorrat prüfen“. Posten mit `stockP ≥ 0,6` kommen in den Block „Wahrscheinlich da“.
- Eingabefeld oben, Liste darunter; abgehakte Posten rutschen ans Ende ihrer Abteilung.
- `SHOP_CATS` erweitert um „Kühlregal“ (Spätzle, Maultaschen, Tofu, Feta, Frischkäse, Schupfnudeln, Gnocchi …), „Tiefkühl“, „Kräuter & Frisches“; „Konserven & Gläser“ wird vor „Obst & Gemüse“ geprüft (Dose, Glas, passiert, Mark, Kokosmilch); Ausnahmeliste für Komposita (Kokosmilch, Hafermilch, Mandelmilch, Erdnussbutter, Kartoffelchips, Apfelsaft).
- „Teilen“ erzeugt Klartext (Abteilungen als Überschriften) für `navigator.share` oder die Zwischenablage.

## 10. Rezepte, Detail, Kochmodus

- Rezeptliste: Sortierung `Zuletzt gekocht · Beste · Neu · A–Z`, Suche über Name und Zutaten, Rubrik-Chips, Schalter „Klassiker-Basis einblenden“ (Einträge aus `CLASSICS` erscheinen abgesetzt mit „Übernehmen“). Reiter „Kochbuch“ entfällt; der PDF-Knopf wandert in die Rezeptliste.
- Detail: Kopfbild (`DishImage`), Rubrik/Küche/Herkunft/Quelle, Portionen `− 4 +` (skaliert Zutaten über `scaleIng`), Zeit, Knöpfe „Kochmodus“, „Zum Wochenplan“ (Tag + Slot wählen, Standard heute und nächster Slot), „Auf die Einkaufsliste“, „Bearbeiten“, „Als PDF“, Bewertung, Notizen, Zutaten, Zubereitung, Kochhistorie („3× gekocht, zuletzt vor 12 Tagen“), Löschen.
- Bearbeiten: zusätzlich Portionen, Minuten, Herkunft, Quelle.
- Kochmodus: einklappbare Zutatenleiste oben, Wake Lock (`navigator.wakeLock`), erkannte Zeitangaben („20 Min.“) als Timer-Knopf mit Countdown und Signal; „Fertig“ trägt `cooked` ein und öffnet den Bewertungsdialog mit „Foto vom Gericht“.

## 11. Shell und Gestaltung

- Vier Tabs: `Heute · Woche · Einkauf · Rezepte`. Einkauf zeigt die Zahl offener Posten.
- Kopf: Titel in Akzentfarbe (nicht in der Fehlerfarbe), Name, Code-Knopf, Menü „⋯“ mit A−/A+, „KI-Symbolbilder“, „Haushaltsbuch“, „Plan verlassen“, Version. Sync-Leiste schmal, bei Fehlern rot mit Text.
- Inhalt auf dem Desktop zentriert, maximal 920 px breit.
- Farben: `subtle` wird `#7A7A86`; Mikrolabels mindestens 11 px; Tipp-Flächen mindestens 40 px hoch; Icon-Knöpfe mit `aria-label`; sichtbarer Fokus.
- Bilder: ohne eigenes Foto eine ruhige Platzhalterkachel (`DishImage`: Rubrik-Farbe, Anfangsbuchstabe, Name). KI-Symbolbilder nur, wenn `settings.aiImages` an ist, dann mit Hinweis „Symbolbild“.

## 12. Vertrag zwischen App und Ansichten

`App.jsx` hält den Zustand und reicht an jede Ansicht zwei Objekte: `state` (nur lesen) und `api` (Aktionen). Ansichten halten nur lokalen UI-Zustand (offene Zelle, Suchtext, Dialoge).

```
state = { code, userName, participants, hbLink, hbBook, stock, settings,
          weekKey, week, today, recipes, images, shopping, classics,
          syncOk, syncErr, lastSync, fontZoom, aiBusy, aiErr, importState … }

api = {
  // Plan
  setWeekKey(key), addDish(day, slot, key), removeDish(day, slot, key), setCook(day, person),
  copyLastWeek(), closeWeek(selection),
  // Einkauf
  buildShoppingFromPlan(), addShopItem(text), toggleShopItem(id), editShopItem(id, text), removeShopItem(id),
  clearShopping(), addRecipeToShopping(key, servings), forceBuy(id),
  // Rezepte
  openRecipe(key), saveRecipe(key, recipe), deleteRecipe(key), rateRecipe(key, rating), noteRecipe(key, notes),
  markCooked(key, iso), uploadImage(key, file), resetImage(key), adoptClassic(classic),
  // KI
  extractRecipe({mode, text, image}), suggestRecipe({fast, kids, cuisine}),
  // Haushaltsbuch, Einstellungen, Sitzung
  connectHb(code), setHbCat(cat), disconnectHb(), reloadHb(), setSetting(name, value), zoom(delta), leavePlan()
}
```

## 13. Tests und Werkzeuge

- `npm test` führt `node --test tests/` aus. Testfälle aus `TESTBERICHT.md` Anhang B sind Pflicht.
- `npm run build` muss ohne Warnungen zu fehlenden Importen durchlaufen.
- Ein Browser-Durchlauf (Playwright, simulierte Firebase/Haushaltsbuch/KI) liegt unter `tests/e2e/` und wird nach jeder größeren Änderung ausgeführt.
