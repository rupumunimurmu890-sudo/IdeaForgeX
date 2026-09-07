// ========================================
// IdeaForgeX Worker v12.2
// Secure AI Multi-Tool + Agent + Vision
// Sessions KV + SQLite Durable Object Quota
// FIXED: added missing endpoints that the
// frontend (app.js) was already calling:
//   /api/generate-launch-plan
//   /api/generate-pitch-deck
//   /api/chat
//   /api/ai-autopilot
//   /api/remix
//   /api/document-ai
//   /api/image-tool  (alias of /api/vision)
// ========================================

import { DurableObject } from "cloudflare:workers";

// ========================================
// CONFIG
// ========================================

const APP_NAME = "IdeaForgeX";
const VERSION = "12.2";

const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

const FREE_DAILY_LIMIT = 15;
const PRO_DAILY_LIMIT = 1000;

const SESSION_TTL = 60 * 60 * 24 * 30;

const MAX_TEXT_LENGTH = 20000;
const MAX_REQUEST_SIZE = 12 * 1024 * 1024;
const MAX_IMAGE_LENGTH = 8 * 1024 * 1024;

// ========================================
// CORS
// ========================================

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-ID",
    "Access-Control-Expose-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
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
      // required key missing/empty -> treat as failed parse unless it's an array
      if (!Array.isArray(parsed[requiredKey])) return null;
    }

    return parsed;
  } catch (error) {
    console.error("JSON parse error:", error);
    return null;
  }
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
// LAUNCH PLAN PROMPT  (NEW)
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
// PITCH DECK PROMPT  (NEW)
// ========================================

