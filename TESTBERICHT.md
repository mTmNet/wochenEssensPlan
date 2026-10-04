# Testbericht WochenEssensPlan – Sicht eines Testnutzers

Stand: 04.10.2026, Codestand `c5b6509` (Reiter „Heute“, KI-Rezept, neue Firebase)

## 1. Kurzfazit

Die App ist schlank, schnell und optisch stimmig. Der Grundablauf **Plan füllen → Einkaufsliste → Rezept → Kochmodus → Bewertung** funktioniert und fühlt sich nach einer App aus einem Guss an. Die Verwandtschaft zum Haushaltsbuch ist sofort erkennbar, und die Idee, aus den Einkäufen des Haushaltsbuchs den wahrscheinlichen Vorrat abzuleiten, ist das stärkste Alleinstellungsmerkmal.

Drei Dinge halten die App aber noch davon ab, den Alltag so verlässlich zu tragen wie das Haushaltsbuch:

1. **Synchronisation der Rezepte ist nicht sicher.** Jeder Haken in der Einkaufsliste lädt die komplette Rezeptsammlung hoch. Dadurch kommen gelöschte Rezepte zurück und Bewertungen eines anderen Geräts gehen verloren (im Test reproduziert, siehe 4.1).
2. **„Heute“ erfindet Rezepte, statt Bewährtes vorzuschlagen.** Der Prompt heißt wörtlich „Erfinde EIN … Rezept“ bei Temperatur 0,7. Das widerspricht deiner Vorgabe, nur Gerichte zu liefern, die es so wirklich gibt und die schon einmal gekocht wurden (siehe 5).
3. **Der Wochenplan hat kein Datum und keine Geschichte.** „Heute“ schaut nicht in den Plan, es gibt keine nächste Woche und keine Kochhistorie, aus der „schon mal gekocht“ überhaupt entstehen könnte (siehe 6).

Das Haushaltsbuch hat genau diese Klasse von Problemen bereits gelöst (Einträge einzeln per PATCH, Beitritt ohne Überschreiben, Monatsnavigation, Temperatur 0,1 bei der Extraktion, PWA, echte PDF-Datei). Ein Großteil der Empfehlungen ist deshalb ein Rückportieren dieser Lösungen.

## 2. Wie getestet wurde

- App lokal gebaut und mit `npm run dev` gestartet, bedient im Chromium-Browser (Playwright) in **Handy-Breite 390 px** und auf dem **Desktop 1280 px**, zusätzlich mit **zwei gleichzeitig angemeldeten Geräten** am selben Plan-Code.
- Firebase, das Haushaltsbuch und der Gemini-Endpunkt sind aus dieser Testumgebung nicht erreichbar (Netzwerk-Policy). Alle drei wurden deshalb **im Browser simuliert**: ein In-Memory-Firebase mit GET/PUT/PATCH, ein Beispiel-Haushaltsbuch mit 4 Einkäufen (1, 3, 10 und 30 Tage alt) und eine KI-Attrappe, die feste JSON-Antworten liefert. Die App-Logik lief dabei unverändert. Nicht geprüft werden konnten: echte Gemini-Antworten, Ladezeiten der Pollinations-Bilder, Verhalten auf echten Android/iOS-Geräten (Zurück-Taste, Druckdialog).
- Die Zutaten-Logik (Parser, Mengen-Zusammenführung, Supermarkt-Kategorien, Bon-Abgleich) wurde zusätzlich direkt mit rund 90 Testfällen geprüft (Anhang B).
- Zum Vergleich wurde das Repository `mTmNet/Haushaltsbuch` nur lesend angeschaut (README, Backlog, Sync-Code).

## 3. Was gut funktioniert

- **Einstieg in 10 Sekunden.** Name, Code, los. Sitzung bleibt nach Neuladen erhalten.
- **Dropdown im Plan** mit Rubrik-Tabs und Küchen-Untergruppen ist übersichtlich, die Suche filtert live, freier Text („Reste von gestern“) geht auch.
- **Mehrere Rezepte pro Mahlzeit**, „Wer kocht?“ mit Initialen und die Zwei-Geräte-Synchronisation des Plans (Risotto vom Desktop war nach dem nächsten Poll auf dem Handy da, der zweite Teilnehmer erschien im Kochpicker).
- **Einkaufsliste** nach Supermarkt-Abteilungen, Mengen werden über Rezepte hinweg addiert („Tomaten Dose 2 St.“ aus Bolognese und Curry), Tippen zum Bearbeiten, Fortschrittsbalken.
- **Kochmodus** ist ruhig und gut lesbar, der Bewertungsdialog danach ist genau der richtige Moment für Sterne und Notiz.
- **Haushaltsbuch-Anbindung** ist nur lesend, die Verknüpfung liegt im Plan (gilt für die Familie), der Rubrik-Wechsel und die Halbwertszeiten je Unterkategorie sind durchdacht. Die Trefferquote beim Bon-Abgleich ist gut („Jogh Natur“ → Joghurt, „Passata“ → Tomaten, „Möhren“ → Karotten, „Hähnchenbrustfilet“ → Hähnchenbrust).
- **Android-Zurück-Taste**, Schriftzoom, Code kopieren, verständliche KI-Fehlertexte: kleine Dinge, die zeigen, dass die App im Alltag benutzt wird.

