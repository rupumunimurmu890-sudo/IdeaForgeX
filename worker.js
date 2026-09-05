// ========================================
// IdeaForgeX Worker v6.0 - Phase 3: Creative Studio
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

function buildReportPrompt(idea, lang) { return `You are IdeaForgeX, an expert startup analyst. Idea: "${idea}". ${langLine(lang)}\nProduce a COMPLETE startup report in EXACTLY this format (no markdown, no extra text):\nSCORE_MARKET:<0-100>\nSCORE_COMPETITION:<0-100>\nSCORE_PROFIT:<0-100>\nSCORE_DIFFICULTY:<0-100>\nSCORE_OVERALL:<0-100>\n###IDEA###\n1-2 sentence restatement.\n###TARGET_CUSTOMERS###\nWho is this for?\n###CUSTOMER_PROBLEM###\nCore pain point.\n###REVENUE_MODEL###\nHow it makes money.\n###MARKET_ANALYSIS###\nMarket size/trends.\n###COMPETITOR_ANALYSIS###\n3-4 competitors & differentiation.\n###SWOT_STRENGTHS###\n3-4 points.\n###SWOT_WEAKNESSES###\n3-4 points.\n###SWOT_OPPORTUNITIES###\n3-4 points.\n###SWOT_THREATS###\n3-4 points.\n###MARKETING_STRATEGY###\n3-4 low-budget tactics.\n###STARTUP_COST###\nBudget breakdown in ₹.\n###ONE_YEAR_PROJECTION###\nRealistic 1-year narrative.\n###RISKS###\n3-4 key risks.\n###GROWTH_STRATEGY###\n3-4 scaling points.`; }
function buildLaunchPlanPrompt(idea, budget, lang) { return `You are IdeaForgeX, a launch strategist. Idea: "${idea}". Budget: ${budget || "Modest bootstrapped"}. ${langLine(lang)}\nProduce a 30-day launch plan in EXACTLY this format:\n###BUDGET_BREAKDOWN###\n4-6 bullet lines.\n###PREPARATION###\nDay 1-7 tasks.\n###PRODUCT_DEVELOPMENT###\nDay 8-15 tasks.\n###BRANDING###\nDay 16-20 tasks.\n###MARKETING_LAUNCH###\nDay 21-25 tasks.\n###LAUNCH_WEEK###\nDay 26-30 tasks.\n###PRODUCT_IDEAS###\n3-5 variations.\n###PRICING###\n3-4 price points.\n###EXPECTED_SALES###\n30-day sales narrative.`; }
function buildPitchDeckPrompt(idea, lang) { return `You are IdeaForgeX, a pitch consultant. Idea: "${idea}". ${langLine(lang)}\nProduce pitch deck content in EXACTLY this format (punchy bullets, no fluff):\n###PROBLEM###\n2-3 bullets.\n###SOLUTION###\n2-3 bullets.\n###MARKET###\n2-3 bullets with size.\n###PRODUCT###\n2-3 bullets.\n###BUSINESS_MODEL###\n2-3 bullets.\n###COMPETITION###\n2-3 bullets.\n###FINANCIALS###\n2-3 bullets with numbers.\n###GROWTH###\n2-3 bullets.\n###FUNDING_REQUIREMENT###\n2-3 bullets with ₹ amount.`; }

