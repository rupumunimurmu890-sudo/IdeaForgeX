async function generateIdea() {
    const idea = document.getElementById("ideaInput").value.trim();
    const result = document.getElementById("result");
    const loader = document.getElementById("loader");
    const button = document.getElementById("generateBtn");

    if (!idea) {
        result.innerHTML = "<p>Please enter your startup idea.</p>";
        return;
    }

    loader.classList.remove("hidden");
    button.disabled = true;
    result.innerHTML = "";

    try {
        const response = await fetch("/.netlify/functions/analyze", {
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
            throw new Error(data.result || "AI request failed");
        }

        result.innerHTML = `
            <h3>🚀 IdeaForgeX AI Startup Analysis</h3>
            <div style="white-space: pre-wrap;">${data.result}</div>
        `;

    } catch (error) {
        result.innerHTML = `
            <p>❌ Error: ${error.message}</p>
        `;
    } finally {
        loader.classList.add("hidden");
        button.disabled = false;
    }
}