## 4. Fehler, die zuerst behoben werden sollten

### 4.1 Gelöschte Rezepte kommen zurück, Bewertungen werden überschrieben (kritisch)

**Reproduziert mit zwei Geräten:**

| Schritt | Ergebnis |
|---|---|
| Gerät A löscht „Avocado Toast“ | Rezept ist aus der Datenbank weg |
| Gerät B (noch nicht neu gepollt) hakt innerhalb von 10 s ein Produkt in der Einkaufsliste ab | B lädt 4,6 KB mit **allen 14 Rezepten** hoch, „Avocado Toast“ ist wieder in der Datenbank |
| Gerät A pollt | „Avocado Toast“ steht wieder in der Rezeptliste |
| Gerät A bewertet Risotto mit 5 Sternen, B hakt erneut ein Produkt ab | Bewertung von Risotto ist gelöscht |

**Ursache:** `pushSync` in `src/App.jsx:529` schickt bei jeder Planänderung, jedem Haken und jedem Einkaufseintrag die gesamte Rezeptsammlung per `fbPatch("globalRecipes", r)` (`src/App.jsx:534`). Da PATCH auf Schlüsselebene überschreibt, gewinnt immer das Gerät mit dem ältesten Stand. Mit wachsender Sammlung (Beschreibungen, Notizen) wird das außerdem zur Datenmenge: im kurzen Test gingen 73 KB hoch, davon fast alles Rezepte.

**Empfehlung (wie im Haushaltsbuch gelöst):**
- Rezepte aus `pushSync` ganz herausnehmen. Rezepte werden ohnehin an jeder Stelle, die sie ändert, bereits einzeln gepatcht (`saveRecipe`, `saveEdit`, `updateRecipeMeta`, `deleteRecipe`).
- Für Bewertung, Notiz und `lastCooked` nicht das ganze Rezept, sondern nur das Feld patchen (Multi-Path-PATCH `{"Risotto/rating": 5}`), damit zwei Personen gleichzeitig bewerten können.
- `fbPatchChecked` überall verwenden und die Sync-Leiste rot schalten, wenn ein Schreiben scheitert. Heute schluckt `fbPatch` jeden Fehler, nur Bilder werden geprüft.

### 4.2 Beitreten mit falschem Code legt still einen leeren Plan an (hoch)

Eingabe eines nicht existierenden Codes („XXXX99“) führt ohne Rückfrage in einen neuen, leeren Plan (`handleJoin`, `src/App.jsx:595`). Wer sich vertippt, denkt, der Familienplan sei weg. Das Haushaltsbuch prüft den Code (`CODE_RE`), meldet „Keine Verbindung“ bei Netzfehlern und schreibt beim Beitritt nur fehlende Felder per PATCH.

**Empfehlung:** Beim Beitreten nur bestehende Pläne annehmen, sonst Meldung „Kein Plan mit diesem Code. Neuen Plan erstellen?“. Neue Pläne nur über „Plan starten“. Dazu 10-stellige Codes aus `crypto.getRandomValues` wie im Haushaltsbuch (`randCode`, `src/App.jsx:420` nutzt `Math.random` und 6 Zeichen), denn der Code ist das einzige Passwort zum Plan.

### 4.3 „Gesamte Einkaufsliste generieren“ löscht Handeinträge und Haken (hoch)

`generateShopping` (`src/App.jsx:666`) ersetzt die komplette Liste. Im Test war „Klopapier“ (von Hand eingetragen) danach weg, ebenso alle Haken. Außerdem wird `addedSlots` zurückgesetzt (`src/App.jsx:684`), die „+“-Sperre verschwindet, und ein erneutes „+“ verdoppelt die Menge („Beeren 300 g“).

**Empfehlung:** Generieren als **Zusammenführen**: Rezeptzutaten neu berechnen, Handeinträge und Haken behalten, Rezeptzutaten, die nicht mehr im Plan sind, entfernen. Dafür jeden Eintrag mit Herkunft speichern (`src: "plan" | "manuell"`). Die „+“-Sperre im Plan speichern, nicht nur im Gerät.