// 🆕 Phase 3 Prompts
function buildAutopilotPrompt(input) { return `You are an AI marketing autopilot. User request: "${input}"\nGenerate a COMPLETE marketing package:\n###AD_COPY###\nShort, punchy advertisement copy (2-3 lines)\n###INSTAGRAM_CAPTION###\nEngaging Instagram caption with emojis (3-4 lines)\n###FACEBOOK_POST###\nDetailed Facebook post (4-5 lines)\n###WHATSAPP_MESSAGE###\nCasual WhatsApp message for sharing (2-3 lines)\n###POSTER_TEXT###\nHeadline and subheadline for a poster\n###IMAGE_PROMPT###\nDetailed prompt to generate a marketing image\n###VIDEO_PROMPT###\nScript/prompt for a short marketing video\n###HASHTAGS###\n10-15 relevant hashtags\nRespond in the same language as the user.`; }
function buildGoalPlanPrompt(goal, timeframe) { return `You are an expert life and business coach. \nUser Goal: "${goal}"\nTimeframe: ${timeframe}\n${langLine("auto")}\nCreate a highly actionable, step-by-step roadmap to achieve this goal within the given timeframe.\nFormat exactly like this:\n###OVERVIEW###\n2-3 sentence summary of the strategy.\n###MILESTONES###\nBreak the timeframe into clear milestones (e.g., Month 1, Month 2).\n###ACTION_PLAN###\nSpecific weekly or daily tasks for each milestone.\n###RESOURCES_NEEDED###\nTools, skills, or money needed.\n###POTENTIAL_OBSTACLES###\n3 things that might go wrong and how to fix them.\nBe practical, motivating, and realistic.`; }
function buildMoneyCalcPrompt(business, investment, type) { return `You are an expert financial analyst and business calculator.\nBusiness Idea: "${business}"\nInitial Investment: ${investment}\nBusiness Type: ${type}\n${langLine("auto")}\nCalculate and provide a realistic financial projection. Format exactly like this:\n###INVESTMENT_BREAKDOWN###\nHow the initial investment should be spent (bullet points).\n###MONTHLY_EXPENSES###\nEstimated recurring monthly costs.\n###REVENUE_MODEL###\nHow it will make money and expected pricing.\n###PROFIT_PROJECTION###\nExpected monthly profit for the first 6 months.\n###BREAK_EVEN###\nWhen the business will recover the initial investment.\n###RISKS###\nFinancial risks to watch out for.\nUse realistic numbers and Indian Rupees (₹) unless specified otherwise.`; }
function buildImproveIdeaPrompt(idea) { return `You are a brutally honest but constructive startup mentor.\nUser Idea: "${idea}"\n${langLine("auto")}\nAnalyze this idea and provide honest feedback. Format exactly like this:\n###VERDICT###\nIs this a good idea? (Give a rating out of 10 and a 1-sentence summary).\n###WHAT_WORKS###\n3 strong points of this idea.\n###WHAT_IS_MISSING###\n3 weaknesses or things the user hasn't thought about.\n###PRICING_STRATEGY###\nHow much should they charge? Give specific price ranges.\n###TARGET_AUDIENCE###\nWho exactly will buy this?\n###IMMEDIATE_NEXT_STEPS###\n3 things they should do right now to test this idea without spending money.\nBe direct, practical, and avoid generic advice.`; }

// 🆕 Phase 3: Poster, Video, Workflow
function buildPosterPrompt(topic) { return `You are an expert graphic designer and copywriter.\nTopic: "${topic}"\n${langLine("auto")}\nCreate content for a beautiful social media poster. Format exactly like this:\n###HEADLINE###\nA short, punchy, attention-grabbing headline (max 6 words).\n###SUBHEADLINE###\nA compelling subheadline (max 12 words).\n###BODY###\nBrief body text or key benefits (2-3 short lines).\n###FOOTER###\nA strong Call to Action (CTA) or contact info (max 10 words).\nKeep it concise, impactful, and visually balanced.`; }

function buildVideoPrompt(topic, platform) { return `You are an expert video scriptwriter and director.\nTopic: "${topic}"\nPlatform: ${platform}\n${langLine("auto")}\nWrite a professional video script. Format exactly like this:\n###TITLE###\nCatchy video title.\n###HOOK###\nFirst 3 seconds: What will grab attention immediately?\n###INTRO###\nBrief introduction (5-10 seconds).\n###BODY###\nMain content broken into 3 key points/scenes. For each scene, provide:\n- Visual: What is on screen?\n- Audio: What is the voiceover/dialogue?\n###CTA###\nStrong Call to Action at the end.\n###HASHTAGS###\n5 relevant hashtags.\nTailor the pacing and style specifically for ${platform}.`; }

function buildWorkflowPrompt(topic, type) { 
  let instructions = "";
  if (type === "startup-launch") instructions = "Generate: 1. A 3-sentence Executive Summary. 2. A complete Instagram Social Pack (Caption + Hashtags). 3. A 30-second Video Ad Script.";
  else if (type === "content-creator") instructions = "Generate: 1. 5 Viral Video Ideas. 2. A detailed Script for the best idea. 3. A Social Media Announcement Post.";
  else instructions = "Generate: 1. A catchy Product Tagline. 2. A Facebook/Instagram Ad Copy. 3. A WhatsApp Broadcast Message.";
  
  return `You are an AI automation expert.\nTopic: "${topic}"\nWorkflow Type: ${type}\n${langLine("auto")}\n${instructions}\nFormat exactly like this:\n###PART_1###\n[Content for Part 1]\n###PART_2###\n[Content for Part 2]\n###PART_3###\n[Content for Part 3]\nBe comprehensive and ready to use.`; 
}

