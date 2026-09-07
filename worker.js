// ========================================
// IdeaForgeX Worker v12.0
// Secure AI Multi-Tool + Agent + Vision
// Sessions KV + SQLite Durable Object Quota
// ========================================

import { DurableObject } from "cloudflare:workers";

// ========================================
// CONFIG
// ========================================

const APP_NAME = "IdeaForgeX";
const VERSION = "12.0";

const AI_MODEL =
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const VISION_MODEL =
  "@cf/meta/llama-4-scout-17b-16e-instruct";

const IMAGE_MODEL =
  "@cf/black-forest-labs/flux-1-schnell";

const FREE_DAILY_LIMIT = 15;
const PRO_DAILY_LIMIT = 1000;

const SESSION_TTL =
  60 * 60 * 24 * 30; // 30 days

const MAX_TEXT_LENGTH = 20000;
const MAX_REQUEST_SIZE = 12 * 1024 * 1024;
const MAX_IMAGE_LENGTH = 8 * 1024 * 1024;


// ========================================
// CORS
// ========================================

function getCorsHeaders(request) {
  const origin =
    request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin":
      origin || "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-User-ID",

    "Access-Control-Expose-Headers":
      "Content-Type",

    "Access-Control-Max-Age":
      "86400",

    "Vary":
      "Origin"
  };
}


// ========================================
// JSON RESPONSE
// ========================================

function jsonResponse(
  data,
  status = 200,
  request
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",

        ...getCorsHeaders(request)
      }
    }
  );
}


// ========================================
// SAFE STRING
// ========================================

function cleanString(
  value,
  maxLength = MAX_TEXT_LENGTH
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}


// ========================================
// DATE
// ========================================

function today() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


// ========================================
// SESSION ID
// ========================================

function generateSessionId() {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}


// ========================================
// LANGUAGE
// ========================================

function langLine(lang) {
  if (
    lang &&
    lang !== "auto"
  ) {
    return `
CRITICAL LANGUAGE RULE:

Respond entirely in:
${lang}

Do not switch languages.
Do not change script unnecessarily.
`;
  }

  return `
CRITICAL LANGUAGE RULE:

Detect the language and script
used by the user.

If the user writes Hindi
in Devanagari, respond in Hindi.

If the user writes Hinglish
in Latin script, respond naturally
in Hinglish.

If the user writes English,
respond in English.

Do not automatically switch
to English.
`;
}


// ========================================
// BRAND CONTEXT
// ========================================

function getBrandContext(
  opts = {}
) {
  if (
    opts.brand &&
    opts.brand.name
  ) {
    return `
[USER BRAND CONTEXT]

Brand Name:
"${cleanString(
  opts.brand.name,
  300
)}"

Industry:
"${cleanString(
  opts.brand.industry ||
    "General",
  300
)}"

Target Audience:
"${cleanString(
  opts.brand.audience ||
    "General",
  500
)}"

Use this brand identity
naturally when relevant.
`;
  }

  return "";
}


// ========================================
// AGENT PROMPT
// ========================================

function buildAgentPrompt(
  input,
  lang,
  brand
) {
  return `
You are IdeaForgeX,
an expert Business Agent,
Startup Consultant and
Marketing Strategist.

USER REQUEST:

"${cleanString(input)}"

${getBrandContext({ brand })}

${langLine(lang)}

Generate a COMPLETE
business starter pack.

Return ONLY valid JSON.

No markdown.
No code fences.
No explanation outside JSON.

Use EXACTLY these keys:

{
  "brand_name": "",
  "tagline": "",
  "logo_prompt": "",
  "description": "",
  "ad_copy": "",
  "social_posts": [
    "",
    "",
    ""
  ],
  "video_prompt": "",
  "marketing_plan": ""
}

Requirements:

brand_name:
Catchy and memorable.

tagline:
Maximum 10 words.

logo_prompt:
Detailed AI image generation prompt.

description:
Exactly 2 useful sentences.

ad_copy:
3-4 punchy advertisement lines.

social_posts:
Exactly 3 social captions.

video_prompt:
Detailed 30-second promotional video
concept/script.

marketing_plan:
Practical 30-day launch plan
divided into weeks.

Do not make unrealistic guarantees.
`;
}