### 4.4 „vor -1 Tagen gekocht“ (mittel, sichtbar)

Direkt nach „Fertig“ im Kochmodus zeigt „Heute“ vormittags „vor -1 Tagen gekocht“. `daysSince` (`src/App.jsx:224`) rechnet mit 12:00 Uhr des Kochtags; vor Mittag ist die Differenz negativ. Datumsstrings vergleichen oder `Math.max(0, …)`.

### 4.5 Eine Rezeptsammlung für alle Familien weltweit (hoch, Datenschutz)

`globalRecipes` und `recipeImages` sind laut Kommentar in `src/App.jsx:4` ohne Code lesbar und schreibbar. Jede Familie, die die App-URL kennt, sieht und ändert dieselben Rezepte, Bewertungen, Notizen („weniger Salz“), Fotos und „gestern gekocht“. Ein versehentliches „Rezept löschen“ löscht für alle. Das Haushaltsbuch hat daraus bereits gelernt: Wurzel gesperrt, Zugriff nur unter `books/<CODE>`.

**Empfehlung:** Rezepte unter `plans/<CODE>/recipes` (oder `recipes/<CODE>`) ablegen, Bilder unter `recipeImages/<CODE>`, Firebase-Regeln entsprechend. Eingebaute Rezepte (`DR`) bleiben im Code und werden nicht in die Datenbank geschrieben. Einmalige Migration des bestehenden Bestands in den Plan-Code der Familie.

## 5. Rubrik „Heute“ und die KI: Abgleich mit deiner Anforderung

Deine Vorgabe: Rezepte unter „Heute“ sollen moderner und klassischer Küche entsprechen, keine erfundenen KI-Kombinationen, sondern Gerichte auf einer Basis, die schon einmal gekocht wurde.

### 5.1 Ist-Zustand

| Stelle | Was heute passiert |
|---|---|
| `generateRecipe`, `src/App.jsx:847` | System-Prompt: „**Erfinde** EIN alltagstaugliches Rezept für heute“. Der Button heißt „REZEPT MIT KI ERFINDEN“ (`src/App.jsx:1461`). Die KI darf frei kombinieren und soll vorhandene Rezepte ausdrücklich nicht wiederholen. |
| `api/gemini.js:40` | `temperature: 0.7` für alle Aufrufe, also auch für die reine Extraktion. Das Haushaltsbuch nutzt 0,1 „reine Extraktion, keine Kreativität“. |
| Textimport, `src/App.jsx:748` | „Falls keine Kochanleitung vorhanden ist, erstelle eine sinnvolle Anleitung“, Nutzertext: „Extrahiere und **vervollständige**“. Ergänzte Schritte sind im Ergebnis nicht als ergänzt erkennbar. |
| Fotoimport, `src/App.jsx:753` | „Beschreibe das Gericht auf dem Bild und **erstelle daraus ein eigenes Rezept**“. Das ist Erfinden anhand eines Fotos, kein Abschreiben einer Kochbuchseite. |
| Ranking ohne Haushaltsbuch | Ohne Bewertungen ist die Punktzahl überall 0, „Vorschlag für heute“ ist schlicht das erste Rezept der Liste (im Test: Haferflocken). |
| Ranking mit Haushaltsbuch | Frühstück konkurriert unter „Alle Gerichte“ mit dem Abendessen; mit frischen Eiern und Milch im Haus steht abends „Pfannkuchen“ ganz oben. Die Uhrzeit spielt keine Rolle. |
| Bilder, `src/App.jsx:117` | Jedes Rezept ohne eigenes Foto bekommt ein **KI-generiertes Fantasiebild** von pollinations.ai, auch im PDF-Kochbuch. Dabei geht jeder Rezeptname an einen Drittanbieter. |

### 5.2 Empfehlung: Quellen in dieser Reihenfolge

