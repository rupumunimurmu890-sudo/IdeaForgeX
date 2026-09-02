// ========================================
// IdeaForgeX Worker — AI Startup Idea Generator
// Powered by Cloudflare Workers AI
// ========================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// ------------------------------------
// 🎯 Section markers — AI se isi format mein
// output maangte hain, taaki parse karna aasan ho
// ------------------------------------

const SECTION_KEYS = [
  "IDEA",
  "TARGET_CUSTOMERS",
  "CUSTOMER_PROBLEM",
  "REVENUE_MODEL",
  "MARKET_ANALYSIS",
  "COMPETITOR_ANALYSIS",
  "SWOT_STRENGTHS",
  "SWOT_WEAKNESSES",
  "SWOT_OPPORTUNITIES",
  "SWOT_THREATS",
  "MARKETING_STRATEGY",
  "STARTUP_COST",
  "ONE_YEAR_PROJECTION",
  "RISKS",
  "GROWTH_STRATEGY"
];

function buildReportPrompt(idea, language) {

  const languageLine =
    language && language !== "auto"
      ? `Respond entirely in ${language}.`
      : "Detect the language the user wrote their idea in, and respond entirely in that same language.";

  return `
You are IdeaForgeX, an expert startup analyst and business consultant AI.

A user has described a business idea:
"${idea}"

${languageLine}

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
// 📄 AI response ko structured object mein parse karo
// ------------------------------------

function parseReport(rawText) {

  if (!rawText || rawText.trim().length < 20) return null;

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

  // 🆕 Agar overall score nahi mila, lekin baaki scores mil gaye,
  // unka average nikal ke overall bana do (bilkul fail mat karo)
  if (score.overall === null) {

    const available = [score.market, score.competition, score.profit, score.difficulty]
      .filter(function (v) { return typeof v === "number"; });

    if (available.length > 0) {
      score.overall = Math.round(
        available.reduce(function (a, b) { return a + b; }, 0) / available.length
      );
    }
  }

  const sections = {};
  let anyMarkerFound = false;

  for (let i = 0; i < SECTION_KEYS.length; i++) {

    const key = SECTION_KEYS[i];
    const nextKey = SECTION_KEYS[i + 1];

    const startMarker = "###" + key + "###";
    const startIdx = rawText.indexOf(startMarker);

    if (startIdx === -1) {
      sections[key] = "";
      continue;
    }

    anyMarkerFound = true;

    const contentStart = startIdx + startMarker.length;

    let endIdx = rawText.length;

    // 🆕 Agla milne wala koi bhi marker dhoondo (sirf immediate
    // next nahi), taaki agar AI ne beech ka koi section skip kar
    // diya ho, tab bhi content sahi se cut ho
    for (let j = i + 1; j < SECTION_KEYS.length; j++) {

      const laterMarker = "###" + SECTION_KEYS[j] + "###";
      const laterIdx = rawText.indexOf(laterMarker, contentStart);

      if (laterIdx !== -1) {
        endIdx = laterIdx;
        break;
      }
    }

    sections[key] = rawText.slice(contentStart, endIdx).trim();
  }

  // 🆕 Agar AI ne bilkul bhi ###MARKER### format follow nahi kiya,
  // toh poora raw text hi "IDEA" section mein daal do — kam se
  // kam user ko kuch toh useful dikhega, khaali error nahi
  if (!anyMarkerFound) {

    // Score/marker lines hata ke saaf text banao
    const cleaned = rawText
      .replace(/SCORE_[A-Z]+\s*:?\s*\d{1,3}/g, "")
      .trim();

    sections.IDEA = cleaned || rawText.trim();
  }

  if (!sections.IDEA) {
    sections.IDEA = "Report generate hua hai, neeche sections dekhein.";
  }

  return { score, sections };
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

    if (
      url.pathname === "/api/generate-report" &&
      request.method === "POST"
    ) {

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

        let parsed = null;

        // 🆕 Retry up to 3 times — kabhi kabhi AI format follow
        // nahi karta, tab dobara try karte hain
        for (let attempt = 0; attempt < 3; attempt++) {

          try {

            const result = await env.AI.run(
              "@cf/meta/llama-3.1-8b-instruct",
              {
                messages: [{ role: "user", content: prompt }],
                max_tokens: 3200,
                temperature: 0.6
              }
            );

            const rawText = result?.response || "";
            parsed = parseReport(rawText);

            if (parsed) break;

          } catch (aiError) {

            console.error("AI attempt " + attempt + " failed:", aiError);
          }
        }

        if (!parsed) {

          // 🆕 200 status — handled/expected failure, retry
          // suggest karo, server crash nahi
          return Response.json(
            {
              success: false,
              error: "Report generate nahi ho paya, कृपया फिर से try करें।"
            },
            { status: 200, headers: corsHeaders }
          );
        }

        return Response.json(
          { success: true, report: parsed },
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

    // ------------------------------------
    // 🌐 WEBSITE FILES
    // ------------------------------------

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("IdeaForgeX Worker is running.", { status: 200 });
  }
};
