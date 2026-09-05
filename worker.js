// ========================================
// IdeaForgeX Worker v3.0 - Real AI Image Generator
// ========================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, X-User-ID, X-User-Plan"
};

const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const IMAGE_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0"; // Real Image Model
const FREE_DAILY_LIMIT = 15;

// 🛡️ Usage Limit Checker
async function checkAndIncrementUsage(env, userId, userPlan) {
  if (userPlan === "pro") return { allowed: true };
  if (!env.USAGE_KV) return { allowed: true };

  const today = new Date().toISOString().split('T')[0];
  const kvKey = `usage:${userId}:${today}`;

  try {
    let currentUsage = await env.USAGE_KV.get(kvKey);
    currentUsage = currentUsage ? parseInt(currentUsage, 10) : 0;
    if (currentUsage >= FREE_DAILY_LIMIT) {
      return { allowed: false, limitReached: true, message: "Free limit khatam! Pro upgrade karein." };
    }
    await env.USAGE_KV.put(kvKey, (currentUsage + 1).toString(), { expirationTtl: 86400 });
    return { allowed: true };
  } catch (error) { return { allowed: true }; }
}

// Section markers
const REPORT_KEYS = ["IDEA", "TARGET_CUSTOMERS", "CUSTOMER_PROBLEM", "REVENUE_MODEL", "MARKET_ANALYSIS", "COMPETITOR_ANALYSIS", "SWOT_STRENGTHS", "SWOT_WEAKNESSES", "SWOT_OPPORTUNITIES", "SWOT_THREATS", "MARKETING_STRATEGY", "STARTUP_COST", "ONE_YEAR_PROJECTION", "RISKS", "GROWTH_STRATEGY"];
const LAUNCH_KEYS = ["BUDGET_BREAKDOWN", "PREPARATION", "PRODUCT_DEVELOPMENT", "BRANDING", "MARKETING_LAUNCH", "LAUNCH_WEEK", "PRODUCT_IDEAS", "PRICING", "EXPECTED_SALES"];
const PITCH_KEYS = ["PROBLEM", "SOLUTION", "MARKET", "PRODUCT", "BUSINESS_MODEL", "COMPETITION", "FINANCIALS", "GROWTH", "FUNDING_REQUIREMENT"];

function langLine(lang) { return lang && lang !== "auto" ? `Respond entirely in ${lang}.` : "Respond in the user's language."; }

// 📊 Prompts
function buildReportPrompt(idea, lang) {
  return `You are IdeaForgeX, an expert startup analyst. Idea: "${idea}". ${langLine(lang)}
Produce a COMPLETE startup report in EXACTLY this format (no markdown, no extra text):
SCORE_MARKET:<0-100>
SCORE_COMPETITION:<0-100>
SCORE_PROFIT:<0-100>
SCORE_DIFFICULTY:<0-100>
SCORE_OVERALL:<0-100>
###IDEA###\n1-2 sentence restatement.
###TARGET_CUSTOMERS###\nWho is this for?
###CUSTOMER_PROBLEM###\nCore pain point.
###REVENUE_MODEL###\nHow it makes money.
###MARKET_ANALYSIS###\nMarket size/trends.
###COMPETITOR_ANALYSIS###\n3-4 competitors & differentiation.
###SWOT_STRENGTHS###\n3-4 points.
###SWOT_WEAKNESSES###\n3-4 points.
###SWOT_OPPORTUNITIES###\n3-4 points.
###SWOT_THREATS###\n3-4 points.
###MARKETING_STRATEGY###\n3-4 low-budget tactics.
###STARTUP_COST###\nBudget breakdown in ₹.
###ONE_YEAR_PROJECTION###\nRealistic 1-year narrative.
###RISKS###\n3-4 key risks.
###GROWTH_STRATEGY###\n3-4 scaling points.`;
}

function buildLaunchPlanPrompt(idea, budget, lang) {
  return `You are IdeaForgeX, a launch strategist. Idea: "${idea}". Budget: ${budget || "Modest bootstrapped"}. ${langLine(lang)}
Produce a 30-day launch plan in EXACTLY this format:
###BUDGET_BREAKDOWN###\n4-6 bullet lines.
###PREPARATION###\nDay 1-7 tasks.
###PRODUCT_DEVELOPMENT###\nDay 8-15 tasks.
###BRANDING###\nDay 16-20 tasks.
###MARKETING_LAUNCH###\nDay 21-25 tasks.
###LAUNCH_WEEK###\nDay 26-30 tasks.
###PRODUCT_IDEAS###\n3-5 variations.
###PRICING###\n3-4 price points.
###EXPECTED_SALES###\n30-day sales narrative.`;
}