1. **Der Wochenplan für heute.** Steht für heute etwas im Plan, ist das der Vorschlag. Alles andere ist „Alternative“.
2. **Das eigene Kochbuch, gewichtet nach „schon mal gekocht“.** Dafür braucht es eine echte Kochhistorie statt nur `lastCooked`: ein Feld `cooked: ["2026-09-12", "2026-10-03"]` pro Rezept, gefüllt vom Kochmodus und beim „Woche abschließen“. Ranking: Vorrats-Abdeckung + Bewertung + Anzahl gekocht, abzüglich „kürzlich gekocht“. Ein Filter „Bewährt“ (mindestens einmal gekocht, 3 Sterne oder mehr) gehört als Chip neben „Alle Gerichte“.
3. **Eine kuratierte Basis etablierter Gerichte**, die mit der App ausgeliefert wird: 80 bis 120 echte Klassiker und moderne Standards mit Herkunft (Käsespätzle, Linsen mit Spätzle, Maultaschen in der Brühe, Gaisburger Marsch, Königsberger Klopse, Rouladen, Kartoffelsuppe, Spaghetti aglio e olio, Ragù alla bolognese, Shakshuka, Dal, Pad Thai, Ofengemüse mit Feta, Bowl mit Hähnchen …). Die heutigen 14 Standardrezepte sind dafür zu dünn (4 bis 6 Zutaten, keine Portionen, keine Zeit, „Risotto“ ohne Sorte). Diese Basis ist das, was „Heute“ durchsucht, wenn das eigene Kochbuch nichts Passendes hat.
4. **Die KI nur als Auswahl- und Anpassungshilfe**, nicht als Erfinder. Prompt-Richtung: „Nenne ein **bekanntes, etabliertes Gericht** der klassischen oder modernen Küche, das es so in Kochbüchern gibt und das zu diesen Zutaten passt. Keine neuen Kombinationen, keine Fantasienamen. Gib den gebräuchlichen Namen, Herkunft/Region und ein typisches Rezept mit Mengen für 4 Personen an.“ Dazu `temperature` 0,2 bis 0,3, Pflichtfelder `herkunft` und `bekanntAls`, und im Ergebnis der Hinweis „Klassiker aus der … Küche“. Button umbenennen in „BEKANNTES GERICHT FINDEN“ oder „KLASSIKER VORSCHLAGEN“. Antworten ohne Herkunft oder mit erkennbar erfundenem Namen (Bindestrich-Ketten wie „Hähnchen-Paprika-Kokos-Pfanne“) ablehnen oder als „freie Kombination“ kennzeichnen.

### 5.3 Import ehrlich machen

- `temperature` für Extraktion auf 0,1 (Haushaltsbuch-Wert), für Vorschläge getrennt steuerbar (`api/gemini.js` kann einen Parameter `mode` annehmen).
- Vom Modell zurückgeben lassen, welche Schritte aus der Vorlage stammen und welche ergänzt wurden (`steps_ergaenzt: true/false`). Ergänzte Schritte im Ergebnis farblich markieren, mit Hinweis „Anleitung fehlte in der Vorlage und wurde ergänzt, bitte prüfen“.
- Fotoimport in zwei Modi trennen: „Rezeptseite/Screenshot“ (abschreiben) und „Fertiges Gericht“ (Vorschlag, als solcher gekennzeichnet). Letzteres passt streng genommen nicht zur Philosophie und könnte auch entfallen.
- Herkunft am Rezept speichern (`source: "Kochbuch Oma, S. 42" | "chefkoch.de" | "KI-Vorschlag"`), im Detail anzeigen, im Kochbuch-PDF mitdrucken. Dann sieht jeder, was Familienrezept, was abgetippt und was KI ist.

### 5.4 Bilder

KI-Fantasiebilder stehen quer zur Echtheits-Idee und sehen bei schwäbischen Gerichten oft falsch aus. Vorschlag: Eigene Fotos als Normalfall, dazu im Bewertungsdialog nach dem Kochen die Frage „Foto vom Gericht?“ (Kamera öffnet sich direkt). Ohne Foto eine ruhige Platzhalterkachel mit Rubrik-Farbe statt eines generierten Bildes. Falls Pollinations bleibt: nur auf Wunsch („Beispielbild laden“) und mit Kennzeichnung „Symbolbild“.

## 6. Workflow und Alltagstauglichkeit

### 6.1 Wochenplan braucht ein Datum

Der Plan ist eine ewige Mo-bis-So-Vorlage. Es gibt kein „nächste Woche planen“, keine Vergangenheit, und „Heute“ kennt den heutigen Wochentag nicht. Das Haushaltsbuch hat mit dem Monatsnavigator genau dieses Muster.

**Vorschlag:** Plan unter `plans/<CODE>/weeks/2026-W41` speichern, oben `‹ KW 41 · 6.–12. Okt › `, heutiger Tag hervorgehoben und beim Öffnen angesprungen. „Woche abschließen“ (oder automatisch am Sonntag) trägt alle gekochten Gerichte in die Kochhistorie ein. „Wie letzte Woche“ und „Lieblingswoche“ als Vorlagen füllen den Plan mit einem Tipp. Das ist zugleich die Datenbasis für „schon mal gekocht“.

### 6.2 „Heute“ und der Plan gehören zusammen