function buildPitchDeckPrompt(idea, lang, brand) {
  return `
You are IdeaForgeX, an expert startup pitch consultant.

BUSINESS IDEA:
"${cleanString(idea)}"

${getBrandContext({ brand })}
${langLine(lang)}

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
// AUTOPILOT PROMPT  (NEW)
// ========================================

function buildAutopilotPrompt(input, lang, brand) {
  return `
You are IdeaForgeX, an expert marketing content generator.

USER REQUEST / PRODUCT OR BUSINESS DESCRIPTION:
"${cleanString(input)}"

${getBrandContext({ brand })}
${langLine(lang)}

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
// REMIX PROMPT  (NEW)
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
// DOCUMENT AI PROMPT  (NEW)
// ========================================

function buildDocumentPrompt(text) {
  return `
You are an expert document analyst and teacher.

DOCUMENT TEXT:
"${cleanString(text, MAX_TEXT_LENGTH)}"

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
// CHAT PROMPT  (NEW)
// ========================================

function buildChatMessages(messages, brand) {
  const systemPrompt = `
You are IdeaForgeX, a helpful, friendly AI assistant.
${getBrandContext({ brand })}
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
// AI RUNNER (text prompt -> string)
// ========================================

async function runTextAI(env, prompt, maxTokens = 2048, temperature = 0.6) {
  if (!env.AI) {
    throw new Error("Workers AI binding 'AI' missing.");
  }

  const result = await env.AI.run(AI_MODEL, {
    messages: [{ role: "user", content: prompt }],
    max_tokens: Math.min(safeInteger(maxTokens, 2048, 1, 4000), 4000),
    temperature: Math.max(0, Math.min(1, Number(temperature) || 0.6))
  });

  const response = result?.response || result?.output || "";
  return cleanString(response, MAX_TEXT_LENGTH);
}

// AI runner for raw chat-style messages array -> string  (NEW, used by /api/chat)
async function runChatAI(env, messages, maxTokens = 1200, temperature = 0.7) {
  if (!env.AI) {
    throw new Error("Workers AI binding 'AI' missing.");
  }

  const result = await env.AI.run(AI_MODEL, {
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
  if (!env.QUOTA_DO) {
    throw new Error("QUOTA_DO binding missing. Add the QuotaDO Durable Object binding in Cloudflare.");
  }

  if (!session || !session.id) {
    throw new Error("Invalid session.");
  }

  const plan = session.plan === "pro" ? "pro" : "free";
  const limit = plan === "pro" ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

  const stub = env.QUOTA_DO.getByName(session.id);
  const result = await stub.consume(today(), limit);

  return { ...result, plan };
}

async function rollbackQuota(env, session) {
  if (!env.QUOTA_DO || !session?.id) return;

  try {
    const stub = env.QUOTA_DO.getByName(session.id);
    await stub.rollback(today());
  } catch (error) {
    console.error("Quota rollback error:", error);
  }
}

// ========================================
// GENERATE REPORT
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      lastRaw = await runTextAI(env, prompt, 2500, 0.6);
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
// LAUNCH PLAN  (NEW)
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await runTextAI(env, prompt, 2500, 0.6);
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
// PITCH DECK  (NEW)
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await runTextAI(env, prompt, 2200, 0.6);
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
// CHAT  (NEW)
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

  let reply = "";

  for (let attempt = 0; attempt < 3; attempt++) {
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
// AI TOOL (existing)
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

  let resultText = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      resultText = await runTextAI(env, prompt, 1800, tool === "calculator" ? 0.2 : 0.7);
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
// AI AUTOPILOT  (NEW)
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await runTextAI(env, prompt, 2500, 0.7);
      pkg = extractJsonObject(raw, "AD_COPY");
      if (pkg) break;
    } catch (error) {
      console.error("Autopilot attempt failed:", error);
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
// REMIX / MAKE-IT-BETTER  (NEW)
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await runTextAI(env, prompt, 1800, 0.7);
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
// DOCUMENT AI  (NEW)
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await runTextAI(env, prompt, 2200, 0.5);
      analysis = extractJsonObject(raw, "SUMMARY");
      if (analysis) break;
    } catch (error) {
      console.error("Document AI attempt failed:", error);
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
// AGENT GENERATOR (existing)
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rawText = await runTextAI(env, prompt, 4000, 0.7);
      const parsed = parseAgentResponse(rawText);

      if (parsed) {
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
    } catch (error) {
      console.error("Agent attempt failed:", error);
    }
  }

  await rollbackQuota(env, session);

  return jsonResponse(
    { success: false, error: "AGENT_JSON_FAILED", message: "Agent ne sahi JSON nahi banaya. Kripya phir try karein." },
    500,
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
// (also serves /api/image-tool, called by app.js)
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

  // app.js sends "action" (analyze / describe / extract-text / ask) - fold it into the question
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
// HEALTH
// ========================================

function health(request, env) {
  return jsonResponse(
    {
      success: true,
      app: APP_NAME,
      version: VERSION,
      status: "online",
      timestamp: new Date().toISOString(),
      bindings: {
        AI: Boolean(env.AI),
        ASSETS: Boolean(env.ASSETS),
        SESSIONS_KV: Boolean(env.SESSIONS_KV),
        QUOTA_DO: Boolean(env.QUOTA_DO)
      }
    },
    200,
    request
  );
}

// ========================================
// API HANDLER
// ========================================

async function handleAPI(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // --------------------------------------
  // OPTIONS
  // --------------------------------------

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  // --------------------------------------
  // HEALTH
  // --------------------------------------

  if (path === "/api/health" && request.method === "GET") {
    return health(request, env);
  }

  // --------------------------------------
  // SESSION INIT
  // --------------------------------------

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

  // --------------------------------------
  // SESSION ME
  // --------------------------------------

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

  // --------------------------------------
  // API REQUESTS (all POST, JSON body)
  // --------------------------------------

  if (path.startsWith("/api/")) {
    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405, request);
    }

    // Request size check
    const contentLength = Number(request.headers.get("Content-Length") || 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
      return jsonResponse(
        { success: false, error: "REQUEST_TOO_LARGE", message: "Request size is too large." },
        413,
        request
      );
    }

    // Session
    const sessionResult = await getOrCreateSession(request, env);
    const session = sessionResult.session;

    // JSON body
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

    // Map of path -> handler function. Every handler has signature
    // (request, env, session, body) and returns a Response.
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
      "/api/image-tool": vision, // app.js calls this path name; same handler as /api/vision
      "/api/generate-image": generateImage
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

      // best-effort rollback; harmless if quota was never consumed
      await rollbackQuota(env, session);

      response = jsonResponse(
        { success: false, error: "SERVER_ERROR", message: "Something went wrong. Please try again." },
        500,
        request
      );
    }

    if (sessionResult.isNew) {
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

      // Frontend assets
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      // Fallback
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

// ========================================
// DURABLE OBJECT - SQLite-backed QuotaDO
// ========================================

export class QuotaDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);

    this.ctx = ctx;
    this.env = env;

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS daily_usage (
        date TEXT PRIMARY KEY,
        usage INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  async consume(date, limit) {
    const safeDate = cleanString(date, 20);

    if (!safeDate) {
      throw new Error("Invalid quota date.");
    }

    const safeLimit = Math.max(1, safeInteger(limit, FREE_DAILY_LIMIT, 1, PRO_DAILY_LIMIT));

    const rows = this.ctx.storage.sql
      .exec(`SELECT usage FROM daily_usage WHERE date = ?`, safeDate)
      .toArray();

    let usage = rows.length ? Number(rows[0].usage) : 0;
    usage = Math.max(0, usage);

    if (usage >= safeLimit) {
      return { allowed: false, usage, limit: safeLimit, remaining: 0 };
    }

    usage += 1;

    this.ctx.storage.sql.exec(
      `
      INSERT INTO daily_usage (date, usage)
      VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET usage = excluded.usage
      `,
      safeDate,
      usage
    );

    this.ctx.storage.sql.exec(`DELETE FROM daily_usage WHERE date < ?`, safeDate);

    return { allowed: true, usage, limit: safeLimit, remaining: Math.max(0, safeLimit - usage) };
  }

  async rollback(date) {
    const safeDate = cleanString(date, 20);

    if (!safeDate) {
      return { success: false, usage: 0 };
    }

    const rows = this.ctx.storage.sql
      .exec(`SELECT usage FROM daily_usage WHERE date = ?`, safeDate)
      .toArray();

    if (!rows.length) {
      return { success: true, usage: 0 };
    }

    let usage = Number(rows[0].usage) || 0;
    usage = Math.max(0, usage - 1);

    if (usage === 0) {
      this.ctx.storage.sql.exec(`DELETE FROM daily_usage WHERE date = ?`, safeDate);
    } else {
      this.ctx.storage.sql.exec(`UPDATE daily_usage SET usage = ? WHERE date = ?`, usage, safeDate);
    }

    return { success: true, usage };
  }

  async getUsage(date) {
    const safeDate = cleanString(date, 20);

    if (!safeDate) return 0;

    const rows = this.ctx.storage.sql
      .exec(`SELECT usage FROM daily_usage WHERE date = ?`, safeDate)
      .toArray();

    if (!rows.length) return 0;

    return Math.max(0, Number(rows[0].usage) || 0);
  }
}
