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
  const geminiContents = messages.map(msg => {
    if (Array.isArray(msg.content)) {
      // Handle image + text messages
      const parts = msg.content.map(part => {
        if (part.type === "text") {
          return { text: part.text };
        } else if (part.type === "image") {
          return {
            inlineData: {
              mimeType: part.source.media_type,
              data: part.source.data,
            }
          };
        }
        return { text: "" };
      });
      return { role: msg.role === "assistant" ? "model" : "user", parts };
    } else {
      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      };
    }
  });

  // Add system prompt as first user message if present
  if (system) {
    geminiContents.unshift({
      role: "user",
      parts: [{ text: "Systemanweisung: " + system }]
    });
    geminiContents.splice(1, 0, {
      role: "model",
      parts: [{ text: "Verstanden. Ich folge diesen Anweisungen." }]
    });
  }

  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.3,
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: "Gemini API Fehler: " + errText.slice(0, 200) });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: "Fehler: " + error.message });
  }
}