Siehe 5.2, Punkt 1. Zusätzlich: vor 11 Uhr Frühstück zuerst, danach Haupt­gerichte, Frühstück nur über den Chip. Der Chip „Kinderessen“ zeigt heute nur den Hinweis, dass die KI etwas erfinden könne. Besser: Rubrik-Chips ohne Treffer ausblenden oder mit Zahl beschriften („Kinderessen (0)“).

### 6.3 Einkaufsliste im Zusammenspiel mit dem Haushaltsbuch

- **Vorrat nutzen.** Die Wahrscheinlichkeits-Logik aus „Heute“ passt genauso in die Einkaufsliste: Zutaten mit hoher Wahrscheinlichkeit („Eier 91 %“) ausgegraut und mit Hinweis „wahrscheinlich da“ nach unten sortieren, mit einem Tipp wieder aktivierbar. Das spart die Hälfte der Liste.
- **Basics raus.** „Olivenoel 2 EL“, „Honig 1 EL“, „Salz und Pfeffer“ stehen heute als Einkaufsposten. `isBasic` (`src/App.jsx:184`) existiert bereits, wird in `generateShopping` aber nicht genutzt. Basics in einen eigenen, eingeklappten Block „Vorratsschrank prüfen“.
- **Zusammenführung scheitert an Schreibweisen.** Aus den Testfällen: „Zwiebel 1 St.“ + „1 Zwiebel“ + „2 Zwiebeln“ bleiben drei Zeilen; „Olivenoel 2 EL“ und „2 EL Olivenöl“ ebenso; „Pasta 200 g“ und „200 g Spaghetti“ ebenso. „Milch 3,5% 200 ml“ wird als Menge 3,5 mit Einheit „% 200 ml“ gelesen. Die Funktionen `normKey`/`KEY_SYN` aus dem Bon-Abgleich lösen das bereits besser als `aggregateIngs` und sollten auch dort verwendet werden (Schlüssel = normierter Name, Einheiten St./Stück/leer zusammenfassen).
- **Abteilungen.** Erste Treffer der Stichwortliste entscheiden: „Kokosmilch“ → Milch & Käse, „Tomaten Dose“ → Obst & Gemüse, „Kartoffelchips“ → Obst & Gemüse, „Mandelmilch“ → Milch & Käse. Ganz ohne Treffer: Spätzle, Maultaschen, Semmelknödel, Feta, Tofu, Petersilie, Basilikum, Backpulver, Sauerkraut. Für eine schwäbische Küche fehlen also ausgerechnet die Standardzutaten. Vorschlag: Kühlregal (Spätzle, Maultaschen, Tofu, Feta), Tiefkühl, Kräuter; Dose/Glas vor Gemüse prüfen; eine kleine Ausnahmeliste für Komposita (Kokosmilch, Hafermilch, Erdnussbutter).
- **Eingabefeld oben oder schwebend.** Bei 22 Einträgen liegt „Produkt hinzufügen“ unter der Liste, im Laden tippt man es nicht.
- **Modus „Im Laden“**: abgehakte Posten ans Ende rutschen lassen, Haken bleibt groß. Bereits gut: 28-px-Checkboxen.

### 6.4 Rezepte und Kochmodus

- **Portionen fehlen.** Keine Angabe, für wie viele Personen ein Rezept ist, keine Skalierung. Für eine Familie ist das der häufigste Rechenschritt. Vorschlag: `servings` am Rezept, im Detail `– 4 +`, Mengen und Einkaufsliste rechnen mit.
- **Zeit fehlt.** „Schnelle Küche“ ist eine Rubrik, aber kein Rezept trägt eine Minutenzahl. Ein Feld `minutes` erlaubt den Filter „unter 30 Minuten“ ehrlich.
- **Aus dem Rezept heraus** gibt es weder „Zum Wochenplan“ noch „Auf die Einkaufsliste“. Beides sind die naheliegendsten Aktionen nach dem Lesen eines Rezepts.
- **Kochmodus:** Zutaten sind im Kochmodus nicht sichtbar (Mengen muss man sich merken oder zurückgehen); einklappbare Zutatenleiste oben wäre genug. Display geht beim Kochen aus (`navigator.wakeLock` anfordern). Erkannte Zeitangaben im Schritt („20 Min. köcheln“) könnten einen Timer-Knopf erzeugen.
- **Rezeptliste**: Sortierung nach Küche ist für ein Familienkochbuch weniger hilfreich als „zuletzt gekocht“, „beste Bewertung“, „neu“. Bewertung als Sterne in der Liste ist gut, sollte aber auch filterbar sein.

### 6.5 Navigation und Oberfläche

