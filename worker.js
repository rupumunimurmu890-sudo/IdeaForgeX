// ========================================
// IdeaForgeX Worker v4.0 - Phase 1: Top 7 Features
// ========================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, X-User-ID, X-User-Plan"
};

const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const IMAGE_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
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

const REPORT_KEYS = ["IDEA", "TARGET_CUSTOMERS", "CUSTOMER_PROBLEM", "REVENUE_MODEL", "MARKET_ANALYSIS", "COMPETITOR_ANALYSIS", "SWOT_STRENGTHS", "SWOT_WEAKNESSES", "SWOT_OPPORTUNITIES", "SWOT_THREATS", "MARKETING_STRATEGY", "STARTUP_COST", "ONE_YEAR_PROJECTION", "RISKS", "GROWTH_STRATEGY"];
const LAUNCH_KEYS = ["BUDGET_BREAKDOWN", "PREPARATION", "PRODUCT_DEVELOPMENT", "BRANDING", "MARKETING_LAUNCH", "LAUNCH_WEEK", "PRODUCT_IDEAS", "PRICING", "EXPECTED_SALES"];
const PITCH_KEYS = ["PROBLEM", "SOLUTION", "MARKET", "PRODUCT", "BUSINESS_MODEL", "COMPETITION", "FINANCIALS", "GROWTH", "FUNDING_REQUIREMENT"];

function langLine(lang) { return lang && lang !== "auto" ? `Respond entirely in ${lang}.` : "Respond in the user's language."; }

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

// 🆕 AUTO-PILOT PROMPT (Feature 1)
function buildAutopilotPrompt(input) {
  return `You are an AI marketing autopilot. The user wants to promote/market something. 
User request: "${input}"

Generate a COMPLETE marketing package with these sections (use exact headers):

###AD_COPY###
Short, punchy advertisement copy (2-3 lines)

###INSTAGRAM_CAPTION###
Engaging Instagram caption with emojis (3-4 lines)

###FACEBOOK_POST###
Detailed Facebook post (4-5 lines)

###WHATSAPP_MESSAGE###
Casual WhatsApp message for sharing (2-3 lines)

###POSTER_TEXT###
Headline and subheadline for a poster

###IMAGE_PROMPT###
Detailed prompt to generate a marketing image using AI

###VIDEO_PROMPT###
Script/prompt for a short marketing video

###HASHTAGS###
10-15 relevant hashtags

Respond in the same language as the user's request. Be specific and creative.`;
}

// 🆕 REMIX PROMPT (Feature 5)
function buildRemixPrompt(text, style) {
  return `You are a content remixer. 
Original text: "${text}"
Remix style: "${style}"

Rewrite the content in the specified style while keeping the core message. 
Styles guide:
- shorter: Make it concise (50% shorter)
- professional: Formal business tone
- funny: Add humor and wit
- viral: Make it attention-grabbing and shareable
- hindi: Translate to Hindi naturally
- english: Translate to English naturally
- simple: Use simple words anyone can understand
- emotional: Add emotional appeal
- seo: Optimize for search engines with keywords
- instagram: Format for Instagram with emojis and hashtags
- youtube: Format for YouTube with hook and CTA

Output ONLY the remixed content, no explanation.`;
}

// 🆕 SOCIAL PACK PROMPT (Feature 6)
function buildSocialPackPrompt(content) {
  return `You are a social media expert. 
Content: "${content}"

Generate a complete social media pack with these sections:

###INSTAGRAM###
Caption with emojis and line breaks (3-4 lines)

###FACEBOOK###
Detailed post (4-5 lines)

###WHATSAPP###
Short status message (1-2 lines)

###YOUTUBE_TITLE###
Catchy title (under 60 characters)

###YOUTUBE_DESCRIPTION###
Description with keywords (3-4 lines)

###SHORTS_CAPTION###
Short caption for YouTube Shorts/Reels

###HASHTAGS###
15 relevant hashtags

###THUMBNAIL_PROMPT###
Prompt to generate a thumbnail image

Be creative and platform-specific.`;
}

