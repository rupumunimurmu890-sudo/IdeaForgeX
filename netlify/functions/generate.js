const OpenAI = require("openai");

exports.handler = async function (event) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { idea } = JSON.parse(event.body);

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: `Generate a startup idea based on: ${idea}`
        }
      ],
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        result: response.choices[0].message.content
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        result: "Error: " + error.message
      }),
    };
  }
};