- **Fünf Tabs passen nicht auf ein Handy.** In 390 px ist der fünfte Tab abgeschnitten („Kochb“) ohne sichtbaren Hinweis zum Scrollen. „Kochbuch“ ist inhaltlich dieselbe Liste wie „Rezepte“, nur anders gruppiert und mit PDF-Knopf. Vorschlag: zusammenlegen (PDF-Knopf und Rubrik-Gruppierung in „Rezepte“), dann bleiben vier Tabs, die auf jedes Handy passen.
- **Rezeptnamen im Plan werden abgeschnitten** („Pasta Bologn…“, „Haferflocken …“), weil pro Zeile drei Aktionen rechts stehen. Vorschlag: Tippen auf den Namen öffnet das Rezept, rechts nur „×“, der Einkaufs-„+“ wandert ins Rezept oder in ein Langdruck-Menü.
- **„Plan starten“ ohne Namen** reagiert nicht. Ein kurzer Hinweis am Namensfeld reicht.
- **„Verlassen“ im Header** ist eine der prominentesten Schaltflächen, wird aber fast nie gebraucht. Unter ein Zahnrad/„Mehr“ zusammen mit A−/A+ und Haushaltsbuch-Verknüpfung.
- **Lokaler Hinweiskasten** („Lokal mit npm run dev …“) erscheint hell auf dunklem Grund und bei jedem lokalen Start in zwei Reitern. Nur für Entwickler relevant, in der Konsole besser aufgehoben.

### 6.6 Installieren, Drucken, Teilen

- **PWA fehlt.** Das Haushaltsbuch hat `manifest.json`, Icons, Service Worker und den „Installieren“-Balken. Für eine App, die in der Küche und im Supermarkt läuft, ist der Startbildschirm-Zugang wichtiger als jede weitere Funktion. Direkt übernehmbar.
- **PDF per `window.print()`** nach 1 s (`src/App.jsx:985`, `995`): Bilder sind dann oft noch nicht geladen, Pop-up-Blocker auf dem Handy, Firefox Android druckt nicht. Das Haushaltsbuch hat das mit jsPDF und Teilen-Dialog bereits gelöst (`src/pdf.js`). Ein einzelnes Rezept als Datei teilen zu können (WhatsApp an die Schwiegermutter) ist zudem ein echter Alltagsfall.
- **Einkaufsliste teilen** als Text (Zwischenablage oder `navigator.share`) für den, der gerade ohne App unterwegs ist.

## 7. Design

Gesamteindruck: ruhig, dunkel, hochwertig. Serif-Titel plus Sans-Fließtext, Großbuchstaben-Mikrolabels und orangefarbener Akzent geben der App Charakter, und die Verwandtschaft zum Haushaltsbuch ist ein Plus. Verbesserungen im Detail:

