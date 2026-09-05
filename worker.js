// ========================================
// IdeaForgeX Worker — AI Startup Idea Generator & Multi-Tool Hub
// Powered by Cloudflare Workers AI + KV (Usage Tracking)
// ========================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, X-User-ID, X-User-Plan"
};

const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const AI_VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

const FREE_DAILY_LIMIT = 15;

// ------------------------------------
// 🛡️ PHASE 6: Usage Limit & Pro Tier Checker
// ------------------------------------
async function checkAndIncrementUsage(env, userId, userPlan) {
  // Pro users skip all limits
  if (userPlan === "pro") {
    return { allowed: true };
  }

  // Fallback if KV is not bound yet (prevents crashes during local dev)
  if (!env.USAGE_KV) {
    console.warn("USAGE_KV not bound. Allowing request, but usage won't be tracked.");
    return { allowed: true };
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const kvKey = `usage:${userId}:${today}`;

  try {
    let currentUsage = await env.USAGE_KV.get(kvKey);
    currentUsage = currentUsage ? parseInt(currentUsage, 10) : 0;

    if (currentUsage >= FREE_DAILY_LIMIT) {
      return { 
        allowed: false, 
        limitReached: true,
        message: `Aaj ki free limit (${FREE_DAILY_LIMIT}) khatam ho gayi. Unlimited access ke liye Pro upgrade karein!`
      };
    }

    // Increment usage and set 24-hour TTL (86400 seconds)
    await env.USAGE_KV.put(kvKey, (currentUsage + 1).toString(), { expirationTtl: 86400 });
    return { allowed: true };
  } catch (error) {
    console.error("KV Usage check error:", error);
    // Fail open: allow request if KV temporarily fails, but log it
    return { allowed: true };
  }
}

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
  "BUDGET_BREAKDOWN", "PREPARATION", "PRODUCT_DEVELOPMENT",
  "BRANDING", "MARKETING_LAUNCH", "LAUNCH_WEEK",
  "PRODUCT_IDEAS", "PRICING", "EXPECTED_SALES"
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
  return `You are IdeaForgeX, an expert startup analyst and business consultant AI.
A user has described a business idea: "${idea}"
${languageLine(language)}
Analyze this idea and produce a COMPLETE startup report in EXACTLY the format below. Do not add any extra commentary, headers, markdown symbols (no **, no #), or explanation outside this format. Use plain text only, with short paragraphs or bullet lines (using "- ") where listed.

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
3-4 bullet lines, each naming a type of existing competitor/alternative, their strength, their weakness, and how this idea can differentiate.
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
An estimated starting budget range (in Indian Rupees ₹ unless the idea clearly targets another country) with a short breakdown, 3-4 bullet lines.
###ONE_YEAR_PROJECTION###
A realistic 1-year revenue/growth projection narrative (3-4 sentences).
###RISKS###
3-4 bullet lines of key risks.
###GROWTH_STRATEGY###
3-4 bullet lines on how to scale after initial traction.

Be specific to the idea given — never generic or vague. Keep the tone practical and encouraging but honest about real risks.`;
}

// ------------------------------------
// 🚀 LAUNCH PLAN prompt
// ------------------------------------
function buildLaunchPlanPrompt(idea, budget, language) {
  const budgetLine = budget
    ? `The user's available starting budget is: ${budget}.`
    : "The user did not specify a budget — assume a modest, realistic bootstrapped budget appropriate for this idea.";

  return `You are IdeaForgeX, an expert startup launch strategist.
A user wants an actionable 30-day launch plan for this business idea: "${idea}"
${budgetLine}
${languageLine(language)}
Produce a COMPLETE 30-day launch plan in EXACTLY the format below. No extra commentary, no markdown symbols. Plain text only, with bullet lines (using "- ") where listed.

###BUDGET_BREAKDOWN###
4-6 bullet lines breaking the budget down into concrete categories with approximate amounts.
###PREPARATION###
Day 1-7: 3-5 bullet lines of concrete preparation tasks.
###PRODUCT_DEVELOPMENT###
Day 8-15: 3-5 bullet lines on building/preparing the actual product or service.
###BRANDING###
Day 16-20: 3-5 bullet lines on naming, logo, packaging, online presence basics.
###MARKETING_LAUNCH###
Day 21-25: 3-5 bullet lines of specific, low-budget marketing actions.
###LAUNCH_WEEK###
Day 26-30: 3-5 bullet lines on the actual launch.
###PRODUCT_IDEAS###
3-5 bullet lines of specific product/service variations or add-ons.
###PRICING###
3-4 bullet lines with concrete suggested price points or pricing strategy.
###EXPECTED_SALES###
A realistic narrative estimating expected sales/revenue in the first 30 days.

Be specific and numeric wherever possible.`;
}

