// ========================================
// IdeaForgeX Worker — AI Startup Idea Generator
// Powered by Cloudflare Workers AI
// ========================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// ------------------------------------
// 🎯 Section markers for each report type
// ------------------------------------

const REPORT_SECTION_KEYS = [
  "IDEA", "TARGET_CUSTOMERS", "CUSTOMER_PROBLEM", "REVENUE_MODEL",
  "MARKET_ANALYSIS", "COMPETITOR_ANALYSIS",
  "SWOT_STRENGTHS", "SWOT_WEAKNESSES", "SWOT_OPPORTUNITIES", "SWOT_THREATS",
  "MARKETING_STRATEGY", "STARTUP_COST", "ONE_YEAR_PROJECTION",
  "RISKS", "GROWTH_STRATEGY"
];

const LAUNCH_PLAN_SECTION_KEYS = [
  "BUDGET_BREAKDOWN",
  "PREPARATION",
  "PRODUCT_DEVELOPMENT",
  "BRANDING",
  "MARKETING_LAUNCH",
  "LAUNCH_WEEK",
  "PRODUCT_IDEAS",
  "PRICING",
  "EXPECTED_SALES"
];

const PITCH_DECK_SECTION_KEYS = [
  "PROBLEM", "SOLUTION", "MARKET", "PRODUCT", "BUSINESS_MODEL",
  "COMPETITION", "FINANCIALS", "GROWTH", "FUNDING_REQUIREMENT"
];

// ------------------------------------
// 🌐 Language instruction helper
// ------------------------------------

function languageLine(language) {
  return language && language !== "auto"
    ? `Respond entirely in ${language}.`
    : "Detect the language the user wrote their idea in, and respond entirely in that same language.";
}

// ------------------------------------
// 📊 STARTUP REPORT prompt
// ------------------------------------

function buildReportPrompt(idea, language) {
  return `
You are IdeaForgeX, an expert startup analyst and business consultant AI.

A user has described a business idea:
"${idea}"

${languageLine(language)}

Analyze this idea and produce a COMPLETE startup report in EXACTLY the
format below. Do not add any extra commentary, headers, markdown
symbols (no **, no #), or explanation outside this format. Use plain
text only, with short paragraphs or bullet lines (using "- ") where
listed.

SCORE_MARKET:<integer 0-100, how strong is market demand>
SCORE_COMPETITION:<integer 0-100, higher = LESS competitive/easier to compete>
SCORE_PROFIT:<integer 0-100, profit potential>
SCORE_DIFFICULTY:<integer 0-100, higher = EASIER to start, lower = harder>
SCORE_OVERALL:<integer 0-100, overall viability score>
###IDEA###
A polished 1-2 sentence restatement of the business idea.
###TARGET_CUSTOMERS###
Who exactly this is for (2-3 sentences or bullet lines).
###CUSTOMER_PROBLEM###
The core problem/pain point this solves (2-3 sentences).
###REVENUE_MODEL###
How this makes money (2-4 bullet lines starting with "- ").
###MARKET_ANALYSIS###
Market size, trends, and opportunity (3-4 sentences).
###COMPETITOR_ANALYSIS###
3-4 bullet lines, each naming a type of existing competitor/alternative,
their strength, their weakness, and how this idea can differentiate.
###SWOT_STRENGTHS###
3-4 bullet lines.
###SWOT_WEAKNESSES###
3-4 bullet lines.
###SWOT_OPPORTUNITIES###
3-4 bullet lines.
###SWOT_THREATS###
3-4 bullet lines.
###MARKETING_STRATEGY###
3-4 bullet lines of practical, low-budget-friendly marketing tactics.
###STARTUP_COST###
An estimated starting budget range (in Indian Rupees ₹ unless the idea
clearly targets another country) with a short breakdown, 3-4 bullet lines.
###ONE_YEAR_PROJECTION###
A realistic 1-year revenue/growth projection narrative (3-4 sentences).
###RISKS###
3-4 bullet lines of key risks.
###GROWTH_STRATEGY###
3-4 bullet lines on how to scale after initial traction.

Be specific to the idea given — never generic or vague. Keep the tone
practical and encouraging but honest about real risks.
`;
}

// ------------------------------------
// 🚀 LAUNCH PLAN prompt
// ------------------------------------

