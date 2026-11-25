// RECHTSTEXTE - Impressum und Datenschutzerklärung für beide Apps (schlauesHaushaltsbuch.de und schlauesKochbuch.de; Repo-Name Wochenplan).
// Gleiche Datei in beiden Repos; Änderungen bitte in beiden nachziehen. Keine Rechtsberatung: Vor dem öffentlichen
// Start prüft ein Anwalt die Texte einmalig. Bei jeder App-Änderung, die Daten oder Dienste berührt, diese Texte mitprüfen.
//
// ANGABEN DES BETREIBERS - nur hier eintragen. Leere Felder erscheinen in der App als „(Angabe folgt)“.
export const BETREIBER = {
  name: "",          // Vor- und Nachname
  firma: "",         // optional: Geschäftsbezeichnung aus der Gewerbeanmeldung
  strasse: "",       // ladungsfähige Anschrift (kein Postfach)
  ort: "",           // PLZ und Ort
  email: "",         // eigene Adresse für die Apps
  telefon: "",       // zweiter schneller Kontaktweg
  ustId: "",         // Umsatzsteuer-ID; leer lassen, solange es keine gibt (Zeile entfällt dann)
};
// Fristen und Annahmen (Vorschläge vom 20.11.2026, von Kevin noch nicht ausdrücklich bestätigt)
export const FRISTEN = {
  mindestalter: 16,
  kontaktMonate: 12,          // E-Mails an uns
  inaktivMonate: 24,          // unbenutzte Bücher, Pläne und Messdaten; automatische Löschung folgt als eigener Schritt
  serverLogs: "",             // Aufbewahrung der Server-Protokolle laut Vercel-Tarif, z. B. "einem Tag"
  stand: "24.11.2026",
};
export const AUFSICHT = "Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg, Lautenschlagerstraße 20, 70173 Stuttgart";

const v = (s) => (String(s || "").trim() || "(Angabe folgt)");

// Abschnitte: { h: Überschrift, p: [Absatz | {list:[…]} | {rows:[[…],…]}] }
export const impressum = (b = BETREIBER) => [
  { h: "Angaben gemäß § 5 DDG", p: [[v(b.name), b.firma, v(b.strasse), v(b.ort)].filter(Boolean).join("\n")] },
  { h: "Kontakt", p: ["E-Mail: " + v(b.email) + "\nTelefon: " + v(b.telefon)] },
  ...(String(b.ustId || "").trim() ? [{ h: "Umsatzsteuer-ID", p: ["Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: " + b.ustId.trim()] }] : []),
  { h: "Verbraucherstreitbeilegung", p: ["Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen."] },
];

