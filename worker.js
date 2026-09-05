// ========================================
// IdeaForgeX Worker v7.0 - Phase 4: Smart Context & Viral Tools
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

const REPORT_KEYS = ["IDEA", "TARGET_CUSTOMERS", "CUSTOMER_PROBLEM", "REVENUE_MODEL", "MARKET_ANALYSIS", "COMPETITOR_ANALYSIS", "SWOT_STRENGTHS", "SWOT_WEAKNESSES", "SWOT_OPPORTUNITIES", "SWOT_THREATS", "MARKETING_STRATEGY", "STARTUP_COST", "ONE_YEAR_PROJECTION", "RISKS", "GROWTH_STRATEGY"];
const LAUNCH_KEYS = ["BUDGET_BREAKDOWN", "PREPARATION", "PRODUCT_DEVELOPMENT", "BRANDING", "MARKETING_LAUNCH", "LAUNCH_WEEK", "PRODUCT_IDEAS", "PRICING", "EXPECTED_SALES"];
const PITCH_KEYS = ["PROBLEM", "SOLUTION", "MARKET", "PRODUCT", "BUSINESS_MODEL", "COMPETITION", "FINANCIALS", "GROWTH", "FUNDING_REQUIREMENT"];

function langLine(lang) { return lang && lang !== "auto" ? `Respond entirely in ${lang}.` : "Respond in the user's language."; }

// Helper to build brand context string
function getBrandContext(opts) {
  if (opts.brand && opts.brand.name) {
    return `\n[USER BRAND CONTEXT: Brand Name: "${opts.brand.name}", Industry: "${opts.brand.industry || 'General'}", Target Audience: "${opts.brand.audience || 'General'}". Please incorporate this brand identity naturally into your output.]\n`;
  }
  return "";
}

function buildReportPrompt(idea, lang, brand) { return `You are IdeaForgeX, an expert startup analyst. Idea: "${idea}". ${getBrandContext({brand})}${langLine(lang)}\nProduce a COMPLETE startup report in EXACTLY this format (no markdown, no extra text):\nSCORE_MARKET:<0-100>\nSCORE_COMPETITION:<0-100>\nSCORE_PROFIT:<0-100>\nSCORE_DIFFICULTY:<0-100>\nSCORE_OVERALL:<0-100>\n###IDEA###\n1-2 sentence restatement.\n###TARGET_CUSTOMERS###\nWho is this for?\n###CUSTOMER_PROBLEM###\nCore pain point.\n###REVENUE_MODEL###\nHow it makes money.\n###MARKET_ANALYSIS###\nMarket size/trends.\n###COMPETITOR_ANALYSIS###\n3-4 competitors & differentiation.\n###SWOT_STRENGTHS###\n3-4 points.\n###SWOT_WEAKNESSES###\n3-4 points.\n###SWOT_OPPORTUNITIES###\n3-4 points.\n###SWOT_THREATS###\n3-4 points.\n###MARKETING_STRATEGY###\n3-4 low-budget tactics.\n###STARTUP_COST###\nBudget breakdown in ₹.\n###ONE_YEAR_PROJECTION###\nRealistic 1-year narrative.\n###RISKS###\n3-4 key risks.\n###GROWTH_STRATEGY###\n3-4 scaling points.`; }
function buildLaunchPlanPrompt(idea, budget, lang, brand) { return `You are IdeaForgeX, a launch strategist. Idea: "${idea}". Budget: ${budget || "Modest bootstrapped"}. ${getBrandContext({brand})}${langLine(lang)}\nProduce a 30-day launch plan in EXACTLY this format:\n###BUDGET_BREAKDOWN###\n4-6 bullet lines.\n###PREPARATION###\nDay 1-7 tasks.\n###PRODUCT_DEVELOPMENT###\nDay 8-15 tasks.\n###BRANDING###\nDay 16-20 tasks.\n###MARKETING_LAUNCH###\nDay 21-25 tasks.\n###LAUNCH_WEEK###\nDay 26-30 tasks.\n###PRODUCT_IDEAS###\n3-5 variations.\n###PRICING###\n3-4 price points.\n###EXPECTED_SALES###\n30-day sales narrative.`; }
function buildPitchDeckPrompt(idea, lang, brand) { return `You are IdeaForgeX, a pitch consultant. Idea: "${idea}". ${getBrandContext({brand})}${langLine(lang)}\nProduce pitch deck content in EXACTLY this format (punchy bullets, no fluff):\n###PROBLEM###\n2-3 bullets.\n###SOLUTION###\n2-3 bullets.\n###MARKET###\n2-3 bullets with size.\n###PRODUCT###\n2-3 bullets.\n###BUSINESS_MODEL###\n2-3 bullets.\n###COMPETITION###\n2-3 bullets.\n###FINANCIALS###\n2-3 bullets with numbers.\n###GROWTH###\n2-3 bullets.\n###FUNDING_REQUIREMENT###\n2-3 bullets with ₹ amount.`; }

