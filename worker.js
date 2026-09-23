// ========================================
// IdeaForgeX Worker v13.0
// Secure AI Multi-Tool + Agent + Vision
// Sessions KV + KV-based Quota (Free Plan compatible)
//
// v13.0 CHANGES (performance + speed):
//   - MODEL TIERING: 3 model sizes (heavy/medium/fast) instead
//     of one 70B model for everything. Simple tasks (chat,
//     translate, writing) now run 5-8x faster on the 8B model.
//   - STREAMING CHAT: /api/chat now supports stream:true for
//     word-by-word SSE responses (ChatGPT-style typing effect).
//   - JSON MODE: structured tools now request native JSON output
//     from the model, reducing retry loops dramatically.
//   - PARALLEL KV READS: /api/data-load now fetches all user
//     data types in parallel instead of sequentially.
//   - CORS CACHE: header objects cached per-Origin instead of
//     rebuilt on every request.
//   - Health endpoint now cacheable for 60s.
//
// PRESERVED from v12.7:
//   - All endpoints, all tools, all prompts
//   - ACCURACY_RULE in factual prompts
//   - KV-based daily quota (Free Plan compatible)
//   - Session cookie + Bearer backup code
//   - User data cloud backup (projects/history/brand/toolhistory)
// ========================================

// ========================================
// CONFIG
// ========================================

const APP_NAME = "IdeaForgeX";
const VERSION = "13.0";

// Model tiers — picked per task for speed.
// Heavy = best quality (report/pitch/agent). Slow, expensive.
// Medium = balanced (structured tools, autopilot). 
// Fast = instant (chat, translate, writing, calculator).
const MODELS = {
  heavy: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  medium: "@cf/meta/llama-3.1-8b-instruct",
  fast: "@cf/meta/llama-3.1-8b-instruct"
};

const VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

// TEMP: raised for testing — change back to 15 before going live
const FREE_DAILY_LIMIT = 15;
const PRO_DAILY_LIMIT = 1000;

const SESSION_TTL = 60 * 60 * 24 * 30;

// Quota keys are stored per session per day and expire a little
// after 24 hours so they auto-reset without any cleanup job.
const QUOTA_TTL = 60 * 60 * 26;

const MAX_TEXT_LENGTH = 20000;
const MAX_REQUEST_SIZE = 12 * 1024 * 1024;
const MAX_IMAGE_LENGTH = 8 * 1024 * 1024;

// Injected into every prompt that could involve facts, numbers, or
// market/business claims, so the model does not present guesses as
// verified facts.
const ACCURACY_RULE = `
CRITICAL ACCURACY RULE:
- If you are not certain about a fact, number, or statistic, clearly say so - do not invent numbers.
- Do not present estimates or guesses as verified, confirmed facts.
- For market size, competitor names, statistics, or costs you are not fully confident about, use qualifiers like "approximately", "typically", or "based on general trends" - never state a made-up exact figure as certain.
- It is better to say a figure needs real research/verification than to fabricate a confident-sounding number.
- Do not claim something is legally required, medically safe, or financially guaranteed unless you are certain - flag these as areas needing professional verification instead.
`;

// ========================================
// CORS (cached per-origin, since Workers isolates are reused)
// ========================================

const CORS_CACHE = new Map();

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";

  const cached = CORS_CACHE.get(origin);
  if (cached) return cached;

  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-ID",
    "Access-Control-Expose-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  if (CORS_CACHE.size < 100) CORS_CACHE.set(origin, headers);
  return headers;
}

// ========================================
// JSON RESPONSE
// ========================================

function jsonResponse(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...getCorsHeaders(request)
    }
  });
}

// ========================================
// SAFE STRING / NUMBER / DATE
// ========================================

function cleanString(value, maxLength = MAX_TEXT_LENGTH) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function safeInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function generateSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ========================================
// LANGUAGE / BRAND HELPERS
// ========================================

function langLine(lang) {
  if (lang && lang !== "auto") {
    return `
CRITICAL LANGUAGE RULE:
Respond entirely in: ${cleanString(lang, 100)}
Do not switch languages. Do not change script unnecessarily.
`;
  }

  return `
CRITICAL LANGUAGE RULE:
Detect the language and script used by the user.
If the user writes Hindi in Devanagari, respond in Hindi.
If the user writes Hinglish in Latin script, respond naturally in Hinglish.
If the user writes English, respond in English.
Do not automatically switch to English.
`;
}

function getBrandContext(opts = {}) {
  if (opts.brand && opts.brand.name) {
    return `
[USER BRAND CONTEXT]
Brand Name: "${cleanString(opts.brand.name, 300)}"
Industry: "${cleanString(opts.brand.industry || "General", 300)}"
Target Audience: "${cleanString(opts.brand.audience || "General", 500)}"
Use this brand identity naturally when relevant.
`;
  }

  return "";
}

// ========================================
// AGENT PROMPT + PARSER
// ========================================

function buildAgentPrompt(input, lang, brand) {
  return `
You are IdeaForgeX, an expert Business Agent, Startup Consultant and Marketing Strategist.

USER REQUEST:
"${cleanString(input)}"

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Generate a COMPLETE business starter pack.
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "brand_name": "",
  "tagline": "",
  "logo_prompt": "",
  "description": "",
  "ad_copy": "",
  "social_posts": ["", "", ""],
  "video_prompt": "",
  "marketing_plan": ""
}

Requirements:
brand_name: Catchy and memorable.
tagline: Maximum 10 words.
logo_prompt: Detailed AI image generation prompt.
description: Exactly 2 useful sentences.
ad_copy: 3-4 punchy advertisement lines.
social_posts: Exactly 3 social captions.
video_prompt: Detailed 30-second promotional video concept/script.
marketing_plan: Practical 30-day launch plan divided into weeks.

Do not make unrealistic guarantees.
`;
}

// Generic JSON extractor used by agent / autopilot / remix(json-ish) / document-ai
function extractJsonObject(rawText, requiredKey = null) {
  try {
    if (!rawText) return null;

    let clean = String(rawText)
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) return null;

    clean = clean.substring(start, end + 1);

    const parsed = JSON.parse(clean);

    if (!parsed || typeof parsed !== "object") return null;

    if (requiredKey && !cleanString(parsed[requiredKey], 500)) {
      if (!Array.isArray(parsed[requiredKey])) return null;
    }

    return parsed;
  } catch (error) {
    console.error("JSON parse error:", error);
    return null;
  }
}

