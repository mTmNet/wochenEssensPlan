# Wochenplan (WochenEssensPlan)

Gemeinsamer Essensplaner für die Familie: Wochenplan mit Datum, Einkaufsliste, Rezepte mit Kochmodus und Kochhistorie, „Was kochen wir heute?“ mit Anbindung an das Haushaltsbuch. Schwester-App von `Haushaltsbuch` (gleiche Optik, gleiche Technik).

## Funktionen

- **Heute** – zeigt zuerst, was für heute geplant ist, dann Vorschläge aus dem eigenen Kochbuch (Filter „Bewährt“ = schon gekocht und gut bewertet), danach passende Gerichte aus der mitgelieferten **Rezept-Basis** (133 etablierte Gerichte mit Herkunft, Portionen, Zeit), zuletzt „Bekanntes Gericht finden“ per KI. Mit verknüpftem Haushaltsbuch werden die Einkäufe berücksichtigt (wahrscheinlicher Vorrat, frische Sachen verblassen schneller). Es wird nur gelesen.
- **Woche** – Plan mit Kalenderwoche und Datum, Navigation vor/zurück, „Letzte Woche übernehmen“, mehrere Gerichte pro Mahlzeit, „Wer kocht?“, „Woche abschließen“ trägt die gekochten Gerichte in die Kochhistorie ein.
- **Einkauf** – aus dem Plan erzeugt und beim erneuten Erzeugen **zusammengeführt** (Handeinträge und Haken bleiben), nach Supermarkt-Abteilungen, Grundvorrat („Vorrat prüfen“) und wahrscheinlich Vorhandenes in eigenen Blöcken, Teilen als Text.
- **Rezepte** – Suche, Rubriken, Sortierung, Textimport und Fotoimport per KI (abschreiben, nicht erfinden; ergänzte Schritte werden gekennzeichnet), Rezept-Basis einblenden und übernehmen, Kochbuch als PDF.
- **Rezept** – Merkmale „Für Kinder“ und „Schnell“ (unabhängig von der Kategorie, steuern die Filter), Portionen umrechnen, Zeit, Herkunft und Quelle, „Zum Wochenplan“, „Auf die Einkaufsliste“, eigenes Foto, Bewertung, Notizen, Kochhistorie. **Kochmodus** mit Zutatenleiste, Display-Wachhalten und Timern aus den Zeitangaben.
- **Gemeinsam** – ein Plan-Code für die Familie (10 Zeichen), Synchronisation alle 10 Sekunden, jede Änderung wird einzeln geschrieben, damit sich zwei Geräte nicht überschreiben.
- Als App installierbar (PWA), Schriftzoom, Android-Zurück-Taste.

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Unit-Tests (node --test)
npm run build
```

Browser-Durchlauf mit simuliertem Firebase, Haushaltsbuch und KI: siehe `tests/e2e/README.md`.

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

`globalRecipes` und `recipeImages/<Name>` sind der Altbestand von Version 1. Beim ersten Beitritt nach dem Umbau werden sie einmalig in den Plan kopiert (Migration, idempotent) und danach nur noch gelesen. Sobald alle Pläne migriert sind, kann `globalRecipes` auf `.write: false` gesetzt werden (wie oben) und `recipeImages` auf `recipeImages/$code` eingeschränkt werden.

Datenmodell, Synchronisation und Migration sind in `docs/ARCHITEKTUR.md` beschrieben, die Rezept-Basis in `docs/KLASSIKER.md`, der Testbericht mit den Befunden in `TESTBERICHT.md`.
