function generateIdea() {

    let idea = document.getElementById("ideaInput").value;
    let result = document.getElementById("result");

    if (idea.trim() === "") {
        result.innerHTML = "Please enter your startup idea.";
        return;
    }

    let score = Math.floor(Math.random() * (95 - 70) + 70);

    result.innerHTML = `
    <h3>🚀 IdeaForgeX AI Startup Analysis</h3>

    <p><b>Startup Idea:</b> ${idea}</p>

    <hr>

    <h3>⭐ Startup Score</h3>
    <h2>${score}/100</h2>

    <h3>📊 Market Research</h3>
    <p>
    This idea has potential customers. 
    Research your target audience and validate demand before launching.
    </p>

    <h3>🎯 Target Customers</h3>
    <p>
    Identify users who need this solution and understand their problems.
    </p>

    <h3>💰 Revenue Model</h3>
    <p>
    Subscription, service fees, premium features, partnerships and online sales.
    </p>

    <h3>⚔️ SWOT Analysis</h3>
    <p>
    Strength: Solves a real problem.<br>
    Weakness: Needs customer validation.<br>
    Opportunity: Growing digital market.<br>
    Threat: Existing competitors.
    </p>

    <h3>🚀 Launch Roadmap</h3>
    <ul>
        <li>Create MVP</li>
        <li>Test with first customers</li>
        <li>Improve product</li>
        <li>Scale marketing</li>
    </ul>
    `;
}
