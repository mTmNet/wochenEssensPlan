# API: KI-Anfragen über `/api/gemini`

Die App ruft die KI nie direkt auf. Alle Anfragen gehen an die Vercel-Function `api/gemini.js`; der Schlüssel liegt nur auf dem Server. Reine Hilfsfunktionen stehen in `api/_shared.js` (führender Unterstrich: bei Vercel keine eigene Function) und sind mit `node --test` getestet (`tests/api.test.mjs`).

## Endpunkt

`POST /api/gemini`, Körper als JSON (`Content-Type: application/json`).

| Feld | Typ | Bedeutung |
|---|---|---|
| `system` | string, optional | Systemanweisung (Rolle, Ausgabeformat) |
| `messages` | Array, Pflicht | Verlauf mit `role` (`user` oder `assistant`) und `content`. `content` ist ein String oder eine Liste von Teilen: `{type:"text", text}` oder `{type:"image", source:{media_type, data}}` (Base64, ohne `data:`-Präfix) |
| `code` | string, optional | Plan-Code, nur für den Tageszähler des Kostendeckels (siehe unten) |
| `mode` | `"extract"` oder `"suggest"`, optional | Steuert die Erzeugungsparameter. `extract` (Rezept abschreiben): Temperatur 0,1, maximal 6000 Ausgabe-Token. `suggest` (bekanntes Gericht vorschlagen): Temperatur 0,3, maximal 4000 Token. Fehlt der Wert oder ist er unbekannt, gilt `extract`. |

Antwort bei Erfolg: `200 {"text": "..."}`. Der Client (`src/ai.js`, `callAI`) wertet nur `text` aus.

Antwort bei Fehlern: `{"error": "deutsche Meldung"}` mit passendem Status.

| Status | Ursache |
|---|---|
| 400 | `messages` fehlt oder ist leer |
| 403 | Herkunft nicht erlaubt (siehe unten) |
| 405 | andere Methode als POST |
| 413 | Körper größer als 6 MB |
| 422 | KI lieferte keinen Text (z. B. `RECITATION`: urheberrechtlich geschütztes Rezept) |
| 429 | Drossel oder Tagesgrenze des Kostendeckels ausgelöst, oder Kontingent des KI-Dienstes aufgebraucht |
| 500 | Umgebungsvariable fehlt oder unerwarteter Fehler |
| 503 | KI-Dienst überlastet (nach drei Versuchen mit 3 s Pause) |

## Schutzmaßnahmen

- **Nur POST.** Alles andere wird mit 405 beantwortet.
- **Herkunftsprüfung** (`originAllowed`): Der Host aus `Origin` (ersatzweise `Referer`) muss dem `Host`-Header entsprechen oder auf `localhost`/`127.0.0.1` zeigen (lokale Entwicklung mit Vite). Fehlen beide Header, wird mit 403 abgelehnt. Das hält fremde Webseiten und einfache Skripte fern, ist aber kein Ersatz für eine Anmeldung: Header lassen sich fälschen.
- **Drossel je IP** (`makeRateLimiter`): höchstens 20 Anfragen pro Minute und IP (erster Eintrag aus `x-forwarded-for`, sonst Socket-Adresse). Danach 429 mit der Bitte, eine Minute zu warten.
- **Größenbegrenzung:** Der JSON-Körper darf höchstens 6 MB lang sein (413). Der Client verkleinert Bilder vorher auf maximal 1600 px Kante als JPEG.
- **Feste Erzeugungsparameter:** Temperatur und Token-Grenze werden serverseitig aus `mode` abgeleitet und können vom Client nicht frei gesetzt werden.
- **Fehlertexte:** Rohe Antworten des KI-Dienstes werden nicht durchgereicht, sondern in kurze deutsche Meldungen übersetzt (`readErrorText`).

## Kostendeckel (Tageszähler)

