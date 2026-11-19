# Messung: täglich aktive Geräte und 4-Wochen-Treue

Stand 19.11.2026. Eigene, schlanke Messung ohne Analyse-Dienst, ohne Cookies und ohne Consent-Banner.

## Was gezählt wird

- Hat die App einen Plan offen, meldet das Gerät höchstens **einmal am Tag** an `/api/aktiv`, dass es die App benutzt hat (`src/aktiv.js`).
- Mit geht nur der Anmelde-Nachweis. Der Server prüft ihn (`api/_token.js`) und nimmt die Nutzer-ID daraus, nicht vom Gerät.
- Kam das Gerät über einen Einstiegslink mit `?von=<standort>` (z. B. `https://wochen-essens-plan.vercel.app/?von=rewe-nord` hinter einem QR-Code), merkt es sich das Kürzel und schickt es mit. Gespeichert wird es nur beim allerersten Tag des Geräts. Erlaubt sind Kleinbuchstaben, Ziffern und Bindestrich, höchstens 24 Zeichen.

Gespeichert wird in der eigenen Datenbank (`api/_aktiv.js`), unter einem Pfad, den nur der Server kennt (wie beim Kostendeckel):

```
activity/<SHA-256 von AI_LIMIT_SECRET>/u/<Hash der Nutzer-ID>        = { f: erster Tag, l: letzter Tag, s: Herkunft }
activity/<SHA-256 von AI_LIMIT_SECRET>/d/<Tag>/<Hash der Nutzer-ID>  = 1
```

Die Nutzer-ID steht nirgends im Klartext, nur als gekürzter Hash mit Salz. Die Einträge lassen sich nicht mit `members` verknüpfen. Tage zählen nach deutscher Zeit.

Gezählt werden **Geräte**, nicht Personen: Handy und Laptop derselben Person zählen doppelt, ebenso ein Gerät nach dem Löschen der Website-Daten.

## Kennzahlen

- **heute aktiv**: Geräte, die heute gemeldet haben.
- **aktiv in den letzten 7 Tagen**: verschiedene Geräte der letzten 7 Tage.
- **Geräte insgesamt**: alle, die je gemeldet haben.
- **nach 4 Wochen noch dabei**: Von allen Geräten, deren erster Tag mindestens 28 Tage zurückliegt, der Anteil, der die App am 28. Tag nach dem ersten Tag oder später wieder benutzt hat.
- Dieselben Zahlen je Herkunft (Einstiegslink) und ein Verlauf der letzten 30 Tage (aktiv, neu).

## Zahlen ansehen

`https://wochen-essens-plan.vercel.app/api/zahlen` öffnen, Passwort eingeben, „Zahlen zeigen“. Das Passwort steht nur in der Vercel-Variable `ZAHLEN_PASSWORT` (mindestens 12 Zeichen). Fünf Versuche je Minute; die Seite wird nicht von Suchmaschinen erfasst.

## Einrichten (einmalig)

1. Firebase Console, Projekt `wochenessenplan-3d0e1`, *Realtime Database → Regeln*: nach dem Knoten `aiUsage` den Knoten `activity` ergänzen (vollständiger Regelsatz im README) und veröffentlichen. Rückweg: im Regelverlauf den vorherigen Stand wiederherstellen.
2. Vercel, Projekt `wochen-essens-plan`, *Settings → Environment Variables*: `ZAHLEN_PASSWORT` für Production setzen, danach neu deployen.

Ohne Schritt 1 lehnt die Datenbank das Speichern ab; die App merkt davon nichts. Ohne Schritt 2 zeigt `/api/zahlen` nur einen Hinweis.

## Noch offen

- Löschfristen (Datenschutz-Schritt): alte Tage unter `d/` und Geräte, die lange nicht mehr aktiv waren, automatisch entfernen.
- Der Knoten `activity` ist wie `aiUsage` für jeden beschreibbar, der einen Schlüssel mit mindestens 32 Zeichen wählt. Lesen kann nur, wer den Pfad kennt. Für das Security-Review vormerken.
