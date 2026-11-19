# Anonyme Anmeldung und Mitglieder-Regeln

Stand 18.11.2026. Dieses Dokument beschreibt den Umbau vom „Code als einzigem Passwort“ zu „Zugriff nur für eingetragene Mitglieder“ und enthält die Regelsätze zum Kopieren. Die geltenden Regeln stehen in der Firebase Console; welche das gerade sind, steht unten unter „Was gilt gerade“.

## Wie es funktioniert

1. **Anmeldung** (`src/auth.js`): Jedes Gerät meldet sich beim ersten Datenbank-Aufruf anonym bei Firebase an und bekommt eine eigene Nutzer-ID. Kein Konto, keine E-Mail, kein Passwort, kein neuer Bildschirm. Auf dem Gerät liegen nur Nutzer-ID und Erneuerungs-Schlüssel (`wochenplan-auth-v1`).
2. **Mitgliedschaft** (`ensureMember` in `src/fb.js`): Das Gerät trägt sich unter `members/<CODE>/<Nutzer-ID>` ein, mit Vorname und Tag des Beitritts. Der Eintrag liegt neben dem Plan, nicht darin.
3. **Regeln**: Mit Stand 2 lassen `plans/<CODE>` und `recipeImages/<CODE>` nur noch eingetragene Mitglieder zu. Sich selbst eintragen darf, wer angemeldet ist und den Code kennt. Der Code bleibt also der Schlüssel zum Beitreten und zum Teilen.

Beitritt im Code (`handleJoin` in `src/App.jsx`): erst den Plan lesen; lehnt die Datenbank ab, als Mitglied eintragen und noch einmal lesen. Gibt es den Plan nicht, wird der eigene Eintrag wieder entfernt. Ein Gerät mit gespeichertem Code, das sich noch nie eingetragen hat, kommt deshalb auch nach dem Scharfstellen ohne Zutun hinein.

Schalter: Die Anmeldung ist nur aktiv, wenn die Vercel-Variable `VITE_FB_API_KEY` gesetzt ist (Web-API-Schlüssel des Firebase-Projekts, öffentlich, aber nicht im Repository). Ohne sie läuft die App ohne Nachweis; das funktioniert nur, solange Stand 2 nicht gilt.

## Was gilt gerade

- Seit 18.11.2026: „Anonym“ ist in der Firebase Console aktiviert, `VITE_FB_API_KEY` ist in Vercel für Production gesetzt, in der Console gilt **Stand 1**. Geprüft an der Live-App: Unter *Authentication → Nutzer* erscheint ein anonymer Nutzer, unter `members/<CODE>` der passende Eintrag.
- Für den Schlüssel wurde in den Projekteinstellungen eine Web-App „Wochenplan“ eingetragen (ohne Firebase Hosting); vorher gab es keinen Web-API-Schlüssel.
- Brücke zum Haushaltsbuch (seit 19.11.2026 aktiv): Der Wochenplan liest den Einkaufsauszug `kitchen/<Schlüssel>` und merkt sich unter `plans/<CODE>/hb/key` nur den Schlüssel. Den Buch-Code entfernt der Plan, sobald er den Schlüssel hat.
- **Seit 19.11.2026 gilt Stand 2** in beiden Projekten (von Kevin veröffentlicht und an der Live-App bestätigt). Die Abschrift in `README.md` und `docs/API.md` entspricht der Console.

## Stand 1: heutige Regeln plus Knoten `members`

Ändert für niemanden etwas. Alte und neue App-Versionen funktionieren. Neu ist nur, dass angemeldete Geräte ihren Mitglieder-Eintrag schreiben dürfen.

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
      "$key": {
        ".read": true,
        ".write": "$key.matches(/^[A-Z0-9]{6,16}$/)"
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
    }
  }
}
```

## Stand 2: nur noch Mitglieder (gilt seit 19.11.2026)

Rückweg: in der Console unter *Realtime Database → Regeln* im Verlauf den vorherigen Stand wiederherstellen.

Gegenüber Stand 1 ändern sich nur `plans` und `recipeImages`:

```json
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
}
```

Die alten Startfotos unter ihrem Gerichtnamen (`recipeImages/<Name>`) bleiben lesbar, Fotos eines Plans sehen nur noch dessen Mitglieder.

## Tests

- `tests/auth.test.mjs`: Anmelden, Merken, Erneuern, Ausfall, abgelehnter Nachweis.
- `tests/e2e/auth-rules.mjs`: Browser-Durchlauf mit nachgebautem Anmeldedienst und den drei Regel-Ständen (alt, Stand 1, Stand 2). Der Mock bildet die Regeln nach; die echten Regeln sind vor dem Veröffentlichen zusätzlich im Regel-Simulator der Console zu prüfen.
