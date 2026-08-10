export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
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

    try {
      const body = await request.json();

      const tool = body.tool || "AI Helper";
      const input = body.input || "";
      const fromLanguage = body.fromLanguage || "auto";
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

      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "GEMINI_API_KEY is not configured."
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

      const prompt = `
You are Universal Helper, a helpful multilingual AI assistant.

Tool: ${tool}
Source language: ${fromLanguage}
Target language: ${toLanguage}

User request:
${input}

Instructions:
- Give a clear, useful and accurate answer.
- For Translate, translate naturally into the target language.
- For AI Helper, answer the user's question directly.
- For Writing, create polished writing suitable for the request.
- For Calculator, calculate carefully and show the result clearly.
- For Ideas, provide practical and useful ideas.
- For Advertisement, create attractive promotional content.
- If the target language is specified, respond in that language when appropriate.
`;

      const apiUrl =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000
          }
        })
      });

      const data = await aiResponse.json();

      if (!aiResponse.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: data?.error?.message || "Gemini API request failed."
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

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim() || "No response generated.";

      return new Response(
        JSON.stringify({
          success: true,
          result: text
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
          error: error.message || "Server error."
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
