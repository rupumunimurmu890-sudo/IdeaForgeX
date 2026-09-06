// ========================================
// IdeaForgeX Worker v10.0 - The "AI Agent" Update
// ========================================

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS, GET", "Access-Control-Allow-Headers": "Content-Type, X-User-ID, X-User-Plan" };
const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const IMAGE_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const FREE_DAILY_LIMIT = 15;

async function checkAndIncrementUsage(env, userId, userPlan) {
  if (userPlan === "pro") return { allowed: true };
  if (!env.USAGE_KV) return { allowed: true };
  const today = new Date().toISOString().split('T')[0];
  const kvKey = `usage:${userId}:${today}`;
  try {
    let currentUsage = await env.USAGE_KV.get(kvKey);
    currentUsage = currentUsage ? parseInt(currentUsage, 10) : 0;
    if (currentUsage >= FREE_DAILY_LIMIT) return { allowed: false, limitReached: true, message: "Free limit khatam! Pro upgrade karein." };
    await env.USAGE_KV.put(kvKey, (currentUsage + 1).toString(), { expirationTtl: 86400 });
    return { allowed: true };
  } catch (error) { return { allowed: true }; }
}

// Helper to build brand context
function getBrandContext(opts) {
  if (opts.brand && opts.brand.name) return `\n[USER BRAND CONTEXT: Brand Name: "${opts.brand.name}", Industry: "${opts.brand.industry || 'General'}", Target Audience: "${opts.brand.audience || 'General'}". Please incorporate this brand identity naturally into your output.]\n`;
  return "";
}

function langLine(lang) {
  if (lang && lang !== "auto") return `CRITICAL: You MUST respond entirely in ${lang}. Do not use any other language.`;
  return `CRITICAL LANGUAGE DETECTION: Analyze the user's input text carefully. Identify the exact language and script they are using. You MUST respond 100% in that exact same language and script. NEVER switch to English unless the input is strictly in English.`;
}

// 🆕 AGENT PROMPT (The Core of Idea #1 & #10)
function buildAgentPrompt(input, lang) {
  return `You are an expert Business Agent and Startup Consultant. 
User Request: "${input}"
${langLine(lang)}

Your task is to generate a COMPLETE business starter pack. 
CRITICAL: You must respond with ONLY a valid JSON object. No markdown formatting like \`\`\`json, no explanations outside the JSON. 

The JSON must have these exact keys:
{
  "brand_name": "A catchy, unique name for the business",
  "tagline": "A short, punchy slogan (max 10 words)",
  "logo_prompt": "A detailed prompt to generate a logo for this brand using an AI image generator",
  "description": "A 2-sentence elevator pitch describing the business",
  "ad_copy": "A punchy advertisement text (3-4 lines)",
  "social_posts": ["Instagram caption 1", "Instagram caption 2", "Instagram caption 3"],
  "video_prompt": "A script/visual description for a 30-second promotional video",
  "marketing_plan": "A step-by-step 30-day launch plan (broken into weeks)"
}`;
}

