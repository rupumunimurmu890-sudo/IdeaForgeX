exports.handler = async (event) => {

  try {

    const { idea } = JSON.parse(event.body);

    const apiKey = process.env.GEMINI_API_KEY;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
                  text: `Analyze this startup idea and provide:
1. Startup Score (/100)
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

    const result =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No AI response received.";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        result
      })
    };

  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        result: "Error: " + error.message
      })
    };

  }

};