// ------------------------------------
// 🎤 INVESTOR PITCH DECK prompt
// ------------------------------------
function buildPitchDeckPrompt(idea, language) {
  return `You are IdeaForgeX, an expert startup pitch consultant.
Create investor pitch deck content for this business idea: "${idea}"
${languageLine(language)}
Produce COMPLETE pitch deck content in EXACTLY the format below, as if each section were one slide. No extra commentary, no markdown symbols. Plain text only, with short punchy bullet lines.

###PROBLEM###
2-3 bullet lines stating the problem clearly.
###SOLUTION###
2-3 bullet lines on how this idea solves it.
###MARKET###
2-3 bullet lines on market size and opportunity.
###PRODUCT###
2-3 bullet lines describing the product/service.
###BUSINESS_MODEL###
2-3 bullet lines on how this makes money.
###COMPETITION###
2-3 bullet lines naming competitor types and this idea's edge.
###FINANCIALS###
2-3 bullet lines with rough projected numbers.
###GROWTH###
2-3 bullet lines on the growth/scaling plan.
###FUNDING_REQUIREMENT###
2-3 bullet lines: how much funding this idea would realistically need.

Keep every line punchy and investor-ready.`;
}

// ------------------------------------
// 📄 Generic lenient section parser
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
    const cleaned = rawText.replace(/SCORE_[A-Z]+\s*:?\s*\d{1,3}/g, "").trim();
    sections[sectionKeys[0]] = cleaned || rawText.trim();
  }

  return { sections, anyMarkerFound };
}

// ------------------------------------
// 🤖 Generic AI call with retry
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
    const available = [score.market, score.competition, score.profit, score.difficulty].filter(v => typeof v === "number");
    if (available.length > 0) {
      score.overall = Math.round(available.reduce((a, b) => a + b, 0) / available.length);
    }
  }
  return score;
}

// ------------------------------------
// 🤖 IdeaForge-AI hub tools prompt builder (Includes Smart Router)
// ------------------------------------
function buildToolPrompt(tool, input, opts) {
  const langLine = opts.language && opts.language !== "auto"
    ? `Respond in ${opts.language}.`
    : "Respond in the same language the user wrote in.";

  if (tool === "writing") {
    return `You are IdeaForge-AI's writing assistant.
Type of writing: ${opts.writingType || "General"}. Tone: ${opts.tone || "Professional"}.
${langLine}
Write the following based on the user's request. Output ONLY the finished piece of writing.
User's request: ${input}`;
  }

  if (tool === "translate") {
    return `You are IdeaForge-AI's translator.
Translate the following text from ${opts.fromLanguage || "auto"} to ${opts.toLanguage || "English"}.
Keep the meaning and tone natural. Output ONLY the translated text.
Text: ${input}`;
  }

  if (tool === "calculator") {
    return `You are IdeaForge-AI's calculator assistant.
Carefully calculate the answer to this, showing the calculation briefly, then the final answer clearly on its own line at the end prefixed with "Answer: ".
${langLine}
Problem: ${input}`;
  }

  if (tool === "student") {
    return `You are IdeaForge-AI's student helper — focused on helping the user actually understand a topic.
${langLine}
Give a clear, well-structured explanation/answer for the following academic request.
Request: ${input}`;
  }

  if (tool === "auto") {
    // 🆕 PHASE 7: Backend Smart Router Fallback
    return `You are IdeaForge-AI, a helpful multilingual AI assistant.
${langLine}
STEP 1: First, output exactly one line identifying which category this request best fits, in this exact format (nothing else on that line):
ROUTE: <category>
Where <category> is one of: writing, translate, calculator, student, assistant

STEP 2: Then, on the next lines, give a direct, well-formatted, useful answer to the user's request based on that category. Do not repeat the ROUTE line again.
User's request: ${input}`;
  }

  // Default assistant
  return `You are IdeaForge-AI, a helpful multilingual AI assistant.
${langLine}
Understand what the user is asking for and give a direct, well formatted, useful answer.
User's request: ${input}`;
}