// ========================================
// AGENT JSON PARSER
// ========================================

function parseAgentResponse(
  rawText
) {
  try {
    if (!rawText) {
      return null;
    }

    let clean =
      String(rawText)
        .replace(
          /```json/gi,
          ""
        )
        .replace(
          /```/g,
          ""
        )
        .trim();

    const start =
      clean.indexOf("{");

    const end =
      clean.lastIndexOf("}");

    if (
      start === -1 ||
      end === -1 ||
      end <= start
    ) {
      return null;
    }

    clean =
      clean.substring(
        start,
        end + 1
      );

    const parsed =
      JSON.parse(clean);

    if (
      !parsed ||
      typeof parsed !==
        "object"
    ) {
      return null;
    }

    if (
      !parsed.brand_name
    ) {
      return null;
    }

    return parsed;

  } catch (error) {

    console.error(
      "Agent JSON parse error:",
      error
    );

    return null;
  }
}


// ========================================
// REPORT PROMPT
// ========================================

function buildReportPrompt(
  idea,
  lang,
  brand
) {
  return `
You are IdeaForgeX,
an expert startup analyst.

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
3-4 likely competitors
and differentiation.

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
// TOOL PROMPT
// ========================================

function buildToolPrompt(
  tool,
  input,
  opts = {}
) {
  const language =
    opts.language &&
    opts.language !== "auto"
      ? `Respond entirely in ${opts.language}.`
      : "Respond in the user's language.";

  const brandContext =
    getBrandContext(opts);

  const request =
    cleanString(input);

  if (
    tool === "writing"
  ) {
    return `
You are a professional
writing assistant.

Type:
${cleanString(
  opts.writingType ||
    "General",
  100
)}

Tone:
${cleanString(
  opts.tone ||
    "Professional",
  100
)}

${brandContext}

${language}

Write ONLY the finished content.

USER REQUEST:
${request}
`;
  }

  if (
    tool === "translate"
  ) {
    return `
You are an expert translator.

Translate from:
${cleanString(
  opts.fromLanguage ||
    "auto",
  100
)}

To:
${cleanString(
  opts.toLanguage ||
    "English",
  100
)}

Preserve:
- Meaning
- Tone
- Formatting
- Context

Output ONLY the translation.

TEXT:
${request}
`;
  }

  if (
    tool === "calculator"
  ) {
    return `
You are a precise calculator.

Solve the problem carefully.

Show calculation steps.

End with:

Answer: <final answer>

PROBLEM:
${request}
`;
  }

  if (
    tool === "student"
  ) {
    return `
You are a helpful teacher.

${language}

Explain the following
in simple language.

Use examples where helpful.

REQUEST:
${request}
`;
  }

  if (
    tool === "code"
  ) {
    return `
You are an expert
software engineer.

Programming language:
${cleanString(
  opts.codeLang ||
    "JavaScript",
  100
)}

${language}

Solve this programming request.

Provide:
1. Correct code
2. Short explanation
3. Important usage notes

REQUEST:
${request}
`;
  }

  if (
    tool === "logo"
  ) {
    return `
You are an expert
brand designer.

Create a professional
logo concept.

Brand:
"${request}"

Style:
${cleanString(
  opts.logoStyle ||
    "Minimalist",
  100
)}

Provide:

- Visual concept
- Composition
- Typography
- Suggested colors
- Hex color codes
- AI image-generation prompt
`;
  }

  if (
    tool === "social"
  ) {
    return `
You are a professional
social media strategist.

Platform:
${cleanString(
  opts.platform ||
    "Instagram",
  100
)}

${brandContext}

${language}

Create an engaging
social media post.

Include:

- Hook
- Main body
- CTA
- Hashtags

TOPIC:
${request}
`;
  }

  if (
    tool === "auto"
  ) {
    return `
You are IdeaForgeX
smart router.

${language}

First output exactly ONE line:

ROUTE: <category>

Allowed categories:

writing
translate
calculator
student
code
logo
social
agent
assistant

Then provide the direct answer.

Do not repeat the ROUTE line.

USER REQUEST:
${request}
`;
  }

  return `
You are IdeaForgeX,
a helpful AI assistant.

${brandContext}

${language}

Answer the user's request
accurately and practically.

REQUEST:
${request}
`;
}


// ========================================
// SECTION PARSER
// ========================================

function parseSections(
  rawText,
  sectionKeys
) {
  if (
    !rawText ||
    rawText.trim().length < 20
  ) {
    return null;
  }

  const sections = {};

  let anyMarkerFound =
    false;

  for (
    let i = 0;
    i < sectionKeys.length;
    i++
  ) {
    const key =
      sectionKeys[i];

    const marker =
      `###${key}###`;

    const startIdx =
      rawText.indexOf(
        marker
      );

    if (
      startIdx === -1
    ) {
      sections[key] = "";
      continue;
    }

    anyMarkerFound =
      true;

    const contentStart =
      startIdx +
      marker.length;

    let endIdx =
      rawText.length;

    for (
      let j = i + 1;
      j < sectionKeys.length;
      j++
    ) {
      const nextMarker =
        `###${sectionKeys[j]}###`;

      const nextIdx =
        rawText.indexOf(
          nextMarker,
          contentStart
        );

      if (
        nextIdx !== -1
      ) {
        endIdx =
          nextIdx;

        break;
      }
    }

    sections[key] =
      rawText
        .slice(
          contentStart,
          endIdx
        )
        .trim();
  }

  if (
    !anyMarkerFound
  ) {
    sections[
      sectionKeys[0]
    ] =
      rawText
        .replace(
          /SCORE_[A-Z_]+\s*:?\s*\d{1,3}/g,
          ""
        )
        .trim();
  }

  return {
    sections,
    anyMarkerFound
  };
}