function buildRemixPrompt(text, style) { return `You are a content remixer. Original text: "${text}"\nRemix style: "${style}"\nRewrite the content in the specified style while keeping the core message. Styles guide: shorter, professional, funny, viral, hindi, english, simple, emotional, seo, instagram, youtube. Output ONLY the remixed content.`; }
function buildSocialPackPrompt(content) { return `You are a social media expert. Content: "${content}"\nGenerate a complete social media pack:\n###INSTAGRAM###\nCaption with emojis (3-4 lines)\n###FACEBOOK###\nDetailed post (4-5 lines)\n###WHATSAPP###\nShort status message (1-2 lines)\n###YOUTUBE_TITLE###\nCatchy title (under 60 chars)\n###YOUTUBE_DESCRIPTION###\nDescription with keywords (3-4 lines)\n###SHORTS_CAPTION###\nShort caption for Shorts/Reels\n###HASHTAGS###\n15 relevant hashtags\n###THUMBNAIL_PROMPT###\nPrompt to generate a thumbnail image`; }
function buildDocumentPrompt(text) { return `You are a document AI assistant. Analyze this text: "${text}"\nProvide:\n###SUMMARY###\n3-5 sentence summary.\n###KEY_POINTS###\n5-7 bullet points.\n###QUESTIONS_ANSWERS###\n3 important Q&A.\n###SIMPLE_EXPLANATION###\nExplain in simple terms.\n###MCQS###\n5 MCQs with answers.`; }

