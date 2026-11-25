# API: KI-Anfragen über `/api/gemini`

Die App ruft die KI nie direkt auf. Alle Anfragen gehen an die Vercel-Function `api/gemini.js`; der Schlüssel liegt nur auf dem Server. Reine Hilfsfunktionen stehen in `api/_shared.js` (führender Unterstrich: bei Vercel keine eigene Function) und sind mit `node --test` getestet (`tests/api.test.mjs`).

## Endpunkt

`POST /api/gemini`, Körper als JSON (`Content-Type: application/json`).

| Feld | Typ | Bedeutung |
|---|---|---|
| `system` | string, optional | Systemanweisung (Rolle, Ausgabeformat) |
| `messages` | Array, Pflicht | Verlauf mit `role` (`user` oder `assistant`) und `content`. `content` ist ein String oder eine Liste von Teilen: `{type:"text", text}` oder `{type:"image", source:{media_type, data}}` (Base64, ohne `data:`-Präfix) oder `{type:"audio", source:{media_type, data}}` (Sprachaufnahme; nur `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg`, `audio/wav`, `audio/aac`, sonst fällt der Teil weg) |
| `code` | string, optional | Plan-Code, zählt im Kostendeckel nur, wenn kein gültiger Anmelde-Nachweis mitkommt (siehe unten) |
| `mode` | `"extract"` oder `"suggest"`, optional | Steuert die Erzeugungsparameter. `extract` (Rezept abschreiben): Temperatur 0,1, maximal 6000 Ausgabe-Token. `suggest` (bekanntes Gericht vorschlagen): Temperatur 0,3, maximal 4000 Token. Fehlt der Wert oder ist er unbekannt, gilt `extract`. |

Kopf `Authorization: Bearer <Anmelde-Nachweis>` (optional): der Nachweis der anonymen Anmeldung. Der Server prüft ihn (`api/_token.js`) und zählt dann die Nutzer-ID statt des Plan-Codes.

Antwort bei Erfolg: `200 {"text": "..."}`. Der Client (`src/ai.js`, `callAI`) wertet nur `text` aus.

Antwort bei Fehlern: `{"error": "deutsche Meldung"}` mit passendem Status.

| Status | Ursache |
|---|---|
| 400 | `messages` fehlt oder ist leer |
| 403 | Herkunft nicht erlaubt (siehe unten) |
| 405 | andere Methode als POST oder GET (GET liefert nur den Status des Kostendeckels) |
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

Zusätzlich zur Drossel je Minute zählt `api/_limit.js` jede KI-Anfrage je Tag (UTC), und zwar über alle Serverinstanzen hinweg. Die Zähler liegen in der eigenen Realtime Database unter `aiUsage/<SHA-256 von AI_LIMIT_SECRET>/<Tag>/…`; IP, Nutzer-ID und Plan-Code stehen dort nur als Hash. Ist eine Grenze erreicht, antwortet die Function mit 429 und ruft die KI nicht auf.

| Grenze je Tag | Standard | Umgebungsvariable |
|---|---|---|
| alle Anfragen zusammen | 300 | `AI_LIMIT_TOTAL` |
| je IP | 60 | `AI_LIMIT_IP` |
| je Nutzer-ID (Gerät mit gültigem Anmelde-Nachweis) | 50 | `AI_LIMIT_UID` (fehlt sie, gilt `AI_LIMIT_CODE`) |
| je Plan-Code (nur ohne gültigen Nachweis) | 50 | `AI_LIMIT_CODE` |

Einrichten (einmalig, ohne das ist der Deckel aus und es gilt nur die Drossel je Minute):

1. Ein zufälliges Geheimnis aus mindestens 16 Zeichen (beliebige Zeichen) erzeugen und in Vercel als Umgebungsvariable `AI_LIMIT_SECRET` setzen, danach neu deployen. Das Geheimnis gehört nicht ins Repository.
2. In der Firebase Console (Projekt `wochenessenplan-3d0e1`) unter *Realtime Database → Regeln* den Knoten `aiUsage` ergänzen. Vollständiger Regelsatz zum Kopieren (entspricht dem README, mit `aiUsage` und `activity`):

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

Prüfen mit einem Klick: `https://<Adresse der App>/api/gemini` im Browser öffnen. Die Antwort `{"kostendeckel":{"aktiv":true|false,"grund":"…"}}` sagt, ob gezählt wird, und nennt sonst die Ursache (Variable fehlt oder zu kurz, Regel fehlt, Datenbank nicht erreichbar). Die Abfrage ruft die KI nicht auf. Das Feld `region` nennt den Standort, an dem die Function läuft; `vercel.json` legt ihn auf Frankfurt (`fra1`) fest, damit Fotos und Texte auf dem Weg zur KI nicht über einen Server außerhalb der EU laufen.

Außerdem: nach einer KI-Anfrage steht in der Firebase Console unter `aiUsage/<64 Zeichen>/<heutiges Datum>/total` eine Zahl. Steht dort nichts, meldet das Vercel-Log „Kostendeckel: Zählerspeicher nicht nutzbar“ (Regel fehlt).

Grenzen des Deckels:

- Gezählt wird je Nutzer-ID, wenn das Gerät einen gültigen Anmelde-Nachweis schickt. Der Server prüft dessen Signatur gegen Googles öffentliche Schlüssel, das Projekt und den Ablauf (`api/_token.js`, ohne zusätzliche Bibliothek). Ohne gültigen Nachweis zählt wie früher der Plan-Code; den schickt der Client mit und er wird nicht geprüft.
- Anonyme Nutzer-IDs kosten nichts: Ein Skript kann sich viele holen. Hart wirken deshalb weiter die Grenze je IP und vor allem die Gesamtgrenze.
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
| `AI_LIMIT_SECRET` | Geheimnis für den Zählerpfad des Kostendeckels (mindestens 16 Zeichen). Fehlt es, ist der Deckel aus. |
| `AI_LIMIT_TOTAL`, `AI_LIMIT_IP`, `AI_LIMIT_UID`, `AI_LIMIT_CODE` | Optionale Tagesgrenzen, Standard 300 / 60 / 50 / 50. |
| `ZAHLEN_PASSWORT` | Passwort der Zahlen-Seite `/api/zahlen` (mindestens 12 Zeichen), siehe `docs/MESSUNG.md`. Fehlt es, ist die Seite aus. |

Für lokale Entwicklung reicht `vercel dev` mit einer `.env`-Datei, die den Schlüssel enthält. Die Datei gehört nicht ins Repository.
