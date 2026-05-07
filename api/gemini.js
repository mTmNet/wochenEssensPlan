export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "XAI_API_KEY not configured" });
  }

  const { system, messages } = req.body;

  // Convert Anthropic message format to OpenAI format (xAI is OpenAI-compatible)
  const xaiMessages = [];
  if (system) {
    xaiMessages.push({ role: "system", content: system });
  }
  messages.forEach(msg => {
    if (Array.isArray(msg.content)) {
      // Vision format: content is array of {type, text|image_url}
      const parts = msg.content.map(part => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        } else if (part.type === "image") {
          const mimeType = part.source.media_type || "image/jpeg";
          return {
            type: "image_url",
            image_url: { url: "data:" + mimeType + ";base64," + part.source.data }
          };
        }
        return { type: "text", text: "" };
      });
      xaiMessages.push({ role: msg.role, content: parts });
    } else {
      xaiMessages.push({ role: msg.role, content: msg.content });
    }
  });

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: xaiMessages,
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: "xAI Fehler: " + errText.slice(0, 300) });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: "Fehler: " + error.message });
  }
}