function buildToolPrompt(tool, input, opts) {
  const ll = opts.language && opts.language !== "auto" ? `Respond in ${opts.language}.` : "Respond in the user's language.";
  if (tool === "writing") return `You are a writing assistant. Type: ${opts.writingType || "General"}, Tone: ${opts.tone || "Professional"}. ${ll}\nWrite ONLY the finished piece for: ${input}`;
  if (tool === "translate") return `You are a translator. Translate from ${opts.fromLanguage || "auto"} to ${opts.toLanguage || "English"}. Preserve the tone and context. Output ONLY the translation.\nText: ${input}`;
  if (tool === "calculator") return `You are a calculator. Solve this, show steps, end with "Answer: ".\nProblem: ${input}`;
  if (tool === "student") return `You are a student helper. Explain clearly.\nRequest: ${input}`;
  if (tool === "code") return `You are an expert software engineer. Write clean, efficient code in ${opts.codeLang || "Python"} for: ${input}. Wrap in markdown blocks.`;
  if (tool === "logo") return `You are a brand designer. Create a logo concept for: "${input}". Style: ${opts.logoStyle || "Minimalist"}. Provide visual description, Hex colors, and typography.`;
  if (tool === "social") return `You are a social media expert. Create an engaging post for ${opts.platform || "Instagram"} about: "${input}". Include hook, body, CTA, and hashtags.`;
  if (tool === "auto") return `You are IdeaForge-AI. ${ll}\nSTEP 1: Output exactly one line: ROUTE: <category> (categories: writing, translate, calculator, student, code, logo, social, autopilot, goalplan, moneycalc, improveidea, poster, video, workflow, assistant).\nSTEP 2: Give a direct answer. Do not repeat ROUTE line.\nUser's request: ${input}`;
  return `You are IdeaForge-AI. ${ll}\nAnswer helpfully.\nRequest: ${input}`;
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
        const prompt = buildReportPrompt(body.idea, body.language);
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
        const parsed = await generateSectioned(env, buildLaunchPlanPrompt(body.idea, body.budget, body.language), LAUNCH_KEYS, 2048);
        if (!parsed) return Response.json({ success: false, error: "Plan generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, plan: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

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

    if (url.pathname === "/api/ai-tool" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildToolPrompt(body.tool, body.input, { language: body.language, writingType: body.writingType, tone: body.tone, fromLanguage: body.fromLanguage, toLanguage: body.toLanguage, codeLang: body.codeLang, logoStyle: body.logoStyle, platform: body.platform });
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
        const parsed = await generateSectioned(env, buildAutopilotPrompt(body.input || ""), ["AD_COPY", "INSTAGRAM_CAPTION", "FACEBOOK_POST", "WHATSAPP_MESSAGE", "POSTER_TEXT", "IMAGE_PROMPT", "VIDEO_PROMPT", "HASHTAGS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Autopilot package generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, package: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/goal-plan" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildGoalPlanPrompt(body.goal || "", body.timeframe || "6 Months"), ["OVERVIEW", "MILESTONES", "ACTION_PLAN", "RESOURCES_NEEDED", "POTENTIAL_OBSTACLES"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Goal plan generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, plan: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/money-calc" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildMoneyCalcPrompt(body.business || "", body.investment || "₹10,000", body.type || "Small Business"), ["INVESTMENT_BREAKDOWN", "MONTHLY_EXPENSES", "REVENUE_MODEL", "PROFIT_PROJECTION", "BREAK_EVEN", "RISKS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Money calc generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, calc: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/improve-idea" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildImproveIdeaPrompt(body.idea || ""), ["VERDICT", "WHAT_WORKS", "WHAT_IS_MISSING", "PRICING_STRATEGY", "TARGET_AUDIENCE", "IMMEDIATE_NEXT_STEPS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Improve idea generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, feedback: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    //  Phase 3: Poster
    if (url.pathname === "/api/generate-poster" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildPosterPrompt(body.topic || ""), ["HEADLINE", "SUBHEADLINE", "BODY", "FOOTER"], 1000);
        if (!parsed) return Response.json({ success: false, error: "Poster content generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, poster: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    //  Phase 3: Video Script
    if (url.pathname === "/api/generate-video" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildVideoPrompt(body.topic || "", body.platform || "YouTube Long"), ["TITLE", "HOOK", "INTRO", "BODY", "CTA", "HASHTAGS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Video script generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, video: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 🆕 Phase 3: Workflow
    if (url.pathname === "/api/run-workflow" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const parsed = await generateSectioned(env, buildWorkflowPrompt(body.topic || "", body.type || "startup-launch"), ["PART_1", "PART_2", "PART_3"], 2500);
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
          try { const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: buildRemixPrompt(body.text || "", body.style || "professional") }], max_tokens: 1000, temperature: 0.8 }); resultText = (res?.response || "").trim(); if (resultText.length > 3) break; } catch(e){}
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
        const parsed = await generateSectioned(env, buildSocialPackPrompt(body.content || ""), ["INSTAGRAM", "FACEBOOK", "WHATSAPP", "YOUTUBE_TITLE", "YOUTUBE_DESCRIPTION", "SHORTS_CAPTION", "HASHTAGS", "THUMBNAIL_PROMPT"], 1500);
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
        if (action === "full-analysis") visionPrompt = `Analyze this image comprehensively and provide:\n1. DETAILED_DESCRIPTION\n2. PRODUCT_DETECTION\n3. AD_COPY\n4. SOCIAL_CAPTION\n5. ALT_TEXT\n6. SEO_KEYWORDS\n7. IMAGE_PROMPT\nFormat each section with clear headers.`;
        else if (action === "extract-text") visionPrompt = "Read and transcribe ALL text visible in this image exactly as it appears.";
        else if (action === "ask" && question) visionPrompt = `Look at this image and answer: "${question}"`;
        else visionPrompt = `Describe this image in detail.`;
        let resultText = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          try { const result = await env.AI.run(VISION_MODEL, { image: Array.from(imageBytes), prompt: visionPrompt, max_tokens: 1500 }); resultText = (result?.description || result?.response || "").trim(); if (resultText.length > 2) break; } catch (aiError) { console.error("Image tool attempt " + attempt + " failed:", aiError); }
        }
        if (!resultText) return Response.json({ success: false, error: "Image analyze nahi ho payi." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, result: resultText }, { status: 200, headers: corsHeaders });
      } catch (error) { return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders }); }
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("IdeaForgeX v6.0 Running 🚀", { status: 200, headers: corsHeaders });
  }
};