// ========================================
// SCORE PARSER
// ========================================

function extractScores(
  rawText
) {
  const getScore =
    (key) => {

      const regex =
        new RegExp(
          key +
            "\\s*:?\\s*(\\d{1,3})",
          "i"
        );

      const match =
        String(rawText)
          .match(regex);

      if (!match) {
        return null;
      }

      return Math.max(
        0,
        Math.min(
          100,
          parseInt(
            match[1],
            10
          )
        )
      );
    };

  const score = {
    market:
      getScore(
        "SCORE_MARKET"
      ),

    competition:
      getScore(
        "SCORE_COMPETITION"
      ),

    profit:
      getScore(
        "SCORE_PROFIT"
      ),

    difficulty:
      getScore(
        "SCORE_DIFFICULTY"
      ),

    overall:
      getScore(
        "SCORE_OVERALL"
      )
  };

  if (
    score.overall === null
  ) {
    const values =
      [
        score.market,
        score.competition,
        score.profit,
        score.difficulty
      ].filter(
        (value) =>
          typeof value ===
          "number"
      );

    if (
      values.length
    ) {
      score.overall =
        Math.round(
          values.reduce(
            (a, b) =>
              a + b,
            0
          ) /
            values.length
        );
    }
  }

  return score;
}


// ========================================
// AI RUNNER
// ========================================

async function runTextAI(
  env,
  prompt,
  maxTokens = 2048,
  temperature = 0.6
) {
  if (!env.AI) {
    throw new Error(
      "Workers AI binding 'AI' missing."
    );
  }

  const result =
    await env.AI.run(
      AI_MODEL,
      {
        messages: [
          {
            role: "user",
            content:
              prompt
          }
        ],

        max_tokens:
          Math.min(
            maxTokens,
            4000
          ),

        temperature
      }
    );

  return (
    result?.response ||
    result?.output ||
    ""
  ).trim();
}


// ========================================
// SESSION COOKIE
// ========================================

function getCookie(
  request,
  name
) {
  const cookieHeader =
    request.headers.get(
      "Cookie"
    );

  if (!cookieHeader) {
    return null;
  }

  const cookies =
    cookieHeader
      .split(";")
      .map(
        (part) =>
          part.trim()
      );

  for (
    const cookie of cookies
  ) {
    const index =
      cookie.indexOf("=");

    if (
      index === -1
    ) {
      continue;
    }

    const key =
      cookie.slice(
        0,
        index
      );

    const value =
      cookie.slice(
        index + 1
      );

    if (
      key === name
    ) {
      return decodeURIComponent(
        value
      );
    }
  }

  return null;
}