function buildAutopilotPrompt(input, brand) { return `You are an AI marketing autopilot. User request: "${input}"${getBrandContext({brand})}\nGenerate a COMPLETE marketing package:\n###AD_COPY###\nShort, punchy advertisement copy (2-3 lines)\n###INSTAGRAM_CAPTION###\nEngaging Instagram caption with emojis (3-4 lines)\n###FACEBOOK_POST###\nDetailed Facebook post (4-5 lines)\n###WHATSAPP_MESSAGE###\nCasual WhatsApp message for sharing (2-3 lines)\n###POSTER_TEXT###\nHeadline and subheadline for a poster\n###IMAGE_PROMPT###\nDetailed prompt to generate a marketing image\n###VIDEO_PROMPT###\nScript/prompt for a short marketing video\n###HASHTAGS###\n10-15 relevant hashtags\nRespond in the same language as the user.`; }
function buildGoalPlanPrompt(goal, timeframe, brand) { return `You are an expert life and business coach. \nUser Goal: "${goal}"\nTimeframe: ${timeframe}${getBrandContext({brand})}\n${langLine("auto")}\nCreate a highly actionable, step-by-step roadmap.\nFormat exactly like this:\n###OVERVIEW###\n2-3 sentence summary.\n###MILESTONES###\nBreak into clear milestones.\n###ACTION_PLAN###\nSpecific weekly tasks.\n###RESOURCES_NEEDED###\nTools, skills, or money needed.\n###POTENTIAL_OBSTACLES###\n3 things that might go wrong.\nBe practical and realistic.`; }
function buildMoneyCalcPrompt(business, investment, type, brand) { return `You are an expert financial analyst.\nBusiness Idea: "${business}"\nInitial Investment: ${investment}\nBusiness Type: ${type}${getBrandContext({brand})}\n${langLine("auto")}\nCalculate realistic financial projection. Format:\n###INVESTMENT_BREAKDOWN###\nHow to spend the investment.\n###MONTHLY_EXPENSES###\nRecurring monthly costs.\n###REVENUE_MODEL###\nHow it makes money.\n###PROFIT_PROJECTION###\nExpected monthly profit for 6 months.\n###BREAK_EVEN###\nWhen it recovers investment.\n###RISKS###\nFinancial risks.\nUse Indian Rupees ().`; }
function buildImproveIdeaPrompt(idea, brand) { return `You are a brutally honest but constructive startup mentor.\nUser Idea: "${idea}"${getBrandContext({brand})}\n${langLine("auto")}\nAnalyze and provide honest feedback. Format:\n###VERDICT###\nRating out of 10 and 1-sentence summary.\n###WHAT_WORKS###\n3 strong points.\n###WHAT_IS_MISSING###\n3 weaknesses.\n###PRICING_STRATEGY###\nSpecific price ranges.\n###TARGET_AUDIENCE###\nWho will buy this?\n###IMMEDIATE_NEXT_STEPS###\n3 things to do right now.\nBe direct and practical.`; }

//  Phase 4: Roast Prompt
function buildRoastPrompt(idea, brand) { 
  return `You are a strict, no-nonsense Shark Tank investor (like a tough judge). \nUser Idea: "${idea}"${getBrandContext({brand})}\n${langLine("auto")}\nAnalyze this idea brutally but fairly. Format exactly like this:\n###SHARK_SCORE###\nGive a score out of 10 (just the number).\n###THE_GOOD###\n2 things that actually work.\n###THE_ROAST###\nBrutal truth: Why this idea might fail (be sharp and direct).\n###THE_FIX###\nHow to make it investable (2-3 actionable steps).\n###FINAL_VERDICT###\n"Deal" or "No Deal" and a 1-sentence closing remark.\nBe professional but sharp. Do not hold back.`; 
}