// ========================================
// 🌐 MAIN WORKER FETCH HANDLER
// ========================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Extract User Identity & Plan from headers
    const userId = request.headers.get('X-User-ID') || 'anonymous_' + request.headers.get('CF-Connecting-IP') || 'anon';
    const userPlan = request.headers.get('X-User-Plan') || 'free';

    // ------------------------------------
    // 📊 GENERATE COMPLETE STARTUP REPORT
    // ------------------------------------
    if (url.pathname === "/api/generate-report" && request.method === "POST") {
      const usageCheck = await checkAndIncrementUsage(env, userId, userPlan);
      if (!usageCheck.allowed) {
        return Response.json({ success: false, error: usageCheck.message, limitReached: true }, { status: 429, headers: corsHeaders });
      }

      try {
        const body = await request.json();
        const idea = (body.idea || "").trim();
        const language = body.language || "auto";

        if (!idea || idea.length > 2000) {
          return Response.json({ success: false, error: "Idea description is invalid or too long." }, { status: 400, headers: corsHeaders });
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
          return Response.json({ success: false, error: "Report generate nahi ho paya, कृपया फिर से try करें।" }, { status: 200, headers: corsHeaders });
        }

        const score = extractScores(lastRawForScore);
        if (!parsed.sections.IDEA) parsed.sections.IDEA = "Report generate hua hai, neeche sections dekhein.";

        return Response.json({ success: true, report: { score, sections: parsed.sections } }, { status: 200, headers: corsHeaders });
      } catch (error) {
        console.error("Report generation error:", error);
        return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders });
      }
    }

    // ------------------------------------
    // 🚀 GENERATE LAUNCH PLAN
    // ------------------------------------
    if (url.pathname === "/api/generate-launch-plan" && request.method === "POST") {
      const usageCheck = await checkAndIncrementUsage(env, userId, userPlan);
      if (!usageCheck.allowed) {
        return Response.json({ success: false, error: usageCheck.message, limitReached: true }, { status: 429, headers: corsHeaders });
      }

      try {
        const body = await request.json();
        const idea = (body.idea || "").trim();
        const budget = (body.budget || "").trim();
        const language = body.language || "auto";

        if (!idea) {
          return Response.json({ success: false, error: "Please describe your idea first." }, { status: 400, headers: corsHeaders });
        }

        const prompt = buildLaunchPlanPrompt(idea, budget, language);
        const parsed = await generateSectioned(env, prompt, LAUNCH_PLAN_SECTION_KEYS, 2048);

        if (!parsed) {
          return Response.json({ success: false, error: "Launch plan generate nahi ho paya." }, { status: 200, headers: corsHeaders });
        }

        return Response.json({ success: true, plan: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (error) {
        console.error("Launch plan generation error:", error);
        return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders });
      }
    }

    // ------------------------------------
    // 🎤 GENERATE INVESTOR PITCH DECK
    // ------------------------------------
    if (url.pathname === "/api/generate-pitch-deck" && request.method === "POST") {
      const usageCheck = await checkAndIncrementUsage(env, userId, userPlan);
      if (!usageCheck.allowed) {
        return Response.json({ success: false, error: usageCheck.message, limitReached: true }, { status: 429, headers: corsHeaders });
      }

      try {
        const body = await request.json();
        const idea = (body.idea || "").trim();
        const language = body.language || "auto";

        if (!idea) {
          return Response.json({ success: false, error: "Please describe your idea first." }, { status: 400, headers: corsHeaders });
        }

        const prompt = buildPitchDeckPrompt(idea, language);
        const parsed = await generateSectioned(env, prompt, PITCH_DECK_SECTION_KEYS, 2048);

        if (!parsed) {
          return Response.json({ success: false, error: "Pitch deck generate nahi ho paya." }, { status: 200, headers: corsHeaders });
        }

        return Response.json({ success: true, deck: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (error) {
        console.error("Pitch deck generation error:", error);
        return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders });
      }
    }

    // ------------------------------------
    // 🤖 AI TOOL — Assistant / Writing / Translate / Calculator / Student
    // ------------------------------------
    if (url.pathname === "/api/ai-tool" && request.method === "POST") {
      const usageCheck = await checkAndIncrementUsage(env, userId, userPlan);
      if (!usageCheck.allowed) {
        return Response.json({ success: false, error: usageCheck.message, limitReached: true }, { status: 429, headers: corsHeaders });
      }

      try {
        const body = await request.json();
        const tool = body.tool || "auto";
        const input = (body.input || "").trim();
        const language = body.language || "auto";
        const writingType = body.writingType || "";
        const tone = body.tone || "";
        const fromLanguage = body.fromLanguage || "auto";
        const toLanguage = body.toLanguage || "English";

        if (!input || input.length > 3000) {
          return Response.json({ success: false, error: "Input is invalid or too long." }, { status: 400, headers: corsHeaders });
        }

        const prompt = buildToolPrompt(tool, input, { language, writingType, tone, fromLanguage, toLanguage });
        let resultText = "";

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await env.AI.run(AI_MODEL, {
              messages: [{ role: "user", content: prompt }],
              max_tokens: 1200,
              temperature: tool === "calculator" ? 0.2 : 0.7
            });
            resultText = (result?.response || "").trim();
            if (resultText.length > 3) break;
          } catch (aiError) {
            console.error("AI tool attempt " + attempt + " failed:", aiError);
          }
        }

        if (!resultText) {
          return Response.json({ success: false, error: "Result generate nahi ho paya." }, { status: 200, headers: corsHeaders });
        }

        // 🆕 PHASE 7: Extract ROUTE from backend if tool was "auto"
        let detectedRoute = null;
        if (tool === "auto") {
          const routeMatch = resultText.match(/^ROUTE:\s*(\w+)\s*\n/i);
          if (routeMatch) {
            detectedRoute = routeMatch[1].toLowerCase();
            resultText = resultText.slice(routeMatch[0].length).trim();
          }
        }

        return Response.json({ success: true, result: resultText, route: detectedRoute }, { status: 200, headers: corsHeaders });
      } catch (error) {
        console.error("AI tool error:", error);
        return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders });
      }
    }

    // ------------------------------------
    // 📸 IMAGE TOOLS — describe / extract text / ask
    // ------------------------------------
    if (url.pathname === "/api/image-tool" && request.method === "POST") {
      const usageCheck = await checkAndIncrementUsage(env, userId, userPlan);
      if (!usageCheck.allowed) {
        return Response.json({ success: false, error: usageCheck.message, limitReached: true }, { status: 429, headers: corsHeaders });
      }

      try {
        const body = await request.json();
        const imageBase64 = body.imageBase64 || "";
        const action = body.action || "describe";
        const question = (body.question || "").trim();
        const language = body.language || "auto";

        if (!imageBase64) {
          return Response.json({ success: false, error: "Please upload a photo first." }, { status: 400, headers: corsHeaders });
        }

        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        let imageBytes;
        try {
          const binaryString = atob(base64Data);
          imageBytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            imageBytes[i] = binaryString.charCodeAt(i);
          }
        } catch (decodeError) {
          return Response.json({ success: false, error: "Photo read nahi ho payi." }, { status: 400, headers: corsHeaders });
        }

        const langLine = language && language !== "auto" ? `Respond in ${language}.` : "Respond in English unless the image contains text in another language.";
        
        let visionPrompt = "";
        if (action === "extract-text") {
          visionPrompt = "Read and transcribe ALL text visible in this image exactly as it appears. If there is no text, say so clearly.";
        } else if (action === "ask" && question) {
          visionPrompt = `Look at this image and answer this question about it: "${question}". ${langLine}`;
        } else {
          visionPrompt = `Describe this image in detail — what it shows, notable objects, people, setting, and mood. ${langLine}`;
        }

        let resultText = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await env.AI.run(AI_VISION_MODEL, {
              image: Array.from(imageBytes),
              prompt: visionPrompt,
              max_tokens: 1024
            });
            resultText = (result?.description || result?.response || "").trim();
            if (resultText.length > 2) break;
          } catch (aiError) {
            console.error("Image tool attempt " + attempt + " failed:", aiError);
          }
        }

        if (!resultText) {
          return Response.json({ success: false, error: "Image analyze nahi ho payi." }, { status: 200, headers: corsHeaders });
        }

        return Response.json({ success: true, result: resultText }, { status: 200, headers: corsHeaders });
      } catch (error) {
        console.error("Image tool error:", error);
        return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders });
      }
    }

    // ------------------------------------
    // 🌐 WEBSITE FILES (Assets)
    // ------------------------------------
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("IdeaForgeX Worker is running. 🚀", { status: 200, headers: corsHeaders });
  }
};