function getBearerToken(
  request
) {
  const header =
    request.headers.get(
      "Authorization"
    ) || "";

  if (
    !header
      .toLowerCase()
      .startsWith(
        "bearer "
      )
  ) {
    return null;
  }

  return header
    .slice(7)
    .trim() || null;
}


// ========================================
// SESSION STORAGE
// ========================================

async function getSession(
  env,
  sessionId
) {
  if (
    !env.SESSIONS_KV ||
    !sessionId
  ) {
    return null;
  }

  try {
    const raw =
      await env.SESSIONS_KV.get(
        `session:${sessionId}`
      );

    if (!raw) {
      return null;
    }

    const session =
      JSON.parse(raw);

    if (
      !session.id ||
      !session.createdAt
    ) {
      return null;
    }

    if (
      Date.now() -
        session.createdAt >
      SESSION_TTL * 1000
    ) {
      await env.SESSIONS_KV.delete(
        `session:${sessionId}`
      );

      return null;
    }

    return session;

  } catch (error) {

    console.error(
      "Session read error:",
      error
    );

    return null;
  }
}


// ========================================
// CREATE SESSION
// ========================================

async function createSession(
  env
) {
  if (
    !env.SESSIONS_KV
  ) {
    throw new Error(
      "SESSIONS_KV binding missing."
    );
  }

  const id =
    generateSessionId();

  const session = {
    id,

    createdAt:
      Date.now(),

    plan:
      "free",

    stripeCustomerId:
      null,

    stripeSubscriptionId:
      null
  };

  await env.SESSIONS_KV.put(
    `session:${id}`,
    JSON.stringify(
      session
    ),
    {
      expirationTtl:
        SESSION_TTL
    }
  );

  return session;
}


// ========================================
// SAVE SESSION
// ========================================

async function saveSession(
  env,
  session
) {
  await env.SESSIONS_KV.put(
    `session:${session.id}`,
    JSON.stringify(
      session
    ),
    {
      expirationTtl:
        SESSION_TTL
    }
  );
}


// ========================================
// SESSION FROM REQUEST
// ========================================

async function getOrCreateSession(
  request,
  env
) {
  const bearer =
    getBearerToken(
      request
    );

  const cookie =
    getCookie(
      request,
      "IFX_SESSION"
    );

  const sessionId =
    bearer ||
    cookie;

  if (sessionId) {
    const existing =
      await getSession(
        env,
        sessionId
      );

    if (existing) {
      return {
        session:
          existing,
        isNew:
          false
      };
    }
  }

  const session =
    await createSession(
      env
    );

  return {
    session,
    isNew:
      true
  };
}


// ========================================
// ATTACH SESSION COOKIE
// ========================================

function attachSessionCookie(
  response,
  session
) {
  const headers =
    new Headers(
      response.headers
    );

  headers.set(
    "Set-Cookie",
    [
      `IFX_SESSION=${encodeURIComponent(
        session.id
      )}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${SESSION_TTL}`
    ].join("; ")
  );

  return new Response(
    response.body,
    {
      status:
        response.status,

      statusText:
        response.statusText,

      headers
    }
  );
}


// ========================================
// QUOTA
// ========================================

async function checkQuota(
  env,
  session
) {
  if (!env.QUOTA_DO) {
    throw new Error(
      "QUOTA_DO binding missing. Add the QuotaDO Durable Object binding in Cloudflare."
    );
  }

  const plan =
    session.plan === "pro"
      ? "pro"
      : "free";

  const limit =
    plan === "pro"
      ? PRO_DAILY_LIMIT
      : FREE_DAILY_LIMIT;

  const stub =
    env.QUOTA_DO.getByName(
      session.id
    );

  const result =
    await stub.consume(
      today(),
      limit
    );

  return {
    ...result,
    plan
  };
}


// ========================================
// GENERATE REPORT
// ========================================

