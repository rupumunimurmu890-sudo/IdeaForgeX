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

        result.innerHTML = data.result;

    } catch (error) {
        result.innerHTML = "❌ Error connecting to AI.";
    }
}