function buildPitchDeckPrompt(idea, lang) {
  return `You are IdeaForgeX, a pitch consultant. Idea: "${idea}". ${langLine(lang)}
Produce pitch deck content in EXACTLY this format (punchy bullets, no fluff):
###PROBLEM###\n2-3 bullets.
###SOLUTION###\n2-3 bullets.
###MARKET###\n2-3 bullets with size.
###PRODUCT###\n2-3 bullets.
###BUSINESS_MODEL###\n2-3 bullets.
###COMPETITION###\n2-3 bullets.
###FINANCIALS###\n2-3 bullets with numbers.
###GROWTH###\n2-3 bullets.
###FUNDING_REQUIREMENT###\n2-3 bullets with ₹ amount.`;
}

// 🆕 TOOLS PROMPTS
function buildToolPrompt(tool, input, opts) {
  const ll = opts.language && opts.language !== "auto" ? `Respond in ${opts.language}.` : "Respond in the user's language.";

  if (tool === "writing") return `You are a writing assistant. Type: ${opts.writingType || "General"}, Tone: ${opts.tone || "Professional"}. ${ll}\nWrite ONLY the finished piece for: ${input}`;
  if (tool === "translate") return `You are a translator. Translate from ${opts.fromLanguage || "auto"} to ${opts.toLanguage || "English"}. Output ONLY the translation.\nText: ${input}`;
  if (tool === "calculator") return `You are a calculator. Solve this, show steps, end with "Answer: ".\nProblem: ${input}`;
  if (tool === "student") return `You are a student helper. Explain clearly.\nRequest: ${input}`;
  if (tool === "code") return `You are an expert software engineer. Write clean, efficient code in ${opts.codeLang || "Python"} for: ${input}. Wrap in markdown blocks.`;
  if (tool === "logo") return `You are a brand designer. Create a logo concept for: "${input}". Style: ${opts.logoStyle || "Minimalist"}. Provide visual description, Hex colors, and typography.`;
  if (tool === "social") return `You are a social media expert. Create an engaging post for ${opts.platform || "Instagram"} about: "${input}". Include hook, body, CTA, and hashtags.`;

  if (tool === "auto") {
    return `You are IdeaForge-AI. ${ll}
STEP 1: Output exactly one line: ROUTE: <category> (categories: writing, translate, calculator, student, code, logo, social, assistant).
STEP 2: Give a direct answer. Do not repeat ROUTE line.
User's request: ${input}`;
  }
  return `You are IdeaForge-AI. ${ll}\nAnswer helpfully.\nRequest: ${input}`;
}

// Parser & Helpers
function parseSections(rawText, sectionKeys) {
  if (!rawText || rawText.trim().length < 20) return null;
  const sections = {}; let anyMarkerFound = false;
  for (let i = 0; i < sectionKeys.length; i++) {
    const key = sectionKeys[i], startMarker = "###" + key + "###", startIdx = rawText.indexOf(startMarker);
    if (startIdx === -1) { sections[key] = ""; continue; }
    anyMarkerFound = true;
    const contentStart = startIdx + startMarker.length; let endIdx = rawText.length;
    for (let j = i + 1; j < sectionKeys.length; j++) {
      const laterIdx = rawText.indexOf("###" + sectionKeys[j] + "###", contentStart);
      if (laterIdx !== -1) { endIdx = laterIdx; break; }
    }
    sections[key] = rawText.slice(contentStart, endIdx).trim();
  }
  if (!anyMarkerFound) sections[sectionKeys[0]] = rawText.replace(/SCORE_[A-Z]+\s*:?\s*\d{1,3}/g, "").trim();
  return { sections, anyMarkerFound };
}

async function generateSectioned(env, prompt, sectionKeys, maxTokens) {
  let parsed = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens || 2048, temperature: 0.6 });
      parsed = parseSections(result?.response || "", sectionKeys);
      if (parsed) break;
    } catch (e) { console.error("AI attempt failed:", e); }
  }
  return parsed;
}

