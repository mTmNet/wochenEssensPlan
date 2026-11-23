# Wochenplan (WochenEssensPlan)

Gemeinsamer Essensplaner für die Familie: Wochenplan mit Datum, Einkaufsliste, Rezepte mit Kochmodus und Kochhistorie, „Was kochen wir heute?“ mit Anbindung an das Haushaltsbuch. Schwester-App von `Haushaltsbuch` (gleiche Optik, gleiche Technik).

## Funktionen (Version 3: „Heute statt Woche“)

- **Heute** – die eine Frage: *Was kochen wir heute?* Bester Vorschlag mit Begründung („nutzt Hackfleisch, Paprika · Paprika hält noch 2 Tage“), drei Alternativen, „Mehr“, Filter *Schnell* und *Für Kinder*, „Andere“ mischt neu. Ein Tipp auf **Gekocht** trägt das Kochdatum ein und fragt nach der Bewertung; **Vormerken** legt das Gericht auf einen Tag oder „demnächst“. Vorschläge kommen aus dem eigenen Kochbuch und der mitgelieferten **Rezept-Basis** (133 etablierte Gerichte); ein leeres Kochbuch zeigt nur die Basis, jedes Gericht lässt sich mit einem Tipp übernehmen.
- **Vorschlags-Logik** – Inspiration statt Wiederholung: Es zählt, was wahrscheinlich da ist, was bald verdirbt und was lange nicht dran war. Kein Bonus für „oft gekocht“; frisch Gekochtes wird gebremst. Ohne Vorrat zählen Bewertung und Abwechslung.
- **Vorrat** – eine Liste aus mehreren Quellen: Haushaltsbuch (automatisch, nur lesend), **Speisekammer-Foto** (die KI listet erkennbare Lebensmittel, du bestätigst) und Hand. **Ohne verbundenes Haushaltsbuch** füllt die Einkaufsliste den Vorrat: Abgehaktes gilt als heute gekauft (Herkunft „Einkauf“). Jede Position mit Gruppe, Kaufdatum, Resttagen und Wahrscheinlichkeit; **★ Dauervorrat** (Spaghetti, Gewürze) verblasst nie; **×** heißt „aufgebraucht“ (entfernt eigene Positionen, streicht Haushaltsbuch-Positionen); unter **⋯** stehen „Einsortieren“, „Kein Lebensmittel“ und „Dauervorrat“.
- **Lernendes Verblassen** – die Gruppenzeiten (Fisch 4 Tage … Vorräte 90 Tage) sind Startwerte. Aus den Abständen zwischen zwei Käufen desselben Produkts und aus ×-Streichungen lernt die App je Produkt die echte Haltbarkeit („gelernt aus 3 Käufen“). Gelernt wird aus bis zu einem Jahr Einkäufen, je Plan.
- **✓ Auffrischen** in der Vorratsliste: „ist noch da“ lässt das Verblassen eines Produkts neu beginnen (zählt wie ein Handeintrag von heute). Die Gruppe eines Produkts kommt aus dem Namen (über die Emoji-Tabelle), nicht aus der Buchrubrik, damit Brokkoli unter Gemüse landet, auch wenn die Rubrik „Obst & Gemüse“ heißt.
- **Namen normieren** – Kassenbon-Bezeichnungen werden auf die Zutatennamen deiner Rezepte gebracht („Bio Strauchtomaten 500g“ → „Tomaten“): erst nach Regeln (Mengen, Marken, Füllwörter weg, Abgleich mit dem Vokabular aus Kochbuch und Rezept-Basis), Unklares ordnet die KI gebündelt zu, jede Bezeichnung nur einmal, gespeichert im Plan. Mehrere Bezeichnungen desselben Produkts werden eine Zeile. Name in der Vorratsliste antippen, um eine Zuordnung zu ändern oder als „kein Lebensmittel“ auszublenden. In der Rezeptansicht steht hinter jeder Zutat „da“, „vielleicht · 40 %“ oder rot „fehlt?“, im Kochmodus farbig markiert. Ein ✓ an einer fehlenden Zutat legt sie in den Vorrat („ist doch da“). Der geteilte Knopf „Alles auf die Liste | Nur Fehlendes auf die Liste (n)“ legt entweder alle Zutaten oder nur die laut Vorrat fehlenden auf die Einkaufsliste.
- **Kochbuch als Datei** (Reiter Rezepte, unten) – „Sichern (.json)“ lädt alle Rezepte mit Bewertung, Notizen, Kochdaten und Fotos als Datei herunter; „Aus Datei laden“ zeigt eine Vorschau (wie viele neu, wie viele schon da) und lässt wählen, ob vorhandene Rezepte behalten oder durch die Datei ersetzt werden. So nimmst du dein Kochbuch in einen neuen Plan mit.
- **Graph** (Umschalter „Liste / Graph“ im Vorrat) – der Vorrat als Kreis: in der Mitte der Rezeptkreis, drumherum je Gruppe ein Kuchenstück (Größe nach Anzahl, leichter Farbakzent, Name als Band außen), darin die Produkte als Punkte mit Emoji (groß und hell = wahrscheinlich da, Ring = Dauervorrat, roter Bogen = kippt bald; die wahrscheinlichsten liegen innen). Punkte lassen sich im eigenen Stück verschieben, die Lage wird im Plan gespeichert („↺“ setzt alles zurück); Punkte, die sich überlappen würden, stoßen sich ab. Ein Rezept antippen zeigt Kanten vom Kreis zu seinen vorhandenen Zutaten, Fehlendes steht im Kreis. Punkte antippen und „Daraus kochen“ lässt die KI ein bekanntes Gericht aus genau diesen Produkten nennen. Schieben, Zoomen (Rad oder zwei Finger), Stück per Gruppenname zuklappen. Reines SVG ohne Bibliothek.
- **Plan** (versteckter Reiter, erscheint nur mit Vormerkungen) – schlichte Tagesliste: Heute, Morgen, weitere Tage, Demnächst. „Gekocht“, auf heute legen, entfernen, Rezept suchen und vormerken, **Einkaufsliste aus dem Vorgemerkten** (nur was laut Vorrat fehlt).
- **Einkauf** – zusammengeführt statt ersetzt (Handeinträge und Haken bleiben), nach Supermarkt-Abteilungen, Block „Vorrat prüfen“, Teilen als Text. Unten „Einkaufsliste komplett löschen“ und „Nur abgehakte Posten löschen“.
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
4. Kostendeckel der KI: Umgebungsvariable `AI_LIMIT_SECRET` setzen und den Regel-Knoten `aiUsage` ergänzen. Der vollständige Regelsatz steht in `docs/API.md`, Abschnitt „Kostendeckel“.
5. Anonyme Anmeldung (seit 18.11.2026 aktiv, seit 19.11.2026 von den Regeln verlangt): In der Firebase Console unter *Authentication → Anmeldemethode* „Anonym“ aktivieren und den Web-API-Schlüssel des Projekts (*Projekteinstellungen → Allgemein*) in Vercel als Umgebungsvariable `VITE_FB_API_KEY` setzen, danach neu deployen. Der Schlüssel ist öffentlich (er steht in der ausgelieferten App) und kein Geheimnis; er gehört trotzdem nicht ins Repository. Fehlt die Variable, ist die Anmeldung aus und die App läuft wie bisher.
6. Messung: Regel-Knoten `activity` ergänzen und in Vercel `ZAHLEN_PASSWORT` setzen, siehe `docs/MESSUNG.md`.