async function generateReport(
  request,
  env,
  session,
  body
) {
  const idea =
    cleanString(
      body.idea
    );

  if (!idea) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "IDEA_REQUIRED",

        message:
          "Please enter a business idea."
      },

      400,
      request
    );
  }

  const quota =
    await checkQuota(
      env,
      session
    );

  if (
    !quota.allowed
  ) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "DAILY_LIMIT_REACHED",

        message:
          session.plan ===
          "pro"
            ? "Pro daily limit reached."
            : "Free limit khatam! Pro upgrade karein.",

        usage:
          quota.usage,

        limit:
          quota.limit,

        remaining:
          quota.remaining
      },

      429,
      request
    );
  }

  const prompt =
    buildReportPrompt(
      idea,
      body.language ||
        "auto",
      body.brand
    );

  let lastRaw =
    "";

  let parsed =
    null;

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

  for (
    let attempt = 0;
    attempt < 3;
    attempt++
  ) {
    try {
      lastRaw =
        await runTextAI(
          env,
          prompt,
          2500,
          0.6
        );

      parsed =
        parseSections(
          lastRaw,
          sectionKeys
        );

      if (
        parsed
      ) {
        break;
      }

    } catch (error) {

      console.error(
        "Report attempt failed:",
        error
      );
    }
  }

  if (!parsed) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "REPORT_GENERATION_FAILED",

        message:
          "Report generate nahi hua. Please try again."
      },

      500,
      request
    );
  }

  return jsonResponse(
    {
      success:
        true,

      report: {
        score:
          extractScores(
            lastRaw
          ),

        sections:
          parsed.sections
      },

      usage: {
        current:
          quota.usage,

        limit:
          quota.limit,

        remaining:
          quota.remaining
      }
    },

    200,
    request
  );
}


// ========================================
// AI TOOL
// ========================================

async function aiTool(
  request,
  env,
  session,
  body
) {
  const input =
    cleanString(
      body.input
    );

  if (!input) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "INPUT_REQUIRED"
      },

      400,
      request
    );
  }

  const quota =
    await checkQuota(
      env,
      session
    );

  if (
    !quota.allowed
  ) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "DAILY_LIMIT_REACHED",

        message:
          "Daily AI limit reached.",

        usage:
          quota.usage,

        limit:
          quota.limit,

        remaining:
          quota.remaining
      },

      429,
      request
    );
  }

  const tool =
    cleanString(
      body.tool ||
        "assistant",
      50
    ).toLowerCase();

  const prompt =
    buildToolPrompt(
      tool,
      input,
      {
        language:
          body.language,

        writingType:
          body.writingType,

        tone:
          body.tone,

        fromLanguage:
          body.fromLanguage,

        toLanguage:
          body.toLanguage,

        codeLang:
          body.codeLang,

        logoStyle:
          body.logoStyle,

        platform:
          body.platform,

        brand:
          body.brand
      }
    );

  let resultText =
    "";

  for (
    let attempt = 0;
    attempt < 3;
    attempt++
  ) {
    try {
      resultText =
        await runTextAI(
          env,
          prompt,
          1800,

          tool ===
            "calculator"
            ? 0.2
            : 0.7
        );

      if (
        resultText.length >
        3
      ) {
        break;
      }

    } catch (error) {

      console.error(
        "AI tool attempt failed:",
        error
      );
    }
  }

  if (!resultText) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "AI_RESULT_FAILED",

        message:
          "Result nahi aaya. Please try again."
      },

      500,
      request
    );
  }

  let detectedRoute =
    null;

  if (
    tool === "auto"
  ) {
    const routeMatch =
      resultText.match(
        /^ROUTE:\s*([a-z_]+)\s*/i
      );

    if (
      routeMatch
    ) {
      detectedRoute =
        routeMatch[1]
          .toLowerCase();

      resultText =
        resultText
          .slice(
            routeMatch[0]
              .length
          )
          .trim();
    }
  }

  return jsonResponse(
    {
      success:
        true,

      result:
        resultText,

      route:
        detectedRoute,

      usage: {
        current:
          quota.usage,

        limit:
          quota.limit,

        remaining:
          quota.remaining
      }
    },

    200,
    request
  );
}


// ========================================
// AGENT GENERATOR
// ========================================