function buildLaunchPlanPrompt(idea, budget, language) {

  const budgetLine = budget
    ? `The user's available starting budget is: ${budget}.`
    : "The user did not specify a budget — assume a modest, realistic bootstrapped budget appropriate for this idea.";

  return `
You are IdeaForgeX, an expert startup launch strategist.

A user wants an actionable 30-day launch plan for this business idea:
"${idea}"

${budgetLine}
${languageLine(language)}

Produce a COMPLETE 30-day launch plan in EXACTLY the format below. No
extra commentary, no markdown symbols (no **, no #). Plain text only,
with bullet lines (using "- ") where listed.

###BUDGET_BREAKDOWN###
4-6 bullet lines breaking the budget down into concrete categories
with approximate amounts (use ₹ unless the idea clearly targets
another country). Amounts should add up sensibly to the stated (or
assumed) budget.
###PREPARATION###
Day 1-7: 3-5 bullet lines of concrete preparation tasks (research,
sourcing, legal/registration basics, setup).
###PRODUCT_DEVELOPMENT###
Day 8-15: 3-5 bullet lines on building/preparing the actual
product or service.
###BRANDING###
Day 16-20: 3-5 bullet lines on naming, logo, packaging, online
presence basics.
###MARKETING_LAUNCH###
Day 21-25: 3-5 bullet lines of specific, low-budget marketing actions
to build initial awareness.
###LAUNCH_WEEK###
Day 26-30: 3-5 bullet lines on the actual launch — first sales push,
offers, what to track.
###PRODUCT_IDEAS###
3-5 bullet lines of specific product/service variations or add-ons
this business could offer.
###PRICING###
3-4 bullet lines with concrete suggested price points or pricing
strategy.
###EXPECTED_SALES###
A realistic narrative (3-4 sentences) estimating expected sales/
revenue in the first 30 days based on the given budget and idea.

Be specific and numeric wherever possible — avoid vague advice.
`;
}

// ------------------------------------
// 🎤 INVESTOR PITCH DECK prompt
// ------------------------------------

function buildPitchDeckPrompt(idea, language) {

  return `
You are IdeaForgeX, an expert startup pitch consultant who has helped
founders raise funding.

Create investor pitch deck content for this business idea:
"${idea}"

${languageLine(language)}

Produce COMPLETE pitch deck content in EXACTLY the format below, as if
each section were one slide. No extra commentary, no markdown symbols
(no **, no #). Plain text only, with short punchy bullet lines (using
"- ") where listed — pitch decks should be concise, not paragraphs of
text.

###PROBLEM###
2-3 bullet lines stating the problem clearly and compellingly.
###SOLUTION###
2-3 bullet lines on how this idea solves it.
###MARKET###
2-3 bullet lines on market size and opportunity (include a rough
number/estimate if reasonable).
###PRODUCT###
2-3 bullet lines describing the product/service and what makes it work.
###BUSINESS_MODEL###
2-3 bullet lines on how this makes money.
###COMPETITION###
2-3 bullet lines naming competitor types and this idea's edge.
###FINANCIALS###
2-3 bullet lines with rough projected numbers (revenue estimate,
margins, or unit economics) — keep realistic.
###GROWTH###
2-3 bullet lines on the growth/scaling plan.
###FUNDING_REQUIREMENT###
2-3 bullet lines: how much funding this idea would realistically need
to get started/scale, and what it would be used for (use ₹ unless the
idea clearly targets another country).

Keep every line punchy and investor-ready — no fluff.
`;
}

// ------------------------------------
// 📄 Generic lenient section parser — kisi bhi
// ###KEY### format wale AI response ko parse karta hai
// ------------------------------------

function parseSections(rawText, sectionKeys) {

  if (!rawText || rawText.trim().length < 20) return null;

  const sections = {};
  let anyMarkerFound = false;

  for (let i = 0; i < sectionKeys.length; i++) {

    const key = sectionKeys[i];
    const startMarker = "###" + key + "###";
    const startIdx = rawText.indexOf(startMarker);

    if (startIdx === -1) {
      sections[key] = "";
      continue;
    }

    anyMarkerFound = true;

    const contentStart = startIdx + startMarker.length;
    let endIdx = rawText.length;

    for (let j = i + 1; j < sectionKeys.length; j++) {

      const laterMarker = "###" + sectionKeys[j] + "###";
      const laterIdx = rawText.indexOf(laterMarker, contentStart);

      if (laterIdx !== -1) {
        endIdx = laterIdx;
        break;
      }
    }

    sections[key] = rawText.slice(contentStart, endIdx).trim();
  }

  if (!anyMarkerFound) {

    const cleaned = rawText
      .replace(/SCORE_[A-Z]+\s*:?\s*\d{1,3}/g, "")
      .trim();

    sections[sectionKeys[0]] = cleaned || rawText.trim();
  }

  return { sections, anyMarkerFound };
}

// ------------------------------------
// 🤖 Generic AI call with retry — kisi bhi prompt +
// section list ke liye reuse hota hai
// ------------------------------------

async function generateSectioned(env, prompt, sectionKeys, maxTokens) {

  let parsed = null;

  for (let attempt = 0; attempt < 3; attempt++) {

    try {

      const result = await env.AI.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens || 2048,
        temperature: 0.6
      });

      const rawText = result?.response || "";
      parsed = parseSections(rawText, sectionKeys);

      if (parsed) break;

    } catch (aiError) {

      console.error("AI attempt " + attempt + " failed:", aiError);
    }
  }

  return parsed;
}

