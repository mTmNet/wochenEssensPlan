# Browser-Durchlauf (Playwright)

Simuliert Firebase, Haushaltsbuch und die KI-Function im Browser (Route-Mocks), die App-Logik läuft unverändert.
Der Firebase-Mock versteht Multi-Path-PATCH (`{"weeks/2026-W41/Mo/meals/Ab": [...]}`), wie die echte Datenbank.
Der KI-Mock entscheidet anhand des Felds `mode` (`extract` / `suggest`), welche Antwort er liefert.

```bash
# einmalig, falls playwright nur global installiert ist:
ln -sfn "$(npm root -g)/playwright" node_modules/playwright

npm run dev -- --port 5173 --host 127.0.0.1 &   # Dev-Server
node tests/e2e/walk-v2.mjs                        # Durchlauf, Screenshots nach tests/e2e/shots/
node tests/e2e/race-v2.mjs                        # Zwei Geräte, Nebenläufigkeit, Beitritt mit falschem Code, Migration
```

`walk-v1.mjs` und `race-v1.mjs` beschreiben die Oberfläche von Version 1 (Selektoren, Tab-Namen, globalRecipes)
und laufen gegen den Umbau nicht mehr durch. Seit dem Umbau (Datenmodell `plans/<CODE>/weeks|shopping|recipes`, Meta-Poll) gelten:

- `walk-v2.mjs`: Startbildschirm (Hinweis ohne Namen, 10-stelliger Code), Startrezepte übernehmen, Plan, Wochen
  (Navigation ‹ › und „Heute“, Datum im Tageskopf, Akzentrahmen und Anspringen des heutigen Tags, „Letzte Woche übernehmen“,
  „Woche abschließen“ → `cooked` im Mock für das jeweilige Datum in einem PATCH), Einkauf (Eingabe oben, Block „Vorrat prüfen“,
  Teilen-Knopf, Generieren führt zusammen: Handeintrag, Haken und „+“-Sperre bleiben), Rezepte, Detail (Portionen-Stepper,
  Metazeile, Kochhistorie, Bearbeiten mit Portionen/Minuten/Herkunft/Quelle), Kochmodus, Bewertung, KI-Import,
  Heute („Heute im Plan“, Chips „Bewährt“/„Frühstück“, Haushaltsbuch), KI-Vorschlag („Bekanntes Gericht finden“), Kochbuch-PDF,
  Menü „⋯“ mit Zoom, Sitzung, zweites Gerät.
  Das Datum ist das echte Tagesdatum: Erwartungen (heutiger Tag, Tage bis heute) werden im Skript mitgerechnet.
  Beendet sich mit Exit-Code 1, wenn eine Prüfung scheitert.
- `race-v2.mjs` weist nach: (a) ein Haken ist ein kleiner Multi-Path-PATCH ohne `recipes/`-Schlüssel, (b) ein gelöschtes
  Rezept kommt nicht zurück, (c) eine Bewertung überlebt den Haken des anderen Geräts, (f) eine besuchte Woche wird beim
  Öffnen frisch geladen und ein Slot-Schreiben gleicht gegen den Serverstand ab (kein Verlust in derselben Zelle),
  (g) ein Feld-PATCH auf ein soeben gelöschtes Rezept erzeugt kein Geister-Rezept (Hinweis, Detail schließt),
  (h) der Editor schreibt nur die editierten Felder (fremde Bewertung bleibt), (i) „Gesamte Einkaufsliste generieren“
  führt zusammen (Handeintrag und Haken bleiben, nie der Schlüssel `shopping` als Ganzes), (m) Umbenennen stellt die
  Planzellen im selben PATCH um, (l) Import mit vorhandenem Namen fragt „Ersetzen oder Kopie“ und trägt `mode: "extract"`,
  (n) die Zurück-Taste schließt Dialog und Dropdown, (d) Beitritt mit unbekanntem Code bleibt auf dem Startbildschirm und
  legt keinen Plan an, (e) Migration eines Altbestands ist vollständig, idempotent, mit deterministischen Ids und
  Bildkopie vor dem meta-PATCH, (j) ein Schreibfehler bleibt rot, bis der Poll den Teil nachgeladen hat (danach lokaler
  Zustand = Server), (k) ein hängender PATCH läuft nach 15 s in die Zeitgrenze, der Poll läuft weiter.
  Laufzeit rund 2,5 Minuten (mehrere Poll-Takte von 10 s werden abgewartet).
