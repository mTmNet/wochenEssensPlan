# CLAUDE.md – Wochenplan (wochenEssensPlan)

Arbeitsregeln und Produktentscheidungen für jede Sitzung in diesem Repo. Stand: 16.11.2026. Dieselben Regeln gelten in der Schwester-App `Haushaltsbuch` (dort eigene CLAUDE.md).

Sprache: Deutsch, in Antworten, Oberfläche, Kommentaren und Commit-Nachrichten.

## Worum es geht

Zwei zusammengehörende Web-Apps: **Haushaltsbuch** (Ausgaben, Belege per Foto und KI) und **Wochenplan** (dieses Repo: „Was kochen wir heute?“ aus dem Vorrat). Der Wochenplan liest die Einkäufe des Haushaltsbuchs, schreibt dort aber nie. Die Apps werden täglich genutzt und sind über Monate fein nachjustiert worden.

**Ziel:** Die Apps so weit härten, dass Fremde sie sicher und kostenlos nutzen können. Zuerst Nutzer gewinnen, nicht Umsatz. Kein Neuaufbau, keine neuen Features.

## Grundregeln

1. **Bestehenden Code erhalten.** Verhalten und Details der Oberfläche nicht ungefragt ändern. Kein Neuaufbau, kein Framework-Wechsel, keine neue Bibliothek ohne Rückfrage.
2. **Kleine Aufträge.** Ein Schritt, dann testen (`npm test`, `npm run build`), Commit, kurz berichten.
3. **Merge-Regel:** Kleine, getestete Änderungen dürfen selbst nach `main` gemergt werden und werden Kevin danach gemeldet. Achtung: Vercel deployt `main` automatisch in die Live-App. **Alles, was Daten, Datenbankregeln oder Login/Zugang betrifft, wird vorher als Pull Request vorgelegt und wartet auf Kevins OK.**
4. **Nichts an der Live-Umgebung ohne ausdrückliche Freigabe:** keine Firebase-Regeln veröffentlichen, keine Daten migrieren oder löschen, keine Vercel-Variablen ändern. Regeln in der Firebase Console und Variablen in Vercel setzt Kevin selbst; dafür eine Anleitung in einfachen Worten liefern (wo klicken, was sehen).
5. **Keine Secrets im Code oder im Repo.** Auch keine echten Plan- oder Buch-Codes, keine E-Mail-Adressen, nichts davon in Tests, Doku oder `.claude/`. Dieses Repo ist öffentlich.
6. **Wenn das Fundament blockiert** (Datenmodell oder Architektur verhindert Härtung oder Sync): stoppen, begründen, Vorschlag machen. Nur den betroffenen Kern neu, alter Code bleibt als Referenz.
7. **Keine Modellnamen oder KI-Anbieter in der Oberfläche oder in Kommentaren.** Die KI heißt in der App „KI“.
8. **Wenn möglich selbst prüfen**, statt Kevin prüfen zu lassen. Kevin testet am Handy und meldet per Screenshot.

## Technik in Kürze

Einzelheiten stehen in `README.md`, `docs/ARCHITEKTUR.md` und `docs/API.md`; hier nur, was man leicht falsch annimmt.

- React 18 + Vite, Inline-Styles, keine UI-Bibliothek. Logik als reine Funktionen in `src/logic/` mit Tests in `tests/` (`node --test`).
- **Firebase Realtime Database per REST, kein Firestore, kein Firebase-SDK.** Projekt `wochenessenplan-3d0e1`, Region europe-west1. Das Haushaltsbuch liegt in einem **eigenen** Firebase-Projekt (`haushaltsbuch-3cefb`).
- Sync ist ein Abruf alle 10 Sekunden, kein Echtzeit-Listener. Geschrieben wird gezielt per PATCH, nie ganze Sammlungen.
- Zugang: Wer den Plan-Code kennt, trägt sich mit seiner anonymen Nutzer-ID unter `members/<CODE>` ein; nur Mitglieder lesen und schreiben `plans/<CODE>` (Stand 2 seit 19.11.2026). Der Plan speichert unter `plans/<CODE>/hb` die Verknüpfung zum Haushaltsbuch: neu nur den Schlüssel des Einkaufsauszugs (`key`), bei alten Verknüpfungen zusätzlich noch den Buch-Code.
- KI: Vercel-Function `api/gemini.js`. Der Schlüssel liegt nur als Vercel-Variable `GEMINI_API_KEY` vor, nie im Client.
- Die geltenden Datenbankregeln stehen in der Firebase Console; die Abschrift in `README.md` und `docs/API.md` muss bei jeder Regeländerung mitgepflegt werden.
- Live: https://wochen-essens-plan.vercel.app (Vercel-Projekt `wochen-essens-plan`).

