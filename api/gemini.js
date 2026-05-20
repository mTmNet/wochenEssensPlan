export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const { system, messages } = req.body;

  // Convert Anthropic message format to Gemini format
  const contents = messages.map(msg => {
    const role = msg.role === "assistant" ? "model" : "user";
    if (Array.isArray(msg.content)) {
      const parts = msg.content.map(part => {
        if (part.type === "text") {
          return { text: part.text };
        } else if (part.type === "image") {
          return {
            inlineData: {
              mimeType: part.source.media_type || "image/jpeg",
              data: part.source.data,
            },
          };
        }
        return { text: "" };
      });
      return { role, parts };
    } else {
      return { role, parts: [{ text: msg.content }] };
    }
  });

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: 6000,
      temperature: 0.3,
    },
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (response.status !== 503 || attempt === 3) break;
    await sleep(3000);
  }

  try {
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: "Gemini Fehler: " + errText.slice(0, 300) });
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || "";

    if (!text) {
      const reason = candidate?.finishReason || "UNKNOWN";
      if (reason === "RECITATION") {
        return res.status(422).json({ error: "Dieses Rezept ist urheberrechtlich geschützt — Gemini darf es nicht reproduzieren. Bitte das Rezept manuell eintippen und den Text-Import nutzen." });
      }
      return res.status(422).json({ error: `Gemini hat keine Antwort geliefert (finishReason: ${reason}). Bitte ein anderes Bild versuchen.` });
    }

    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: "Fehler: " + error.message });
  }
}
