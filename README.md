# Wochenplan App

Gemeinsamer Essensplaner mit Einkaufsliste, Rezepten und Kochbuch.

## Voraussetzungen

- Node.js (https://nodejs.org) installieren
- Ein kostenloses Firebase Konto (https://firebase.google.com)
- Ein kostenloses GitHub Konto (https://github.com)
- Ein kostenloses Vercel Konto (https://vercel.com)

## Lokale Entwicklung

```bash
npm install
npm run dev
```

Dann http://localhost:5173 im Browser öffnen.

## KI-Extraktion lokal testen (wichtig)

Die Rezept-KI nutzt den Endpoint `/api/gemini` aus dem Ordner `api/`.
Dieser Endpoint wird mit reinem `npm run dev` (Vite) lokal nicht bereitgestellt.

Wenn du KI-Extraktion lokal testen willst:

1. Vercel CLI installieren: `npm i -g vercel`
2. Im Projekt anmelden: `vercel login`
3. Umgebungsvariable setzen: `GEMINI_API_KEY` in Vercel Project Settings (oder lokal via Vercel env)
4. Lokal mit Vercel starten: `vercel dev`

Ohne `GEMINI_API_KEY` liefert der Endpoint einen 500-Fehler.

## Deployment auf Vercel

### Schritt 1 — GitHub Repository erstellen
1. github.com aufrufen und einloggen
2. "New repository" klicken
3. Name: "wochenplan", Public oder Private wählen
4. "Create repository" klicken

### Schritt 2 — Dateien hochladen
1. Im neuen Repository auf "uploading an existing file" klicken
2. Alle Dateien aus diesem Ordner hochladen (inkl. src/ Ordner)
3. "Commit changes" klicken

### Schritt 3 — Vercel verbinden
1. vercel.com aufrufen und mit GitHub einloggen
2. "New Project" klicken
3. Das GitHub Repository "wochenplan" auswählen
4. Einstellungen so lassen wie sie sind
5. "Deploy" klicken
6. Nach ~1 Minute bekommt die App eine URL wie: wochenplan.vercel.app

### Fertig!
Die URL an alle teilen. Jeder gibt beim ersten Start seine Firebase URL ein,
die wird im Browser gespeichert. Dann einfach denselben Plan-Code verwenden.

## Firebase einrichten

1. firebase.google.com aufrufen
2. Projekt erstellen
3. Realtime Database erstellen (Testmodus)
4. Die URL der Datenbank in die App eingeben

