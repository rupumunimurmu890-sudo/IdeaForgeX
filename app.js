function generateIdea() {

    let idea = document.getElementById("ideaInput").value;
    let result = document.getElementById("result");

    if (idea.trim() === "") {
        result.innerHTML = "Please enter your startup idea.";
        return;
    }

    result.innerHTML = `
    <h3>🚀 AI Startup Analysis</h3>
    <p><b>Idea:</b> ${idea}</p>
    <p>✅ Problem: Identify customer problems</p>
    <p>💡 Solution: Build a useful product</p>
    <p>💰 Revenue: Subscription, Services, Premium Features</p>
    <p>📈 Growth: Marketing + User Feedback</p>
    `;
}
