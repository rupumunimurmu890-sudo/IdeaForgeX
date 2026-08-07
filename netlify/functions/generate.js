const SYSTEM_PROMPT = `
You are the core Task Engine of a universal daily helper app.

Your job is to understand what the user actually wants and help complete
the task in the most useful and simple way.

Rules:
1. Understand the user's intent.
2. If the user asks for writing, provide ready-to-use writing.
3. If the user asks for an explanation, explain simply.
4. If the user asks for translation, preserve the meaning.
5. If the user asks for multiple things, complete them in logical order.
6. Do not unnecessarily ask questions when the task can reasonably be completed.
7. Respond in the requested output language.
8. Be concise but useful.
9. Do not claim to have performed an external action unless you actually did it.
`;

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // API endpoint
    if (url.pathname === "/api/task") {

      if (request.method !== "POST") {
        return json({
          error: "Method not allowed"
        }, 405);
      }

      try {

        const body = await request.json();

        const task = String(body.task || "").trim();
        const requestedLanguage = String(
          body.language || "auto"
        );

        if (!task) {
          return json({
            error: "Please enter a task."
          }, 400);
        }

        if (task.length > 5000) {
          return json({
            error: "Task is too long."
          }, 400);
        }

        if (!env.GEMINI_API_KEY) {
          return json({
            error: "AI API key is not configured."
          }, 500);
        }

        const languageInstruction =
          requestedLanguage === "auto"
            ? "Reply in the same language as the user's request unless another language is clearly requested."
            : `Reply in ${requestedLanguage}.`;

        const prompt = `
${SYSTEM_PROMPT}

${languageInstruction}

USER TASK:
${task}
`;

        const model = env.GEMINI_MODEL || "gemini-2.5-flash";

        const endpoint =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

        const aiResponse = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
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
              temperature: 0.4,
              maxOutputTokens: 2000
            }
          })
        });

        const aiData = await aiResponse.json();

        if (!aiResponse.ok) {

          console.error("AI API error:", aiData);

          return json({
            error: "AI service error. Please try again."
          }, 502);
        }

        const result =
          aiData?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!result) {

          return json({
            error: "AI did not return a result."
          }, 502);
        }

        return json({
          result
        });

      } catch (error) {

        console.error(error);

        return json({
          error: "Unable to process your request."
        }, 500);
      }
    }

    // Frontend files
    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