function buildPosterPrompt(topic, brand) { return `You are an expert graphic designer and copywriter.\nTopic: "${topic}"${getBrandContext({brand})}\n${langLine("auto")}\nCreate content for a beautiful social media poster. Format:\n###HEADLINE###\nShort, punchy headline (max 6 words).\n###SUBHEADLINE###\nCompelling subheadline (max 12 words).\n###BODY###\nBrief body text (2-3 short lines).\n###FOOTER###\nStrong CTA (max 10 words).\nKeep it concise and impactful.`; }

function buildVideoPrompt(topic, platform, brand) { return `You are an expert video scriptwriter.\nTopic: "${topic}"\nPlatform: ${platform}${getBrandContext({brand})}\n${langLine("auto")}\nWrite a professional video script. Format:\n###TITLE###\nCatchy video title.\n###HOOK###\nFirst 3 seconds attention grabber.\n###INTRO###\nBrief introduction (5-10 seconds).\n###BODY###\nMain content in 3 scenes (Visual + Audio for each).\n###CTA###\nStrong Call to Action.\n###HASHTAGS###\n5 relevant hashtags.\nTailor pacing for ${platform}.`; }

function buildWorkflowPrompt(topic, type, brand) { 
  let instructions = "";
  if (type === "startup-launch") instructions = "Generate: 1. 3-sentence Executive Summary. 2. Instagram Social Pack. 3. 30-second Video Ad Script.";
  else if (type === "content-creator") instructions = "Generate: 1. 5 Viral Video Ideas. 2. Detailed Script for best idea. 3. Social Media Announcement Post.";
  else instructions = "Generate: 1. Catchy Product Tagline. 2. Facebook/Instagram Ad Copy. 3. WhatsApp Broadcast Message.";
  return `You are an AI automation expert.\nTopic: "${topic}"\nWorkflow Type: ${type}${getBrandContext({brand})}\n${langLine("auto")}\n${instructions}\nFormat:\n###PART_1###\n[Content]\n###PART_2###\n[Content]\n###PART_3###\n[Content]\nBe comprehensive.`; 
}

function buildRemixPrompt(text, style, brand) { return `You are a content remixer. Original text: "${text}"${getBrandContext({brand})}\nRemix style: "${style}"\nRewrite in specified style keeping core message. Output ONLY remixed content.`; }
function buildSocialPackPrompt(content, brand) { return `You are a social media expert. Content: "${content}"${getBrandContext({brand})}\nGenerate social pack:\n###INSTAGRAM###\nCaption with emojis.\n###FACEBOOK###\nDetailed post.\n###WHATSAPP###\nShort status.\n###YOUTUBE_TITLE###\nCatchy title.\n###YOUTUBE_DESCRIPTION###\nDescription.\n###SHORTS_CAPTION###\nShort caption.\n###HASHTAGS###\n15 hashtags.\n###THUMBNAIL_PROMPT###\nThumbnail prompt.`; }
function buildDocumentPrompt(text) { return `You are a document AI assistant. Analyze: "${text}"\nProvide:\n###SUMMARY###\n3-5 sentence summary.\n###KEY_POINTS###\n5-7 bullet points.\n###QUESTIONS_ANSWERS###\n3 Q&A.\n###SIMPLE_EXPLANATION###\nSimple terms.\n###MCQS###\n5 MCQs with answers.`; }

