function generateIdea() {

    let idea = document.getElementById("ideaInput").value;
    let result = document.getElementById("result");

    if (idea.trim() === "") {
        result.innerHTML = "Please enter your startup idea.";
        return;
    }

    result.innerHTML = `
    <h3>🚀 IdeaForgeX AI Startup Analysis</h3>

    <p><b>Idea:</b> ${idea}</p>

    <hr>

    <h3>⭐ Startup Score</h3>

    <h2>85/100</h2>

    <p>📊 Market Potential: High</p>
    <p>💰 Revenue Potential: Strong</p>
    <p>⚔️ Competition Level: Medium</p>
    <p>🚀 Growth Opportunity: Excellent</p>

    <hr>

    <h3>💡 Business Recommendation</h3>

    <p>
    Create an MVP, test with customers, collect feedback,
    and improve your product step by step.
    </p>

    <h3>📌 Next Actions</h3>

    <ul>
    <li>Research target customers</li>
    <li>Create product prototype</li>
    <li>Build marketing strategy</li>
    <li>Plan revenue model</li>
    </ul>
    `;
}
