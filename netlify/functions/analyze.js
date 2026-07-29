exports.handler = async (event) => {
  try {
    const { idea } = JSON.parse(event.body || "{}");

    if (!idea) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          result: "Please enter a startup idea."
        })
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          result: "GEMINI_API_KEY is not configured in Netlify."
        })
      };
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this startup idea and provide:
1. Startup Score (out of 100)
2. Market Research
3. Target Customers
4. Revenue Model
5. SWOT Analysis
6. Launch Roadmap

Startup Idea: ${idea}`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          result:
            data?.error?.message || "Gemini API request failed."
        })
      };
    }

    const result =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No AI response received.";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        result: result
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        result: "Error: " + error.message
      })
    };
  }
};
