// RECHTSTEXT ANZEIGEN - Impressum oder Datenschutzerklärung als eigene Ebene über allem (Inhalt aus src/rechtliches.js).
// Gleiche Datei in beiden Repos. Farben über die CSS-Variablen beider Apps, damit Hell und Dunkel stimmen.
import { impressum, datenschutz } from "./rechtliches.js";

const SANS = "system-ui,-apple-system,Helvetica Neue,Arial,sans-serif";

export default function Rechtstext({ art, onClose }) {
  const titel = art === "impressum" ? "Impressum" : "Datenschutzerklärung";
  const teile = art === "impressum" ? impressum() : datenschutz();
  const text = { fontSize: "14px", color: "var(--c-text)", lineHeight: "1.6", margin: "0 0 10px", whiteSpace: "pre-line" };
  return (
    <div role="dialog" aria-modal="true" aria-label={titel} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.65)", display: "flex", justifyContent: "center", padding: "16px", boxSizing: "border-box" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "640px", maxHeight: "100%", overflowY: "auto", background: "var(--c-white)", border: "1px solid var(--c-border)", borderRadius: "8px", padding: "20px", boxSizing: "border-box", fontFamily: SANS }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <h1 style={{ flex: 1, margin: 0, fontSize: "20px", color: "var(--c-text)" }}>{titel}</h1>
          <button onClick={onClose} aria-label="Schließen" style={{ minWidth: "44px", minHeight: "44px", background: "none", border: "1px solid var(--c-border)", borderRadius: "6px", color: "var(--c-accent)", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>
        {teile.map((t) => (
          <section key={t.h} style={{ marginBottom: "14px" }}>
            <h2 style={{ fontSize: "15px", color: "var(--c-text)", margin: "0 0 6px" }}>{t.h}</h2>
            {t.p.map((x, i) => {
              if (typeof x === "string") return <p key={i} style={text}>{x}</p>;
              if (x.list) return <ul key={i} style={{ ...text, paddingLeft: "20px" }}>{x.list.map((l) => <li key={l} style={{ marginBottom: "4px" }}>{l}</li>)}</ul>;
              if (x.rows) return (
                <div key={i} style={{ margin: "0 0 10px" }}>
                  {x.rows.map((r) => (
                    <div key={r[0]} style={{ borderTop: "1px solid var(--c-border)", padding: "6px 0", fontSize: "14px", lineHeight: "1.5", color: "var(--c-text)" }}>
                      <div style={{ fontWeight: 700 }}>{r[0]}</div>
                      <div style={{ color: "var(--c-muted)" }}>{r[1]} · {r[2]}</div>
                    </div>
                  ))}
                </div>
              );
              return null;
            })}
          </section>
        ))}
        <button onClick={onClose} style={{ width: "100%", minHeight: "48px", marginTop: "4px", background: "none", border: "1px solid var(--c-border)", borderRadius: "6px", color: "var(--c-accent)", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: SANS }}>Schließen</button>
      </div>
    </div>
  );
}