async function agentGenerate(
  request,
  env,
  session,
  body
) {
  const input =
    cleanString(
      body.input ||
        body.task
    );

  if (!input) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "INPUT_REQUIRED"
      },

      400,
      request
    );
  }

  const quota =
    await checkQuota(
      env,
      session
    );

  if (
    !quota.allowed
  ) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "DAILY_LIMIT_REACHED",

        message:
          "Daily AI limit reached."
      },

      429,
      request
    );
  }

  const prompt =
    buildAgentPrompt(
      input,

      body.language ||
        "auto",

      body.brand
    );

  for (
    let attempt = 0;
    attempt < 3;
    attempt++
  ) {
    try {
      const rawText =
        await runTextAI(
          env,
          prompt,
          4000,
          0.7
        );

      const parsed =
        parseAgentResponse(
          rawText
        );

      if (
        parsed
      ) {
        return jsonResponse(
          {
            success:
              true,

            data:
              parsed,

            usage: {
              current:
                quota.usage,

              limit:
                quota.limit,

              remaining:
                quota.remaining
            }
          },

          200,
          request
        );
      }

    } catch (error) {

      console.error(
        "Agent attempt failed:",
        error
      );
    }
  }

  return jsonResponse(
    {
      success:
        false,

      error:
        "AGENT_JSON_FAILED",

      message:
        "Agent ne sahi JSON nahi banaya. Kripya phir try karein."
    },

    500,
    request
  );
}


// ========================================
// IMAGE BASE64 CLEANER
// ========================================

function cleanImageBase64(
  value
) {
  if (!value) {
    return null;
  }

  let base64 =
    String(value);

  if (
    base64.includes(",")
  ) {
    base64 =
      base64
        .split(",")
        .pop();
  }

  base64 =
    base64.replace(
      /\s/g,
      ""
    );

  if (
    base64.length >
    MAX_IMAGE_LENGTH
  ) {
    throw new Error(
      "Image too large."
    );
  }

  if (
    !/^[A-Za-z0-9+/=]+$/.test(
      base64
    )
  ) {
    throw new Error(
      "Invalid image data."
    );
  }

  return base64;
}


// ========================================
// VISION / IMAGE ANALYSIS
// ========================================

async function vision(
  request,
  env,
  session,
  body
) {
  const image =
    cleanImageBase64(
      body.image ||
        body.imageBase64
    );

  if (!image) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "IMAGE_REQUIRED",

        message:
          "Please provide an image."
      },

      400,
      request
    );
  }

  const quota =
    await checkQuota(
      env,
      session
    );

  if (
    !quota.allowed
  ) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "DAILY_LIMIT_REACHED"
      },

      429,
      request
    );
  }

  const language =
    cleanString(
      body.language ||
        "English",
      100
    );

  const question =
    cleanString(
      body.question ||
        body.prompt ||
        "Describe and analyze this image.",
      5000
    );

  const result =
    await env.AI.run(
      VISION_MODEL,
      {
        messages: [
          {
            role:
              "system",

            content:
              `You are an expert image analysis assistant. Respond in ${language}. Clearly separate observations from uncertain guesses.`
          },

          {
            role:
              "user",

            content: [
              {
                type:
                  "text",

                text:
                  question
              },

              {
                type:
                  "image_url",

                image_url: {
                  url:
                    `data:image/jpeg;base64,${image}`
                }
              }
            ]
          }
        ],

        max_tokens:
          1800
      }
    );

  return jsonResponse(
    {
      success:
        true,

      result:
        result?.response ||
        result?.output ||
        "",

      usage: {
        current:
          quota.usage,

        limit:
          quota.limit,

        remaining:
          quota.remaining
      }
    },

    200,
    request
  );
}


// ========================================
// IMAGE GENERATION
// ========================================

async function generateImage(
  request,
  env,
  session,
  body
) {
  const prompt =
    cleanString(
      body.prompt,
      3000
    );

  if (!prompt) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "PROMPT_REQUIRED"
      },

      400,
      request
    );
  }

  const quota =
    await checkQuota(
      env,
      session
    );

  if (
    !quota.allowed
  ) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "DAILY_LIMIT_REACHED"
      },

      429,
      request
    );
  }

  const steps =
    Math.min(
      Math.max(
        Number(
          body.steps
        ) || 4,

        1
      ),

      8
    );

  const result =
    await env.AI.run(
      IMAGE_MODEL,
      {
        prompt,

        steps,

        seed:
          Math.floor(
            Math.random() *
              1000000000
          )
      }
    );

  if (
    !result ||
    !result.image
  ) {
    throw new Error(
      "Image generation failed."
    );
  }

  return jsonResponse(
    {
      success:
        true,

      image:
        `data:image/jpeg;base64,${result.image}`,

      usage: {
        current:
          quota.usage,

        limit:
          quota.limit,

        remaining:
          quota.remaining
      }
    },

    200,
    request
  );
}


