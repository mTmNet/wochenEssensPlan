# Dateiablage für Rezeptfotos (Cloud Storage for Firebase)

Stand 23.11.2026. Eigene Rezeptfotos lagen bisher als Base64-Text unter `recipeImages/<CODE>` in der Realtime Database. Speicher in der Datenbank kostet rund 200-mal mehr als im Dateispeicher, und jedes Foto wurde bei jedem Laden des Plans mitgeschickt. Neu liegen die Fotos als Dateien im Dateispeicher (Rechenzentrum europe-west1, Belgien); in der Datenbank steht nur noch ein Link.

## So funktioniert es

- Code: `src/ablage.js` (gleiche Datei im Haushaltsbuch), Aufrufe in `src/fb.js` (`storePhoto`, `removePhoto`, `photoAsDataUrl`, `planFileKey`) und `src/App.jsx` (`uploadImage`, `movePhotos`). Tests: `tests/ablage.test.mjs`.
- Jeder Plan bekommt beim ersten Foto einen geheimen Ordnernamen `plans/<CODE>/fileKey` (32 Zufallszeichen). Fotos liegen unter `fotos/<fileKey>/<Inhalts-Prüfwert>.jpg`. Gleiches Foto, gleicher Name: Zwei Geräte, die gleichzeitig umziehen, legen keine Doppel an.
- In `recipeImages/<CODE>/<Rezept>` steht statt `data:image/jpeg;base64,…` der Link mit Download-Token (`https://firebasestorage.googleapis.com/v0/b/…?alt=media&token=…`). Die Anzeige und das Kochbuch-PDF nutzen den Link direkt. Der Kochbuch-Export als Datei wandelt die Links zurück in Bilder, damit die Datei für sich allein funktioniert.
- **Rückfall:** Ohne Speicher (nicht eingerichtet, Regeln fehlen, offline) legt die App das Foto wie bisher als Base64 in der Datenbank ab. Nach „Speicher nicht eingerichtet“ versucht sie es fünf Minuten lang nicht erneut. Es geht also nichts verloren.
- **Umzug des Altbestands:** Beim Öffnen eines Plans lädt die App jedes alte Base64-Foto hoch, prüft die Größe, die der Speicher bestätigt, und ersetzt den Datenbank-Eintrag erst dann durch den Link, und nur, wenn er sich in der Zwischenzeit nicht geändert hat.
- Löschen von Foto, Rezept oder ganzem Plan löscht die Dateien mit.

## Was Kevin in Firebase einrichten muss (einmalig, rund 15 Minuten je Projekt)

Bis das erledigt ist, läuft alles wie bisher über die Datenbank. Die App merkt selbst, wenn der Speicher bereit ist.

**Schritt 1: Sicherung ziehen.** Firebase Console → Projekt `wochenessenplan-3d0e1` → links „Realtime Database“ → oben rechts die drei Punkte ⋮ → „JSON exportieren“. Die Datei auf dem Laptop aufheben. Sie enthält alle Pläne und Rezeptfotos in ihrer bisherigen Form und ist der Rückweg, falls beim Umzug etwas schiefgeht.

**Schritt 2: Tarif Blaze.** Unten links steht der Tarif („Spark“ oder „Blaze“). Steht dort Spark: „Upgrade“ → „Blaze“ → Zahlungskonto wählen. Blaze hat keine Grundgebühr, bezahlt wird nur die Nutzung. Seit Oktober 2024 verlangt Google Blaze für jeden neuen Dateispeicher. Gleich danach unter „Nutzung und Abrechnung“ → „Details & Einstellungen“ → „Budget-Benachrichtigung“ einen Alarm setzen, zum Beispiel bei 5 €.

**Schritt 3: Speicher anlegen.** Links „Build“ → „Storage“ → „Jetzt starten“. Bei „Standort“ **europe-west1 (Belgien)** wählen (steht unter „Alle Standorte“), gleiche Region wie die Datenbank. Regeln: „Im Produktionsmodus starten“. Danach steht oben eine Adresse wie `gs://wochenessenplan-3d0e1.firebasestorage.app`. Steht dort etwas anderes, mir den Namen schicken; dann muss in Vercel die Variable `VITE_FB_BUCKET` gesetzt werden.

**Schritt 4: Regeln veröffentlichen.** In „Storage“ der Reiter „Rules“ → den ganzen Text durch die Regeln unten ersetzen → „Veröffentlichen“.

**Schritt 5: App öffnen.** Einmal die App auf dem Handy öffnen und eine Minute offen lassen. Der Altbestand zieht im Hintergrund um. Prüfen: In „Storage“ → „Files“ erscheint ein Ordner `fotos` mit einem Unterordner aus 32 Zufallszeichen und darin die Dateien. Im Kochbuch sehen die Rezeptfotos aus wie vorher.

Die Reihenfolge ist wichtig: erst Schritt 1, dann der Rest. Schritt 4 vor Schritt 5, sonst lehnt der Speicher alles ab und die App bleibt bei der Datenbank (es geht nichts verloren, es zieht nur nichts um).


## Speicher-Regeln (Stand 1)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Rezeptfotos: fotos/<geheimer Ordner>/<Datei>. Nur angemeldete Geräte, nur wer den Ordner kennt.
    // Kein Auflisten (nur "get"), kein Überschreiben (nur "create"), höchstens 2 MB, nur Bilder.
    match /fotos/{key}/{datei} {
      allow get, delete: if request.auth != null && key.matches('^[A-Za-z0-9]{32}$');
      allow create: if request.auth != null && key.matches('^[A-Za-z0-9]{32}$')
                    && request.resource.size < 2 * 1024 * 1024
                    && request.resource.contentType.matches('image/(jpeg|png|webp)');
    }
    // Alles andere ist gesperrt.
    match /{pfad=**} {
      allow read, write: if false;
    }
  }
}
```

## Grenze dieser Lösung (ehrlich)

Die Regeln des Dateispeichers können die Mitgliederliste der Datenbank nicht lesen. Deshalb ersetzt der geheime Ordnername (32 Zufallszeichen, rund 10^56 Möglichkeiten, nicht erratbar, Auflisten verboten) die Mitgliedsprüfung. Den Namen kennt nur, wer den Plan lesen darf, also nur Mitglieder. Wer aber einmal Mitglied war, kennt ihn auch nach dem Austritt noch. Das ist dieselbe Lage wie bei einem früheren Mitglied, das sich das Kochbuch exportiert gespeichert hat. Wenn das später nicht reicht, ist der nächste Schritt eine kleine Server-Funktion bei Vercel, die die Mitgliedschaft prüft und dann die Datei ausliefert (mehr Einrichtung, ein zusätzliches Geheimnis in Vercel).

Rezeptfotos sind zusätzlich über ihren Link abrufbar (der Token ist ebenso nicht erratbar), damit `<img>` und das PDF sie ohne Anmeldung anzeigen können. Ein Foto wird durch „Foto entfernen“ gelöscht; damit wird auch der Link ungültig.

## Rückweg

- Kleinere Probleme: Speicher-Regeln wieder auf „alles gesperrt“ stellen. Neue Fotos landen dann wieder in der Datenbank; schon umgezogene Fotos sind über ihre Links aber weiter sichtbar, weil Links mit Token die Regeln umgehen.
- Ganz zurück: `recipeImages` aus der JSON-Sicherung aus Schritt 1 in der Realtime Database wieder einspielen (Knoten `recipeImages` → ⋮ → „JSON importieren“). Bitte nur mit mir zusammen, weil ein Import den Knoten ganz ersetzt.