function extractScores(rawText) {
  const match = (key) => { const m = rawText.match(new RegExp(key + "\\s*:?\\s*(\\d{1,3})")); return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null; };
  const score = { market: match("SCORE_MARKET"), competition: match("SCORE_COMPETITION"), profit: match("SCORE_PROFIT"), difficulty: match("SCORE_DIFFICULTY"), overall: match("SCORE_OVERALL") };
  if (score.overall === null) {
    const avail = [score.market, score.competition, score.profit, score.difficulty].filter(v => typeof v === "number");
    if (avail.length > 0) score.overall = Math.round(avail.reduce((a, b) => a + b, 0) / avail.length);
  }
  return score;
}

// MAIN FETCH HANDLER
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const userId = request.headers.get('X-User-ID') || 'anon_' + request.headers.get('CF-Connecting-IP');
    const userPlan = request.headers.get('X-User-Plan') || 'free';

    // 1. Report
    if (url.pathname === "/api/generate-report" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildReportPrompt(body.idea, body.language);
        let lastRaw = "", parsed = null;
        for (let i = 0; i < 3; i++) {
          try { const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 2048, temperature: 0.6 }); lastRaw = res?.response || ""; parsed = parseSections(lastRaw, REPORT_KEYS); if (parsed) break; } catch(e){}
        }
        if (!parsed) return Response.json({ success: false, error: "Report generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, report: { score: extractScores(lastRaw), sections: parsed.sections } }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 2. Launch Plan
    if (url.pathname === "/api/generate-launch-plan" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildLaunchPlanPrompt(body.idea, body.budget, body.language), LAUNCH_KEYS, 2048);
        if (!parsed) return Response.json({ success: false, error: "Plan generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, plan: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 3. Pitch Deck
    if (url.pathname === "/api/generate-pitch-deck" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildPitchDeckPrompt(body.idea, body.language), PITCH_KEYS, 2048);
        if (!parsed) return Response.json({ success: false, error: "Deck generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, deck: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 4. AI Tools (Text)
    if (url.pathname === "/api/ai-tool" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildToolPrompt(body.tool, body.input, { 
          language: body.language, writingType: body.writingType, tone: body.tone, 
          fromLanguage: body.fromLanguage, toLanguage: body.toLanguage,
          codeLang: body.codeLang, logoStyle: body.logoStyle, platform: body.platform 
        });
        let resultText = "";
        for (let i = 0; i < 3; i++) {
          try { const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 1500, temperature: body.tool === "calculator" ? 0.2 : 0.7 }); resultText = (res?.response || "").trim(); if (resultText.length > 3) break; } catch(e){}
        }
        if (!resultText) return Response.json({ success: false, error: "Result nahi aaya." }, { status: 200, headers: corsHeaders });
        
        let detectedRoute = null;
        if (body.tool === "auto") {
          const m = resultText.match(/^ROUTE:\s*(\w+)\s*\n/i);
          if (m) { detectedRoute = m[1].toLowerCase(); resultText = resultText.slice(m[0].length).trim(); }
        }
        return Response.json({ success: true, result: resultText, route: detectedRoute }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 🆕 5. REAL AI IMAGE GENERATOR
    if (url.pathname === "/api/generate-image" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      
      try {
        const body = await request.json();
        let prompt = body.prompt || "";
        const style = body.style || "Photorealistic";
        
        // Enhance prompt with style
        if (style !== "None") {
          prompt = `${prompt}, ${style} style, high quality, 8k resolution, highly detailed`;
        }

        // Run Stable Diffusion Model
        const imageResponse = await env.AI.run(IMAGE_MODEL, { prompt });
        
        // Convert ArrayBuffer to Base64
        const uint8Array = new Uint8Array(imageResponse);
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Image = btoa(binary);

        return Response.json({ success: true, image: `data:image/png;base64,${base64Image}` }, { status: 200, headers: corsHeaders });
      } catch (e) {
        console.error("Image generation error:", e);
        return Response.json({ success: false, error: "Image generate nahi ho payi. " + e.message }, { status: 200, headers: corsHeaders });
      }
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("IdeaForgeX v3.0 Running 🚀", { status: 200, headers: corsHeaders });
  }
};