function extractScores(rawText) {

  const scoreMatch = function (key) {
    const re = new RegExp(key + "\\s*:?\\s*(\\d{1,3})");
    const m = rawText.match(re);
    return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;
  };

  const score = {
    market: scoreMatch("SCORE_MARKET"),
    competition: scoreMatch("SCORE_COMPETITION"),
    profit: scoreMatch("SCORE_PROFIT"),
    difficulty: scoreMatch("SCORE_DIFFICULTY"),
    overall: scoreMatch("SCORE_OVERALL")
  };

  if (score.overall === null) {

    const available = [score.market, score.competition, score.profit, score.difficulty]
      .filter(function (v) { return typeof v === "number"; });

    if (available.length > 0) {
      score.overall = Math.round(
        available.reduce(function (a, b) { return a + b; }, 0) / available.length
      );
    }
  }

  return score;
}

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ========================================
    // 📊 GENERATE COMPLETE STARTUP REPORT
    // ========================================

    if (url.pathname === "/api/generate-report" && request.method === "POST") {

      try {

        const body = await request.json();
        const idea = (body.idea || "").trim();
        const language = body.language || "auto";

        if (!idea) {
          return Response.json(
            { success: false, error: "Please describe your idea first." },
            { status: 400, headers: corsHeaders }
          );
        }

        if (idea.length > 2000) {
          return Response.json(
            { success: false, error: "Idea description is too long (max 2000 characters)." },
            { status: 400, headers: corsHeaders }
          );
        }

        const prompt = buildReportPrompt(idea, language);
        let lastRawForScore = "";

        let parsed = null;

        for (let attempt = 0; attempt < 3; attempt++) {

          try {

            const result = await env.AI.run(AI_MODEL, {
              messages: [{ role: "user", content: prompt }],
              max_tokens: 2048,
              temperature: 0.6
            });

            const rawText = result?.response || "";
            lastRawForScore = rawText;
            parsed = parseSections(rawText, REPORT_SECTION_KEYS);

            if (parsed) break;

          } catch (aiError) {
            console.error("AI attempt " + attempt + " failed:", aiError);
          }
        }

        if (!parsed) {
          return Response.json(
            { success: false, error: "Report generate nahi ho paya, कृपया फिर से try करें।" },
            { status: 200, headers: corsHeaders }
          );
        }

        const score = extractScores(lastRawForScore);

        if (!parsed.sections.IDEA) {
          parsed.sections.IDEA = "Report generate hua hai, neeche sections dekhein.";
        }

        return Response.json(
          { success: true, report: { score, sections: parsed.sections } },
          { status: 200, headers: corsHeaders }
        );

      } catch (error) {

        console.error("Report generation error:", error);

        return Response.json(
          { success: false, error: error?.message || "Something went wrong." },
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // ========================================
    // 🚀 GENERATE LAUNCH PLAN
    // ========================================

    if (url.pathname === "/api/generate-launch-plan" && request.method === "POST") {

      try {

        const body = await request.json();
        const idea = (body.idea || "").trim();
        const budget = (body.budget || "").trim();
        const language = body.language || "auto";

        if (!idea) {
          return Response.json(
            { success: false, error: "Please describe your idea first." },
            { status: 400, headers: corsHeaders }
          );
        }

        const prompt = buildLaunchPlanPrompt(idea, budget, language);
        const parsed = await generateSectioned(env, prompt, LAUNCH_PLAN_SECTION_KEYS, 2048);

        if (!parsed) {
          return Response.json(
            { success: false, error: "Launch plan generate nahi ho paya, कृपया फिर से try करें।" },
            { status: 200, headers: corsHeaders }
          );
        }

        return Response.json(
          { success: true, plan: parsed.sections },
          { status: 200, headers: corsHeaders }
        );

      } catch (error) {

        console.error("Launch plan generation error:", error);

        return Response.json(
          { success: false, error: error?.message || "Something went wrong." },
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // ========================================
    // 🎤 GENERATE INVESTOR PITCH DECK
    // ========================================

    if (url.pathname === "/api/generate-pitch-deck" && request.method === "POST") {

      try {

        const body = await request.json();
        const idea = (body.idea || "").trim();
        const language = body.language || "auto";

        if (!idea) {
          return Response.json(
            { success: false, error: "Please describe your idea first." },
            { status: 400, headers: corsHeaders }
          );
        }

        const prompt = buildPitchDeckPrompt(idea, language);
        const parsed = await generateSectioned(env, prompt, PITCH_DECK_SECTION_KEYS, 2048);

        if (!parsed) {
          return Response.json(
            { success: false, error: "Pitch deck generate nahi ho paya, कृपया फिर से try करें।" },
            { status: 200, headers: corsHeaders }
          );
        }

        return Response.json(
          { success: true, deck: parsed.sections },
          { status: 200, headers: corsHeaders }
        );

      } catch (error) {

        console.error("Pitch deck generation error:", error);

        return Response.json(
          { success: false, error: error?.message || "Something went wrong." },
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // ------------------------------------
    // 🌐 WEBSITE FILES
    // ------------------------------------

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("IdeaForgeX Worker is running.", { status: 200 });
  }
};