// ========================================
// HEALTH
// ========================================

function health(
  request,
  env
) {
  return jsonResponse(
    {
      success:
        true,

      app:
        APP_NAME,

      version:
        VERSION,

      status:
        "online",

      timestamp:
        new Date()
          .toISOString(),

      bindings: {
        AI:
          Boolean(
            env.AI
          ),

        ASSETS:
          Boolean(
            env.ASSETS
          ),

        SESSIONS_KV:
          Boolean(
            env.SESSIONS_KV
          ),

        QUOTA_DO:
          Boolean(
            env.QUOTA_DO
          )
      }
    },

    200,
    request
  );
}


// ========================================
// API HANDLER
// ========================================

async function handleAPI(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const path =
    url.pathname;


  // --------------------------------------
  // OPTIONS
  // --------------------------------------

  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status:
          204,

        headers:
          getCorsHeaders(
            request
          )
      }
    );
  }


  // --------------------------------------
  // HEALTH
  // --------------------------------------

  if (
    path ===
      "/api/health" &&
    request.method ===
      "GET"
  ) {
    return health(
      request,
      env
    );
  }


  // --------------------------------------
  // SESSION INIT
  // --------------------------------------

  if (
    path ===
      "/api/auth/init" &&
    request.method ===
      "POST"
  ) {
    const result =
      await getOrCreateSession(
        request,
        env
      );

    let response =
      jsonResponse(
        {
          success:
            true,

          sessionId:
            result.session.id,

          plan:
            result.session.plan,

          expiresIn:
            SESSION_TTL
        },

        200,
        request
      );

    response =
      attachSessionCookie(
        response,
        result.session
      );

    return response;
  }


  // --------------------------------------
  // SESSION ME
  // --------------------------------------

  if (
    path ===
      "/api/auth/me" &&
    request.method ===
      "GET"
  ) {
    const result =
      await getOrCreateSession(
        request,
        env
      );

    let response =
      jsonResponse(
        {
          success:
            true,

          session: {
            id:
              result.session.id,

            plan:
              result.session.plan,

            createdAt:
              result.session.createdAt
          }
        },

        200,
        request
      );

    if (
      result.isNew
    ) {
      response =
        attachSessionCookie(
          response,
          result.session
        );
    }

    return response;
  }


  // --------------------------------------
  // API REQUESTS
  // --------------------------------------

  if (
    path.startsWith(
      "/api/"
    )
  ) {
    if (
      request.method !==
      "POST"
    ) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "METHOD_NOT_ALLOWED"
        },

        405,
        request
      );
    }


    // Request size check
    const contentLength =
      Number(
        request.headers.get(
          "Content-Length"
        ) || 0
      );

    if (
      contentLength >
      MAX_REQUEST_SIZE
    ) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "REQUEST_TOO_LARGE",

          message:
            "Request size is too large."
        },

        413,
        request
      );
    }


    // Get/create secure session
    const sessionResult =
      await getOrCreateSession(
        request,
        env
      );

    const session =
      sessionResult.session;


    // Parse JSON
    let body;

    try {
      body =
        await request.json();

    } catch {
      return jsonResponse(
        {
          success:
            false,

          error:
            "INVALID_JSON"
        },

        400,
        request
      );
    }


    // ------------------------------------
    // REPORT
    // ------------------------------------

    if (
      path ===
      "/api/generate-report"
    ) {
      let response =
        await generateReport(
          request,
          env,
          session,
          body
        );

      if (
        sessionResult.isNew
      ) {
        response =
          attachSessionCookie(
            response,
            session
          );
      }

      return response;
    }


    // ------------------------------------
    // AI TOOL
    // ------------------------------------

    if (
      path ===
      "/api/ai-tool"
    ) {
      let response =
        await aiTool(
          request,
          env,
          session,
          body
        );

      if (
        sessionResult.isNew
      ) {
        response =
          attachSessionCookie(
            response,
            session
          );
      }

      return response;
    }


    // ------------------------------------
    // AGENT
    // ------------------------------------

    if (
      path ===
      "/api/agent-generate"
    ) {
      let response =
        await agentGenerate(
          request,
          env,
          session,
          body
        );

      if (
        sessionResult.isNew
      ) {
        response =
          attachSessionCookie(
            response,
            session
          );
      }

      return response;
    }


    // ------------------------------------
    // VISION
    // ------------------------------------

    if (
      path ===
      "/api/vision"
    ) {
      let response =
        await vision(
          request,
          env,
          session,
          body
        );

      if (
        sessionResult.isNew
      ) {
        response =
          attachSessionCookie(
            response,
            session
          );
      }

      return response;
    }


    // ------------------------------------
    // IMAGE GENERATION
    // ------------------------------------

    if (
      path ===
      "/api/generate-image"
    ) {
      let response =
        await generateImage(
          request,
          env,
          session,
          body
        );

      if (
        sessionResult.isNew
      ) {
        response =
          attachSessionCookie(
            response,
            session
          );
      }

      return response;
    }


    // ------------------------------------
    // UNKNOWN API
    // ------------------------------------

    return jsonResponse(
      {
        success:
          false,

        error:
          "NOT_FOUND",

        message:
          "API endpoint not found."
      },

      404,
      request
    );
  }


  return null;
}