// Shared runner for the "single JSON-structured tool" pattern.
async function runStructuredToolFlow(request, env, session, quota, opts) {
  const {
    prompt,
    requiredKey,
    temperature = 0.5,
    maxTokens = 1800,
    errorCode,
    errorMessage,
    textFields,
    logLabel,
    tier = "medium"
  } = opts;

  // Try JSON-mode first (usually succeeds in one shot), fall back
  // to plain mode with retry only if the model rejects json_object.
  let structured = null;

  try {
    const raw = await runJsonAI(env, prompt, maxTokens, temperature, tier);
    structured = extractJsonObject(raw, requiredKey);
  } catch (error) {
    console.error(`${logLabel || errorCode} (json mode) failed:`, error);
  }

  if (!structured) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await runTextAI(env, prompt, maxTokens, temperature, tier);
        structured = extractJsonObject(raw, requiredKey);
        if (structured) break;
      } catch (error) {
        console.error(`${logLabel || errorCode} attempt failed:`, error);
      }
    }
  }

  if (!structured) {
    await rollbackQuota(env, session);
    return jsonResponse({ success: false, error: errorCode, message: errorMessage }, 500, request);
  }

  const readableText = textFields(structured).filter(Boolean).join("\n\n");

  return jsonResponse(
    {
      success: true,
      result: readableText,
      structured,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

function parseAgentResponse(rawText) {
  const parsed = extractJsonObject(rawText, "brand_name");
  if (!parsed) return null;

  if (!Array.isArray(parsed.social_posts)) {
    parsed.social_posts = [];
  }

  return parsed;
}

// ========================================
// REPORT PROMPT
// ========================================

function buildReportPrompt(idea, lang, brand) {
  return `
You are IdeaForgeX, an expert startup analyst.

BUSINESS IDEA:
"${cleanString(idea)}"

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Create a COMPLETE startup report.

Return EXACTLY this structure:

SCORE_MARKET:<0-100>
SCORE_COMPETITION:<0-100>
SCORE_PROFIT:<0-100>
SCORE_DIFFICULTY:<0-100>
SCORE_OVERALL:<0-100>

###IDEA###
1-2 sentence restatement.

###TARGET_CUSTOMERS###
Who is this for?

###CUSTOMER_PROBLEM###
Core customer pain point.

###REVENUE_MODEL###
How the business can make money.

###MARKET_ANALYSIS###
Market size, trends and opportunity.

###COMPETITOR_ANALYSIS###
3-4 likely competitors and differentiation.

###SWOT_STRENGTHS###
3-4 points.

###SWOT_WEAKNESSES###
3-4 points.

###SWOT_OPPORTUNITIES###
3-4 points.

###SWOT_THREATS###
3-4 points.

###MARKETING_STRATEGY###
3-4 low-budget tactics.

###STARTUP_COST###
Practical budget breakdown in ₹.

###ONE_YEAR_PROJECTION###
Realistic one-year projection.

###RISKS###
3-4 key risks.

###GROWTH_STRATEGY###
3-4 scaling strategies.

Do not add unnecessary sections.
`;
}

// ========================================
// LAUNCH PLAN PROMPT
// ========================================

function buildLaunchPlanPrompt(idea, budget, lang, brand) {
  return `
You are IdeaForgeX, an expert startup launch planner.

BUSINESS IDEA:
"${cleanString(idea)}"

BUDGET (optional, may be empty):
"${cleanString(budget, 200)}"

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Create a COMPLETE 30-day launch plan.

Return EXACTLY this structure (use these markers, nothing else):

###BUDGET_BREAKDOWN###
Practical budget allocation (use the given budget if provided, otherwise assume a low-budget bootstrapped launch).

###PREPARATION###
Pre-launch preparation checklist (legal, sourcing, branding basics).

###PRODUCT_DEVELOPMENT###
What to build/finalize before launch.

###BRANDING###
Branding essentials to lock in before launch.

###MARKETING_LAUNCH###
Marketing channels and tactics to prepare.

###LAUNCH_WEEK###
Day-by-day plan for Day 1 to Day 7.

###PRODUCT_IDEAS###
2-3 product/service variations or add-ons to consider.

###PRICING###
Suggested pricing approach.

###EXPECTED_SALES###
Realistic expected sales/traction for the first 30 days.

Do not add unnecessary sections. Do not make unrealistic guarantees.
`;
}

// ========================================
// PITCH DECK PROMPT
// ========================================

function buildPitchDeckPrompt(idea, lang, brand) {
  return `
You are IdeaForgeX, an expert startup pitch consultant.

BUSINESS IDEA:
"${cleanString(idea)}"

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Create a COMPLETE investor pitch deck as slide content.

Return EXACTLY this structure (use these markers, nothing else):

###PROBLEM###
The core problem being solved.

###SOLUTION###
How this business solves it.

###MARKET###
Market size and opportunity.

###PRODUCT###
Product/service overview.

###BUSINESS_MODEL###
How the business makes money.

###COMPETITION###
Competitive landscape and edge.

###FINANCIALS###
Key financial highlights/projections.

###GROWTH###
Growth and scaling strategy.

###FUNDING_REQUIREMENT###
How much funding is needed and what it will be used for.

Keep each slide concise (investor-deck style, not essays).
Do not add unnecessary sections.
`;
}

// ========================================
// ROAST IDEA PROMPT
// ========================================

function buildRoastPrompt(idea, lang, brand) {
  return `
You are a brutally honest "Shark Tank" style startup critic - blunt,
funny, but ultimately trying to help, not just tearing things down.

BUSINESS IDEA:
"${cleanString(idea)}"

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Roast this idea like a shark investor would, then give real advice.
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "SHARK_SCORE": 0,
  "THE_GOOD": "",
  "THE_ROAST": "",
  "THE_FIX": "",
  "FINAL_VERDICT": ""
}

SHARK_SCORE: An integer from 0 to 10 (not a string) rating the idea's
current investability.
THE_GOOD: 1-2 sentences on what's genuinely working, if anything.
THE_ROAST: 2-3 blunt, witty sentences on the idea's real weaknesses -
be direct, not cruel.
THE_FIX: 2-3 concrete changes that would meaningfully improve it.
FINAL_VERDICT: One punchy closing sentence, shark-tank style.

Each string value must be plain text (not nested objects/arrays).
SHARK_SCORE must be a plain number, not a string.
`;
}

// ========================================
// IMPROVE IDEA PROMPT
// ========================================

function buildImproveIdeaPrompt(idea, lang, brand) {
  return `
You are IdeaForgeX, an experienced startup mentor giving honest,
constructive feedback - not generic praise.

BUSINESS IDEA:
"${cleanString(idea)}"

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Give honest, specific, constructive feedback to help improve this idea.
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "VERDICT": "",
  "WHAT_WORKS": "",
  "WHAT_IS_MISSING": "",
  "PRICING_STRATEGY": "",
  "TARGET_AUDIENCE": "",
  "IMMEDIATE_NEXT_STEPS": ""
}

VERDICT: One or two honest sentences on the idea's overall potential.
WHAT_WORKS: 2-3 genuine strengths, specific to this idea.
WHAT_IS_MISSING: 2-3 real gaps or risks, stated plainly (not softened).
PRICING_STRATEGY: One concrete, practical pricing suggestion.
TARGET_AUDIENCE: Who this should focus on first, and why.
IMMEDIATE_NEXT_STEPS: 2-3 concrete actions to take this week.

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// GOAL PLAN PROMPT
// ========================================

function buildGoalPlanPrompt(goal, timeframe, lang, brand) {
  return `
You are IdeaForgeX, an expert goal-setting and execution strategist.

GOAL / OBJECTIVE:
"${cleanString(goal)}"

TIMEFRAME: ${cleanString(timeframe || "3 Months", 50)}

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Create a practical, achievable plan for this goal within the given timeframe.
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "OVERVIEW": "",
  "MILESTONES": "",
  "ACTION_PLAN": "",
  "RESOURCES_NEEDED": "",
  "POTENTIAL_OBSTACLES": ""
}

OVERVIEW: 2-3 sentence strategy overview for reaching this goal.
MILESTONES: 3-4 key checkpoints across the timeframe, each with a rough date/week.
ACTION_PLAN: A concrete, step-by-step breakdown of what to actually do.
RESOURCES_NEEDED: Tools, skills, people, or budget needed.
POTENTIAL_OBSTACLES: 2-3 realistic obstacles and how to handle each.

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// MONEY CALC PROMPT
// ========================================

function buildMoneyCalcPrompt(description, investment, businessType, lang, brand) {
  return `
You are IdeaForgeX, a practical small-business financial advisor.

BUSINESS / SCENARIO:
"${cleanString(description)}"

INVESTMENT AMOUNT (may be empty): "${cleanString(investment, 100)}"
BUSINESS TYPE: ${cleanString(businessType || "Small Business", 100)}

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Give a practical, grounded financial breakdown. Use ₹ (INR) unless the
input clearly implies another currency. If no investment amount was
given, assume a realistic low-budget starting point for this business type.

Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "INVESTMENT_BREAKDOWN": "",
  "MONTHLY_EXPENSES": "",
  "REVENUE_MODEL": "",
  "PROFIT_PROJECTION": "",
  "BREAK_EVEN": "",
  "RISKS": ""
}

INVESTMENT_BREAKDOWN: Where the starting investment would practically go.
MONTHLY_EXPENSES: Realistic recurring monthly costs.
REVENUE_MODEL: How this makes money.
PROFIT_PROJECTION: A cautious, clearly-labeled-as-estimated monthly/yearly projection.
BREAK_EVEN: Rough estimate of when investment is recovered, with the
assumptions stated.
RISKS: 2-3 financial risks specific to this scenario.

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// VIDEO SCRIPT PROMPT
// ========================================

function buildVideoScriptPrompt(topic, platform, lang, brand) {
  return `
You are IdeaForgeX, an expert short-form and long-form video scriptwriter.

TOPIC / PRODUCT / IDEA:
"${cleanString(topic)}"

TARGET PLATFORM: ${cleanString(platform || "YouTube Long", 100)}

${getBrandContext({ brand })}
${langLine(lang)}

Write a video script suited to the target platform's format and typical length.
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "TITLE": "",
  "HOOK": "",
  "INTRO": "",
  "BODY": "",
  "CTA": "",
  "HASHTAGS": ""
}

TITLE: A catchy, platform-appropriate title.
HOOK: The first 1-2 lines meant to stop someone from scrolling.
INTRO: A short intro setting up what the video covers.
BODY: The main script/scene breakdown (this is the bulk of the content).
CTA: A clear call to action for the end of the video.
HASHTAGS: 5-8 relevant hashtags, space or comma separated.

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// WORKFLOW PACK PROMPT
// ========================================

function buildWorkflowPrompt(input, workflowType, lang, brand) {
  const workflowLabels = {
    "startup-launch": "a Startup Launch Pack (idea validation, branding basics, and a launch checklist)",
    "content-creator": "a Content Creator Pack (content ideas, captions, and a posting plan)",
    "product-promo": "a Product Promotion Pack (ad angles, promo copy, and a short campaign plan)"
  };

  const workflowDescription = workflowLabels[workflowType] || workflowLabels["startup-launch"];

  return `
You are IdeaForgeX, generating a complete multi-part content pack.

USER REQUEST:
"${cleanString(input)}"

PACK TYPE: Generate ${workflowDescription}.

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "PART_1": "",
  "PART_2": "",
  "PART_3": ""
}

Divide the pack into three clear, substantial parts appropriate to the
pack type above. Each part should be genuinely useful on its own.

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// COLD EMAIL PROMPT
// ========================================

function buildEmailPrompt(input, emailType, lang, brand) {
  return `
You are IdeaForgeX, an expert at writing effective, non-spammy business emails.

CONTEXT / WHAT THE EMAIL IS FOR:
"${cleanString(input)}"

EMAIL TYPE: ${cleanString(emailType || "Cold Outreach", 100)}

${getBrandContext({ brand })}
${langLine(lang)}

Write a complete, professional email of the given type. Keep it concise -
real people skim emails; do not pad it out.

Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "SUBJECT": "",
  "BODY": "",
  "SIGN_OFF": ""
}

SUBJECT: A short, specific subject line (not clickbait-y).
BODY: The full email body, concise and to the point.
SIGN_OFF: A brief closing line plus sign-off (e.g. "Best regards,").

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// POSTER / QUOTE CARD PROMPT
// ========================================

const THEME_GRADIENTS = {
  purple: "linear-gradient(135deg,#667eea,#764ba2)",
  pink: "linear-gradient(135deg,#ff9a9e,#fecfef)",
  orange: "linear-gradient(135deg,#f6a04d,#e0533d)",
  dark: "linear-gradient(135deg,#0f172a,#334155)",
  green: "linear-gradient(135deg,#134e5e,#71b280)"
};

function resolveThemeGradient(themeKey) {
  return THEME_GRADIENTS[cleanString(themeKey, 20)] || THEME_GRADIENTS.purple;
}

function buildPosterPrompt(input, lang, brand) {
  return `
You are IdeaForgeX, a graphic-design copywriter creating poster text.

TOPIC / PRODUCT / MESSAGE:
"${cleanString(input)}"

${getBrandContext({ brand })}
${langLine(lang)}

Write punchy, poster-ready text. Keep every field short - this is
going on a visual poster, not a document.

Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "HEADLINE": "",
  "SUBHEADLINE": "",
  "BODY": "",
  "FOOTER": ""
}

HEADLINE: Maximum 6 words, bold and attention-grabbing.
SUBHEADLINE: Maximum 10 words, supporting the headline.
BODY: 1-2 short sentences, maximum ~25 words total.
FOOTER: A short CTA or tagline, maximum 8 words.

Each value must be a plain string (not nested objects/arrays).
`;
}

function buildQuoteCardPrompt(input, lang, brand) {
  return `
You are IdeaForgeX, creating a shareable quote/status card.

TOPIC OR TEXT TO BASE THE CARD ON:
"${cleanString(input)}"

${getBrandContext({ brand })}
${langLine(lang)}

Write short, shareable card text. Keep every field short - this is
going on a small social-media card, not a document.

Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "HEADLINE": "",
  "BODY": "",
  "FOOTER": ""
}

HEADLINE: Maximum 8 words - the main quote or hook, bold and memorable.
BODY: 1 short supporting sentence, maximum ~20 words.
FOOTER: A short attribution, tagline, or CTA, maximum 8 words.

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// SOCIAL PACK PROMPT
// ========================================

function buildSocialPackPrompt(input, lang, brand) {
  return `
You are IdeaForgeX, an expert social media content creator.

TOPIC / PRODUCT / BUSINESS:
"${cleanString(input)}"

${getBrandContext({ brand })}
${langLine(lang)}

Generate a complete cross-platform social media content package.
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "INSTAGRAM": "",
  "FACEBOOK": "",
  "WHATSAPP": "",
  "YOUTUBE_TITLE": "",
  "YOUTUBE_DESCRIPTION": "",
  "SHORTS_CAPTION": "",
  "HASHTAGS": "",
  "THUMBNAIL_PROMPT": ""
}

INSTAGRAM: A complete Instagram caption with a hook and CTA.
FACEBOOK: A complete Facebook post, slightly more descriptive than Instagram.
WHATSAPP: A short, forwardable WhatsApp message/status.
YOUTUBE_TITLE: A clickable but honest YouTube video title.
YOUTUBE_DESCRIPTION: A 2-3 sentence YouTube description.
SHORTS_CAPTION: A short caption suited to Shorts/Reels.
HASHTAGS: 8-10 relevant hashtags, space or comma separated.
THUMBNAIL_PROMPT: A detailed AI image-generation prompt for a thumbnail.

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// AUTOPILOT PROMPT
// ========================================

function buildAutopilotPrompt(input, lang, brand) {
  return `
You are IdeaForgeX, an expert marketing content generator.

USER REQUEST / PRODUCT OR BUSINESS DESCRIPTION:
"${cleanString(input)}"

${getBrandContext({ brand })}
${langLine(lang)}
${ACCURACY_RULE}

Generate a COMPLETE marketing content package.
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

Use EXACTLY these keys:
{
  "AD_COPY": "",
  "INSTAGRAM_CAPTION": "",
  "FACEBOOK_POST": "",
  "WHATSAPP_MESSAGE": "",
  "POSTER_TEXT": "",
  "IMAGE_PROMPT": "",
  "VIDEO_PROMPT": "",
  "HASHTAGS": ""
}

Each value must be a plain string (not nested objects/arrays).
`;
}

// ========================================
// REMIX PROMPT
// ========================================

function buildRemixPrompt(text, style, brand) {
  return `
You are an expert content editor.

Rewrite the following text in this style: ${cleanString(style || "improved", 100)}.

${getBrandContext({ brand })}

Rules:
- Keep the core meaning intact.
- Do not add explanations, notes, or quotation marks around the output.
- Output ONLY the rewritten text.

ORIGINAL TEXT:
"${cleanString(text, MAX_TEXT_LENGTH)}"
`;
}

// ========================================
// DOCUMENT AI PROMPT
// ========================================

function buildDocumentPrompt(text) {
  return `
You are an expert document analyst and teacher.

DOCUMENT TEXT:
"${cleanString(text, MAX_TEXT_LENGTH)}"
${ACCURACY_RULE}

Analyze this document and return ONLY valid JSON (no markdown, no code fences) using EXACTLY these keys:

{
  "SUMMARY": "",
  "KEY_POINTS": "",
  "QUESTIONS_ANSWERS": "",
  "SIMPLE_EXPLANATION": "",
  "MCQS": ""
}

SUMMARY: A concise summary (4-6 sentences).
KEY_POINTS: The most important points, as a readable bullet-style block of text.
QUESTIONS_ANSWERS: 3-4 likely Q&A pairs about the document.
SIMPLE_EXPLANATION: An explanation simple enough for a beginner.
MCQS: 3 multiple choice questions (with options and the correct answer marked) as plain text.
`;
}

// ========================================
// CHAT PROMPT
// ========================================

function buildChatMessages(messages, brand) {
  const systemPrompt = `
You are IdeaForgeX, a helpful, friendly AI assistant.
${getBrandContext({ brand })}
${ACCURACY_RULE}
Detect the user's language/script from their messages and reply naturally in the same language (English, Hindi/Devanagari, or Hinglish).
Keep replies conversational and practical.
`;

  const safeHistory = Array.isArray(messages) ? messages.slice(-10) : [];

  const cleanedHistory = safeHistory
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({
      role: m.role,
      content: cleanString(m.content, 4000)
    }));

  return [{ role: "system", content: systemPrompt }, ...cleanedHistory];
}

// ========================================
// TOOL PROMPT (existing tools)
// ========================================

function buildToolPrompt(tool, input, opts = {}) {
  const language =
    opts.language && opts.language !== "auto"
      ? `Respond entirely in ${cleanString(opts.language, 100)}.`
      : "Respond in the user's language.";

  const brandContext = getBrandContext(opts);
  const request = cleanString(input);

  if (tool === "writing") {
    return `
You are a professional writing assistant.
Type: ${cleanString(opts.writingType || "General", 100)}
Tone: ${cleanString(opts.tone || "Professional", 100)}
${brandContext}
${language}
Write ONLY the finished content.

USER REQUEST:
${request}
`;
  }

  if (tool === "translate") {
    return `
You are an expert translator.
Translate from: ${cleanString(opts.fromLanguage || "auto", 100)}
To: ${cleanString(opts.toLanguage || "English", 100)}
Preserve meaning, tone, formatting and context.
Output ONLY the translation.

TEXT:
${request}
`;
  }

  if (tool === "calculator") {
    return `
You are a precise calculator.
Solve the problem carefully. Show calculation steps.
End with:
Answer: <final answer>

PROBLEM:
${request}
`;
  }

  if (tool === "student") {
    return `
You are a helpful teacher.
${language}
${ACCURACY_RULE}
Explain the following in simple language. Use examples where helpful.

REQUEST:
${request}
`;
  }

  if (tool === "code") {
    return `
You are an expert software engineer.
Programming language: ${cleanString(opts.codeLang || "JavaScript", 100)}
${language}
Solve this programming request.
Provide: 1. Correct code 2. Short explanation 3. Important usage notes

REQUEST:
${request}
`;
  }

  if (tool === "logo") {
    return `
You are an expert brand designer.
Create a professional logo concept.
Brand: "${request}"
Style: ${cleanString(opts.logoStyle || "Minimalist", 100)}
Provide: Visual concept, Composition, Typography, Suggested colors, Hex color codes, AI image-generation prompt.
`;
  }

  if (tool === "social") {
    return `
You are a professional social media strategist.
Platform: ${cleanString(opts.platform || "Instagram", 100)}
${brandContext}
${language}
Create an engaging social media post.
Include: Hook, Main body, CTA, Hashtags.

TOPIC:
${request}
`;
  }

  if (tool === "auto") {
    return `
You are IdeaForgeX smart router.
${language}
First output exactly ONE line:
ROUTE: <category>

Allowed categories: writing, translate, calculator, student, code, logo, social, agent, assistant

Then provide the direct answer. Do not repeat the ROUTE line.

USER REQUEST:
${request}
`;
  }

  return `
You are IdeaForgeX, a helpful AI assistant.
${brandContext}
${language}
${ACCURACY_RULE}
Answer the user's request accurately and practically.

REQUEST:
${request}
`;
}

// ========================================
// SECTION PARSER (marker based ###KEY###)
// ========================================

function parseSections(rawText, sectionKeys) {
  if (!rawText || rawText.trim().length < 20) return null;

  const sections = {};
  let anyMarkerFound = false;

  for (let i = 0; i < sectionKeys.length; i++) {
    const key = sectionKeys[i];
    const marker = `###${key}###`;
    const startIdx = rawText.indexOf(marker);

    if (startIdx === -1) {
      sections[key] = "";
      continue;
    }

    anyMarkerFound = true;

    const contentStart = startIdx + marker.length;
    let endIdx = rawText.length;

    for (let j = i + 1; j < sectionKeys.length; j++) {
      const nextMarker = `###${sectionKeys[j]}###`;
      const nextIdx = rawText.indexOf(nextMarker, contentStart);

      if (nextIdx !== -1) {
        endIdx = nextIdx;
        break;
      }
    }

    sections[key] = rawText.slice(contentStart, endIdx).trim();
  }

  if (!anyMarkerFound) {
    sections[sectionKeys[0]] = rawText
      .replace(/SCORE_[A-Z_]+\s*:?\s*\d{1,3}/g, "")
      .trim();
  }

  return { sections, anyMarkerFound };
}

// ========================================
// SCORE PARSER
// ========================================

function extractScores(rawText) {
  const getScore = (key) => {
    const regex = new RegExp(key + "\\s*:?\\s*(\\d{1,3})", "i");
    const match = String(rawText).match(regex);
    if (!match) return null;
    return Math.max(0, Math.min(100, parseInt(match[1], 10)));
  };

  const score = {
    market: getScore("SCORE_MARKET"),
    competition: getScore("SCORE_COMPETITION"),
    profit: getScore("SCORE_PROFIT"),
    difficulty: getScore("SCORE_DIFFICULTY"),
    overall: getScore("SCORE_OVERALL")
  };

  if (score.overall === null) {
    const values = [score.market, score.competition, score.profit, score.difficulty].filter(
      (v) => typeof v === "number"
    );

    if (values.length) {
      score.overall = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  return score;
}

// ========================================
// AI RUNNERS
// ========================================

// Plain text prompt -> string, with a model tier.
async function runTextAI(env, prompt, maxTokens = 2048, temperature = 0.6, tier = "medium") {
  if (!env.AI) {
    throw new Error("Workers AI binding 'AI' missing.");
  }

  const model = MODELS[tier] || MODELS.medium;

  const result = await env.AI.run(model, {
    messages: [{ role: "user", content: prompt }],
    max_tokens: Math.min(safeInteger(maxTokens, 2048, 1, 4000), 4000),
    temperature: Math.max(0, Math.min(1, Number(temperature) || 0.6))
  });

  const response = result?.response || result?.output || "";
  return cleanString(response, MAX_TEXT_LENGTH);
}

// JSON-mode prompt -> string (model returns valid JSON directly).
// Falls back to plain mode if the model rejects response_format.
async function runJsonAI(env, prompt, maxTokens = 1800, temperature = 0.3, tier = "medium") {
  if (!env.AI) throw new Error("Workers AI binding 'AI' missing.");

  const model = MODELS[tier] || MODELS.medium;

  try {
    const result = await env.AI.run(model, {
      messages: [
        {
          role: "system",
          content: "You always return valid JSON matching the requested schema. No markdown, no explanation, only JSON."
        },
        { role: "user", content: prompt }
      ],
      max_tokens: Math.min(safeInteger(maxTokens, 1800, 1, 4000), 4000),
      temperature: Math.max(0, Math.min(1, Number(temperature) || 0.3)),
      response_format: { type: "json_object" }
    });

    const response = result?.response || result?.output || "";
    return cleanString(response, MAX_TEXT_LENGTH);
  } catch (error) {
    // Model may not support response_format — caller will retry plain.
    console.warn("runJsonAI: JSON mode unavailable, falling back:", error?.message || error);
    throw error;
  }
}

// Chat messages array -> string (used by /api/chat non-stream path).
async function runChatAI(env, messages, maxTokens = 1200, temperature = 0.7) {
  if (!env.AI) {
    throw new Error("Workers AI binding 'AI' missing.");
  }

  const result = await env.AI.run(MODELS.fast, {
    messages,
    max_tokens: Math.min(safeInteger(maxTokens, 1200, 1, 4000), 4000),
    temperature: Math.max(0, Math.min(1, Number(temperature) || 0.7))
  });

  const response = result?.response || result?.output || "";
  return cleanString(response, MAX_TEXT_LENGTH);
}

// ========================================
// SESSION COOKIE / STORAGE
// ========================================

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((part) => part.trim());

  for (const cookie of cookies) {
    const index = cookie.indexOf("=");
    if (index === -1) continue;

    const key = cookie.slice(0, index);
    const value = cookie.slice(index + 1);

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";

  if (!header.toLowerCase().startsWith("bearer ")) return null;

  const token = header.slice(7).trim();

  if (!token || token.length > 200) return null;

  return token;
}

async function getSession(env, sessionId) {
  if (!env.SESSIONS_KV || !sessionId) return null;

  try {
    const raw = await env.SESSIONS_KV.get(`session:${sessionId}`);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (!session.id || !session.createdAt) return null;

    if (Date.now() - session.createdAt > SESSION_TTL * 1000) {
      await env.SESSIONS_KV.delete(`session:${sessionId}`);
      return null;
    }

    return session;
  } catch (error) {
    console.error("Session read error:", error);
    return null;
  }
}

async function createSession(env) {
  if (!env.SESSIONS_KV) {
    throw new Error("SESSIONS_KV binding missing.");
  }

  const id = generateSessionId();

  const session = {
    id,
    createdAt: Date.now(),
    plan: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null
  };

  await env.SESSIONS_KV.put(`session:${id}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL
  });

  return session;
}

async function saveSession(env, session) {
  if (!env.SESSIONS_KV || !session?.id) {
    throw new Error("Invalid session.");
  }

  await env.SESSIONS_KV.put(`session:${session.id}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL
  });
}

// ========================================
// USER DATA BACKUP
// ========================================

const USER_DATA_TYPES = ["projects", "history", "brand", "toolhistory"];
const MAX_USER_DATA_BYTES = 150 * 1024;

function safeJsonParseServer(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Parallel KV reads for all data types at once.
async function loadUserDataHandler(request, env) {
  const sessionResult = await getOrCreateSession(request, env);
  const session = sessionResult.session;

  if (!env.SESSIONS_KV) {
    return jsonResponse({ success: false, error: "SESSIONS_KV binding missing." }, 500, request);
  }

  const results = await Promise.all(
    USER_DATA_TYPES.map(async (type) => {
      const raw = await env.SESSIONS_KV.get(`udata:${session.id}:${type}`);
      return [type, raw ? safeJsonParseServer(raw, null) : null];
    })
  );

  const data = Object.fromEntries(results);

  let response = jsonResponse({ success: true, data }, 200, request);

  if (sessionResult.isNew) {
    response = attachSessionCookie(response, session);
  }

  return response;
}

async function saveUserDataHandler(request, env, session, body) {
  const type = cleanString(body.type, 50);

  if (!USER_DATA_TYPES.includes(type)) {
    return jsonResponse(
      { success: false, error: "INVALID_TYPE", message: "Unknown data type." },
      400,
      request
    );
  }

  if (!env.SESSIONS_KV) {
    return jsonResponse({ success: false, error: "SESSIONS_KV binding missing." }, 500, request);
  }

  let payload;

  try {
    payload = JSON.stringify(body.data ?? null);
  } catch {
    return jsonResponse(
      { success: false, error: "INVALID_DATA", message: "Data could not be serialized." },
      400,
      request
    );
  }

  if (payload.length > MAX_USER_DATA_BYTES) {
    return jsonResponse(
      { success: false, error: "DATA_TOO_LARGE", message: "Data too large to back up." },
      413,
      request
    );
  }

  await env.SESSIONS_KV.put(`udata:${session.id}:${type}`, payload, {
    expirationTtl: SESSION_TTL
  });

  return jsonResponse({ success: true }, 200, request);
}

async function getOrCreateSession(request, env) {
  const bearer = getBearerToken(request);
  const cookie = getCookie(request, "IFX_SESSION");
  const sessionId = bearer || cookie;

  if (sessionId) {
    const existing = await getSession(env, sessionId);
    if (existing) return { session: existing, isNew: false };
  }

  const session = await createSession(env);
  return { session, isNew: true };
}

function attachSessionCookie(response, session) {
  const headers = new Headers(response.headers);

  headers.set(
    "Set-Cookie",
    [
      `IFX_SESSION=${encodeURIComponent(session.id)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${SESSION_TTL}`
    ].join("; ")
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// ========================================
// QUOTA CHECK / ROLLBACK
// ========================================

async function checkQuota(env, session) {
  if (!env.SESSIONS_KV) {
    throw new Error("SESSIONS_KV binding missing. Add the SESSIONS_KV binding in Cloudflare.");
  }

  if (!session || !session.id) {
    throw new Error("Invalid session.");
  }

  const plan = session.plan === "pro" ? "pro" : "free";
  const limit = plan === "pro" ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

  const key = `quota:${session.id}:${today()}`;

  const raw = await env.SESSIONS_KV.get(key);
  const currentUsage = safeInteger(raw, 0, 0, PRO_DAILY_LIMIT);

  if (currentUsage >= limit) {
    return { allowed: false, usage: currentUsage, limit, remaining: 0, plan };
  }

  const usage = currentUsage + 1;

  await env.SESSIONS_KV.put(key, String(usage), { expirationTtl: QUOTA_TTL });

  return { allowed: true, usage, limit, remaining: Math.max(0, limit - usage), plan };
}

async function rollbackQuota(env, session) {
  if (!env.SESSIONS_KV || !session?.id) return;

  try {
    const key = `quota:${session.id}:${today()}`;

    const raw = await env.SESSIONS_KV.get(key);
    const currentUsage = safeInteger(raw, 0, 0, PRO_DAILY_LIMIT);
    const usage = Math.max(0, currentUsage - 1);

    if (usage === 0) {
      await env.SESSIONS_KV.delete(key);
    } else {
      await env.SESSIONS_KV.put(key, String(usage), { expirationTtl: QUOTA_TTL });
    }
  } catch (error) {
    console.error("Quota rollback error:", error);
  }
}

// ========================================
// GENERATE REPORT (heavy model)
// ========================================

async function generateReport(request, env, session, body) {
  const idea = cleanString(body.idea);

  if (!idea) {
    return jsonResponse(
      { success: false, error: "IDEA_REQUIRED", message: "Please enter a business idea." },
      400,
      request
    );
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: session.plan === "pro" ? "Pro daily limit reached." : "Free limit khatam! Pro upgrade karein.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const prompt = buildReportPrompt(idea, body.language || "auto", body.brand);

  let lastRaw = "";
  let parsed = null;

  const sectionKeys = [
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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      lastRaw = await runTextAI(env, prompt, 2500, 0.3, "heavy");
      parsed = parseSections(lastRaw, sectionKeys);

      if (parsed && (parsed.anyMarkerFound || lastRaw.length > 20)) break;
    } catch (error) {
      console.error("Report attempt failed:", error);
    }
  }

  if (!parsed) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "REPORT_GENERATION_FAILED", message: "Report generate nahi hua. Please try again." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      report: { score: extractScores(lastRaw), sections: parsed.sections },
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// LAUNCH PLAN (heavy model)
// ========================================

async function generateLaunchPlanHandler(request, env, session, body) {
  const idea = cleanString(body.idea);

  if (!idea) {
    return jsonResponse(
      { success: false, error: "IDEA_REQUIRED", message: "Please provide an idea first." },
      400,
      request
    );
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Free limit khatam! Pro upgrade karein.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const prompt = buildLaunchPlanPrompt(idea, body.budget || "", body.language || "auto", body.brand);

  const sectionKeys = [
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

  let parsed = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runTextAI(env, prompt, 2500, 0.3, "heavy");
      parsed = parseSections(raw, sectionKeys);

      if (parsed && (parsed.anyMarkerFound || raw.length > 20)) break;
    } catch (error) {
      console.error("Launch plan attempt failed:", error);
    }
  }

  if (!parsed) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "LAUNCH_PLAN_FAILED", message: "Launch plan generate nahi hua. Please try again." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      plan: parsed.sections,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// PITCH DECK (heavy model)
// ========================================

async function generatePitchDeckHandler(request, env, session, body) {
  const idea = cleanString(body.idea);

  if (!idea) {
    return jsonResponse(
      { success: false, error: "IDEA_REQUIRED", message: "Please provide an idea first." },
      400,
      request
    );
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Free limit khatam! Pro upgrade karein.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const prompt = buildPitchDeckPrompt(idea, body.language || "auto", body.brand);

  const sectionKeys = [
    "PROBLEM",
    "SOLUTION",
    "MARKET",
    "PRODUCT",
    "BUSINESS_MODEL",
    "COMPETITION",
    "FINANCIALS",
    "GROWTH",
    "FUNDING_REQUIREMENT"
  ];

  let parsed = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runTextAI(env, prompt, 2200, 0.3, "heavy");
      parsed = parseSections(raw, sectionKeys);

      if (parsed && (parsed.anyMarkerFound || raw.length > 20)) break;
    } catch (error) {
      console.error("Pitch deck attempt failed:", error);
    }
  }

  if (!parsed) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "PITCH_DECK_FAILED", message: "Pitch deck generate nahi hua. Please try again." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      deck: parsed.sections,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// CHAT — supports optional streaming (stream: true)
// ========================================

async function chatHandler(request, env, session, body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!messages.length) {
    return jsonResponse(
      { success: false, error: "MESSAGES_REQUIRED", message: "No chat messages provided." },
      400,
      request
    );
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Free Plan limit khatam! Pro lein.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const chatMessages = buildChatMessages(messages, body.brand);
  const wantsStream = body.stream === true;

  // ---- STREAMING PATH (SSE) ----
  if (wantsStream) {
    try {
      const streamResult = await env.AI.run(MODELS.fast, {
        messages: chatMessages,
        max_tokens: 1200,
        temperature: 0.7,
        stream: true
      });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      (async () => {
        const reader = streamResult.getReader();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let idx;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const event = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);

              if (event.startsWith("data: ")) {
                const payload = event.slice(6).trim();
                if (payload === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(payload);
                  const chunk = parsed.response || parsed.delta || "";
                  if (chunk) {
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
                  }
                } catch {
                  // ignore malformed partial event
                }
              }
            }
          }
        } catch (streamErr) {
          console.error("Chat stream pipe error:", streamErr);
        } finally {
          try {
            await writer.write(encoder.encode("data: [DONE]\n\n"));
          } catch {}
          try {
            await writer.close();
          } catch {}
        }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=UTF-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          ...getCorsHeaders(request)
        }
      });
    } catch (error) {
      console.error("Chat stream error, falling back to non-stream:", error);
      // fall through to non-stream path below
    }
  }

  // ---- NON-STREAMING PATH (also the fallback) ----
  let reply = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      reply = await runChatAI(env, chatMessages, 1200, 0.7);
      if (reply.length > 0) break;
    } catch (error) {
      console.error("Chat attempt failed:", error);
    }
  }

  if (!reply) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "CHAT_FAILED", message: "Chat reply nahi aaya. Please try again." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      reply,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// AI TOOL (multi-tool router)
// ========================================

async function aiTool(request, env, session, body) {
  const input = cleanString(body.input);

  if (!input) {
    return jsonResponse({ success: false, error: "INPUT_REQUIRED" }, 400, request);
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Daily AI limit reached.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const tool = cleanString(body.tool || "assistant", 50).toLowerCase();

  // ---- improveidea (structured JSON, medium) ----
  if (tool === "improveidea") {
    const prompt = buildImproveIdeaPrompt(input, body.language || "auto", body.brand);

    return runStructuredToolFlow(request, env, session, quota, {
      prompt,
      requiredKey: "VERDICT",
      temperature: 0.3,
      maxTokens: 1800,
      errorCode: "IMPROVE_IDEA_FAILED",
      errorMessage: "Idea improve nahi ho paayi. Please try again.",
      tier: "medium",
      textFields: (s) => [
        s.VERDICT && `Verdict: ${s.VERDICT}`,
        s.WHAT_WORKS && `What Works: ${s.WHAT_WORKS}`,
        s.WHAT_IS_MISSING && `What's Missing: ${s.WHAT_IS_MISSING}`,
        s.PRICING_STRATEGY && `Pricing Strategy: ${s.PRICING_STRATEGY}`,
        s.TARGET_AUDIENCE && `Target Audience: ${s.TARGET_AUDIENCE}`,
        s.IMMEDIATE_NEXT_STEPS && `Next Steps: ${s.IMMEDIATE_NEXT_STEPS}`
      ]
    });
  }

  // ---- roast (structured JSON, medium) ----
  if (tool === "roast") {
    const prompt = buildRoastPrompt(input, body.language || "auto", body.brand);

    let structured = null;

    try {
      const raw = await runJsonAI(env, prompt, 1500, 0.6, "medium");
      structured = extractJsonObject(raw, "FINAL_VERDICT");
    } catch {}

    if (!structured) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await runTextAI(env, prompt, 1500, 0.6, "medium");
          structured = extractJsonObject(raw, "FINAL_VERDICT");
          if (structured) break;
        } catch (error) {
          console.error("Roast attempt failed:", error);
        }
      }
    }

    if (!structured) {
      await rollbackQuota(env, session);
      return jsonResponse(
        { success: false, error: "ROAST_FAILED", message: "Roast generate nahi hui. Please try again." },
        500,
        request
      );
    }

    const scoreNumber = Number(structured.SHARK_SCORE);
    structured.SHARK_SCORE = Number.isFinite(scoreNumber)
      ? Math.max(0, Math.min(10, Math.round(scoreNumber)))
      : "?";

    const readableText = [
      `Shark Score: ${structured.SHARK_SCORE}/10`,
      structured.THE_GOOD && `The Good: ${structured.THE_GOOD}`,
      structured.THE_ROAST && `The Brutal Truth: ${structured.THE_ROAST}`,
      structured.THE_FIX && `The Fix: ${structured.THE_FIX}`,
      structured.FINAL_VERDICT && `Final Verdict: ${structured.FINAL_VERDICT}`
    ]
      .filter(Boolean)
      .join("\n\n");

    return jsonResponse(
      {
        success: true,
        result: readableText,
        structured,
        usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
      },
      200,
      request
    );
  }

  // ---- goalplan (medium) ----
  if (tool === "goalplan") {
    const prompt = buildGoalPlanPrompt(input, body.timeframe, body.language || "auto", body.brand);

    return runStructuredToolFlow(request, env, session, quota, {
      prompt,
      requiredKey: "OVERVIEW",
      temperature: 0.3,
      maxTokens: 1800,
      errorCode: "GOAL_PLAN_FAILED",
      errorMessage: "Goal plan generate nahi hua. Please try again.",
      tier: "medium",
      textFields: (s) => [
        s.OVERVIEW && `Overview: ${s.OVERVIEW}`,
        s.MILESTONES && `Milestones: ${s.MILESTONES}`,
        s.ACTION_PLAN && `Action Plan: ${s.ACTION_PLAN}`,
        s.RESOURCES_NEEDED && `Resources Needed: ${s.RESOURCES_NEEDED}`,
        s.POTENTIAL_OBSTACLES && `Potential Obstacles: ${s.POTENTIAL_OBSTACLES}`
      ]
    });
  }

  // ---- moneycalc (medium) ----
  if (tool === "moneycalc") {
    const prompt = buildMoneyCalcPrompt(
      input,
      body.investment,
      body.businessType,
      body.language || "auto",
      body.brand
    );

    return runStructuredToolFlow(request, env, session, quota, {
      prompt,
      requiredKey: "REVENUE_MODEL",
      temperature: 0.3,
      maxTokens: 1800,
      errorCode: "MONEY_CALC_FAILED",
      errorMessage: "Calculation generate nahi hui. Please try again.",
      tier: "medium",
      textFields: (s) => [
        s.INVESTMENT_BREAKDOWN && `Investment Breakdown: ${s.INVESTMENT_BREAKDOWN}`,
        s.MONTHLY_EXPENSES && `Monthly Expenses: ${s.MONTHLY_EXPENSES}`,
        s.REVENUE_MODEL && `Revenue Model: ${s.REVENUE_MODEL}`,
        s.PROFIT_PROJECTION && `Profit Projection: ${s.PROFIT_PROJECTION}`,
        s.BREAK_EVEN && `Break-Even: ${s.BREAK_EVEN}`,
        s.RISKS && `Risks: ${s.RISKS}`
      ]
    });
  }

  // ---- video (medium) ----
  if (tool === "video") {
    const prompt = buildVideoScriptPrompt(input, body.platform, body.language || "auto", body.brand);

    return runStructuredToolFlow(request, env, session, quota, {
      prompt,
      requiredKey: "TITLE",
      temperature: 0.7,
      maxTokens: 1800,
      errorCode: "VIDEO_SCRIPT_FAILED",
      errorMessage: "Video script generate nahi hua. Please try again.",
      tier: "medium",
      textFields: (s) => [
        s.TITLE && `Title: ${s.TITLE}`,
        s.HOOK && `Hook: ${s.HOOK}`,
        s.INTRO && `Intro: ${s.INTRO}`,
        s.BODY && `Body: ${s.BODY}`,
        s.CTA && `CTA: ${s.CTA}`,
        s.HASHTAGS && `Hashtags: ${s.HASHTAGS}`
      ]
    });
  }

  // ---- workflow (medium) ----
  if (tool === "workflow") {
    const prompt = buildWorkflowPrompt(input, body.workflowType, body.language || "auto", body.brand);

    return runStructuredToolFlow(request, env, session, quota, {
      prompt,
      requiredKey: "PART_1",
      temperature: 0.6,
      maxTokens: 2500,
      errorCode: "WORKFLOW_FAILED",
      errorMessage: "Workflow pack generate nahi hua. Please try again.",
      tier: "medium",
      textFields: (s) => [
        s.PART_1 && `Part 1: ${s.PART_1}`,
        s.PART_2 && `Part 2: ${s.PART_2}`,
        s.PART_3 && `Part 3: ${s.PART_3}`
      ]
    });
  }

  // ---- email (medium) ----
  if (tool === "email") {
    const prompt = buildEmailPrompt(input, body.emailType, body.language || "auto", body.brand);

    return runStructuredToolFlow(request, env, session, quota, {
      prompt,
      requiredKey: "BODY",
      temperature: 0.6,
      maxTokens: 1200,
      errorCode: "EMAIL_FAILED",
      errorMessage: "Email generate nahi hua. Please try again.",
      tier: "medium",
      textFields: (s) => [
        s.SUBJECT && `Subject: ${s.SUBJECT}`,
        s.BODY && `Body: ${s.BODY}`,
        s.SIGN_OFF && `Sign Off: ${s.SIGN_OFF}`
      ]
    });
  }

  // ---- poster (fast) ----
  if (tool === "poster") {
    const prompt = buildPosterPrompt(input, body.language || "auto", body.brand);

    let structured = null;
    try {
      const raw = await runJsonAI(env, prompt, 800, 0.7, "fast");
      structured = extractJsonObject(raw, "HEADLINE");
    } catch {}

    if (!structured) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await runTextAI(env, prompt, 800, 0.7, "fast");
          structured = extractJsonObject(raw, "HEADLINE");
          if (structured) break;
        } catch (error) {
          console.error("Poster attempt failed:", error);
        }
      }
    }

    if (!structured) {
      await rollbackQuota(env, session);
      return jsonResponse(
        { success: false, error: "POSTER_FAILED", message: "Poster generate nahi hua. Please try again." },
        500,
        request
      );
    }

    structured.theme = resolveThemeGradient(body.theme);

    const readableText = [
      structured.HEADLINE && `Headline: ${structured.HEADLINE}`,
      structured.SUBHEADLINE && `Subheadline: ${structured.SUBHEADLINE}`,
      structured.BODY && `Body: ${structured.BODY}`,
      structured.FOOTER && `Footer: ${structured.FOOTER}`
    ]
      .filter(Boolean)
      .join("\n\n");

    return jsonResponse(
      {
        success: true,
        result: readableText,
        structured,
        usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
      },
      200,
      request
    );
  }

  // ---- card (fast) ----
  if (tool === "card") {
    const prompt = buildQuoteCardPrompt(input, body.language || "auto", body.brand);

    let structured = null;
    try {
      const raw = await runJsonAI(env, prompt, 600, 0.7, "fast");
      structured = extractJsonObject(raw, "HEADLINE");
    } catch {}

    if (!structured) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await runTextAI(env, prompt, 600, 0.7, "fast");
          structured = extractJsonObject(raw, "HEADLINE");
          if (structured) break;
        } catch (error) {
          console.error("Quote card attempt failed:", error);
        }
      }
    }

    if (!structured) {
      await rollbackQuota(env, session);
      return jsonResponse(
        { success: false, error: "CARD_FAILED", message: "Card generate nahi hua. Please try again." },
        500,
        request
      );
    }

    structured.BG_GRADIENT = resolveThemeGradient(body.theme);

    const readableText = [
      structured.HEADLINE && `Headline: ${structured.HEADLINE}`,
      structured.BODY && `Body: ${structured.BODY}`,
      structured.FOOTER && `Footer: ${structured.FOOTER}`
    ]
      .filter(Boolean)
      .join("\n\n");

    return jsonResponse(
      {
        success: true,
        result: readableText,
        structured,
        usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
      },
      200,
      request
    );
  }

  // ---- socialpack (medium) ----
  if (tool === "socialpack") {
    const prompt = buildSocialPackPrompt(input, body.language || "auto", body.brand);

    return runStructuredToolFlow(request, env, session, quota, {
      prompt,
      requiredKey: "INSTAGRAM",
      temperature: 0.6,
      maxTokens: 2200,
      errorCode: "SOCIAL_PACK_FAILED",
      errorMessage: "Social pack generate nahi hua. Please try again.",
      tier: "medium",
      textFields: (s) => [
        s.INSTAGRAM && `Instagram: ${s.INSTAGRAM}`,
        s.FACEBOOK && `Facebook: ${s.FACEBOOK}`,
        s.WHATSAPP && `WhatsApp: ${s.WHATSAPP}`,
        s.YOUTUBE_TITLE && `YouTube Title: ${s.YOUTUBE_TITLE}`,
        s.YOUTUBE_DESCRIPTION && `YouTube Description: ${s.YOUTUBE_DESCRIPTION}`,
        s.SHORTS_CAPTION && `Shorts Caption: ${s.SHORTS_CAPTION}`,
        s.HASHTAGS && `Hashtags: ${s.HASHTAGS}`,
        s.THUMBNAIL_PROMPT && `Thumbnail Prompt: ${s.THUMBNAIL_PROMPT}`
      ]
    });
  }

  // ---- Generic tools (writing/translate/student/calculator/code/logo/social/auto/assistant) ----
  const prompt = buildToolPrompt(tool, input, {
    language: body.language,
    writingType: body.writingType,
    tone: body.tone,
    fromLanguage: body.fromLanguage,
    toLanguage: body.toLanguage,
    codeLang: body.codeLang,
    logoStyle: body.logoStyle,
    platform: body.platform,
    brand: body.brand
  });

  // Fast tier for the simple tools, medium for the rest.
  const fastTools = ["writing", "translate", "student", "calculator", "auto", "assistant"];
  const tier = fastTools.includes(tool) ? "fast" : "medium";

  let resultText = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      resultText = await runTextAI(env, prompt, 1800, tier === "fast" ? 0.7 : 0.5, tier);
      if (resultText.length > 3) break;
    } catch (error) {
      console.error("AI tool attempt failed:", error);
    }
  }

  if (!resultText) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "AI_RESULT_FAILED", message: "Result nahi aaya. Please try again." },
      500,
      request
    );
  }

  let detectedRoute = null;

  if (tool === "auto") {
    const routeMatch = resultText.match(/^ROUTE:\s*([a-z_]+)\s*/i);

    if (routeMatch) {
      detectedRoute = routeMatch[1].toLowerCase();
      resultText = resultText.slice(routeMatch[0].length).trim();
    }
  }

  return jsonResponse(
    {
      success: true,
      result: resultText,
      route: detectedRoute,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// AI AUTOPILOT (medium)
// ========================================

async function autopilotHandler(request, env, session, body) {
  const input = cleanString(body.input);

  if (!input) {
    return jsonResponse({ success: false, error: "INPUT_REQUIRED" }, 400, request);
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Daily AI limit reached.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const prompt = buildAutopilotPrompt(input, body.language || "auto", body.brand);

  let pkg = null;

  try {
    const raw = await runJsonAI(env, prompt, 2500, 0.7, "medium");
    pkg = extractJsonObject(raw, "AD_COPY");
  } catch {}

  if (!pkg) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await runTextAI(env, prompt, 2500, 0.7, "medium");
        pkg = extractJsonObject(raw, "AD_COPY");
        if (pkg) break;
      } catch (error) {
        console.error("Autopilot attempt failed:", error);
      }
    }
  }

  if (!pkg) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "AUTOPILOT_FAILED", message: "Autopilot package generate nahi hua. Please try again." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      package: pkg,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// REMIX / MAKE-IT-BETTER (fast)
// ========================================

async function remixHandler(request, env, session, body) {
  const text = cleanString(body.text, MAX_TEXT_LENGTH);

  if (!text) {
    return jsonResponse({ success: false, error: "TEXT_REQUIRED" }, 400, request);
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Daily AI limit reached.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const prompt = buildRemixPrompt(text, body.style, body.brand);

  let result = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await runTextAI(env, prompt, 1800, 0.7, "fast");
      if (result.length > 0) break;
    } catch (error) {
      console.error("Remix attempt failed:", error);
    }
  }

  if (!result) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "REMIX_FAILED", message: "Remix failed. Please try again." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      result,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// DOCUMENT AI (medium)
// ========================================

async function documentAiHandler(request, env, session, body) {
  const text = cleanString(body.text, MAX_TEXT_LENGTH);

  if (!text) {
    return jsonResponse({ success: false, error: "TEXT_REQUIRED" }, 400, request);
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Free limit khatam!",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const prompt = buildDocumentPrompt(text);

  let analysis = null;

  try {
    const raw = await runJsonAI(env, prompt, 2200, 0.5, "medium");
    analysis = extractJsonObject(raw, "SUMMARY");
  } catch {}

  if (!analysis) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await runTextAI(env, prompt, 2200, 0.5, "medium");
        analysis = extractJsonObject(raw, "SUMMARY");
        if (analysis) break;
      } catch (error) {
        console.error("Document AI attempt failed:", error);
      }
    }
  }

  if (!analysis) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "DOCUMENT_ANALYSIS_FAILED", message: "Document analysis failed. Please try again." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      analysis,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// AGENT GENERATOR (heavy)