## Firebase-Regeln und Datenmodell

Alle Daten einer Familie liegen unter `plans/<CODE>`; Bilder unter `recipeImages/<CODE>`, seit 23.11.2026 dort nur noch als Link auf eine Datei im Dateispeicher (`fotos/<fileKey>/…`, Regeln und Einrichtung in `docs/ABLAGE.md`; ohne Dateispeicher wie früher als Base64). Der Code ist das einzige Passwort. Geltende Regeln (Stand 2 seit 19.11.2026; der Knoten `activity` für die Messung gilt, sobald er in der Console veröffentlicht ist, siehe `docs/MESSUNG.md`):

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "plans": {
      "$code": {
        ".read": "auth != null && root.child('members/' + $code + '/' + auth.uid).exists()",
        ".write": "auth != null && root.child('members/' + $code + '/' + auth.uid).exists()"
      }
    },
    "recipeImages": {
      "$key": {
        ".read": "!$key.matches(/^[A-Z0-9]{6,16}$/) || (auth != null && root.child('members/' + $key + '/' + auth.uid).exists())",
        ".write": "auth != null && root.child('members/' + $key + '/' + auth.uid).exists()"
      }
    },
    "globalRecipes": {
      ".read": true,
      ".write": false
    },
    "members": {
      "$code": {
        ".read": "auth != null && data.child(auth.uid).exists()",
        ".write": "auth != null && data.child(auth.uid).exists() && !newData.exists()",
        "$uid": {
          ".read": "auth != null && auth.uid === $uid",
          ".write": "auth != null && auth.uid === $uid && $code.matches(/^[A-Z0-9]{6,16}$/)",
          ".validate": "newData.hasChildren(['name', 'since']) && newData.child('name').isString() && newData.child('name').val().length <= 40 && newData.child('since').isString() && newData.child('since').val().length === 10"
        }
      }
    },
    "aiUsage": {
      "$secret": {
        ".read": "$secret.length >= 32",
        ".write": "$secret.length >= 32"
      }
    },
    "activity": {
      "$secret": {
        ".read": "$secret.length >= 32",
        ".write": "$secret.length >= 32"
      }
    }
  }
}
```

`recipeImages` hat bewusst keine Leseregel an der Wurzel: Die Liste der Schlüssel (und damit die Plan-Codes) lässt sich nicht abrufen. Ein Unterknoten ist nur lesbar, wenn man seinen Schlüssel kennt, also den Plan-Code oder (Altbestand) den Rezeptnamen. Geschrieben wird nur unter einem Plan-Code. `globalRecipes` (Altbestand) wird nur noch für die Migration gelesen und nie geschrieben.

Unter `plans/<CODE>` liegen `participants`, `hb`, `settings`, `meta`, `picks` (Vormerkungen), `stock` (eigener Vorrat: `items`, `perm`), `shopping` und `recipes`; `weeks` aus Version 2 wird nicht mehr gelesen. `globalRecipes` und `recipeImages/<Name>` sind der Altbestand von Version 1. Beim ersten Beitritt nach dem Umbau werden sie einmalig in den Plan kopiert (Migration, idempotent) und danach nur noch gelesen. Sobald alle Pläne migriert sind, kann `globalRecipes` auf `.write: false` gesetzt werden (wie oben) und `recipeImages` auf `recipeImages/$code` eingeschränkt werden.

Messung (täglich aktive Geräte, 4-Wochen-Treue, Zahlen-Seite `/api/zahlen`): `docs/MESSUNG.md`.

Der Umbau auf anonyme Anmeldung und Mitglieder-Regeln (samt den nächsten Regelsätzen zum Kopieren) steht in `docs/ANMELDUNG.md`.

Datenmodell, Synchronisation und Migration sind in `docs/ARCHITEKTUR.md` beschrieben, die Rezept-Basis in `docs/KLASSIKER.md`, der Testbericht mit den Befunden in `TESTBERICHT.md`.