// Helper to parse JSON safely from LLM
function parseAgentResponse(rawText) {
  try {
    // Remove markdown code blocks if present
    let cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Find the first '{' and last '}'
    const start = cleanText.indexOf('{');
    const end = cleanText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleanText = cleanText.substring(start, end + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
}

// Standard prompts for other tools (kept brief for space, logic remains same)
function buildReportPrompt(idea, lang, brand) { return `You are IdeaForgeX, an expert startup analyst. Idea: "${idea}". ${getBrandContext({brand})}${langLine(lang)}\nProduce a COMPLETE startup report in EXACTLY this format (no markdown, no extra text):\nSCORE_MARKET:<0-100>\nSCORE_COMPETITION:<0-100>\nSCORE_PROFIT:<0-100>\nSCORE_DIFFICULTY:<0-100>\nSCORE_OVERALL:<0-100>\n###IDEA###\n1-2 sentence restatement.\n###TARGET_CUSTOMERS###\nWho is this for?\n###CUSTOMER_PROBLEM###\nCore pain point.\n###REVENUE_MODEL###\nHow it makes money.\n###MARKET_ANALYSIS###\nMarket size/trends.\n###COMPETITOR_ANALYSIS###\n3-4 competitors & differentiation.\n###SWOT_STRENGTHS###\n3-4 points.\n###SWOT_WEAKNESSES###\n3-4 points.\n###SWOT_OPPORTUNITIES###\n3-4 points.\n###SWOT_THREATS###\n3-4 points.\n###MARKETING_STRATEGY###\n3-4 low-budget tactics.\n###STARTUP_COST###\nBudget breakdown in ₹.\n###ONE_YEAR_PROJECTION###\nRealistic 1-year narrative.\n###RISKS###\n3-4 key risks.\n###GROWTH_STRATEGY###\n3-4 scaling points.`; }
function buildToolPrompt(tool, input, opts) {
  const ll = opts.language && opts.language !== "auto" ? `Respond in ${opts.language}.` : "Respond in the user's language.";
  const brandCtx = getBrandContext(opts);
  if (tool === "writing") return `You are a writing assistant. Type: ${opts.writingType || "General"}, Tone: ${opts.tone || "Professional"}. ${brandCtx}${ll}\nWrite ONLY the finished piece for: ${input}`;
  if (tool === "translate") return `You are a translator. Translate from ${opts.fromLanguage || "auto"} to ${opts.toLanguage || "English"}. Preserve tone. Output ONLY translation.\nText: ${input}`;
  if (tool === "calculator") return `You are a calculator. Solve, show steps, end with "Answer: ".\nProblem: ${input}`;
  if (tool === "student") return `You are a student helper. Explain clearly.\nRequest: ${input}`;
  if (tool === "code") return `You are an expert software engineer. Write clean code in ${opts.codeLang || "Python"} for: ${input}. Wrap in markdown.`;
  if (tool === "logo") return `You are a brand designer. Logo concept for: "${input}". Style: ${opts.logoStyle || "Minimalist"}. Provide visual description, Hex colors, typography.`;
  if (tool === "social") return `You are a social media expert. Post for ${opts.platform || "Instagram"} about: "${input}".${brandCtx} Include hook, body, CTA, hashtags.`;
  if (tool === "auto") return `You are IdeaForge-AI. ${ll}\nSTEP 1: Output exactly one line: ROUTE: <category> (categories: writing, translate, calculator, student, code, logo, social, agent, assistant).\nSTEP 2: Give direct answer. Do not repeat ROUTE.\nUser's request: ${input}`;
  return `You are IdeaForge-AI. ${ll}${brandCtx}\nAnswer helpfully.\nRequest: ${input}`;
}

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    const userId = request.headers.get('X-User-ID') || 'anon_' + request.headers.get('CF-Connecting-IP');
    const userPlan = request.headers.get('X-User-Plan') || 'free';

    // 1. Standard Report
    if (url.pathname === "/api/generate-report" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildReportPrompt(body.idea, body.language, body.brand);
        let lastRaw = "", parsed = null;
        for (let i = 0; i < 3; i++) {
          try { const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 2048, temperature: 0.6 }); lastRaw = res?.response || ""; parsed = parseSections(lastRaw, ["IDEA", "TARGET_CUSTOMERS", "CUSTOMER_PROBLEM", "REVENUE_MODEL", "MARKET_ANALYSIS", "COMPETITOR_ANALYSIS", "SWOT_STRENGTHS", "SWOT_WEAKNESSES", "SWOT_OPPORTUNITIES", "SWOT_THREATS", "MARKETING_STRATEGY", "STARTUP_COST", "ONE_YEAR_PROJECTION", "RISKS", "GROWTH_STRATEGY"]); if (parsed) break; } catch(e){}
        }
        if (!parsed) return Response.json({ success: false, error: "Report generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, report: { score: extractScores(lastRaw), sections: parsed.sections } }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 2. AI Tool (Text)
    if (url.pathname === "/api/ai-tool" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildToolPrompt(body.tool, body.input, { language: body.language, writingType: body.writingType, tone: body.tone, fromLanguage: body.fromLanguage, toLanguage: body.toLanguage, codeLang: body.codeLang, logoStyle: body.logoStyle, platform: body.platform, brand: body.brand });
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

    //  3. THE AGENT ENDPOINT (One-Click Business Generator)
    if (url.pathname === "/api/agent-generate" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildAgentPrompt(body.input || "", body.language || "auto");
        
        let rawText = "";
        let success = false;
        for (let i = 0; i < 3; i++) {
          try {
            const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 4000, temperature: 0.7 });
            rawText = res?.response || "";
            const parsed = parseAgentResponse(rawText);
            if (parsed && parsed.brand_name) {
              return Response.json({ success: true, data: parsed }, { status: 200, headers: corsHeaders });
            }
          } catch(e) { console.error("Agent attempt failed:", e); }
        }
        return Response.json({ success: false, error: "Agent ne sahi JSON nahi banaya. Kripya phir try karein." }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("IdeaForgeX v10.0 Running 🚀", { status: 200, headers: corsHeaders });
  }
};
