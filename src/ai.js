// KI-AUFRUFE ueber die eigene Server-Function (der Schluessel bleibt auf dem Server).
// mode "extract" = Rezept abschreiben (kaum Kreativitaet), "suggest" = bekanntes Gericht vorschlagen.
import { CATS, CUISINE_LIST } from "./data.js";

export const callAI = async ({mode, system, messages}) => {
  const r = await fetch("/api/gemini", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({mode:mode==="suggest"?"suggest":"extract", system, messages}),
  });
  if(!r.ok) {
    const errText = await r.text();
    throw new Error("KI Fehler "+r.status+": "+errText.slice(0,300));
  }
  const d = await r.json();
  if(d.error) throw new Error(d.error);
  return d.text||"";
};

// Erster JSON-Block ({...} oder [...]) aus einer Antwort; wirft, wenn keiner da ist
export const parseJsonBlock = (raw, kind) => {
  const s=String(raw||"");
  const m = kind==="array" ? s.match(/\[[\s\S]*\]/) : s.match(/\{[\s\S]*\}/);
  if(!m) throw new Error("Kein JSON in Antwort: "+s.slice(0,200));
  return JSON.parse(m[0]);
};

const CAT_HELP = "Für category wähle genau eine aus: "+CATS.join(", ")+". Kinderessen = einfache, milde Gerichte, die Kinder gern mögen; Schnelle Küche = in höchstens etwa 20 Minuten fertig. "+
  "Für cuisine wähle aus: "+CUISINE_LIST.join(", ")+".";

// EXTRAKTION (Text oder Foto einer Rezeptseite): woertliche Uebernahme, ergaenzte Schritte werden gekennzeichnet
export const buildExtractPrompt = () =>
  "Du bist ein Kochassistent und schreibst ein Rezept aus einer Vorlage ab. Übernimm Rezeptname, Zutaten (mit Mengen) und Schritte WÖRTLICH aus der Vorlage; "+
  "nur offensichtliche Tippfehler korrigieren und Mengen einheitlich schreiben (Menge zuerst, z. B. \"200 g Reis\"). Füge keine Zutaten hinzu und lasse keine weg. "+
  "Fehlt in der Vorlage die Kochanleitung, darfst du eine sinnvolle Anleitung aus den Zutaten ableiten; dann setze \"stepsGenerated\": true, sonst \"stepsGenerated\": false. "+
  "Schreibe zusätzlich eine kurze Beschreibung (2–4 Sätze) komplett in eigenen Worten: Worum geht es, Herkunft oder Geschichte aus der Vorlage, was macht das Gericht besonders. Übernimm dafür keine Sätze wörtlich und ergänze nichts, was nicht in der Vorlage steht. "+
  "Antworte NUR mit JSON ohne Markdown-Formatierung: {\"name\":\"Rezeptname\",\"ingredients\":[\"200 g Reis\"],\"steps\":[\"Schritt 1\"],\"stepsGenerated\":false,\"description\":\"Kurze Beschreibung\",\"category\":\"Hauptgericht\",\"cuisine\":\"Italienisch\",\"servings\":4,\"minutes\":35,\"origin\":\"Region oder Land\"}. "+
  "servings = Portionen laut Vorlage (sonst 4), minutes = Gesamtzeit in Minuten laut Vorlage (sonst null), origin = Herkunft/Region, falls in der Vorlage genannt (sonst leer). "+CAT_HELP;

// VORSCHLAG: ein bekanntes, etabliertes Gericht, keine neuen Kombinationen, keine Fantasienamen
export const buildSuggestPrompt = () =>
  "Du bist ein Kochassistent für eine Familie. Nenne EIN bekanntes, etabliertes Gericht der klassischen oder modernen Küche, das es so in Kochbüchern gibt und das zur Anfrage passt. "+
  "Keine neuen Kombinationen, keine Fantasienamen, keine Bindestrich-Ketten. Gib den gebräuchlichen Namen, die Herkunft (Region oder Küche) und ein typisches Rezept mit Mengen für 4 Portionen an. "+
  "Zutaten immer mit Menge zuerst, z. B. \"2 Paprika\", \"200 g Reis\". Schreibe eine kurze Beschreibung (2–3 Sätze) und eine klare Schritt-für-Schritt-Anleitung. "+
  "Antworte NUR mit JSON ohne Markdown-Formatierung: {\"name\":\"Gebräuchlicher Name\",\"bekanntAls\":\"Gebräuchlicher Name oder Alternativname\",\"origin\":\"Region oder Küche\",\"servings\":4,\"minutes\":35,"+
  "\"ingredients\":[\"200 g Reis\"],\"steps\":[\"Schritt 1\"],\"description\":\"Kurze Beschreibung\",\"cuisine\":\"Italienisch\",\"category\":\"Hauptgericht\",\"genutzt\":[\"Paprika\"],\"fehlt\":[\"Sahne\"]}. "+CAT_HELP;

// Verstaendliche Fehlermeldung fuer KI-Aufrufe (Extrahieren + Vorschlagen); die Servertexte werden nur erkannt, nie angezeigt
export const kiErrText = (msg) => {
  if(msg.includes("404")) return "Die KI ist gerade nicht erreichbar (404). Bitte das Server-Protokoll prüfen.";
  if(msg.includes("429")) return "Zu viele Anfragen (429). Bitte 1 Minute warten und erneut versuchen.";
  if(msg.includes("413")) return "Das Bild ist zu groß für die Anfrage (413). Bitte ein kleineres Bild nutzen.";
  if(msg.includes("not configured")) return "Server-Konfiguration fehlt: Der Schlüssel für die KI ist nicht gesetzt. Bitte die Umgebungsvariable auf dem Server eintragen und danach neu deployen.";
  if(msg.includes("API_KEY_INVALID") || msg.includes("401")) return "Der Schlüssel für die KI ist ungültig. Bitte auf dem Server einen gültigen Schlüssel eintragen und danach neu deployen.";
  if(msg.includes("500")) return "Serverfehler bei der KI-Anfrage (500). Bitte Server-Protokoll und Umgebungsvariablen prüfen.";
  return null;
};

// BILD VORBEREITEN (Import und eigenes Rezeptbild): verkleinern und als JPEG-Base64 liefern
export const compressImageToBase64 = (file, opts = {}) => {
  const { maxEdge = 1600, quality = 0.82 } = opts;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas-Kontext nicht verfügbar."));
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Bildkomprimierung fehlgeschlagen."));
              return;
            }
            const outReader = new FileReader();
            outReader.onerror = () => reject(new Error("Komprimiertes Bild konnte nicht gelesen werden."));
            outReader.onload = () => {
              const dataUrl = String(outReader.result || "");
              const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
              resolve({
                base64,
                mimeType: "image/jpeg",
                previewUrl: URL.createObjectURL(blob),
              });
            };
            outReader.readAsDataURL(blob);
          },
          "image/jpeg",
          quality
        );
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
};
