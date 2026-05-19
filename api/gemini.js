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
      maxOutputTokens: 2000,
      temperature: 0.3,
    },
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: "Gemini Fehler: " + errText.slice(0, 300) });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: "Fehler: " + error.message });
  }
}