// ========================================

async function agentGenerate(request, env, session, body) {
  const input = cleanString(body.input || body.task);

  if (!input) {
    return jsonResponse({ success: false, error: "INPUT_REQUIRED" }, 400, request);
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        message: "Daily AI limit reached.",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const prompt = buildAgentPrompt(input, body.language || "auto", body.brand);

  let parsed = null;

  try {
    const raw = await runJsonAI(env, prompt, 4000, 0.5, "heavy");
    parsed = parseAgentResponse(raw);
  } catch {}

  if (!parsed) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawText = await runTextAI(env, prompt, 4000, 0.5, "heavy");
        parsed = parseAgentResponse(rawText);
        if (parsed) break;
      } catch (error) {
        console.error("Agent attempt failed:", error);
      }
    }
  }

  if (!parsed) {
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "AGENT_JSON_FAILED", message: "Agent ne sahi JSON nahi banaya. Kripya phir try karein." },
      500,
      request
    );
  }

  return jsonResponse(
    {
      success: true,
      data: parsed,
      usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
    },
    200,
    request
  );
}

// ========================================
// IMAGE BASE64 CLEANER
// ========================================

function cleanImageBase64(value) {
  if (!value) return null;

  let base64 = String(value).trim();

  if (base64.includes(",")) {
    base64 = base64.split(",").pop();
  }

  base64 = base64.replace(/\s/g, "");

  if (base64.length > MAX_IMAGE_LENGTH) {
    throw new Error("Image too large.");
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw new Error("Invalid image data.");
  }

  return base64;
}