export const datenschutz = (b = BETREIBER, f = FRISTEN) => [
  { h: "1. Wer verantwortlich ist", p: [
    "Verantwortlich für die Verarbeitung deiner Daten in den Apps „schlauesHaushaltsbuch.de“ und „schlauesKochbuch.de“ ist:",
    [v(b.name), b.firma, v(b.strasse), v(b.ort), "E-Mail: " + v(b.email)].filter(Boolean).join("\n"),
    "Einen Datenschutzbeauftragten gibt es nicht, weil er gesetzlich nicht vorgeschrieben ist. Fragen zum Datenschutz gehen an die E-Mail-Adresse oben.",
  ] },
  { h: "2. Das Wichtigste in Kürze", p: [{ list: [
    "Du brauchst kein Konto und keine E-Mail-Adresse. Der Einstieg läuft über einen Code und einen Vornamen.",
    "Deine Daten liegen bei Google in einem Rechenzentrum in Belgien.",
    "Nur wenn du eine KI-Funktion nutzt (Beleg scannen, etwas einsprechen, Rezept importieren, Gericht finden), gehen Foto, Sprachaufnahme oder Text an eine KI-Schnittstelle von Google. Dabei können Daten auch in den USA verarbeitet werden. Sprachaufnahmen speichern wir nicht.",
    "Es gibt keine Werbung, keine Cookies, kein Tracking durch Dritte und keine Weitergabe deiner Daten zu Werbezwecken.",
    "Du kannst deine Daten jederzeit exportieren und in der App selbst endgültig löschen.",
  ] }] },
  { h: "3. Welche Daten wir verarbeiten und wozu", p: [
    "Nutzung der Apps. Im Haushaltsbuch speichern wir den Buch-Code, die Vornamen der Mitglieder, Buchungen (Datum, Händler, Betrag, Einzelpositionen, Rubrik, wer bezahlt hat), Einnahmen, Fixkosten, Budgets und, wenn du es nicht abwählst, die gescannten Belege als Bild oder PDF. Im Kochbuch speichern wir den Plan-Code, die Vornamen der Mitglieder, Wochenpläne, Einkaufsliste, Vorrat (eingetragene, abgehakte und beim Kochen verbrauchte Lebensmittel mit Datum), Rezepte mit Bewertungen und Notizen, Kochhistorie und eigene Rezeptfotos. Zweck ist, dir die Apps bereitzustellen und die Daten zwischen den Geräten der Mitglieder abzugleichen. Rechtsgrundlage ist Art. 6 Abs. 1 Buchstabe b DSGVO (Nutzungsvertrag).",
    "Verknüpfung von Haushaltsbuch und Kochbuch. Wenn du die beiden Apps verknüpfst, legt das Haushaltsbuch einen Auszug deiner Lebensmittel-Einkäufe an (Datum, Artikelname, Unterkategorie, ohne Beträge und ohne Händler). Das Kochbuch liest nur diesen Auszug, um deinen Vorrat zu schätzen. Es erhält keinen Zugang zu deinem Haushaltsbuch und ändert dort nichts. Rechtsgrundlage ist Art. 6 Abs. 1 Buchstabe b DSGVO.",
    "Anmeldung ohne Konto. Beim ersten Öffnen erhält dein Gerät automatisch eine zufällige Nutzer-ID, ohne Namen und ohne E-Mail-Adresse. Wir speichern zu jedem Buch und Plan, welche Nutzer-IDs Mitglied sind, mit Vornamen und Tag des Beitritts. So dürfen nur Geräte von Mitgliedern auf die Daten zugreifen. Den Anmeldedienst betreibt Google (Firebase Authentication); dabei werden auch IP-Adresse und Browserkennung verarbeitet. Rechtsgrundlage ist Art. 6 Abs. 1 Buchstabe b DSGVO.",
    "Belege und Fotos. Belegdateien und eigene Rezeptfotos liegen als Dateien im Dateispeicher von Google (Cloud Storage for Firebase) in Belgien, in einem Ordner mit zufälligem, nicht erratbarem Namen. Den Ordnernamen kennen nur die Mitglieder des Buchs oder Plans. Rezeptfotos sind über einen ebenso nicht erratbaren Link abrufbar, damit sie in der App und im Kochbuch-PDF angezeigt werden können.",
    "Belege können Namen, Anschriften, Kundennummern, Teile von Karten- oder Kontonummern und Angaben über andere Personen enthalten. Bitte lade nur Belege hoch, die du hochladen darfst. Aus Belegen von Apotheke oder Arzt können Gesundheitsdaten hervorgehen. Vor deinem ersten Scan fragt die App deshalb nach deiner ausdrücklichen Einwilligung, dass solche Angaben verarbeitet werden dürfen, wenn du einen solchen Beleg scannst (Art. 9 Abs. 2 Buchstabe a DSGVO). Du kannst sie jederzeit widerrufen, indem du solche Belege von Hand einträgst und bereits gescannte löschst. Dasselbe gilt, wenn du eine solche Ausgabe einsprichst: Vor der ersten Spracheingabe fragt die App ebenfalls nach deiner Einwilligung.",
    "KI-Funktionen. Wenn du einen Beleg scannst, wird das Foto auf deinem Gerät verkleinert und über unseren Server in Frankfurt an die Gemini API von Google gesendet. Die KI liest Betrag, Datum, Händler und Einzelpositionen aus. Im Kochbuch gehen beim Rezeptimport der Text oder das Foto und bei „Bekanntes Gericht finden“ die Liste der wahrscheinlich vorhandenen Lebensmittel an dieselbe Schnittstelle. Spracheingabe: Hältst du den Mikrofon-Knopf gedrückt (Ausgabe einsprechen im Haushaltsbuch, Einkaufsliste und Vorrat im Kochbuch), nimmt dein Browser deine Stimme auf, nur solange du den Knopf hältst und höchstens eine Minute. Die Aufnahme geht auf demselben Weg an dieselbe Schnittstelle; die KI schreibt daraus die Buchung, die Posten der Einkaufsliste oder die Lebensmittel für einen Gerichtvorschlag. Die Aufnahme wird weder auf deinem Gerät noch bei uns gespeichert; gespeichert wird nur, was du danach übernimmst. Die eingebaute Spracherkennung des Browsers (von Apple oder Google) nutzen wir nicht. Den Zugriff aufs Mikrofon erlaubst du im Browser und kannst ihn dort jederzeit wieder entziehen. Dein Vorname und dein Code werden nicht an die KI übermittelt. Google verwendet die Inhalte nach den Bedingungen für den bezahlten Dienst nicht zum Training seiner Modelle und speichert Anfragen und Antworten bis zu 55 Tage, um Missbrauch zu erkennen. Rechtsgrundlage ist Art. 6 Abs. 1 Buchstabe b DSGVO, weil du die Funktion selbst auslöst. Die Apps lassen sich auch ohne KI nutzen.",
    "Schutz vor Missbrauch. Um die KI-Kosten zu begrenzen, zählen wir Anfragen pro Tag je Nutzer-ID und je Internetanschluss. Dafür speichern wir weder Nutzer-ID noch IP-Adresse im Klartext, sondern einen mit einem geheimen Schlüssel gebildeten Prüfwert. Die Zähler werden am Folgetag gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 Buchstabe f DSGVO; unser Interesse ist der Schutz vor Missbrauch und unkontrollierten Kosten.",
    "Reichweitenmessung ohne Tracking. Zu jedem Gerät speichern wir, an welchen Tagen die App geöffnet wurde, den ersten und den letzten Tag der Nutzung und einmalig, über welchen Einstiegslink das Gerät gekommen ist (zum Beispiel den QR-Code eines bestimmten Standorts). Die Nutzer-ID steht dabei nicht im Klartext, sondern als Prüfwert. Daraus berechnen wir, wie viele Geräte die Apps täglich nutzen und wie viele nach vier Wochen noch dabei sind. Wir setzen dafür keine Cookies und keine Dienste Dritter ein und erstellen keine Profile. Rechtsgrundlage ist Art. 6 Abs. 1 Buchstabe f DSGVO; unser Interesse ist, den Betrieb zu planen und die Apps zu verbessern. Du kannst jederzeit per E-Mail widersprechen.",
    "Anonyme, zusammengefasste Statistiken. Wir können aus den Daten aller Nutzer Statistiken bilden, die keiner Person und keinem Haushalt mehr zugeordnet werden können, zum Beispiel durchschnittliche Ausgaben je Rubrik oder die Zahl gescannter Belege. In solche Statistiken gehen nur Gruppen mit einer Mindestgröße ein; einzelne Datensätze, Codes, Namen oder Kennungen verlassen die Datenbank dabei nicht, Angaben zu Gesundheit fließen nicht ein. Anonyme Statistiken können wir für die Weiterentwicklung nutzen und veröffentlichen oder an Dritte weitergeben. Rechtsgrundlage für die Anonymisierung ist Art. 6 Abs. 1 Buchstabe f DSGVO.",
    "Server-Protokolle. Beim Aufruf der Apps verarbeitet unser Hosting-Anbieter technisch notwendige Daten: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browserkennung. Sie dienen der Auslieferung, der Sicherheit und der Fehlersuche und werden nach " + v(f.serverLogs) + " gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 Buchstabe f DSGVO.",
    "Speicher auf deinem Gerät. Die Apps setzen keine Cookies. Im lokalen Speicher deines Browsers liegen Code, Vorname, die Anmeldung deines Geräts, deine Einwilligung zum Belegscan, Schriftgröße und Ansichtseinstellungen, damit du nicht bei jedem Öffnen neu einsteigen musst. Das ist für die Funktion erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Beim Verlassen eines Buchs oder Plans werden Code und Name vom Gerät entfernt.",
    "Kontakt. Wenn du uns schreibst, verarbeiten wir deine E-Mail-Adresse und deine Nachricht, um zu antworten (Art. 6 Abs. 1 Buchstabe b oder f DSGVO), und löschen sie spätestens " + f.kontaktMonate + " Monate nach Abschluss.",
  ] },
  { h: "4. Empfänger und Dienstleister", p: [
    { rows: [
      ["Google (Firebase Realtime Database)", "Speicherung der Bücher und Pläne", "Belgien"],
      ["Google (Cloud Storage for Firebase)", "Speicherung der Belegdateien und Rezeptfotos", "Belgien"],
      ["Google (Firebase Authentication)", "Anmeldung ohne Konto", "USA"],
      ["Google (Gemini API)", "Auslesen von Belegen, Sprachaufnahmen und Rezepten durch KI", "weltweit, auch USA"],
      ["Vercel Inc.", "Auslieferung der Apps, Weiterleitung der KI-Anfragen", "Weiterleitung in Frankfurt, Auslieferung weltweit"],
    ] },
    "Vertragspartner für die Google-Dienste ist Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Mit diesen Anbietern bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO. Mitglieder eines Buchs oder Plans sehen alle Daten darin. Wer den Code kennt, kann einem Buch oder Plan beitreten; gib ihn deshalb nur an Menschen, die mitlesen sollen. Sonst geben wir keine personenbezogenen Daten weiter, außer wir sind gesetzlich dazu verpflichtet.",
  ] },
  { h: "5. Übermittlung in Länder außerhalb der EU", p: [
    "Google und Vercel können Daten in den USA verarbeiten. Die Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU-Kommission zum EU-US-Datenschutzrahmen (Art. 45 DSGVO), unter dem beide Unternehmen zertifiziert sind, und ergänzend auf die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 Buchstabe c DSGVO).",
  ] },
  { h: "6. Wie lange wir Daten speichern", p: [{ list: [
    "Bücher, Pläne, Belege und Fotos: bis du sie löschst. „Endgültig löschen“ in der App entfernt alles sofort; aus den Sicherungen des Anbieters verschwinden die Daten danach innerhalb weniger Wochen. Bücher und Pläne, die " + f.inaktivMonate + " Monate lang nicht geöffnet wurden, löschen wir.",
    "Zähler für den Missbrauchsschutz: bis zum Folgetag.",
    "Nutzungstage, erster und letzter Tag und Herkunft eines Geräts: bis " + f.inaktivMonate + " Monate nach der letzten Nutzung.",
    "Server-Protokolle: " + v(f.serverLogs) + ".",
    "E-Mails an uns: " + f.kontaktMonate + " Monate nach Abschluss.",
  ] }, "Steuerliche Aufbewahrungspflichten treffen dich als Nutzer selbst; die App ist kein Archiv im Sinne des Steuerrechts."] },
  { h: "7. Sicherheit", p: [
    "Alle Übertragungen sind verschlüsselt (TLS), Datenbank und Dateispeicher sind beim Anbieter verschlüsselt gespeichert. Auf ein Buch oder einen Plan dürfen nur angemeldete Geräte zugreifen, die dort Mitglied sind.",
  ] },
  { h: "8. Deine Rechte", p: [
    "Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen, die auf berechtigtem Interesse beruhen (Art. 21). Eine Einwilligung kannst du jederzeit für die Zukunft widerrufen.",
    "Das meiste erledigst du direkt in der App: Export als CSV, Sicherung als Datei, Belege als ZIP, Kochbuch als Datei oder PDF, und „Endgültig löschen“. Für alles andere schreib an " + v(b.email) + ". Weil wir weder Namen noch E-Mail-Adresse von dir haben, brauchen wir zur Zuordnung deinen Code.",
    "Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei: " + AUFSICHT + ".",
  ] },
  { h: "9. Weitere Hinweise", p: [{ list: [
    "Die Apps richten sich an Personen ab " + f.mindestalter + " Jahren.",
    "Es gibt keine automatisierte Entscheidung im Sinne von Art. 22 DSGVO. Die KI macht Vorschläge, die du vor dem Speichern siehst und ändern kannst.",
    "Du bist nicht verpflichtet, Daten anzugeben. Ohne Code und Vornamen lassen sich die Apps aber nicht nutzen.",
    "Wenn du Daten anderer Personen einträgst (zum Beispiel Mitglieder deines Haushalts), informiere sie bitte darüber.",
    "Wir passen diese Erklärung an, wenn sich die Apps ändern. Stand: " + f.stand + ".",
  ] }] },
];