- **Roter Schriftzug „Wochenplan“** benutzt die Fehlerfarbe (`C.err`). Direkt darunter leuchtet die Sync-Leiste grün. Zwei Signalfarben im Kopf lenken vom Inhalt ab; Akzentfarbe oder Weiß wäre stimmiger. (Im Haushaltsbuch war das laut Backlog ein ausdrücklicher Wunsch, dann wenigstens die Sync-Leiste dezenter.)
- **Umlaute uneinheitlich:** „ZURUECK“, „REZEPT LOESCHEN“, „Nochmal „Zurueck“ druecken“ neben „BILD ÄNDERN“, „EINKAUFSLISTE KOMPLETT LÖSCHEN“, „MEHR VORSCHLÄGE“. Überall echte Umlaute.
- **Kontrast und Größe:** `C.subtle` (#5A5A64) auf Kartengrund (#2A2A32) liegt bei etwa 2,3:1, damit sind „+ Hinzufügen…“, die Mahlzeit-Labels und die Küchen-Untergruppen für ältere Augen kaum lesbar. Mikrolabels mit 9 bis 10 px sind sehr klein; der Zoom hilft, aber die Grundgröße sollte bei 11 bis 12 px liegen und `C.subtle` heller (#7A7A86).
- **Tipp-Flächen:** „aktualisieren“ und „trennen“ sind 11-px-Textlinks ohne Fläche; die „x“-Knöpfe in den Zutaten- und Schritt-Editoren sind 14 bis 16 px. Mindestens 40 px Höhe.
- **„ALS PDF“** bricht in zwei Zeilen; „Leerer Einkaufslisten“-Zustand zeigt ein einzelnes „-“ als Symbol, das wie ein Fehler wirkt.
- **Desktop:** Inhalt läuft ohne Maximalbreite über 1 280 px; eine zentrierte Spalte von 760 bis 900 px liest sich besser und lässt rechts Platz für das geöffnete Rezept.
- **Tastatur und Vorlesen:** keine sichtbaren Fokus-Zustände, Icon-Knöpfe („+“, „×“, Sterne) ohne `aria-label`. Für die Zielgruppe nicht entscheidend, aber günstig nachzurüsten.

## 8. Technik, kurz

- `api/gemini.js` hat weder Herkunftsprüfung noch Mengenbegrenzung: Jeder, der die Vercel-URL kennt, kann dein Gemini-Kontingent verbrauchen. Mindestens den `Origin`-Header prüfen und pro IP drosseln.
- Der Zweig in `callClaude` (`src/App.jsx:373`) für claude.ai-Artefakte ist toter Code mit veraltetem Modellnamen, das Haushaltsbuch hat ihn bereits entfernt.
- `README.md` beschreibt noch den Stand „jeder gibt seine Firebase-URL ein“ und Upload per GitHub-Web-Oberfläche. Das Haushaltsbuch-README (Regeln, Datenmodell, Sicherheit) ist die bessere Vorlage; ein `BACKLOG.md` wie dort hilft auch hier.
- Eine Datei mit 1 900 Zeilen und ohne Tests. Die reinen Funktionen (Parser, Aggregation, Abteilungen, Bon-Abgleich, Ranking) lassen sich ohne Umbau in eine eigene Datei ziehen und mit den Fällen aus Anhang B absichern.
- `fbPatch` ignoriert Fehler. Nach dem Ablauf von Firebase-Testregeln merkt die App es nur an der Sync-Leiste, nicht beim Speichern.

## 9. Vorschlag für die Reihenfolge

| Prio | Maßnahme | Nutzen |
|---|---|---|
| 1 | Rezepte aus `pushSync` nehmen, Felder einzeln patchen (4.1) | Keine verlorenen Bewertungen, keine Wiedergänger |
| 2 | Beitritt nur zu bestehenden Plänen, 10-stellige Codes (4.2) | Kein „Plan weg“-Schreck, Code als echtes Passwort |
| 3 | Rezepte pro Plan-Code statt global, Regeln anpassen (4.5) | Familiendaten bleiben in der Familie |
| 4 | „Heute“: Plan für heute zuerst, Uhrzeit, Filter „Bewährt“, Kochhistorie (5.2, 6.2) | Vorschläge aus dem, was ihr wirklich kocht |
| 5 | KI-Prompt auf „bekanntes Gericht“ umstellen, Temperatur senken, Herkunft speichern (5.2, 5.3) | Keine erfundenen Rezepte |
| 6 | Einkaufsliste zusammenführen statt ersetzen, Basics und Vorrat berücksichtigen (4.3, 6.3) | Kürzere, verlässliche Liste |
| 7 | Wochen mit Datum, „Woche abschließen“ (6.1) | Historie, nächste Woche, Vorlagen |
| 8 | PWA, jsPDF und Teilen aus dem Haushaltsbuch übernehmen (6.6) | App auf dem Startbildschirm, PDF auf dem Handy |
| 9 | Tabs auf vier reduzieren, Plan-Zeilen entlasten, Umlaute, Kontrast (6.5, 7) | Lesbarkeit auf dem Handy |
| 10 | Portionen und Zeit am Rezept, Kochmodus mit Zutaten und Wake Lock (6.4) | Kochen ohne Zurückblättern |

## Anhang A: Testprotokoll (Auszug)

| Nr. | Schritt | Ergebnis |
|---|---|---|
| 1 | Start, Name leer, „Plan starten“ | Keine Reaktion, kein Hinweis |
| 2 | Name „Claude“, Plan starten | Plan geöffnet, Code im Header, Sitzung nach Neuladen erhalten |
| 3 | Montag Abendessen: Dropdown, Tab „Hauptgericht“, Bolognese; zweites Rezept per Suche „sal“ | Zwei Rezepte im Slot, Namen abgeschnitten |
| 4 | Freitext „Reste von gestern“ | Übernommen, ohne Rezept-Knopf, in der Einkaufsliste als „(Zutaten prüfen)“ |
| 5 | „Wer kocht?“ | Picker mit Initialen, Auswahl synchronisiert |
| 6 | „+“ an Haferflocken, dann „Gesamte Einkaufsliste generieren“ | 21 Posten, 6 Abteilungen; Olivenöl, Honig, Dressing als Einkaufsposten |
| 7 | Posten abhaken, Posten bearbeiten („(Bio)“ angehängt), „Klopapier“ hinzufügen | Funktioniert |
| 8 | Erneut generieren | Klopapier und Haken weg, „+“ wieder frei, zweites „+“ verdoppelt Beeren auf 300 g |
| 9 | Rezepte: Suche „parmesan“ | Findet Rezepte über Zutaten, gut |
| 10 | Carbonara: Kochmodus, 5 Schritte, Fertig, 4 Sterne, Notiz | Gespeichert; in „Heute“ steht „vor -1 Tagen gekocht“ |
| 11 | Textimport Käsespätzle (KI simuliert) | Erkanntes Rezept editierbar, gespeichert, in Liste unter „Schwäbisch“ |
| 12 | „Heute“ ohne Haushaltsbuch | Vorschlag „Haferflocken mit Beeren“ (erstes Rezept), keine Begründung |
| 13 | Haushaltsbuch „ABC“ | Meldung „6 bis 16 Zeichen“, gut |
| 14 | Haushaltsbuch „FAMILIE1“ (simuliert, 4 Einkäufe) | „19 Lebensmittel wahrscheinlich da“; Vorschlag „Pfannkuchen 74 %“, dann Carbonara 71 %, Risotto 62 % |
| 15 | Chip „Kinderessen“ | Leer, nur KI-Hinweis |
| 16 | „Schnell“ + „Rezept mit KI erfinden“ (simuliert) | Sprung in Reiter „Rezepte“, Vorschlag oben, „Ins Kochbuch & öffnen“ landet im Detail |
| 17 | Kochbuch-PDF | Neues Fenster, 16 Rezepte, Bilder von pollinations.ai, Druckdialog nach 1 s |
| 18 | Zoom A+ zweimal | Ganze App skaliert, Layout hält |
| 19 | Zweites Gerät (Desktop) tritt bei, fügt Risotto Mittwoch hinzu | Nach ≤ 10 s auf dem Handy sichtbar, Teilnehmer im Kochpicker |
| 20 | Gerät A löscht Rezept, Gerät B hakt Posten ab | Rezept wieder da (4.1) |
| 21 | Gerät A bewertet Risotto, Gerät B hakt Posten ab | Bewertung weg (4.1) |
| 22 | Beitritt mit Code „XXXX99“ | Neuer leerer Plan ohne Rückfrage (4.2) |

## Anhang B: Zutaten-Logik, auffällige Testfälle

| Eingabe | Ergebnis heute | Erwartung |
|---|---|---|
| `Zwiebel 1 St.` + `1 Zwiebel` + `2 Zwiebeln` | 3 Zeilen | 1 Zeile „Zwiebeln 4 St.“ |
| `Olivenoel 2 EL` + `2 EL Olivenöl` | 2 Zeilen | 1 Zeile oder Basics-Block |
| `Pasta 200g` + `200 g Spaghetti` + `Nudeln 250 g` | 3 Zeilen | 1 Zeile (Synonyme existieren in `KEY_SYN`) |
| `Milch 3,5% 200 ml` | Menge 3,5, Einheit „% 200 ml“ | Menge 200 ml |
| `1/2 Bund Petersilie` | keine Menge erkannt | 0,5 Bund (nur „½“ wird erkannt) |
| `2 große Kartoffeln` | Name „große Kartoffeln“ | Name „Kartoffeln“ |
| `Kokosmilch Dose 1 St.` | Milch & Käse | Konserven |
| `Tomaten Dose 2 St.` | Obst & Gemüse | Konserven |
| `Spätzle`, `Maultaschen`, `Feta`, `Tofu`, `Petersilie`, `Backpulver`, `Sauerkraut` | Sonstiges | Kühlregal / Kräuter / Backen |
| Bon „Rinderhack 500g“ ↔ Rezept „Hackfleisch“ | kein Treffer | Treffer (Synonym `rinderhack` → `hackfleisch` ergänzen) |
| Bon „Kokosmilch“ / „Mandelmilch“ ↔ Rezept „Milch“ | Treffer | kein Treffer (Komposita mit anderer Bedeutung) |
| Bon „Butterkäse“ / „Erdnussbutter“ ↔ Rezept „Butter“ | Treffer | kein Treffer |
| `Butter`, `Eier`, `Milch`, `Honig`, `Knoblauch` | nicht Basic | passt; `Butter` und `Knoblauch` wären als Basics vertretbar |
| `Mandelmehl`, `Kokosöl`, `Vanillezucker` | Basic (Endung) | Spezialzutaten, eher nicht Basic |

Treffer, die gut funktionieren: „Jogh Natur“ → Joghurt, „Passata“ → Tomaten, „Möhren“ → Karotten, „Hähnchenbrustfilet“ → Hähnchenbrust, „Kirschtomaten“ → Tomaten, „Eier 10er Bio“ → Eier, „Lauch“ ≠ „Knoblauch“ (Ausnahmeliste greift).
