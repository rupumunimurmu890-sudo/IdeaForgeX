async function generateIdea() {

    const idea = document.getElementById("ideaInput").value;
    const result = document.getElementById("result");

    if (!idea.trim()) {
        result.innerHTML = "Please enter your startup idea.";
        return;
    }

    result.innerHTML = "⏳ AI is analyzing your startup idea...";

    try {
        const response = await fetch("/.netlify/functions/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                idea: idea
            })
        });

        const data = await response.json();

        if (!response.ok) {
            result.innerHTML = `❌ ${data.result || data.error || "AI function error"}`;
            return;
        }

        result.innerHTML = `
            <h3>💡 AI Startup Plan</h3>
            <p>${data.result || "No AI response received."}</p>
        `;

    } catch (error) {
        result.innerHTML = `❌ Connection Error: ${error.message}`;
    }
}