// 🆕 DOCUMENT AI PROMPT (Feature 3)
function buildDocumentPrompt(text) {
  return `You are a document AI assistant. Analyze this text/document:

"${text}"

Provide a comprehensive analysis with these sections:

###SUMMARY###
3-5 sentence summary of the document

###KEY_POINTS###
5-7 bullet points of important information

###QUESTIONS_ANSWERS###
3 important questions and their answers based on the document

###SIMPLE_EXPLANATION###
Explain the document in simple terms anyone can understand

###MCQS###
5 multiple choice questions with answers (format: Q: ... A) ... B) ... C) ... D) ... Correct: ...)

Be thorough and accurate.`;
}

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
STEP 1: Output exactly one line: ROUTE: <category> (categories: writing, translate, calculator, student, code, logo, social, autopilot, assistant).
STEP 2: Give a direct answer. Do not repeat ROUTE line.
User's request: ${input}`;
  }
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

    // 5. Real Image Generation
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

    // 🆕 6. AI AUTO-PILOT (Feature 1)
    if (url.pathname === "/api/ai-autopilot" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildAutopilotPrompt(body.input || "");
        const parsed = await generateSectioned(env, prompt, ["AD_COPY", "INSTAGRAM_CAPTION", "FACEBOOK_POST", "WHATSAPP_MESSAGE", "POSTER_TEXT", "IMAGE_PROMPT", "VIDEO_PROMPT", "HASHTAGS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Autopilot package generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, package: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    //  7. REMIX (Feature 5)
    if (url.pathname === "/api/remix" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildRemixPrompt(body.text || "", body.style || "professional");
        let resultText = "";
        for (let i = 0; i < 3; i++) {
          try { const res = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 1000, temperature: 0.8 }); resultText = (res?.response || "").trim(); if (resultText.length > 3) break; } catch(e){}
        }
        if (!resultText) return Response.json({ success: false, error: "Remix generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, result: resultText }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 🆕 8. SOCIAL PACK (Feature 6)
    if (url.pathname === "/api/social-pack" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildSocialPackPrompt(body.content || "");
        const parsed = await generateSectioned(env, prompt, ["INSTAGRAM", "FACEBOOK", "WHATSAPP", "YOUTUBE_TITLE", "YOUTUBE_DESCRIPTION", "SHORTS_CAPTION", "HASHTAGS", "THUMBNAIL_PROMPT"], 1500);
        if (!parsed) return Response.json({ success: false, error: "Social pack generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, pack: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 🆕 9. DOCUMENT AI (Feature 3)
    if (url.pathname === "/api/document-ai" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const prompt = buildDocumentPrompt(body.text || "");
        const parsed = await generateSectioned(env, prompt, ["SUMMARY", "KEY_POINTS", "QUESTIONS_ANSWERS", "SIMPLE_EXPLANATION", "MCQS"], 2000);
        if (!parsed) return Response.json({ success: false, error: "Document analysis generate nahi hua." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, analysis: parsed.sections }, { status: 200, headers: corsHeaders });
      } catch (e) { return Response.json({ success: false, error: e.message }, { status: 200, headers: corsHeaders }); }
    }

    // 10. Enhanced Image Analysis (Feature 2)
    if (url.pathname === "/api/image-tool" && request.method === "POST") {
      const check = await checkAndIncrementUsage(env, userId, userPlan);
      if (!check.allowed) return Response.json({ success: false, error: check.message, limitReached: true }, { status: 429, headers: corsHeaders });
      try {
        const body = await request.json();
        const imageBase64 = body.imageBase64 || "";
        const action = body.action || "full-analysis";
        const question = (body.question || "").trim();
        const language = body.language || "auto";
        if (!imageBase64) return Response.json({ success: false, error: "Please upload a photo first." }, { status: 400, headers: corsHeaders });
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        let imageBytes;
        try {
          const binaryString = atob(base64Data);
          imageBytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) imageBytes[i] = binaryString.charCodeAt(i);
        } catch (decodeError) { return Response.json({ success: false, error: "Photo read nahi ho payi." }, { status: 400, headers: corsHeaders }); }
        
        let visionPrompt = "";
        if (action === "full-analysis") {
          visionPrompt = `Analyze this image comprehensively and provide:
1. DETAILED_DESCRIPTION: What the image shows
2. PRODUCT_DETECTION: If any product is visible, describe it
3. AD_COPY: Short advertisement copy for this image
4. SOCIAL_CAPTION: Social media caption
5. ALT_TEXT: SEO-friendly alt text
6. SEO_KEYWORDS: 10 relevant keywords
7. IMAGE_PROMPT: Prompt to recreate similar image
Format each section with clear headers.`;
        } else if (action === "extract-text") {
          visionPrompt = "Read and transcribe ALL text visible in this image exactly as it appears.";
        } else if (action === "ask" && question) {
          visionPrompt = `Look at this image and answer: "${question}"`;
        } else {
          visionPrompt = `Describe this image in detail.`;
        }

        let resultText = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await env.AI.run(VISION_MODEL, { image: Array.from(imageBytes), prompt: visionPrompt, max_tokens: 1500 });
            resultText = (result?.description || result?.response || "").trim();
            if (resultText.length > 2) break;
          } catch (aiError) { console.error("Image tool attempt " + attempt + " failed:", aiError); }
        }
        if (!resultText) return Response.json({ success: false, error: "Image analyze nahi ho payi." }, { status: 200, headers: corsHeaders });
        return Response.json({ success: true, result: resultText }, { status: 200, headers: corsHeaders });
      } catch (error) { return Response.json({ success: false, error: error?.message || "Something went wrong." }, { status: 200, headers: corsHeaders }); }
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("IdeaForgeX v4.0 Running 🚀", { status: 200, headers: corsHeaders });
  }
};