function buildToolPrompt(tool, input, opts) {
  const ll = opts.language && opts.language !== "auto" ? `Respond in ${opts.language}.` : "Respond in the user's language.";
  const brandCtx = getBrandContext(opts);
  const bilingual = opts.bilingual ? "\nIMPORTANT: Provide the output in BOTH English and Hindi (side-by-side or sequentially)." : "";
  
  if (tool === "writing") return `You are a writing assistant. Type: ${opts.writingType || "General"}, Tone: ${opts.tone || "Professional"}. ${brandCtx}${ll}${bilingual}\nWrite ONLY the finished piece for: ${input}`;
  if (tool === "translate") return `You are a translator. Translate from ${opts.fromLanguage || "auto"} to ${opts.toLanguage || "English"}. Preserve tone. Output ONLY translation.\nText: ${input}`;
  if (tool === "calculator") return `You are a calculator. Solve, show steps, end with "Answer: ".\nProblem: ${input}`;
  if (tool === "student") return `You are a student helper. Explain clearly.\nRequest: ${input}`;
  if (tool === "code") return `You are an expert software engineer. Write clean code in ${opts.codeLang || "Python"} for: ${input}. Wrap in markdown.`;
  if (tool === "logo") return `You are a brand designer. Logo concept for: "${input}". Style: ${opts.logoStyle || "Minimalist"}. Provide visual description, Hex colors, typography.`;
  if (tool === "social") return `You are a social media expert. Post for ${opts.platform || "Instagram"} about: "${input}".${brandCtx} Include hook, body, CTA, hashtags.${bilingual}`;
  if (tool === "auto") return `You are IdeaForge-AI. ${ll}\nSTEP 1: Output exactly one line: ROUTE: <category> (categories: writing, translate, calculator, student, code, logo, social, autopilot, goalplan, moneycalc, improveidea, roast, poster, video, workflow, assistant).\nSTEP 2: Give direct answer. Do not repeat ROUTE.\nUser's request: ${input}`;
  return `You are IdeaForge-AI. ${ll}${brandCtx}${bilingual}\nAnswer helpfully.\nRequest: ${input}`;
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

    if (url.pathname === "/api/generate-report" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildReportPrompt(body.idea, body.language, body.brand);
        let lastRaw = "", parsed = null;
        for (let i = 0; i < 3; i++) {
          try { const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 2048, temperature: 0.6 }); lastRaw = res?.response || ""; parsed = parseSections(lastRaw, REPORT_KEYS); if (parsed) break; } catch(e){}
        }
        if (!parsed) return Response.json({ success: false, error: "Report generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, report: { score: extractScores(lastRaw), sections: parsed.sections } }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/generate-launch-plan" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildLaunchPlanPrompt(body.idea, body.budget, body.language, body.brand), LAUNCH_KEYS, 2048);
        if (!parsed) return Response.json({ success: false, error: "Plan generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, plan: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/generate-pitch-deck" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildPitchDeckPrompt(body.idea, body.language, body.brand), PITCH_KEYS, 2048);
        if (!parsed) return Response.json({ success: false, error: "Deck generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, deck: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/ai-tool" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildToolPrompt(body.tool, body.input, { language: body.language, writingType: body.writingType, tone: body.tone, fromLanguage: body.fromLanguage, toLanguage: body.toLanguage, codeLang: body.codeLang, logoStyle: body.logoStyle, platform: body.platform, brand: body.brand, bilingual: body.bilingual });
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

    if (url.pathname === "/api/generate-image" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        let prompt = body.prompt || "";
        const style = body.style || "Photorealistic";
        if (style !== "None") prompt = `${prompt}, ${style} style, high quality, 8k resolution, highly detailed`;
        const imageResponse = await env.AI.run(IMAGE_MODEL, { prompt });
        const uint8Array = new Uint8Array(imageResponse);
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) binary += String.fromCharCode(uint8Array[i]);
        const base64Image = btoa(binary);
        return Response.json({ success: true, image: `data:image/png;base64,${base64Image}` }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: "Image generate nahi ho payi. " + e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/ai-autopilot" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildAutopilotPrompt(body.input || "", body.brand), ["AD_COPY", "INSTAGRAM_CAPTION", "FACEBOOK_POST", "WHATSAPP_MESSAGE", "POSTER_TEXT", "IMAGE_PROMPT", "VIDEO_PROMPT", "HASHTAGS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Autopilot package generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, package: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/goal-plan" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildGoalPlanPrompt(body.goal || "", body.timeframe || "6 Months", body.brand), ["OVERVIEW", "MILESTONES", "ACTION_PLAN", "RESOURCES_NEEDED", "POTENTIAL_OBSTACLES"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Goal plan generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, plan: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/money-calc" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildMoneyCalcPrompt(body.business || "", body.investment || "₹10,000", body.type || "Small Business", body.brand), ["INVESTMENT_BREAKDOWN", "MONTHLY_EXPENSES", "REVENUE_MODEL", "PROFIT_PROJECTION", "BREAK_EVEN", "RISKS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Money calc generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, calc: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/improve-idea" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildImproveIdeaPrompt(body.idea || "", body.brand), ["VERDICT", "WHAT_WORKS", "WHAT_IS_MISSING", "PRICING_STRATEGY", "TARGET_AUDIENCE", "IMMEDIATE_NEXT_STEPS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Improve idea generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, feedback: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 🆕 Phase 4: Roast Idea
    if (url.pathname === "/api/roast-idea" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildRoastPrompt(body.idea || "", body.brand), ["SHARK_SCORE", "THE_GOOD", "THE_ROAST", "THE_FIX", "FINAL_VERDICT"], 1500);
        if (!parsed) return Response.json({ success: false, error: "Roast generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, roast: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/generate-poster" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildPosterPrompt(body.topic || "", body.brand), ["HEADLINE", "SUBHEADLINE", "BODY", "FOOTER"], 1000);
        if (!parsed) return Response.json({ success: false, error: "Poster content generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, poster: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/generate-video" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildVideoPrompt(body.topic || "", body.platform || "YouTube Long", body.brand), ["TITLE", "HOOK", "INTRO", "BODY", "CTA", "HASHTAGS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Video script generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, video: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/run-workflow" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildWorkflowPrompt(body.topic || "", body.type || "startup-launch", body.brand), ["PART_1", "PART_2", "PART_3"], 2500);
        if (!parsed) return Response.json({ success: false, error: "Workflow generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, workflow: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/remix" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        let resultText = "";
        for (let i = 0; i < 3; i++) {
          try { const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: buildRemixPrompt(body.text || "", body.style || "professional", body.brand) }], max_tokens: 1000, temperature: 0.8 }); resultText = (res?.response || "").trim(); if (resultText.length > 3) break; } catch(e){}
        }
        if (!resultText) return Response.json({ success: false, error: "Remix generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, result: resultText }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/social-pack" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildSocialPackPrompt(body.content || "", body.brand), ["INSTAGRAM", "FACEBOOK", "WHATSAPP", "YOUTUBE_TITLE", "YOUTUBE_DESCRIPTION", "SHORTS_CAPTION", "HASHTAGS", "THUMBNAIL_PROMPT"], 1500);
        if (!parsed) return Response.json({ success: false, error: "Social pack generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, pack: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/document-ai" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildDocumentPrompt(body.text || ""), ["SUMMARY", "KEY_POINTS", "QUESTIONS_ANSWERS", "SIMPLE_EXPLANATION", "MCQS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Document analysis generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, analysis: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/image-tool" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const imageBase64 = body.imageBase64 || "";
        const action = body.action || "full-analysis";
        const question = (body.question || "").trim();
        if (!imageBase64) return Response.json({ success: false, error: "Please upload a photo first." }, { status: 400, headers: corsHeaders });
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        let imageBytes;
        try { const binaryString = atob(base64Data); imageBytes = new Uint8Array(binaryString.length); for (let i = 0; i < binaryString.length; i++) imageBytes[i] = binaryString.charCodeAt(i); } catch (decodeError) { return Response.json({ success: false, error: "Photo read nahi ho payi." }, { status: 400, headers: corsHeaders }); }
        let visionPrompt = "";
        if (action === "full-analysis") visionPrompt = `Analyze comprehensively:\n1. DETAILED_DESCRIPTION\n2. PRODUCT_DETECTION\n3. AD_COPY\n4. SOCIAL_CAPTION\n5. ALT_TEXT\n6. SEO_KEYWORDS\n7. IMAGE_PROMPT`;
        else if (action === "extract-text") visionPrompt = "Read and transcribe ALL text.";
        else if (action === "ask" && question) visionPrompt = `Look and answer: "${question}"`;
        else visionPrompt = `Describe in detail.`;
        let resultText = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          try { const result = await env.AI.run(VISION_MODEL, { image: Array.from(imageBytes), prompt: visionPrompt, max_tokens: 1500 }); resultText = (result?.description || result?.response || "").trim(); if (resultText.length > 2) break; } catch (aiError) { console.error("Image tool attempt " + attempt + " failed:", aiError); }
        }
        if (!resultText) return Response.json({ success: false, error: "Image analyze nahi ho payi." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, result: resultText }, { status: 200, headers: corsHeaders });
      } catch (error) { return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders }); }
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("IdeaForgeX v7.0 Running 🚀", { status: 200, headers: corsHeaders });
  }
};
