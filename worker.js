export default {
  async fetch(request, env) {
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    if (request.method !== "POST") {
      return json({
        success: false,
        error: "Only POST requests are allowed."
      }, 405);
    }

    try {
      const body = await request.json();

      const {
        tool = "AI Helper",
        input = "",
        fromLanguage = "auto",
        toLanguage = "English"
      } = body;

      if (!input.trim()) {
        return json({
          success: false,
          error: "Please enter some text."
        }, 400);
      }

      /*
       * API key Cloudflare Worker secret में रखें:
       * AI_API_KEY
       */

      const apiKey = env.AI_API_KEY;

      if (!apiKey) {
        return json({
          success: false,
          error: "AI API key is not configured."
        }, 500);
      }

      const prompt = createPrompt(
        tool,
        input,
        fromLanguage,
        toLanguage
      );

      /*
       * Example Gemini API request.
       * बाद में model/API को जरूरत के अनुसार बदल सकते हैं।
       */

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
          encodeURIComponent(apiKey),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        return json({
          success: false,
          error: "AI service error.",
          details: errorText
        }, 502);
      }

      const data = await response.json();

      const result =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No result was generated.";

      return json({
        success: true,
        tool,
        fromLanguage,
        toLanguage,
        result
      });

    } catch (error) {
      return json({
        success: false,
        error: "Server error.",
        message: error.message
      }, 500);
    }
  }
};


function createPrompt(
  tool,
  input,
  fromLanguage,
  toLanguage
) {

  if (tool === "Translate") {
    return `
You are a professional multilingual translator.

Translate the following text.

Source language: ${fromLanguage}
Target language: ${toLanguage}

Important:
- Preserve the original meaning.
- Do not add unnecessary explanations.
- Keep names, numbers and important details accurate.
- Use natural language appropriate for native speakers.

Text:
${input}
`;
  }

  if (tool === "Writing") {
    return `
You are a professional multilingual writing assistant.

User language: ${fromLanguage}
Output language: ${toLanguage}

Improve or create the requested text.

Requirements:
- Clear
- Natural
- Useful
- Grammatically correct
- Appropriate for the requested purpose

User request:
${input}
`;
  }

  if (tool === "Ideas") {
    return `
You are an expert idea generator.

Generate useful and practical ideas based on the user's request.

Output language: ${toLanguage}

Give the answer in a clear numbered list.

User request:
${input}
`;
  }

  if (tool === "Advertisement") {
    return `
You are a professional advertising copywriter.

Create an attractive advertisement based on the user's information.

Output language: ${toLanguage}

Include where appropriate:
- Headline
- Short description
- Benefits
- Call to action

Keep it suitable for social media and small businesses.

Product/request:
${input}
`;
  }

  return `
You are Universal Helper, a helpful multilingual AI assistant.

Answer the user's question accurately and clearly.

Output language: ${toLanguage}

User question:
${input}
`;
}


function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        ...corsHeaders()
      }
    }
  );
}