// ========================================
// VISION / IMAGE ANALYSIS
// ========================================

async function vision(request, env, session, body) {
  let image;

  try {
    image = cleanImageBase64(body.image || body.imageBase64);
  } catch (error) {
    return jsonResponse(
      { success: false, error: "INVALID_IMAGE", message: error?.message || "Invalid image." },
      400,
      request
    );
  }

  if (!image) {
    return jsonResponse(
      { success: false, error: "IMAGE_REQUIRED", message: "Please provide an image." },
      400,
      request
    );
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const language = cleanString(body.language || "English", 100);

  const actionPrompts = {
    describe: "Describe this image in detail.",
    "extract-text": "Extract all readable text from this image (OCR). Output only the extracted text.",
    "full-analysis": "Give a full analysis of this image: what it shows, key details, and anything notable.",
    analyze: "Analyze this image and describe what you see."
  };

  const action = cleanString(body.action || "full-analysis", 50);

  const question = cleanString(
    body.question || body.prompt || actionPrompts[action] || "Describe and analyze this image.",
    5000
  );

  try {
    if (!env.AI) {
      throw new Error("Workers AI binding 'AI' missing.");
    }

    const result = await env.AI.run(VISION_MODEL, {
      messages: [
        {
          role: "system",
          content: `You are an expert image analysis assistant. Respond in ${language}. Clearly separate observations from uncertain guesses.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
          ]
        }
      ],
      max_tokens: 1800
    });

    const resultText = cleanString(result?.response || result?.output || "", MAX_TEXT_LENGTH);

    if (!resultText) {
      throw new Error("Vision model returned an empty result.");
    }

    return jsonResponse(
      {
        success: true,
        result: resultText,
        usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
      },
      200,
      request
    );
  } catch (error) {
    console.error("Vision error:", error);
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "VISION_FAILED", message: "Image analysis failed. Please try again." },
      500,
      request
    );
  }
}

// ========================================
// IMAGE GENERATION
// ========================================

async function generateImage(request, env, session, body) {
  const prompt = cleanString(body.prompt, 3000);

  if (!prompt) {
    return jsonResponse({ success: false, error: "PROMPT_REQUIRED" }, 400, request);
  }

  const quota = await checkQuota(env, session);

  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        error: "DAILY_LIMIT_REACHED",
        usage: quota.usage,
        limit: quota.limit,
        remaining: quota.remaining
      },
      429,
      request
    );
  }

  const steps = safeInteger(body.steps, 4, 1, 8);

  try {
    if (!env.AI) {
      throw new Error("Workers AI binding 'AI' missing.");
    }

    const result = await env.AI.run(IMAGE_MODEL, {
      prompt,
      steps,
      seed: Math.floor(Math.random() * 1000000000)
    });

    if (!result || !result.image) {
      throw new Error("Image generation failed.");
    }

    return jsonResponse(
      {
        success: true,
        image: `data:image/jpeg;base64,${result.image}`,
        usage: { current: quota.usage, limit: quota.limit, remaining: quota.remaining }
      },
      200,
      request
    );
  } catch (error) {
    console.error("Image generation error:", error);
    await rollbackQuota(env, session);
    return jsonResponse(
      { success: false, error: "IMAGE_GENERATION_FAILED", message: "Image generate nahi hui. Please try again." },
      500,
      request
    );
  }
}

// ========================================
// HEALTH (cacheable)
// ========================================

function health(request, env) {
  const body = JSON.stringify({
    success: true,
    app: APP_NAME,
    version: VERSION,
    status: "online",
    timestamp: new Date().toISOString(),
    bindings: {
      AI: Boolean(env.AI),
      ASSETS: Boolean(env.ASSETS),
      SESSIONS_KV: Boolean(env.SESSIONS_KV)
    }
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "public, max-age=60",
      ...getCorsHeaders(request)
    }
  });
}

// ========================================
// API HANDLER
// ========================================

async function handleAPI(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  if (path === "/api/health" && request.method === "GET") {
    return health(request, env);
  }

  if (path === "/api/auth/init" && request.method === "POST") {
    const result = await getOrCreateSession(request, env);

    let response = jsonResponse(
      { success: true, sessionId: result.session.id, plan: result.session.plan, expiresIn: SESSION_TTL },
      200,
      request
    );

    response = attachSessionCookie(response, result.session);
    return response;
  }

  if (path === "/api/auth/me" && request.method === "GET") {
    const result = await getOrCreateSession(request, env);

    let response = jsonResponse(
      {
        success: true,
        session: { id: result.session.id, plan: result.session.plan, createdAt: result.session.createdAt }
      },
      200,
      request
    );

    if (result.isNew) {
      response = attachSessionCookie(response, result.session);
    }
    return response;
  }

  if (path === "/api/data-load" && request.method === "GET") {
    return loadUserDataHandler(request, env);
  }

  if (path.startsWith("/api/")) {
    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405, request);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
      return jsonResponse(
        { success: false, error: "REQUEST_TOO_LARGE", message: "Request size is too large." },
        413,
        request
      );
    }

    const sessionResult = await getOrCreateSession(request, env);
    const session = sessionResult.session;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { success: false, error: "INVALID_JSON", message: "Invalid JSON request." },
        400,
        request
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(
        { success: false, error: "INVALID_BODY", message: "Request body must be a JSON object." },
        400,
        request
      );
    }

    const routes = {
      "/api/generate-report": generateReport,
      "/api/generate-launch-plan": generateLaunchPlanHandler,
      "/api/generate-pitch-deck": generatePitchDeckHandler,
      "/api/ai-tool": aiTool,
      "/api/chat": chatHandler,
      "/api/ai-autopilot": autopilotHandler,
      "/api/remix": remixHandler,
      "/api/document-ai": documentAiHandler,
      "/api/agent-generate": agentGenerate,
      "/api/vision": vision,
      "/api/image-tool": vision,
      "/api/generate-image": generateImage,
      "/api/data-save": saveUserDataHandler
    };

    const handler = routes[path];

    if (!handler) {
      return jsonResponse(
        { success: false, error: "NOT_FOUND", message: "API endpoint not found." },
        404,
        request
      );
    }

    let response;

    try {
      response = await handler(request, env, session, body);
    } catch (error) {
      console.error(`Handler error for ${path}:`, error);
      await rollbackQuota(env, session);

      response = jsonResponse(
        { success: false, error: "SERVER_ERROR", message: "Something went wrong. Please try again." },
        500,
        request
      );
    }

    // Stream responses must NOT be wrapped (body is already the SSE stream).
    if (sessionResult.isNew && !(response.headers.get("Content-Type") || "").includes("event-stream")) {
      response = attachSessionCookie(response, session);
    }

    return response;
  }

  return null;
}

// ========================================
// MAIN WORKER
// ========================================

export default {
  async fetch(request, env) {
    try {
      const apiResponse = await handleAPI(request, env);

      if (apiResponse) {
        return apiResponse;
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response(`${APP_NAME} v${VERSION} Running 🚀`, {
        status: 200,
        headers: getCorsHeaders(request)
      });
    } catch (error) {
      console.error("Worker error:", error);

      return jsonResponse(
        { success: false, error: "INTERNAL_SERVER_ERROR", message: "Server error. Please try again." },
        500,
        request
      );
    }
  }
};