// ========================================
// MAIN WORKER
// ========================================

export default {
  async fetch(
    request,
    env
  ) {
    try {

      const apiResponse =
        await handleAPI(
          request,
          env
        );

      if (
        apiResponse
      ) {
        return apiResponse;
      }


      // Serve frontend
      if (
        env.ASSETS
      ) {
        return env.ASSETS.fetch(
          request
        );
      }


      return new Response(
        `${APP_NAME} v${VERSION} Running 🚀`,
        {
          status:
            200,

          headers:
            getCorsHeaders(
              request
            )
        }
      );

    } catch (error) {

      console.error(
        "Worker error:",
        error
      );

      return jsonResponse(
        {
          success:
            false,

          error:
            "INTERNAL_SERVER_ERROR",

          message:
            error?.message ||
            "Server error. Please try again."
        },

        500,
        request
      );
    }
  }
};


// ========================================
// DURABLE OBJECT
// SQLite-backed QuotaDO
// ========================================

export class QuotaDO
  extends DurableObject {

  constructor(
    ctx,
    env
  ) {
    super(
      ctx,
      env
    );

    this.ctx =
      ctx;

    this.env =
      env;


    // Create quota table
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS daily_usage (
        date TEXT PRIMARY KEY,
        usage INTEGER NOT NULL DEFAULT 0
      )
    `);
  }


  // --------------------------------------
  // CONSUME QUOTA
  // --------------------------------------

  async consume(
    date,
    limit
  ) {
    const safeDate =
      cleanString(
        date,
        20
      );

    const safeLimit =
      Math.max(
        1,
        Number(
          limit
        ) ||
          FREE_DAILY_LIMIT
      );


    // Read current usage
    const rows =
      this.ctx.storage.sql
        .exec(
          `
          SELECT usage
          FROM daily_usage
          WHERE date = ?
          `,
          safeDate
        )
        .toArray();


    let usage =
      rows.length
        ? Number(
            rows[0].usage
          )
        : 0;


    // Limit reached
    if (
      usage >=
      safeLimit
    ) {
      return {
        allowed:
          false,

        usage,

        limit:
          safeLimit,

        remaining:
          0
      };
    }


    // Increment atomically
    usage += 1;


    this.ctx.storage.sql.exec(
      `
      INSERT INTO daily_usage
        (date, usage)
      VALUES
        (?, ?)
      ON CONFLICT(date)
      DO UPDATE SET
        usage = excluded.usage
      `,
      safeDate,
      usage
    );


    // Optional cleanup:
    // Keep only recent rows.
    this.ctx.storage.sql.exec(
      `
      DELETE FROM daily_usage
      WHERE date < ?
      `,
      safeDate
    );


    return {
      allowed:
        true,

      usage,

      limit:
        safeLimit,

      remaining:
        Math.max(
          0,
          safeLimit -
            usage
        )
    };
  }
}