## Stand der Härtung

Erledigt (16.11.2026):

- Rezeptfotos: Die Liste unter `recipeImages` ist nicht mehr abrufbar, `globalRecipes` ist nur lesbar.
- KI-Kostendeckel (`api/_limit.js`): je Tag 300 Anfragen gesamt, 60 je IP, 50 je Plan. Zusätzlich hat Kevin eine Sperre am Google-API-Schlüssel.

Offen, in dieser Reihenfolge, jeweils als eigener Auftrag:

1. **Anonymous Auth hinter dem Code-Einstieg.** Im Wochenplan seit 18.11.2026 aktiv (`src/auth.js`, Vercel-Variable `VITE_FB_API_KEY`); jedes Gerät trägt sich unter `members/<CODE>/<Nutzer-ID>` ein. Seit 19.11.2026 gilt Stand 2: Pläne und Plan-Fotos nur für eingetragene Mitglieder. Ablauf, Regel-Stände und nächste Schritte: `docs/ANMELDUNG.md`. Kevin hat am 17.11. entschieden: keine Beobachtungszeit, aber zwingend erst App, dann scharfe Regeln.
2. **Datenbankregeln pro Nutzer-ID** (Mitgliedschaft im Plan statt nur Code). Dazu gehört die Brücke zum Haushaltsbuch: Der Plan-Code darf nicht dauerhaft die Finanzdaten öffnen. Seit 18.11.2026 liest der Wochenplan dafür den Einkaufsauszug (`hbLoad` in `src/fb.js`, Tests `tests/bridge.test.mjs`, `tests/e2e/bridge.mjs`); der Plan entfernt den Buch-Code, sobald er den Schlüssel hat. Stand 2 gilt seit 19.11.2026.
3. **Kostendeckel auf Nutzer-ID** umstellen (in `api/_limit.js` vorbereitet).
4. **Messung:** eigener Zeitstempel „zuletzt aktiv“ je Nutzer-ID und Herkunft aus dem Einstiegslink (ein Parameter je QR-Code-Standort). Kein Firebase Analytics, keine Cookies, kein Consent-Banner. Auswertung: täglich aktive Nutzer und Retention nach vier Wochen.
5. **Datenschutz-Technik:** Löschfristen, Texte in der App passend zur Datenschutzerklärung. Datenschutzerklärung, Vertrag zur Auftragsverarbeitung mit Google und Impressum erledigt Kevin.
6. **Zum Abschluss** ein Security-Review über alle Änderungen.

Später:

- Design-Auffrischung **Komponente für Komponente**, nie die ganze Oberfläche auf einmal. Kevin gibt Screenshots als Referenz, vor jeder Komponente einen Vorschlag zeigen.
- Landingpage als **eigenes, neues Projekt** (dort freie Gestaltung). Botschaft: „Bon fotografieren, fertig, nie wieder Rechnungen suchen“.

## Ausdrücklich nicht

- Neue Features. Kleine Korrekturen aus Kevins Tests sind davon nicht betroffen.
- Neuaufbau der App oder Umzug auf Firestore.
- Firebase Analytics, Tracking-Cookies oder ein Consent-Banner.
- Bezahlfunktionen. Wochenplan und Auswertung bleiben kostenlos.

## Befehle

```bash
npm install
npm test          # Unit-Tests der Logik
npm run build     # muss vor jedem Merge durchlaufen
npm run dev       # Oberfläche lokal; die KI läuft nur mit `vercel dev`
```

Browser-Durchlauf mit simuliertem Firebase: siehe `tests/e2e/README.md`.
