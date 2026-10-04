# Browser-Durchlauf (Playwright)

Simuliert Firebase, Haushaltsbuch und `/api/gemini` im Browser (Route-Mocks), die App-Logik läuft unverändert.

```bash
# einmalig, falls playwright nur global installiert ist:
ln -sfn "$(npm root -g)/playwright" node_modules/playwright

npm run dev -- --port 5173 --host 127.0.0.1 &   # Dev-Server
node tests/e2e/walk-v1.mjs                        # Durchlauf, Screenshots nach tests/e2e/shots/
node tests/e2e/race-v1.mjs                        # Zwei Geräte: Löschen/Bewerten/Beitritt
```

`walk-v1.mjs` und `race-v1.mjs` beschreiben die Oberfläche von Version 1 (Selektoren, Tab-Namen).
Nach dem Umbau gilt `walk-v2.mjs`.
