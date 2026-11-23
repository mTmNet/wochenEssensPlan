# Löschfrist für unbenutzte Pläne (24 Monate)

Stand 23.11.2026. Die Datenschutzerklärung (src/rechtliches.js, Abschnitt 6) sagt: Pläne, die 24 Monate lang nicht geöffnet wurden, werden gelöscht.

## Was schon gebaut ist

Beim Öffnen schreibt die App den aktuellen Monat nach `plans/<CODE>/lastOpen` (z. B. `"2026-11"`). Das passiert höchstens einmal je Monat und erst nach dem Mitglieds-Eintrag, weil nur Mitglieder schreiben dürfen. Genauer als auf den Monat wird es nicht gespeichert.

Pläne ohne `lastOpen` sind seit dem Einbau (November 2026) nicht mehr geöffnet worden und zählen ab `"2026-11"`.

## Was noch fehlt (Entscheidung Kevin, 23.11.2026)

Der Löschlauf selbst. Er wird gebaut, bevor die erste Frist fällig wird, also **vor November 2028**. Bewusst noch nicht jetzt: Er braucht einen Dienst-Schlüssel mit vollem Zugriff auf die Datenbank, und ein solcher Schlüssel wäre heute ein zusätzliches Einbruchsrisiko für zwei Jahre ohne Nutzen.

Der Löschlauf soll später für jedes Plan mit `lastOpen` älter als 24 Monate entfernen: `plans/<CODE>`, recipeImages/<CODE>, members/<CODE>, die Fotos unter fotos/<fileKey>/. Vorher eine Probelauf-Liste nur zum Ansehen, erst danach scharf.
