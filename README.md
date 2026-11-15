# Wochenplan (WochenEssensPlan)

Gemeinsamer Essensplaner für die Familie: Wochenplan mit Datum, Einkaufsliste, Rezepte mit Kochmodus und Kochhistorie, „Was kochen wir heute?“ mit Anbindung an das Haushaltsbuch. Schwester-App von `Haushaltsbuch` (gleiche Optik, gleiche Technik).

## Funktionen (Version 3: „Heute statt Woche“)

- **Heute** – die eine Frage: *Was kochen wir heute?* Bester Vorschlag mit Begründung („nutzt Hackfleisch, Paprika · Paprika hält noch 2 Tage“), drei Alternativen, „Mehr“, Filter *Schnell* und *Für Kinder*, „Andere“ mischt neu. Ein Tipp auf **Gekocht** trägt das Kochdatum ein und fragt nach der Bewertung; **Vormerken** legt das Gericht auf einen Tag oder „demnächst“. Vorschläge kommen aus dem eigenen Kochbuch und der mitgelieferten **Rezept-Basis** (133 etablierte Gerichte); ein leeres Kochbuch zeigt nur die Basis, jedes Gericht lässt sich mit einem Tipp übernehmen.
- **Vorschlags-Logik** – Inspiration statt Wiederholung: Es zählt, was wahrscheinlich da ist, was bald verdirbt und was lange nicht dran war. Kein Bonus für „oft gekocht“; frisch Gekochtes wird gebremst. Ohne Vorrat zählen Bewertung und Abwechslung.
- **Vorrat** – eine Liste aus drei Quellen: Haushaltsbuch (automatisch, nur lesend), **Speisekammer-Foto** (die KI listet erkennbare Lebensmittel, du bestätigst) und Hand. Jede Position mit Gruppe, Kaufdatum, Resttagen und Wahrscheinlichkeit; **★ Dauervorrat** (Spaghetti, Gewürze) verblasst nie; **×** entfernt eigene Positionen oder streicht Haushaltsbuch-Positionen.
- **Lernendes Verblassen** – die Gruppenzeiten (Fisch 4 Tage … Vorräte 90 Tage) sind Startwerte. Aus den Abständen zwischen zwei Käufen desselben Produkts und aus ×-Streichungen lernt die App je Produkt die echte Haltbarkeit („gelernt aus 3 Käufen“). Gelernt wird aus bis zu einem Jahr Einkäufen, je Plan.
- **Graph** (Umschalter „Liste / Graph“ im Vorrat) – der Vorrat als Kreis: in der Mitte der Rezeptkreis, drumherum je Gruppe ein Kuchenstück (Größe nach Anzahl, leichter Farbakzent, Name als Band außen), darin die Produkte als Punkte mit Emoji (groß und hell = wahrscheinlich da, Ring = Dauervorrat, roter Bogen = kippt bald; die wahrscheinlichsten liegen innen). Punkte lassen sich im eigenen Stück verschieben, die Lage wird im Plan gespeichert („↺“ setzt alles zurück). Ein Rezept antippen zeigt Kanten vom Kreis zu seinen vorhandenen Zutaten, Fehlendes steht im Kreis. Punkte antippen und „Daraus kochen“ lässt die KI ein bekanntes Gericht aus genau diesen Produkten nennen. Schieben, Zoomen (Rad oder zwei Finger), Stück per Gruppenname zuklappen. Reines SVG ohne Bibliothek.
- **Plan** (versteckter Reiter, erscheint nur mit Vormerkungen) – schlichte Tagesliste: Heute, Morgen, weitere Tage, Demnächst. „Gekocht“, auf heute legen, entfernen, Rezept suchen und vormerken, **Einkaufsliste aus dem Vorgemerkten**.
- **Einkauf** – zusammengeführt statt ersetzt (Handeinträge und Haken bleiben), nach Supermarkt-Abteilungen, Blöcke „Wahrscheinlich da“ und „Vorrat prüfen“, Teilen als Text.
- **Rezepte** – Umschalter *Meine / Alle (mit Rezept-Basis)*, Suche, Rubriken, Merkmale, Sortierung, Textimport und Fotoimport per KI (abschreiben, nicht erfinden), Kochbuch als PDF.
- **Rezept** – Portionen umrechnen, Merkmale, Vormerken, Auf die Einkaufsliste, eigenes Foto, Bewertung, Notizen, Kochhistorie, **Kochmodus** mit Zutatenleiste, Display-Wachhalten und Timern.
- **Gemeinsam** – ein Plan-Code für die Familie, Synchronisation alle 10 Sekunden, jede Änderung wird einzeln geschrieben.
- **Datenschutz & Daten** im Menü: was wo gespeichert wird, Kochbuch-PDF, „Plan endgültig löschen“.
- Als App installierbar (PWA), Schriftzoom, Android-Zurück-Taste.

Der Stand vor dem Umbau (Wochenraster, Essensplan-Vorlagen) liegt im Zweig `archiv/v2`.

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Unit-Tests (node --test)
npm run build
```

Browser-Durchlauf mit simuliertem Firebase, Haushaltsbuch und KI: `node tests/e2e/walk-v3.mjs` bei laufendem Dev-Server, siehe `tests/e2e/README.md`.

Die KI-Funktionen (`/api/gemini`) laufen lokal nur mit `vercel dev` und gesetztem `GEMINI_API_KEY`, nicht mit `npm run dev`. Details in `docs/API.md`.

## Deployment

1. Repository bei Vercel importieren (Vite wird erkannt, `api/` wird zur Serverless Function).
2. Umgebungsvariable `GEMINI_API_KEY` setzen (Key von aistudio.google.com/apikey), neu deployen.
3. Firebase Realtime Database: die App nutzt das Projekt `wochenessenplan-3d0e1` (URL in `src/fb.js`).

## Firebase-Regeln und Datenmodell

Alle Daten einer Familie liegen unter `plans/<CODE>`; Bilder unter `recipeImages/<CODE>`. Der Code ist das einzige Passwort. Empfohlene Regeln:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "plans": {
      "$code": {
        ".read": "$code.matches(/^[A-Z0-9]{6,16}$/)",
        ".write": "$code.matches(/^[A-Z0-9]{6,16}$/)"
      }
    },
    "recipeImages": {
      ".read": true,
      ".write": true
    },
    "globalRecipes": {
      ".read": true,
      ".write": false
    }
  }
}
```

Unter `plans/<CODE>` liegen `participants`, `hb`, `settings`, `meta`, `picks` (Vormerkungen), `stock` (eigener Vorrat: `items`, `perm`), `shopping` und `recipes`; `weeks` aus Version 2 wird nicht mehr gelesen. `globalRecipes` und `recipeImages/<Name>` sind der Altbestand von Version 1. Beim ersten Beitritt nach dem Umbau werden sie einmalig in den Plan kopiert (Migration, idempotent) und danach nur noch gelesen. Sobald alle Pläne migriert sind, kann `globalRecipes` auf `.write: false` gesetzt werden (wie oben) und `recipeImages` auf `recipeImages/$code` eingeschränkt werden.

Datenmodell, Synchronisation und Migration sind in `docs/ARCHITEKTUR.md` beschrieben, die Rezept-Basis in `docs/KLASSIKER.md`, der Testbericht mit den Befunden in `TESTBERICHT.md`.