Zusätzlich zur Drossel je Minute zählt `api/_limit.js` jede KI-Anfrage je Tag (UTC), und zwar über alle Serverinstanzen hinweg. Die Zähler liegen in der eigenen Realtime Database unter `aiUsage/<AI_LIMIT_SECRET>/<Tag>/…`; IP und Plan-Code stehen dort nur als Hash. Ist eine Grenze erreicht, antwortet die Function mit 429 und ruft die KI nicht auf.

| Grenze je Tag | Standard | Umgebungsvariable |
|---|---|---|
| alle Anfragen zusammen | 300 | `AI_LIMIT_TOTAL` |
| je IP | 60 | `AI_LIMIT_IP` |
| je Plan-Code | 80 | `AI_LIMIT_CODE` |

Einrichten (einmalig, ohne das ist der Deckel aus und es gilt nur die Drossel je Minute):

1. Ein zufälliges Geheimnis aus mindestens 32 Zeichen (nur Buchstaben, Ziffern, `-`, `_`) erzeugen und in Vercel als Umgebungsvariable `AI_LIMIT_SECRET` setzen, danach neu deployen. Das Geheimnis gehört nicht ins Repository.
2. In der Firebase Console unter *Realtime Database → Regeln* diesen Knoten neben den vorhandenen ergänzen:

```json
"aiUsage": {
  "$secret": {
    ".read": "$secret.length >= 32",
    ".write": "$secret.length >= 32"
  }
}
```

Prüfen: nach einer KI-Anfrage steht in der Firebase Console unter `aiUsage/<Geheimnis>/<heutiges Datum>/total` eine Zahl. Steht dort nichts, meldet das Vercel-Log „Kostendeckel: Zählerspeicher nicht nutzbar“ (Regel fehlt oder Geheimnis ungültig).

Grenzen des Deckels:

- Der Plan-Code wird vom Client mitgeschickt und nicht geprüft; ein Skript kann ihn wechseln. Hart wirken deshalb die Grenze je IP und vor allem die Gesamtgrenze. Mit der Anmeldung (Nutzer-ID) kommt in `subjects` ein Eintrag `kind: "uid"` dazu und ersetzt den Code.
- Ist die Datenbank nicht erreichbar, lässt die Function die Anfrage durch (echte Nutzer sollen nicht an einer Störung hängen). Die harte Kostengrenze bleibt die Budget-Sperre am API-Schlüssel bei Google.
- Erreicht ein Angreifer die Gesamtgrenze, ist die KI für alle bis Mitternacht UTC gesperrt; die App selbst läuft weiter.

## Grenzen

- Die Drossel je Minute zählt **je Serverinstanz**, nicht global. Vercel startet mehrere Instanzen und setzt sie bei einem Kaltstart zurück. Global zählt nur der Kostendeckel je Tag (oben).
- Die Herkunftsprüfung schützt gegen Missbrauch aus dem Browser, nicht gegen gezielte Aufrufe mit gefälschten Headern.
- Ein Nutzer hinter gemeinsam genutzter IP (Firmennetz, Mobilfunk) teilt sich das Kontingent mit anderen hinter derselben Adresse.

## Umgebungsvariable

| Name | Bedeutung |
|---|---|
| `GEMINI_API_KEY` | Schlüssel für den KI-Dienst. Wird in den Vercel-Projekteinstellungen gesetzt; danach neu deployen. Fehlt er, antwortet die Function mit 500 und dem Text `GEMINI_API_KEY not configured`, den der Client als Konfigurationshinweis erkennt. |
| `AI_LIMIT_SECRET` | Geheimnis für den Zählerpfad des Kostendeckels (mindestens 32 Zeichen). Fehlt es, ist der Deckel aus. |
| `AI_LIMIT_TOTAL`, `AI_LIMIT_IP`, `AI_LIMIT_CODE` | Optionale Tagesgrenzen, Standard 300 / 60 / 80. |

Für lokale Entwicklung reicht `vercel dev` mit einer `.env`-Datei, die den Schlüssel enthält. Die Datei gehört nicht ins Repository.
