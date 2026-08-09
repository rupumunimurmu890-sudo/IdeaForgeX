const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default {
  async fetch(request, env) {

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    // Health check
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          success: true,
          app: "Universal Helper",
          status: "online"
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

    // Only POST
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "POST request required"
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

    try {
      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "GEMINI_API_KEY is not configured in Cloudflare."
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          }
        );
      }

      const body = await request.json();

      const tool = body.tool || "General";
      const input = body.input || "";
      const fromLanguage = body.fromLanguage || "Auto";
      const toLanguage = body.toLanguage || "English";

      if (!input.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Please enter some text."
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          }
        );
      }

      let prompt = "";

      if (tool === "Translation") {
        prompt = `
You are a professional multilingual translator.

Translate the following text naturally and accurately.

Source language: ${fromLanguage}
Target language: ${toLanguage}

Rules:
- Preserve the original meaning.
- Do not add unnecessary explanations.
- Keep names, numbers and important details accurate.
- Use natural language appropriate for the target language.

Text:
${input}
`;
      }

      else if (tool === "Writing") {
        prompt = `
You are a professional multilingual writer.

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

      else if (tool === "Ideas") {
        prompt = `
You are an expert idea generator.

Generate useful, practical and realistic ideas.

Output language: ${toLanguage}

Give the answer in a clear numbered list.

User request:
${input}
`;
      }

      else if (tool === "Advertisement") {
        prompt = `
You are a professional advertisement writer.

Create an attractive advertisement.

Output language: ${toLanguage}

Include where appropriate:
- Headline
- Short description
- Benefits
- Call to action

Keep it suitable for social media and customers.

Product/request:
${input}
`;
      }

      else {
        prompt = `
You are Universal Helper, a multilingual AI assistant.

Answer the user's question clearly, accurately and helpfully.

Output language: ${toLanguage}

User question:
${input}
`;
      }

      const apiUrl =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(env.GEMINI_API_KEY);

      const aiResponse = await fetch(apiUrl, {
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
      });

      const data = await aiResponse.json();

      if (!aiResponse.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: data.error?.message || "Gemini API request failed."
          }),
          {
            status: aiResponse.status,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          }
        );
      }

      const result =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response generated.";

      return new Response(
        JSON.stringify({
          success: true,
          tool: tool,
          fromLanguage: fromLanguage,
          toLanguage: toLanguage,
          result: result
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
  }
};
