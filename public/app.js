// ============================================================
// IdeaForgeX - Main JavaScript v11.10
// FIXED: "?.value = x" SyntaxError in openBrandBtn handler
// (optional chaining cannot be used as an assignment target —
// this was breaking the entire script from parsing/loading)
// FIXED: FREE_DAILY_LIMIT was hardcoded to 15 here, separate
// from worker.js's own limit — raising the backend limit alone
// did nothing because this client-side check blocked requests
// before they ever reached the API. Synced to 100 to match the
// current TEMPORARY testing limit in worker.js. Remember to set
// this back to 15 together with worker.js before going live.
// ADDED: cloud backup for projects, idea history, brand profile
// and tool history via /api/data-save and /api/data-load, so a
// cleared browser cache or a new device doesn't lose everything.
// localStorage remains the primary, fast copy.
// ADDED: Backup Code system — the session ID is now shown to the
// user as a copyable code and sent as a Bearer token (not just a
// cookie), because a session ID that lives only in a cookie is
// wiped by the same cache-clear it's meant to protect against.
// Users can copy their code and paste it on a new device/browser
// to restore their data.
// ============================================================

"use strict";

// ============================================================
// GLOBAL STATE
// ============================================================

let currentReport = null;
let currentIdeaText = "";
let isProUser = false;

let userBrand = {
  name: "",
  industry: "",
  audience: ""
};

let chatHistory = [];

// Separate, per-idea conversation thread for the report's
// "Ask a follow-up question" panel — kept apart from the main
// AI Chat tool's chatHistory so the two don't mix context.
let reportFollowupHistory = [];
let currentProjectId = null;

let currentToolResult = "";
let currentToolInput = "";
let activeTool = "assistant";
let lastToolPayload = null;

const HISTORY_KEY = "ideaforgex_history";
const HISTORY_LIMIT = 10;

// TEMP: raised to 100 for testing to match worker.js — change
// both back to 15 before going live.
const FREE_DAILY_LIMIT = 100;
const USAGE_KEY = "ideaforge_usage";

const PROJECTS_KEY = "ideaforge_projects_v2";
const TOOL_HISTORY_KEY = "ideaforge_tool_history";

// The session ID doubles as a "Backup Code": the only way to
// reconnect to server-backed-up data (Projects, History, Brand,
// Tool History) from a new browser/device after a cache clear,
// since it is never itself stored anywhere durable unless the
// user manually saves/copies it. Sent as a Bearer token so it
// works even if cookies are cleared independently.
const BACKUP_CODE_KEY = "ifx_backup_code";

// Must match MAX_USER_DATA_BYTES in worker.js. Checked here too
// so oversized payloads never leave the browser.
const MAX_USER_DATA_BYTES = 150 * 1024;

// ============================================================
// ANALYTICS
// ============================================================

function trackEvent(eventName, params = {}) {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
    console.log("📊 Analytics:", eventName, params);
  } catch (error) {
    console.warn("Analytics error:", error);
  }
}

// ============================================================
// TOAST
// ============================================================

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");

  if (!container) {
    console.log(`[${type}] ${message}`);
    return;
  }

  const toast = document.createElement("div");
  const normalizedType = String(type).charAt(0).toUpperCase() + String(type).slice(1);

  toast.className = `toast toast${normalizedType}`;
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
// SAFE HTML / JSON
// ============================================================

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ============================================================
// API JSON HELPER
// ============================================================

async function parseApiResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(response.ok ? "Server ne valid JSON response nahi diya." : `Server Error (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  }

  return data;
}

// ============================================================
// USER ID
// ============================================================

function getUserId() {
  let uid = localStorage.getItem("uid");

  if (!uid) {
    uid = "user_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    localStorage.setItem("uid", uid);
  }

  return uid;
}

function getBackupCode() {
  return localStorage.getItem(BACKUP_CODE_KEY) || "";
}

function setBackupCode(code) {
  if (code) {
    localStorage.setItem(BACKUP_CODE_KEY, code);
  } else {
    localStorage.removeItem(BACKUP_CODE_KEY);
  }
}

function getApiHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-User-ID": getUserId(),
    "X-User-Plan": isProUser ? "pro" : "free"
  };

  // Sending the backup code as a Bearer token (rather than relying
  // only on the session cookie) means the same server-side session
  // is reachable even if cookies get cleared independently of
  // localStorage, as long as the user still has this code saved.
  const backupCode = getBackupCode();
  if (backupCode) {
    headers["Authorization"] = `Bearer ${backupCode}`;
  }

  return headers;
}

// Calls /api/auth/init (which reuses an existing session if the
// current Backup Code / cookie already matches one, or creates a
// new one otherwise) and saves the resulting session ID locally as
// the Backup Code. Must run before any data-save/data-load calls
// so those calls carry a stable identity.
async function initSessionAndBackupCode() {
  try {
    const response = await fetch("/api/auth/init", {
      method: "POST",
      headers: getApiHeaders()
    });

    const data = await parseApiResponse(response);

    if (data.success && data.sessionId) {
      setBackupCode(data.sessionId);
    }
  } catch (error) {
    console.warn("Session init failed (non-fatal):", error);
  }
}

function renderBackupCodeDisplay() {
  const input = document.getElementById("backupCodeDisplay");
  if (input) input.value = getBackupCode() || "Not available yet";
}

// Explicit, user-initiated restore: unlike the passive startup
// restore (which only fills in empty data types), this overwrites
// local data for every type the server has, because the person is
// deliberately switching to a different Backup Code (e.g. on a new
// device) and expects that code's data to take over.
async function restoreFromBackupCode(code) {
  const trimmed = String(code || "").trim();

  if (!trimmed) {
    showToast("Backup code likhein.", "error");
    return;
  }

  if (
    !confirm(
      "Yeh is device/browser ka current data (Projects, History, Brand, Tool History) us code ke server data se replace kar dega. Continue karein?"
    )
  ) {
    return;
  }

  setBackupCode(trimmed);

  const serverData = await loadFromServer();

  if (!serverData) {
    showToast("Is code se koi backup nahi mila.", "error");
    return;
  }

  if (Array.isArray(serverData.history)) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(serverData.history));
  }

  if (Array.isArray(serverData.projects)) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(serverData.projects));
  }

  if (Array.isArray(serverData.toolhistory)) {
    localStorage.setItem(TOOL_HISTORY_KEY, JSON.stringify(serverData.toolhistory));
  }

  if (serverData.brand && typeof serverData.brand === "object") {
    userBrand = {
      name: serverData.brand.name || "",
      industry: serverData.brand.industry || "",
      audience: serverData.brand.audience || ""
    };

    localStorage.setItem("ideaforge_brand", JSON.stringify(userBrand));
  }

  renderHistory();
  renderToolHistory();
  renderProjects();
  renderBackupCodeDisplay();

  const modal = document.getElementById("backupModal");
  if (modal) modal.style.display = "none";

  showToast("✅ Data restored from backup code!", "success");
}

// ============================================================
// CLOUD DATA BACKUP
// localStorage stays the fast, primary copy of projects,
// idea history, brand profile and tool history. These helpers
// silently mirror that data to the server (SESSIONS_KV) as a
// backup, and can restore it if localStorage is ever empty
// (new browser, cleared cache, new device). Sync failures are
// non-fatal - the app keeps working from localStorage either way.
// ============================================================

async function syncToServer(type, data) {
  try {
    // Check size on this side too, so an oversized payload never
    // leaves the browser at all (worker.js enforces the same cap
    // server-side as a backstop, in case this check is bypassed).
    const serialized = JSON.stringify(data ?? null);

    if (serialized.length > MAX_USER_DATA_BYTES) {
      console.warn(
        `Cloud backup skipped: ${type} payload (${serialized.length} bytes) exceeds the ${MAX_USER_DATA_BYTES} byte limit.`
      );
      return;
    }

    await fetch("/api/data-save", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ type, data })
    });
  } catch (error) {
    console.warn("Cloud backup failed (non-fatal):", type, error);
  }
}

async function loadFromServer() {
  try {
    const response = await fetch("/api/data-load", {
      method: "GET",
      headers: getApiHeaders()
    });

    const result = await parseApiResponse(response);

    if (!result.success) return null;

    return result.data || null;
  } catch (error) {
    console.warn("Cloud restore failed (non-fatal):", error);
    return null;
  }
}

// On startup: for each data type, if localStorage is empty but the
// server has a backup, restore it. If localStorage already has data,
// leave it as-is (it's the source of truth) and just push a fresh
// backup copy up to the server so the backup stays current.
async function restoreOrBackupUserData() {
  const serverData = await loadFromServer();
  if (!serverData) return;

  const localHistory = getHistory();
  if (!localHistory.length && Array.isArray(serverData.history) && serverData.history.length) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(serverData.history));
  } else if (localHistory.length) {
    syncToServer("history", localHistory);
  }

  const localProjects = getProjects();
  if (!localProjects.length && Array.isArray(serverData.projects) && serverData.projects.length) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(serverData.projects));
  } else if (localProjects.length) {
    syncToServer("projects", localProjects);
  }

  const localToolHistory = getToolHistory();
  if (!localToolHistory.length && Array.isArray(serverData.toolhistory) && serverData.toolhistory.length) {
    localStorage.setItem(TOOL_HISTORY_KEY, JSON.stringify(serverData.toolhistory));
  } else if (localToolHistory.length) {
    syncToServer("toolhistory", localToolHistory);
  }

  const hasLocalBrand = Boolean(userBrand.name || userBrand.industry || userBrand.audience);

  if (!hasLocalBrand && serverData.brand && typeof serverData.brand === "object") {
    userBrand = {
      name: serverData.brand.name || "",
      industry: serverData.brand.industry || "",
      audience: serverData.brand.audience || ""
    };

    localStorage.setItem("ideaforge_brand", JSON.stringify(userBrand));
  } else if (hasLocalBrand) {
    syncToServer("brand", userBrand);
  }

  renderHistory();
  renderToolHistory();
  renderProjects();
  renderBackupCodeDisplay();
}

// ============================================================
// HISTORY
// ============================================================

function getHistory() {
  return safeJsonParse(localStorage.getItem(HISTORY_KEY), []) || [];
}

function saveToHistory(idea, report) {
  if (!report) return;

  const list = getHistory();

  list.unshift({
    idea: String(idea).slice(0, 80),
    score: report?.score?.overall ?? 0,
    report,
    fullIdea: idea,
    savedAt: Date.now()
  });

  while (list.length > HISTORY_LIMIT) {
    list.pop();
  }

  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  syncToServer("history", list);
  renderHistory();
}

function renderHistory() {
  const list = getHistory();
  const section = document.getElementById("ideaHistorySection");
  const row = document.getElementById("ideaHistoryRow");

  if (!section || !row) return;

  row.innerHTML = "";

  if (!list.length) {
    row.innerHTML = `<div class="empty-state">No past ideas yet. Generate your first report!</div>`;
    return;
  }

  list.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "historyItem";

    button.innerHTML = `
      <strong>${escapeHtml(item.score)}/100</strong>
      <span>${escapeHtml(item.idea)}</span>
    `;

    button.addEventListener("click", () => {
      currentIdeaText = item.fullIdea || "";
      currentReport = item.report || null;
      resetFollowupChat();

      const input = document.getElementById("ideaInput");
      if (input) input.value = currentIdeaText;

      if (currentReport) renderReport(currentReport);
    });

    row.appendChild(button);
  });
}

// ============================================================
// UI LANGUAGE
// ============================================================

let i18nCache = null;

const UI_STRINGS = {
  en: { tagline: "One AI Workspace for Everything", askAiBtn: "➤ Ask AI" },
  hi: { tagline: "सबके लिए AI वर्कस्पेस", askAiBtn: "➤ AI से पूछें" }
};

function applyUILanguage(lang = "en") {
  const dictionary = UI_STRINGS[lang] || UI_STRINGS.en;

  if (!i18nCache) {
    i18nCache = Array.from(document.querySelectorAll("[data-i18n]")).map((element) => ({
      element,
      key: element.getAttribute("data-i18n")
    }));
  }

  i18nCache.forEach(({ element, key }) => {
    if (dictionary[key]) element.textContent = dictionary[key];
  });

  localStorage.setItem("ideaforge_ui_lang", lang);
}

// ============================================================
// REPORT
// ============================================================

const SECTION_DISPLAY = [
  { key: "IDEA", title: "💡 The Idea" },
  { key: "TARGET_CUSTOMERS", title: "🎯 Target Customers" },
  { key: "CUSTOMER_PROBLEM", title: "😣 Customer Problem" },
  { key: "REVENUE_MODEL", title: "💰 Revenue Model" },
  { key: "MARKET_ANALYSIS", title: "📊 Market Analysis" },
  { key: "COMPETITOR_ANALYSIS", title: "🥊 Competitor Analysis" },
  { key: "MARKETING_STRATEGY", title: "📣 Marketing Strategy" },
  { key: "STARTUP_COST", title: "💵 Startup Cost" },
  { key: "ONE_YEAR_PROJECTION", title: "📈 1-Year Projection" },
  { key: "RISKS", title: "⚠️ Risks" },
  { key: "GROWTH_STRATEGY", title: "🚀 Growth Strategy" }
];

function setBar(barId, valueId, value) {
  const bar = document.getElementById(barId);
  const valueElement = document.getElementById(valueId);

  const numericValue = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;

  if (bar) bar.style.width = `${numericValue}%`;

  if (valueElement) {
    valueElement.textContent = typeof value === "number" ? `${value}/100` : "--/100";
  }
}

function renderReport(report) {
  if (!report) return;

  const score = report.score || {};
  const sections = report.sections || {};

  const overall = document.getElementById("scoreOverall");
  if (overall) overall.textContent = typeof score.overall === "number" ? score.overall : "--";

  setBar("barMarket", "valMarket", score.market);
  setBar("barCompetition", "valCompetition", score.competition);
  setBar("barProfit", "valProfit", score.profit);
  setBar("barDifficulty", "valDifficulty", score.difficulty);

  const container = document.getElementById("reportSections");
  if (!container) return;

  container.innerHTML = "";

  SECTION_DISPLAY.forEach((item) => {
    const content = sections[item.key];
    if (!content) return;

    const card = document.createElement("div");
    card.className = "reportCard";

    card.innerHTML = `
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(content)}</p>
    `;

    container.appendChild(card);
  });

  // SWOT
  const swotKeys = ["SWOT_STRENGTHS", "SWOT_WEAKNESSES", "SWOT_OPPORTUNITIES", "SWOT_THREATS"];

  if (swotKeys.some((key) => sections[key])) {
    const card = document.createElement("div");
    card.className = "reportCard";

    card.innerHTML = `
      <h3>📊 SWOT Analysis</h3>
      <h4>💪 Strengths</h4>
      <p>${escapeHtml(sections.SWOT_STRENGTHS || "")}</p>
      <h4>⚠️ Weaknesses</h4>
      <p>${escapeHtml(sections.SWOT_WEAKNESSES || "")}</p>
      <h4>🚀 Opportunities</h4>
      <p>${escapeHtml(sections.SWOT_OPPORTUNITIES || "")}</p>
      <h4>🔥 Threats</h4>
      <p>${escapeHtml(sections.SWOT_THREATS || "")}</p>
    `;

    container.appendChild(card);
  }

  const reportSection = document.getElementById("reportSection");

  if (reportSection) {
    reportSection.style.display = "block";
    reportSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ============================================================
// GENERATE REPORT
// ============================================================

async function generateReport() {
  const input = document.getElementById("ideaInput");
  const btn = document.getElementById("generateBtn");

  if (!input) return;

  const idea = input.value.trim();

  if (!idea) {
    showToast("Idea likhein.", "error");
    return;
  }

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam! Pro upgrade karein.", "error");
    return;
  }

  const originalText = btn?.innerHTML || "Generate";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Analyzing...";
  }

  try {
    const response = await fetch("/api/generate-report", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        idea,
        language: document.getElementById("languageSelect")?.value || "auto",
        brand: userBrand
      })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.report) {
      if (data.limitReached) showToast("Free Plan limit khatam!", "error");
      throw new Error(data.error || "Report generate nahi hua.");
    }

    if (!isProUser) incrementUsage();

    currentReport = data.report;
    currentIdeaText = idea;
    resetFollowupChat();

    renderReport(data.report);
    saveToHistory(idea, data.report);

    trackEvent("generate_report", { success: true });
    showToast("✅ Report generated!", "success");
  } catch (error) {
    console.error(error);
    trackEvent("generate_report", { success: false });
    showToast(error.message || "Report generation failed.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// PDF
// ============================================================

async function downloadElementAsPdf(elementId, prefix, button) {
  if (!window.html2canvas || !window.jspdf) {
    showToast("PDF library load nahi hui.", "error");
    return;
  }

  const element = document.getElementById(elementId);

  if (!element) {
    showToast("PDF content nahi mila.", "error");
    return;
  }

  const originalText = button?.innerHTML || "PDF";

  if (button) {
    button.disabled = true;
    button.innerHTML = "⏳ PDF...";
  }

  try {
    const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageHeight = (canvas.height * pageWidth) / canvas.width;
    const image = canvas.toDataURL("image/jpeg", 0.92);

    let heightLeft = imageHeight;
    let position = 0;

    pdf.addImage(image, "JPEG", 0, position, pageWidth, imageHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imageHeight;
      pdf.addPage();
      pdf.addImage(image, "JPEG", 0, position, pageWidth, imageHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${prefix}-${Date.now()}.pdf`);
    showToast("📄 PDF downloaded!", "success");
  } catch (error) {
    console.error(error);
    showToast("PDF Error.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }
}

// ============================================================
// COPY
// ============================================================

async function copyText(text) {
  if (!text) {
    showToast("Copy karne ke liye text nahi hai.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(String(text));
    showToast("📋 Copied!", "success");
  } catch {
    showToast("Copy failed.", "error");
  }
}

// ============================================================
// LAUNCH PLAN
// ============================================================

async function generateLaunchPlan() {
  if (!currentIdeaText) {
    showToast("Pehle report generate karein.", "error");
    return;
  }

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam!", "error");
    return;
  }

  const btn = document.getElementById("generateLaunchPlanBtn");
  const originalText = btn?.innerHTML || "Generate";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Planning...";
  }

  try {
    const response = await fetch("/api/generate-launch-plan", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        idea: currentIdeaText,
        budget: document.getElementById("budgetInput")?.value || "",
        language: document.getElementById("languageSelect")?.value || "auto",
        brand: userBrand
      })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.plan) {
      throw new Error(data.error || "Launch plan generate nahi hua.");
    }

    if (!isProUser) incrementUsage();

    renderSectionsInto(
      "launchPlanSections",
      [
        { key: "BUDGET_BREAKDOWN", title: "💰 Budget" },
        { key: "PREPARATION", title: "📋 Preparation" },
        { key: "PRODUCT_DEVELOPMENT", title: "🛠️ Product Development" },
        { key: "BRANDING", title: "🎨 Branding" },
        { key: "MARKETING_LAUNCH", title: "📣 Marketing" },
        { key: "LAUNCH_WEEK", title: "🚀 Launch Week" },
        { key: "PRODUCT_IDEAS", title: "💡 Product Ideas" },
        { key: "PRICING", title: "🏷️ Pricing" },
        { key: "EXPECTED_SALES", title: "💵 Expected Sales" }
      ],
      data.plan
    );

    const section = document.getElementById("launchPlanSection");
    if (section) section.style.display = "block";

    showToast("🚀 Launch plan ready!", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// PITCH DECK
// ============================================================

async function generatePitchDeck() {
  if (!currentIdeaText) {
    showToast("Pehle report generate karein.", "error");
    return;
  }

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam!", "error");
    return;
  }

  const btn = document.getElementById("generatePitchDeckBtn");
  const originalText = btn?.innerHTML || "Generate";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Building...";
  }

  try {
    const response = await fetch("/api/generate-pitch-deck", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        idea: currentIdeaText,
        language: document.getElementById("languageSelect")?.value || "auto",
        brand: userBrand
      })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.deck) {
      throw new Error(data.error || "Pitch deck generate nahi hua.");
    }

    if (!isProUser) incrementUsage();

    renderSectionsInto(
      "pitchDeckSlides",
      [
        { key: "PROBLEM", title: "❗ Problem" },
        { key: "SOLUTION", title: "💡 Solution" },
        { key: "MARKET", title: "📊 Market" },
        { key: "PRODUCT", title: "🛠️ Product" },
        { key: "BUSINESS_MODEL", title: "💰 Business Model" },
        { key: "COMPETITION", title: "🥊 Competition" },
        { key: "FINANCIALS", title: "📈 Financials" },
        { key: "GROWTH", title: "🚀 Growth" },
        { key: "FUNDING_REQUIREMENT", title: "💵 Funding" }
      ],
      data.deck
    );

    const section = document.getElementById("pitchDeckSection");
    if (section) section.style.display = "block";

    showToast("📊 Pitch deck ready!", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// GENERIC SECTION RENDERER
// ============================================================

function renderSectionsInto(containerId, specification, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";
  if (!data) return;

  specification.forEach((item) => {
    if (!data[item.key]) return;

    const card = document.createElement("div");
    card.className = "reportCard";

    card.innerHTML = `
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(data[item.key])}</p>
    `;

    container.appendChild(card);
  });
}

// ============================================================
// SMART ROUTER
// ============================================================

function smartRouteInput(input) {
  const text = String(input || "").toLowerCase().trim();

  if (
    /^[\d\s()+\-*/%.^]+$/.test(text) ||
    /\b(calculate|calculator|math|kitna|jod|jama|guna|multiply|divide|percent)\b/.test(text)
  ) {
    return "calculator";
  }

  if (/\b(translate|translation|anuvad|meaning|in hindi|in english|hindi me|english me)\b/.test(text)) {
    return "translate";
  }

  if (/\b(write|draft|email|letter|essay|application|likho|likhna|message)\b/.test(text)) {
    return "writing";
  }

  if (/\b(explain|define|what is|kya hai|history|science|study|padhai|question|answer)\b/.test(text)) {
    return "student";
  }

  if (/\b(code|coding|program|script|function|python|javascript|html|css|react|api|worker|cloudflare|github)\b/.test(text)) {
    return "code";
  }

  if (/\b(logo|brand logo|icon|symbol|emblem)\b/.test(text)) {
    return "logo";
  }

  if (/\b(post|tweet|instagram|linkedin|facebook|social media|caption|reel)\b/.test(text)) {
    return "social";
  }

  if (/\b(image|picture|photo|draw|generate image|banaiye|tasveer|chitra|painting)\b/.test(text)) {
    return "ai-image";
  }

  if (/\b(promote|marketing|advertisement|advertising|ad campaign|campaign|business promote)\b/.test(text)) {
    return "autopilot";
  }

  if (/\b(document|pdf|analyze document|summary|notes|report)\b/.test(text)) {
    return "document";
  }

  if (/\b(goal|plan|roadmap|kaise karein|how to achieve|target|strategy)\b/.test(text)) {
    return "goalplan";
  }

  if (/\b(profit|loss|money|investment|roi|kamaai|income|expense|business calculation)\b/.test(text)) {
    return "moneycalc";
  }

  if (/\b(improve|feedback|suggestion|better idea|idea improve)\b/.test(text)) {
    return "improveidea";
  }

  if (/\b(roast|shark tank|critique|brutal|idea check)\b/.test(text)) {
    return "roast";
  }

  if (/\b(poster|banner|flyer|graphic design)\b/.test(text)) {
    return "poster";
  }

  if (/\b(video|video script|youtube|shorts|tiktok)\b/.test(text)) {
    return "video";
  }

  if (/\b(workflow|batch|all in one|complete pack)\b/.test(text)) {
    return "workflow";
  }

  if (/\b(cold email|outreach|follow up|proposal|networking email)\b/.test(text)) {
    return "email";
  }

  if (/\b(card|quote card|quote|instagram story|status|shareable)\b/.test(text)) {
    return "card";
  }

  if (/\b(agent|startup|business idea|business start|shuru karna|start business)\b/.test(text)) {
    return "agent";
  }

  if (/\b(chat|talk|conversation|baat karo|help me)\b/.test(text)) {
    return "chat";
  }

  return "assistant";
}

// ============================================================
// TOOL TITLES
// ============================================================

const TOOL_TITLES = {
  assistant: "🤖 AI Assistant",
  autopilot: "🚀 Auto-Pilot",
  goalplan: "🎯 Goal Plan",
  moneycalc: "💰 Money Calc",
  improveidea: "💡 Improve Idea",
  roast: "🦈 Roast Idea",
  poster: "🖼️ Poster Maker",
  video: "🎬 Video Script",
  workflow: "⚙️ AI Workflow",
  writing: "✍️ Writing",
  translate: "🌐 Translate",
  calculator: "🧮 Calculator",
  student: "📚 Student",
  code: "💻 Code",
  logo: "🎨 Logo",
  social: "📱 Social",
  socialpack: "📦 Social Pack",
  "ai-image": "🖼️ AI Image",
  document: "📄 Doc AI",
  image: "📸 Image Tools",
  chat: "💬 AI Chat",
  card: "📸 Quote Card",
  email: "✉️ Cold Email",
  projects: "📂 My Projects",
  agent: "🤖 Business Agent"
};

// ============================================================
// OPEN TOOL
// ============================================================

function openToolWorkspace(tool) {
  activeTool = tool;

  document.querySelectorAll(".hubChip").forEach((chip) => chip.classList.remove("active"));

  const selectedChip = document.querySelector(`.hubChip[data-tool="${tool}"]`);
  if (selectedChip) selectedChip.classList.add("active");

  // If the selected chip lives inside the collapsed "All Tools"
  // grid, expand it so the highlighted chip is actually visible
  // (e.g. when a tool is opened via the Hub's smart router rather
  // than a direct click).
  const allToolsGrid = document.getElementById("allToolsGrid");

  if (selectedChip && allToolsGrid && allToolsGrid.contains(selectedChip) && allToolsGrid.style.display === "none") {
    allToolsGrid.style.display = "grid";

    const viewAllBtn = document.getElementById("viewAllToolsBtn");

    if (viewAllBtn) {
      viewAllBtn.setAttribute("aria-expanded", "true");
      viewAllBtn.innerHTML = "🧰 Hide Tools ▴";
    }
  }

  const projectsSection = document.getElementById("projectsSection");
  const toolWorkspace = document.getElementById("toolWorkspace");
  const imageWorkspace = document.getElementById("imageToolWorkspace");
  const documentWorkspace = document.getElementById("documentWorkspace");

  if (tool === "projects") {
    if (projectsSection) projectsSection.style.display = "block";
    if (toolWorkspace) toolWorkspace.style.display = "none";

    const list = document.getElementById("projectListView");
    const detail = document.getElementById("projectDetailView");

    if (list) list.style.display = "block";
    if (detail) detail.style.display = "none";

    renderProjects();
    projectsSection?.scrollIntoView({ behavior: "smooth" });

    return;
  }

  if (projectsSection) projectsSection.style.display = "none";
  if (toolWorkspace) toolWorkspace.style.display = "none";
  if (imageWorkspace) imageWorkspace.style.display = "none";
  if (documentWorkspace) documentWorkspace.style.display = "none";

  if (tool === "image") {
    if (imageWorkspace) {
      imageWorkspace.style.display = "block";
      imageWorkspace.scrollIntoView({ behavior: "smooth" });
    }
    return;
  }

  if (tool === "document") {
    if (documentWorkspace) {
      documentWorkspace.style.display = "block";
      documentWorkspace.scrollIntoView({ behavior: "smooth" });
    }
    return;
  }

  const title = document.getElementById("toolWorkspaceTitle");
  if (title) title.textContent = TOOL_TITLES[tool] || TOOL_TITLES.assistant;

  const optionIds = [
    "writingOptions",
    "translateOptions",
    "codeOptions",
    "logoOptions",
    "socialOptions",
    "aiImageOptions",
    "goalOptions",
    "moneyOptions",
    "posterOptions",
    "videoOptions",
    "workflowOptions",
    "emailOptions"
  ];

  optionIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.style.display = "none";
  });

  const optionMap = {
    writing: "writingOptions",
    translate: "translateOptions",
    code: "codeOptions",
    logo: "logoOptions",
    social: "socialOptions",
    "ai-image": "aiImageOptions",
    goalplan: "goalOptions",
    moneycalc: "moneyOptions",
    poster: "posterOptions",
    video: "videoOptions",
    workflow: "workflowOptions",
    email: "emailOptions"
  };

  const optionId = optionMap[tool];

  if (optionId) {
    const option = document.getElementById(optionId);
    if (option) option.style.display = "flex";
  }

  const chatInterface = document.getElementById("chatInterface");
  const standardInput = document.getElementById("standardInputArea");
  const resultActions = document.getElementById("toolResultActions");
  const bilingual = document.getElementById("bilingualToggle");

  if (tool === "chat") {
    if (chatInterface) chatInterface.style.display = "block";
    if (standardInput) standardInput.style.display = "none";
    if (resultActions) resultActions.style.display = "none";
    if (bilingual && bilingual.parentElement) bilingual.parentElement.style.display = "none";
  } else {
    if (chatInterface) chatInterface.style.display = "none";
    if (standardInput) standardInput.style.display = "block";
    if (bilingual && bilingual.parentElement) bilingual.parentElement.style.display = "flex";
  }

  if (toolWorkspace) {
    toolWorkspace.style.display = "block";
    toolWorkspace.scrollIntoView({ behavior: "smooth" });
  }

  if (tool !== "chat") {
    document.getElementById("toolInput")?.focus();
  }
}

// ============================================================
// USAGE
// ============================================================

function getTodayUsage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const stored = safeJsonParse(localStorage.getItem(USAGE_KEY), null);

  if (!stored || stored.date !== todayStr) {
    return { date: todayStr, count: 0 };
  }

  return { date: todayStr, count: Number(stored.count) || 0 };
}

function incrementUsage() {
  if (isProUser) return;

  const usage = getTodayUsage();
  usage.count++;

  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  renderUsageBanner();
}

function hasUsageRemaining() {
  if (isProUser) return true;
  return getTodayUsage().count < FREE_DAILY_LIMIT;
}

function renderUsageBanner() {
  const banner = document.getElementById("usageBanner");
  const text = document.getElementById("usageText");

  if (!banner || !text) return;

  if (isProUser) {
    text.textContent = "✨ Pro Plan • Unlimited AI access";
    banner.classList.remove("limitReached");
    banner.style.display = "block";
    return;
  }

  const usage = getTodayUsage();
  const remaining = Math.max(0, FREE_DAILY_LIMIT - usage.count);

  if (remaining <= 0) {
    text.textContent = "⚠️ Free Plan Limit Reached! Upgrade to Pro for unlimited access.";
    banner.classList.add("limitReached");
  } else {
    text.textContent = `Free Plan • ${remaining} AI uses remaining today`;
    banner.classList.remove("limitReached");
  }

  banner.style.display = "block";
}

// ============================================================
// FORMAT RESULT
// ============================================================

function formatToolResult(text, tool) {
  if (text == null) return "";

  const value = String(text);

  if (tool === "code") {
    return `<pre class="code-result"><code>${escapeHtml(value)}</code></pre>`;
  }

  return escapeHtml(value).replace(/\n{3,}/g, "\n\n").replace(/\n/g, "<br>");
}

// ============================================================
// AUTOPILOT RESULT
// ============================================================

function renderAutopilotResult(pkg) {
  const container = document.getElementById("autopilotResult");
  if (!container) return;

  container.innerHTML = "";

  const sections = [
    { key: "AD_COPY", title: "📢 Ad Copy" },
    { key: "INSTAGRAM_CAPTION", title: "📸 Instagram Caption" },
    { key: "FACEBOOK_POST", title: "📘 Facebook Post" },
    { key: "WHATSAPP_MESSAGE", title: "💬 WhatsApp Message" },
    { key: "POSTER_TEXT", title: "🎨 Poster Text" },
    { key: "IMAGE_PROMPT", title: "🖼️ Image Prompt" },
    { key: "VIDEO_PROMPT", title: "🎥 Video Prompt" },
    { key: "HASHTAGS", title: "#️⃣ Hashtags" }
  ];

  sections.forEach((section) => {
    if (!pkg?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "autopilot-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(pkg[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// SOCIAL PACK
// ============================================================

function renderSocialPackResult(pack) {
  const container = document.getElementById("socialPackResult");
  if (!container) return;

  container.innerHTML = "";

  const sections = [
    { key: "INSTAGRAM", title: "📸 Instagram" },
    { key: "FACEBOOK", title: "📘 Facebook" },
    { key: "WHATSAPP", title: "💬 WhatsApp" },
    { key: "YOUTUBE_TITLE", title: "🎬 YouTube Title" },
    { key: "YOUTUBE_DESCRIPTION", title: "📝 YouTube Description" },
    { key: "SHORTS_CAPTION", title: "⚡ Shorts Caption" },
    { key: "HASHTAGS", title: "#️⃣ Hashtags" },
    { key: "THUMBNAIL_PROMPT", title: "🖼️ Thumbnail Prompt" }
  ];

  sections.forEach((section) => {
    if (!pack?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "autopilot-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(pack[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// GOAL RESULT
// ============================================================

function renderGoalResult(plan) {
  const container = document.getElementById("goalResult");
  if (!container) return;

  container.innerHTML = "";

  const sections = [
    { key: "OVERVIEW", title: "🎯 Strategy Overview" },
    { key: "MILESTONES", title: "🏆 Key Milestones" },
    { key: "ACTION_PLAN", title: "📋 Action Plan" },
    { key: "RESOURCES_NEEDED", title: "🛠️ Resources Needed" },
    { key: "POTENTIAL_OBSTACLES", title: "⚠️ Potential Obstacles" }
  ];

  sections.forEach((section) => {
    if (!plan?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "goal-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(plan[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// MONEY RESULT
// ============================================================

function renderMoneyResult(calc) {
  const container = document.getElementById("moneyResult");
  if (!container) return;

  container.innerHTML = "";

  const sections = [
    { key: "INVESTMENT_BREAKDOWN", title: "💰 Investment Breakdown" },
    { key: "MONTHLY_EXPENSES", title: "📉 Monthly Expenses" },
    { key: "REVENUE_MODEL", title: "💵 Revenue Model" },
    { key: "PROFIT_PROJECTION", title: "📈 Profit Projection" },
    { key: "BREAK_EVEN", title: "⚖️ Break-Even Point" },
    { key: "RISKS", title: "⚠️ Financial Risks" }
  ];

  sections.forEach((section) => {
    if (!calc?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "money-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(calc[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// IMPROVE RESULT
// ============================================================

function renderImproveResult(feedback) {
  const container = document.getElementById("improveResult");
  if (!container) return;

  container.innerHTML = "";

  const sections = [
    { key: "VERDICT", title: "⚖️ Final Verdict" },
    { key: "WHAT_WORKS", title: "✅ What Works" },
    { key: "WHAT_IS_MISSING", title: "❓ What is Missing" },
    { key: "PRICING_STRATEGY", title: "🏷️ Pricing Strategy" },
    { key: "TARGET_AUDIENCE", title: "🎯 Target Audience" },
    { key: "IMMEDIATE_NEXT_STEPS", title: "🚀 Immediate Next Steps" }
  ];

  sections.forEach((section) => {
    if (!feedback?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "improve-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(feedback[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// ROAST
// ============================================================

function renderRoastResult(roast) {
  const container = document.getElementById("roastResult");
  if (!container) return;

  container.innerHTML = "";

  const score = roast?.SHARK_SCORE ?? "?";

  container.innerHTML = `<div class="shark-score">🦈 ${escapeHtml(score)}/10</div>`;

  const sections = [
    { key: "THE_GOOD", title: "✅ The Good" },
    { key: "THE_ROAST", title: "🔥 The Brutal Truth" },
    { key: "THE_FIX", title: "🛠️ The Fix" },
    { key: "FINAL_VERDICT", title: "⚖️ Final Verdict" }
  ];

  sections.forEach((section) => {
    if (!roast?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "roast-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(roast[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// POSTER
// ============================================================

function renderPosterResult(poster, theme) {
  document
    .getElementById("posterHeadline")
    ?.replaceChildren(document.createTextNode(poster?.HEADLINE || "Headline"));

  document
    .getElementById("posterSubhead")
    ?.replaceChildren(document.createTextNode(poster?.SUBHEADLINE || "Subheadline"));

  document
    .getElementById("posterBody")
    ?.replaceChildren(document.createTextNode(poster?.BODY || "Body text goes here."));

  document
    .getElementById("posterFooter")
    ?.replaceChildren(document.createTextNode(poster?.FOOTER || "Footer / CTA"));

  const preview = document.getElementById("posterPreview");

  if (preview) {
    preview.style.background = theme || "linear-gradient(135deg,#667eea,#764ba2)";
  }

  const box = document.getElementById("posterPreviewBox");
  if (box) box.style.display = "block";
}

// ============================================================
// CARD
// ============================================================

function renderCardResult(card) {
  const headline = document.getElementById("cardHeadline");
  const body = document.getElementById("cardBody");
  const footer = document.getElementById("cardFooter");

  if (headline) headline.textContent = card?.HEADLINE || "Headline";
  if (body) body.textContent = card?.BODY || "Body text goes here.";
  if (footer) footer.textContent = card?.FOOTER || "Footer / CTA";

  const preview = document.getElementById("cardPreview");

  if (preview) {
    preview.style.background = card?.BG_GRADIENT || "linear-gradient(135deg,#667eea,#764ba2)";
    preview.style.color = "white";
  }

  const box = document.getElementById("cardPreviewBox");
  if (box) box.style.display = "block";
}

// ============================================================
// VIDEO
// ============================================================

function renderVideoResult(video) {
  const container = document.getElementById("videoResult");
  if (!container) return;

  container.innerHTML = "";

  const sections = [
    { key: "TITLE", title: "🎬 Video Title" },
    { key: "HOOK", title: "🪝 Hook" },
    { key: "INTRO", title: "🎙️ Intro" },
    { key: "BODY", title: "🎥 Main Script / Scenes" },
    { key: "CTA", title: "📢 Call to Action" },
    { key: "HASHTAGS", title: "#️⃣ Hashtags" }
  ];

  sections.forEach((section) => {
    if (!video?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "video-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(video[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// WORKFLOW
// ============================================================

function renderWorkflowResult(workflow) {
  const container = document.getElementById("workflowResult");
  if (!container) return;

  container.innerHTML = "";

  ["PART_1", "PART_2", "PART_3"].forEach((key, index) => {
    if (!workflow?.[key]) return;

    const div = document.createElement("div");
    div.className = "workflow-section";

    div.innerHTML = `
      <h4>📦 Part ${index + 1}</h4>
      <p>${escapeHtml(workflow[key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// EMAIL
// ============================================================

function renderEmailResult(email) {
  const container = document.getElementById("emailResult");
  if (!container) return;

  container.innerHTML = "";

  [
    { key: "SUBJECT", title: "📧 Subject Line" },
    { key: "BODY", title: "📝 Email Body" },
    { key: "SIGN_OFF", title: "✍️ Sign Off" }
  ].forEach((section) => {
    if (!email?.[section.key]) return;

    const div = document.createElement("div");
    div.className = "email-section";

    div.innerHTML = `
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(email[section.key])}</p>
    `;

    container.appendChild(div);
  });

  container.style.display = "block";
}

// ============================================================
// CHAT
// ============================================================

function appendChatMessage(role, text) {
  const container = document.getElementById("chatContainer");
  if (!container) return;

  const message = document.createElement("div");
  message.className = `chat-message chat-${role}`;
  message.textContent = String(text);

  container.appendChild(message);
  container.scrollTop = container.scrollHeight;
}

// ============================================================
// REPORT FOLLOW-UP CHAT
// Lets the user keep asking questions about the same idea
// without retyping it or clearing anything — each question
// (and the AI's answers) accumulate in reportFollowupHistory
// and get sent together for context, same as the main Chat tool.
// ============================================================

function appendFollowupMessage(role, text) {
  const container = document.getElementById("followupContainer");
  if (!container) return;

  const message = document.createElement("div");
  message.className = `chat-message chat-${role}`;
  message.textContent = String(text);

  container.appendChild(message);
  container.scrollTop = container.scrollHeight;
}

function resetFollowupChat() {
  reportFollowupHistory = [];

  const container = document.getElementById("followupContainer");
  if (container) container.innerHTML = "";
}

async function askIdeaFollowup() {
  const input = document.getElementById("followupInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam! Pro lein.", "error");
    return;
  }

  // On the first question, fold the idea itself into the message
  // so the AI has context without the user having to repeat it.
  // Later questions go through as-is — the running history already
  // carries the idea and every prior Q&A.
  const isFirstQuestion = reportFollowupHistory.length === 0;

  const messageForApi = isFirstQuestion
    ? `Business idea: "${currentIdeaText}"\n\nSawaal: ${text}`
    : text;

  appendFollowupMessage("user", text);
  input.value = "";

  reportFollowupHistory.push({ role: "user", content: messageForApi });

  if (reportFollowupHistory.length > 10) {
    reportFollowupHistory = reportFollowupHistory.slice(-10);
  }

  const btn = document.getElementById("askFollowupBtn");
  const originalText = btn?.innerHTML || "Ask";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳...";
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ messages: reportFollowupHistory, brand: userBrand })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.reply) {
      throw new Error(data.error || "Jawab nahi aaya.");
    }

    if (!isProUser) incrementUsage();

    appendFollowupMessage("ai", data.reply);
    reportFollowupHistory.push({ role: "assistant", content: data.reply });

    trackEvent("report_followup_question", { success: true });
  } catch (error) {
    showToast(error.message, "error");
    trackEvent("report_followup_question", { success: false });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam! Pro lein.", "error");
    return;
  }

  appendChatMessage("user", text);
  input.value = "";

  chatHistory.push({ role: "user", content: text });

  if (chatHistory.length > 10) {
    chatHistory = chatHistory.slice(-10);
  }

  const btn = document.getElementById("sendChatBtn");
  const originalText = btn?.innerHTML || "Send";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Thinking...";
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ messages: chatHistory, brand: userBrand })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.reply) {
      throw new Error(data.error || "Chat reply nahi aaya.");
    }

    if (!isProUser) incrementUsage();

    appendChatMessage("ai", data.reply);
    chatHistory.push({ role: "assistant", content: data.reply });

    currentToolResult = data.reply;
    currentToolInput = text;

    trackEvent("chat_message", { success: true });
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// BUSINESS AGENT
// ============================================================

async function runBusinessAgent() {
  const input = document.getElementById("agentInput");
  if (!input) return;

  const text = input.value.trim();

  if (!text) {
    showToast("Apna business idea likhein!", "error");
    return;
  }

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam!", "error");
    return;
  }

  if (!currentProjectId) {
    showToast("Pehle ek Project create karein!", "error");
    return;
  }

  const btn = document.getElementById("runAgentBtn");
  const originalText = btn?.innerHTML || "Run";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Agent is working...";
  }

  try {
    trackEvent("run_business_agent", { project_id: String(currentProjectId) });

    const response = await fetch("/api/agent-generate", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        input: text,
        language:
          document.getElementById("uiLanguageSelect")?.value ||
          document.getElementById("languageSelect")?.value ||
          "en"
      })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.data) {
      throw new Error(data.error || "Agent failed.");
    }

    if (!isProUser) incrementUsage();

    const projects = getProjects();
    const index = projects.findIndex((project) => project.id === currentProjectId);

    if (index === -1) {
      throw new Error("Project nahi mila.");
    }

    const assets = data.data || {};
    const socialPosts = Array.isArray(assets.social_posts) ? assets.social_posts : [];

    const newAssets = [
      { type: "Brand Name", title: "Brand Name", content: assets.brand_name || "" },
      { type: "Tagline", title: "Tagline", content: assets.tagline || "" },
      { type: "Logo Prompt", title: "Logo Generation Prompt", content: assets.logo_prompt || "" },
      { type: "Description", title: "Business Description", content: assets.description || "" },
      { type: "Ad Copy", title: "Advertisement Copy", content: assets.ad_copy || "" },
      { type: "Social Post 1", title: "Instagram Post 1", content: socialPosts[0] || "" },
      { type: "Social Post 2", title: "Instagram Post 2", content: socialPosts[1] || "" },
      { type: "Social Post 3", title: "Instagram Post 3", content: socialPosts[2] || "" },
      { type: "Video Prompt", title: "Video Ad Script", content: assets.video_prompt || "" },
      { type: "Marketing Plan", title: "30-Day Marketing Plan", content: assets.marketing_plan || "" }
    ].filter((asset) => asset.content !== "");

    projects[index].assets = [...(projects[index].assets || []), ...newAssets];

    saveProjects(projects);
    renderProjectDetail(currentProjectId);

    input.value = "";
    showToast("🎉 Full Business Pack Generated & Saved!", "success");
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// HIDE TOOL RESULTS
// ============================================================

function hideAllToolResults() {
  const ids = [
    "toolResult",
    "autopilotResult",
    "socialPackResult",
    "goalResult",
    "moneyResult",
    "improveResult",
    "roastResult",
    "videoResult",
    "workflowResult",
    "posterPreviewBox",
    "cardPreviewBox",
    "emailResult",
    "generatedImageBox"
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.style.display = "none";
  });
}

// ============================================================
// AI TOOL
// ============================================================

async function runAiTool(input, tool) {
  if (!input?.trim()) return;

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam! Pro lein.", "error");
    return;
  }

  const btn = document.getElementById("toolGenerateBtn");
  const resultBox = document.getElementById("toolResult");
  const resultActions = document.getElementById("toolResultActions");
  const originalText = btn?.innerHTML || "Generate";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Thinking...";
  }

  hideAllToolResults();

  if (resultActions) resultActions.style.display = "none";

  const bilingual = document.getElementById("bilingualToggle")?.checked || false;

  const payload = {
    tool,
    input: input.trim(),
    language: document.getElementById("languageSelect")?.value || "auto",
    brand: userBrand,
    bilingual
  };

  if (tool === "writing") {
    payload.writingType = document.getElementById("writingTypeSelect")?.value || "";
    payload.tone = document.getElementById("toneSelect")?.value || "";
  }

  if (tool === "translate") {
    payload.fromLanguage = document.getElementById("fromLanguageSelect")?.value || "auto";
    payload.toLanguage = document.getElementById("toLanguageSelect")?.value || "en";
  }

  if (tool === "code") {
    payload.codeLang = document.getElementById("codeLangSelect")?.value || "javascript";
  }

  if (tool === "logo") {
    payload.logoStyle = document.getElementById("logoStyleSelect")?.value || "modern";
  }

  if (tool === "social") {
    payload.platform = document.getElementById("platformSelect")?.value || "instagram";
  }

  if (tool === "ai-image") {
    payload.style = document.getElementById("imageStyleSelect")?.value || "realistic";
  }

  if (tool === "goalplan") {
    payload.timeframe = document.getElementById("goalTimeframeSelect")?.value || "3 Months";
  }

  if (tool === "moneycalc") {
    payload.investment = document.getElementById("moneyInvestment")?.value || "";
    payload.businessType = document.getElementById("moneyTypeSelect")?.value || "Small Business";
  }

  if (tool === "poster" || tool === "card") {
    payload.theme = document.getElementById("posterThemeSelect")?.value || "purple";
  }

  if (tool === "video") {
    payload.platform = document.getElementById("videoPlatformSelect")?.value || "YouTube Long";
  }

  if (tool === "workflow") {
    payload.workflowType = document.getElementById("workflowTypeSelect")?.value || "startup-launch";
  }

  if (tool === "email") {
    payload.emailType = document.getElementById("emailTypeSelect")?.value || "Cold Outreach";
  }

  lastToolPayload = { ...payload, tool, input: input.trim() };

  try {
    if (tool === "autopilot") {
      const response = await fetch("/api/ai-autopilot", {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ input: input.trim(), brand: userBrand })
      });

      const data = await parseApiResponse(response);

      if (!data.success || !data.package) {
        throw new Error(data.error || "Autopilot package generate nahi hua.");
      }

      if (!isProUser) incrementUsage();

      renderAutopilotResult(data.package);

      currentToolResult = JSON.stringify(data.package, null, 2);
      currentToolInput = input.trim();

      if (resultActions) resultActions.style.display = "flex";

      saveToToolHistory(tool, input, currentToolResult);

      return;
    }

    const response = await fetch("/api/ai-tool", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.result) {
      throw new Error(data.error || "AI result nahi mila.");
    }

    if (!isProUser) incrementUsage();

    let effectiveTool = tool;

    if (tool === "auto" && data.route && data.route !== "auto") {
      effectiveTool = data.route;

      openToolWorkspace(effectiveTool);

      const toolInput = document.getElementById("toolInput");
      if (toolInput) toolInput.value = input;

      showToast(`✨ ${TOOL_TITLES[effectiveTool] || "Tool"} detected`, "info");
    }

    currentToolResult = String(data.result);
    currentToolInput = input.trim();

    if (resultBox) {
      resultBox.innerHTML = formatToolResult(data.result, effectiveTool);
      resultBox.style.display = "block";
    }

    if (resultActions) resultActions.style.display = "flex";

    saveToToolHistory(effectiveTool, input, currentToolResult);

    if (data.structured) {
      switch (effectiveTool) {
        case "goalplan":
          renderGoalResult(data.structured);
          break;
        case "moneycalc":
          renderMoneyResult(data.structured);
          break;
        case "improveidea":
          renderImproveResult(data.structured);
          break;
        case "roast":
          renderRoastResult(data.structured);
          break;
        case "video":
          renderVideoResult(data.structured);
          break;
        case "workflow":
          renderWorkflowResult(data.structured);
          break;
        case "email":
          renderEmailResult(data.structured);
          break;
        case "poster":
          renderPosterResult(data.structured, data.structured.theme);
          break;
        case "card":
          renderCardResult(data.structured);
          break;
        case "socialpack":
          renderSocialPackResult(data.structured);
          break;
      }
    }
  } catch (error) {
    console.error("AI Tool Error:", error);
    showToast(error.message || "AI tool failed.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// REMIX
// ============================================================

async function remixContent(style) {
  if (!currentToolResult || currentToolResult === "Image Generated Successfully") {
    showToast("Text content par hi Remix kaam karta hai.", "error");
    return;
  }

  const btn = document.getElementById("remixBtn");
  const originalText = btn?.innerHTML || "Remix";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Remixing...";
  }

  try {
    const response = await fetch("/api/remix", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ text: currentToolResult, style, brand: userBrand })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.result) {
      throw new Error(data.error || "Remix failed.");
    }

    if (!isProUser) incrementUsage();

    currentToolResult = String(data.result);

    const result = document.getElementById("toolResult");

    if (result) {
      result.innerHTML = formatToolResult(data.result, activeTool);
      result.style.display = "block";
    }

    showToast(`✨ Content remixed: ${style}`, "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// MAKE BETTER
// ============================================================

async function makeItBetter() {
  if (!currentToolResult || currentToolResult === "Image Generated Successfully") {
    showToast("Text content par hi Make Better kaam karta hai.", "error");
    return;
  }

  const btn = document.getElementById("makeBetterBtn");
  const originalText = btn?.innerHTML || "Improve";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Improving...";
  }

  try {
    const response = await fetch("/api/remix", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        text: currentToolResult,
        style: "professional, detailed, clear, polished and highly improved",
        brand: userBrand
      })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.result) {
      throw new Error(data.error || "Improvement failed.");
    }

    if (!isProUser) incrementUsage();

    currentToolResult = String(data.result);

    const result = document.getElementById("toolResult");

    if (result) {
      result.innerHTML = formatToolResult(data.result, activeTool);
      result.style.display = "block";
    }

    showToast("✨ Content improved!", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// DOCUMENT AI
// ============================================================

async function analyzeDocument() {
  const input = document.getElementById("docTextInput");
  if (!input) return;

  const text = input.value.trim();

  if (!text) {
    showToast("Document upload karein ya text paste karein.", "error");
    return;
  }

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam!", "error");
    return;
  }

  const btn = document.getElementById("docAnalyzeBtn");
  const originalText = btn?.innerHTML || "Analyze";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Analyzing...";
  }

  try {
    const response = await fetch("/api/document-ai", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ text })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.analysis) {
      throw new Error(data.error || "Document analysis failed.");
    }

    if (!isProUser) incrementUsage();

    const result = document.getElementById("docResult");
    if (!result) return;

    result.innerHTML = "";

    const sections = [
      { key: "SUMMARY", title: "📋 Summary" },
      { key: "KEY_POINTS", title: "🎯 Key Points" },
      { key: "QUESTIONS_ANSWERS", title: "❓ Q&A" },
      { key: "SIMPLE_EXPLANATION", title: "📖 Simple Explanation" },
      { key: "MCQS", title: "📝 MCQs" }
    ];

    sections.forEach((section) => {
      if (!data.analysis[section.key]) return;

      const div = document.createElement("div");
      div.className = "autopilot-section";

      div.innerHTML = `
        <h4>${escapeHtml(section.title)}</h4>
        <p>${escapeHtml(data.analysis[section.key])}</p>
      `;

      result.appendChild(div);
    });

    result.style.display = "block";
    showToast("📄 Document analyzed successfully!", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// VOICE
// ============================================================

function startVoiceInput(targetId, button) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast("Voice support nahi hai.", "error");
    return;
  }

  const target = document.getElementById(targetId);
  if (!target) return;

  const recognition = new SpeechRecognition();
  recognition.lang = "hi-IN";
  recognition.interimResults = false;
  recognition.continuous = false;

  button?.classList.add("listening");

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    target.value += transcript;
  };

  recognition.onerror = () => {
    showToast("Voice input failed.", "error");
  };

  recognition.onend = () => {
    button?.classList.remove("listening");
  };

  try {
    recognition.start();
  } catch {
    button?.classList.remove("listening");
  }
}

// ============================================================
// SPEECH
// ============================================================

function speakResult() {
  if (!currentToolResult || currentToolResult === "Image Generated Successfully") {
    showToast("Text content ko hi bola ja sakta hai.", "error");
    return;
  }

  if (!window.speechSynthesis) {
    showToast("Voice support nahi hai.", "error");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(currentToolResult);
  utterance.lang = "hi-IN";
  utterance.rate = 1;

  window.speechSynthesis.speak(utterance);

  showToast("🔊 Speaking...", "info");
}

// ============================================================
// POSTER DOWNLOAD
// ============================================================

async function downloadPoster() {
  if (!window.html2canvas) {
    showToast("Image library load nahi hui.", "error");
    return;
  }

  const element = document.getElementById("posterPreview");
  if (!element) return;

  const btn = document.getElementById("downloadPosterBtn");
  const originalText = btn?.innerHTML || "Download";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Downloading...";
  }

  try {
    const canvas = await window.html2canvas(element, { scale: 2, useCORS: true });
    const link = document.createElement("a");

    link.download = `IdeaForge-Poster-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    showToast("🖼️ Poster downloaded!", "success");
  } catch (error) {
    console.error(error);
    showToast("Poster download failed.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// CARD DOWNLOAD
// ============================================================

async function downloadCard() {
  if (!window.html2canvas) {
    showToast("Image library load nahi hui.", "error");
    return;
  }

  const element = document.getElementById("cardPreview");
  if (!element) return;

  const btn = document.getElementById("downloadCardBtn");
  const originalText = btn?.innerHTML || "Download";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Downloading...";
  }

  try {
    const canvas = await window.html2canvas(element, { scale: 2, useCORS: true });
    const link = document.createElement("a");

    link.download = `IdeaForge-Card-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    showToast("📸 Card downloaded!", "success");
  } catch (error) {
    console.error(error);
    showToast("Card download failed.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// PROJECTS
// ============================================================

function getProjects() {
  return safeJsonParse(localStorage.getItem(PROJECTS_KEY), []) || [];
}

function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  syncToServer("projects", projects);
}

function createProject() {
  const input = document.getElementById("newProjectNameInput");
  if (!input) return;

  const name = input.value.trim();

  if (!name) {
    showToast("Project ka naam likhein!", "error");
    return;
  }

  const projects = getProjects();

  const newProject = {
    id: Date.now(),
    name,
    createdAt: new Date().toLocaleDateString("en-IN"),
    assets: []
  };

  projects.unshift(newProject);
  saveProjects(projects);

  input.value = "";

  const modal = document.getElementById("newProjectModal");
  if (modal) modal.style.display = "none";

  renderProjects();
  showToast("📁 Project Created!", "success");
}

function deleteProject(id) {
  if (!confirm("Kya aap sure hain ki is project ko delete karna hai?")) {
    return;
  }

  let projects = getProjects();
  projects = projects.filter((project) => project.id !== id);

  saveProjects(projects);

  if (currentProjectId === id) {
    currentProjectId = null;
  }

  renderProjects();
  showToast("Project deleted.", "info");
}

function renderProjects() {
  const grid = document.getElementById("projectsGrid");
  if (!grid) return;

  const projects = getProjects();
  grid.innerHTML = "";

  if (!projects.length) {
    grid.innerHTML = `
      <div class="empty-state">
        No projects yet. Click '+ New Project' to start!
      </div>
    `;
    return;
  }

  projects.forEach((project) => {
    const card = document.createElement("div");
    card.className = "project-card";

    const assetCount = Array.isArray(project.assets) ? project.assets.length : 0;

    card.innerHTML = `
      <button class="delete-btn" type="button" aria-label="Delete project">✕</button>
      <h4>${escapeHtml(project.name)}</h4>
      <p>${assetCount} assets generated</p>
      <p class="project-date">${escapeHtml(project.createdAt || "")}</p>
    `;

    const deleteButton = card.querySelector(".delete-btn");

    deleteButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteProject(project.id);
    });

    card.addEventListener("click", () => openProject(project.id));

    grid.appendChild(card);
  });

  renderHomeProjectsPreview();
}

// ============================================================
// HOME PROJECTS PREVIEW
// A compact, always-visible preview of recent projects on the
// home screen (separate from the full #projectsSection list,
// which stays hidden until "View All" or the My Projects chip
// is used). Kept in sync automatically since it's called from
// inside renderProjects().
// ============================================================

const HOME_PROJECTS_PREVIEW_LIMIT = 3;

function renderHomeProjectsPreview() {
  const grid = document.getElementById("homeProjectsPreviewGrid");
  if (!grid) return;

  const projects = getProjects();
  grid.innerHTML = "";

  if (!projects.length) {
    grid.innerHTML = `
      <div class="empty-state">
        Create a Project to organize all your AI assets.
      </div>
    `;

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.id = "homeNewProjectBtn";
    newBtn.className = "btn-brand";
    newBtn.style.width = "100%";
    newBtn.style.marginTop = "10px";
    newBtn.textContent = "+ New Project";

    newBtn.addEventListener("click", () => {
      const modal = document.getElementById("newProjectModal");
      if (modal) modal.style.display = "flex";
    });

    grid.appendChild(newBtn);
    return;
  }

  projects.slice(0, HOME_PROJECTS_PREVIEW_LIMIT).forEach((project) => {
    const card = document.createElement("div");
    card.className = "project-card";

    const assetCount = Array.isArray(project.assets) ? project.assets.length : 0;

    card.innerHTML = `
      <h4>${escapeHtml(project.name)}</h4>
      <p>${assetCount} assets generated</p>
      <p class="project-date">${escapeHtml(project.createdAt || "")}</p>
    `;

    const continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.style.width = "100%";
    continueBtn.style.marginTop = "10px";
    continueBtn.textContent = "Continue →";

    continueBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      goToProjectFromHome(project.id);
    });

    card.appendChild(continueBtn);
    card.addEventListener("click", () => goToProjectFromHome(project.id));

    grid.appendChild(card);
  });
}

function goToProjectFromHome(id) {
  openToolWorkspace("projects");
  openProject(id);
}

// ============================================================
// FREE QUICK TOOLS
// Calculator, QR Code, Password Generator, Unit Converter —
// all client-side, no AI call, no quota used. Each is its own
// small modal rather than going through the AI toolWorkspace
// machinery (Generate button, brand context, bilingual toggle,
// etc.) which doesn't apply to any of these.
// ============================================================

// ---------- Calculator ----------

let calcExpression = "";

function calcUpdateDisplay() {
  const display = document.getElementById("calcDisplay");
  if (display) display.value = calcExpression || "0";
}

function calcHandleInput(key) {
  if (key === "C") {
    calcExpression = "";
    calcUpdateDisplay();
    return;
  }

  if (key === "back") {
    calcExpression = calcExpression.slice(0, -1);
    calcUpdateDisplay();
    return;
  }

  if (key === "=") {
    // calcExpression is built entirely from a fixed set of
    // button presses (digits, . , + - * / %), never free-typed
    // text, so evaluating it as an arithmetic expression is safe.
    try {
      const sanitized = calcExpression.replace(/[^0-9+\-*/%.()]/g, "");
      if (!sanitized) return;

      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${sanitized})`)();

      if (!Number.isFinite(result)) {
        calcExpression = "Error";
      } else {
        calcExpression = String(Math.round(result * 1e10) / 1e10);
      }
    } catch {
      calcExpression = "Error";
    }

    calcUpdateDisplay();
    return;
  }

  if (calcExpression === "Error") {
    calcExpression = "";
  }

  calcExpression += key;
  calcUpdateDisplay();
}

// ---------- QR Code ----------

let qrInstance = null;

function generateQrCode() {
  const input = document.getElementById("qrTextInput");
  const output = document.getElementById("qrCodeOutput");
  const downloadBtn = document.getElementById("downloadQrBtn");

  if (!input || !output) return;

  const text = input.value.trim();

  if (!text) {
    showToast("QR ke liye kuch text/link likhein.", "error");
    return;
  }

  if (typeof QRCode === "undefined") {
    showToast("QR library load nahi hui. Internet check karein.", "error");
    return;
  }

  output.innerHTML = "";

  qrInstance = new QRCode(output, {
    text,
    width: 220,
    height: 220,
    colorDark: "#000000",
    colorLight: "#ffffff"
  });

  output.style.display = "block";
  if (downloadBtn) downloadBtn.style.display = "block";
}

function downloadQrCode() {
  const output = document.getElementById("qrCodeOutput");
  if (!output) return;

  // qrcodejs renders either a <canvas> or an <img> depending on
  // browser support - handle both.
  const canvas = output.querySelector("canvas");
  const img = output.querySelector("img");

  const dataUrl = canvas ? canvas.toDataURL("image/png") : img?.src;

  if (!dataUrl) {
    showToast("QR download nahi ho paaya.", "error");
    return;
  }

  const link = document.createElement("a");
  link.download = `qr-code-${Date.now()}.png`;
  link.href = dataUrl;
  link.click();
}

// ---------- Password Generator ----------

function generatePassword() {
  const length = Number(document.getElementById("passwordLength")?.value || 14);

  const useUpper = document.getElementById("pwUppercase")?.checked;
  const useLower = document.getElementById("pwLowercase")?.checked;
  const useNumbers = document.getElementById("pwNumbers")?.checked;
  const useSymbols = document.getElementById("pwSymbols")?.checked;

  const charSets = {
    upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
    lower: "abcdefghijkmnpqrstuvwxyz",
    numbers: "23456789",
    symbols: "!@#$%^&*()_+-="
  };

  let pool = "";
  if (useUpper) pool += charSets.upper;
  if (useLower) pool += charSets.lower;
  if (useNumbers) pool += charSets.numbers;
  if (useSymbols) pool += charSets.symbols;

  if (!pool) {
    showToast("Kam se kam ek character type chunein.", "error");
    return;
  }

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let password = "";
  for (let i = 0; i < length; i++) {
    password += pool[randomValues[i] % pool.length];
  }

  const output = document.getElementById("passwordOutput");
  if (output) output.value = password;
}

// ---------- Unit Converter ----------

const UNIT_DEFINITIONS = {
  length: {
    label: "Length",
    units: {
      mm: { label: "Millimeters", toBase: 0.001 },
      cm: { label: "Centimeters", toBase: 0.01 },
      m: { label: "Meters", toBase: 1 },
      km: { label: "Kilometers", toBase: 1000 },
      inch: { label: "Inches", toBase: 0.0254 },
      foot: { label: "Feet", toBase: 0.3048 },
      mile: { label: "Miles", toBase: 1609.34 }
    }
  },
  weight: {
    label: "Weight",
    units: {
      mg: { label: "Milligrams", toBase: 0.001 },
      g: { label: "Grams", toBase: 1 },
      kg: { label: "Kilograms", toBase: 1000 },
      oz: { label: "Ounces", toBase: 28.3495 },
      lb: { label: "Pounds", toBase: 453.592 }
    }
  },
  temperature: {
    label: "Temperature",
    units: {
      celsius: { label: "Celsius" },
      fahrenheit: { label: "Fahrenheit" },
      kelvin: { label: "Kelvin" }
    }
  }
};

function populateUnitSelects() {
  const category = document.getElementById("unitCategorySelect")?.value || "length";
  const fromSelect = document.getElementById("unitFromSelect");
  const toSelect = document.getElementById("unitToSelect");

  if (!fromSelect || !toSelect) return;

  const units = UNIT_DEFINITIONS[category]?.units || {};
  const optionsHtml = Object.entries(units)
    .map(([key, unit]) => `<option value="${key}">${escapeHtml(unit.label)}</option>`)
    .join("");

  fromSelect.innerHTML = optionsHtml;
  toSelect.innerHTML = optionsHtml;

  // Default to two different units so the conversion isn't trivially 1:1
  const keys = Object.keys(units);
  if (keys.length > 1) toSelect.value = keys[1];

  runUnitConversion();
}

function convertTemperature(value, fromUnit, toUnit) {
  let celsius;

  if (fromUnit === "celsius") celsius = value;
  else if (fromUnit === "fahrenheit") celsius = ((value - 32) * 5) / 9;
  else celsius = value - 273.15;

  if (toUnit === "celsius") return celsius;
  if (toUnit === "fahrenheit") return (celsius * 9) / 5 + 32;
  return celsius + 273.15;
}

function runUnitConversion() {
  const category = document.getElementById("unitCategorySelect")?.value || "length";
  const fromUnit = document.getElementById("unitFromSelect")?.value;
  const toUnit = document.getElementById("unitToSelect")?.value;
  const fromValue = Number(document.getElementById("unitFromValue")?.value);
  const outputField = document.getElementById("unitToValue");

  if (!outputField || !fromUnit || !toUnit) return;

  if (!Number.isFinite(fromValue)) {
    outputField.value = "";
    return;
  }

  let result;

  if (category === "temperature") {
    result = convertTemperature(fromValue, fromUnit, toUnit);
  } else {
    const units = UNIT_DEFINITIONS[category]?.units || {};
    const baseValue = fromValue * (units[fromUnit]?.toBase || 1);
    result = baseValue / (units[toUnit]?.toBase || 1);
  }

  outputField.value = Number.isFinite(result) ? String(Math.round(result * 1e6) / 1e6) : "";
}

function openProject(id) {
  currentProjectId = id;

  const list = document.getElementById("projectListView");
  const detail = document.getElementById("projectDetailView");

  if (list) list.style.display = "none";
  if (detail) detail.style.display = "block";

  renderProjectDetail(id);
}

function renderProjectDetail(id) {
  const projects = getProjects();
  const project = projects.find((item) => item.id === id);

  if (!project) return;

  const title = document.getElementById("currentProjectTitle");
  if (title) title.textContent = project.name;

  const container = document.getElementById("projectAssetsContainer");
  if (!container) return;

  container.innerHTML = "";

  const assets = Array.isArray(project.assets) ? project.assets : [];

  if (!assets.length) {
    container.innerHTML = `
      <div class="empty-state">
        No assets yet. Use Business Agent to generate your first pack!
      </div>
    `;
    return;
  }

  assets.forEach((asset) => {
    const card = document.createElement("div");
    card.className = "asset-card";

    card.innerHTML = `
      <h4>${escapeHtml(asset.title || asset.type || "Asset")}</h4>
      <p>${escapeHtml(asset.content || "")}</p>
    `;

    container.appendChild(card);
  });
}

// ============================================================
// TOOL HISTORY
// ============================================================

function getToolHistory() {
  return safeJsonParse(localStorage.getItem(TOOL_HISTORY_KEY), []) || [];
}

function saveToToolHistory(tool, input, result) {
  if (!tool || !input || !result) return;

  let history = getToolHistory();

  history.unshift({
    tool,
    input,
    result,
    label: `${TOOL_TITLES[tool] || tool}: ${String(input).slice(0, 50)}`,
    savedAt: Date.now()
  });

  history = history.slice(0, 15);

  localStorage.setItem(TOOL_HISTORY_KEY, JSON.stringify(history));
  syncToServer("toolhistory", history);
  renderToolHistory();
}

function renderToolHistory() {
  const section = document.getElementById("toolHistorySection");
  const row = document.getElementById("toolHistoryRow");

  if (!section || !row) return;

  const history = getToolHistory();

  if (!history.length) {
    section.style.display = "none";
    return;
  }

  row.innerHTML = "";

  history.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "historyItem";
    button.textContent = item.label;

    button.addEventListener("click", () => {
      openToolWorkspace(item.tool);

      const input = document.getElementById("toolInput");
      const result = document.getElementById("toolResult");

      if (input) input.value = item.input;

      currentToolResult = item.result;
      currentToolInput = item.input;

      if (result) {
        result.innerHTML = formatToolResult(item.result, item.tool);
        result.style.display = "block";
      }

      const actions = document.getElementById("toolResultActions");
      if (actions) actions.style.display = "flex";
    });

    row.appendChild(button);
  });

  section.style.display = "block";
}

// ============================================================
// BRAND
// ============================================================

function loadBrand() {
  const saved = safeJsonParse(localStorage.getItem("ideaforge_brand"), null);

  if (saved && typeof saved === "object") {
    userBrand = {
      name: saved.name || "",
      industry: saved.industry || "",
      audience: saved.audience || ""
    };
  }
}

function saveBrand() {
  userBrand = {
    name: document.getElementById("brandNameInput")?.value.trim() || "",
    industry: document.getElementById("brandIndustryInput")?.value.trim() || "",
    audience: document.getElementById("brandAudienceInput")?.value.trim() || ""
  };

  localStorage.setItem("ideaforge_brand", JSON.stringify(userBrand));
  syncToServer("brand", userBrand);

  const modal = document.getElementById("brandModal");
  if (modal) modal.style.display = "none";

  showToast("👤 Brand Profile Saved!", "success");
}

// ============================================================
// THEME
// ============================================================

function toggleTheme() {
  document.body.classList.toggle("light-mode");

  const isLight = document.body.classList.contains("light-mode");

  localStorage.setItem("ideaforge_theme", isLight ? "light" : "dark");

  const button = document.getElementById("themeToggleBtn");
  if (button) button.textContent = isLight ? "🌞" : "🌗";
}

function loadTheme() {
  const theme = localStorage.getItem("ideaforge_theme");

  if (theme === "light") {
    document.body.classList.add("light-mode");

    const button = document.getElementById("themeToggleBtn");
    if (button) button.textContent = "🌞";
  }
}

// ============================================================
// IMAGE TOOL
// ============================================================

async function runImageTool() {
  if (!window.currentImageBase64) {
    showToast("Pehle image upload karein.", "error");
    return;
  }

  if (!hasUsageRemaining()) {
    showToast("Free Plan limit khatam!", "error");
    return;
  }

  const btn = document.getElementById("imageGenerateBtn");
  const originalText = btn?.innerHTML || "Analyze";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Analyzing...";
  }

  try {
    const response = await fetch("/api/image-tool", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        imageBase64: window.currentImageBase64,
        action: document.getElementById("imageActionSelect")?.value || "analyze",
        question: document.getElementById("imageQuestionInput")?.value || ""
      })
    });

    const data = await parseApiResponse(response);

    if (!data.success || !data.result) {
      throw new Error(data.error || "Image analysis failed.");
    }

    if (!isProUser) incrementUsage();

    const result = document.getElementById("imageResult");

    if (result) {
      result.innerHTML = formatToolResult(data.result, "image");
      result.style.display = "block";
    }

    const actions = document.getElementById("imageResultActions");
    if (actions) actions.style.display = "flex";

    showToast("🖼️ Image analyzed!", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// DOM READY
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  isProUser = localStorage.getItem("ideaforge_pro") === "true";

  getUserId();
  loadBrand();
  loadTheme();

  applyUILanguage(localStorage.getItem("ideaforge_ui_lang") || "en");

  renderHistory();
  renderToolHistory();
  renderUsageBanner();

  // Restore from server backup if localStorage is empty (new
  // browser/device/cache-clear), or back up current local data
  // to the server if it isn't. Runs in the background; UI is
  // already usable from localStorage while this completes.
  // initSessionAndBackupCode() must resolve first so the Backup
  // Code (used as the Bearer token) is set before any data
  // save/load calls go out.
  (async () => {
    await initSessionAndBackupCode();
    await restoreOrBackupUserData();
  })();

  document.getElementById("generateBtn")?.addEventListener("click", generateReport);
  document.getElementById("generateLaunchPlanBtn")?.addEventListener("click", generateLaunchPlan);
  document.getElementById("generatePitchDeckBtn")?.addEventListener("click", generatePitchDeck);

  document.getElementById("improveIdeaFromScoreBtn")?.addEventListener("click", () => {
    if (!currentIdeaText) {
      showToast("Pehle report generate karein.", "error");
      return;
    }

    openToolWorkspace("improveidea");

    const toolInput = document.getElementById("toolInput");
    if (toolInput) toolInput.value = currentIdeaText;

    runAiTool(currentIdeaText, "improveidea");
  });

  document.getElementById("hubAskBtn")?.addEventListener("click", () => {
    const input = document.getElementById("hubInput");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const tool = smartRouteInput(text);

    trackEvent("hub_ask_ai", { tool_detected: tool });
    openToolWorkspace(tool);

    if (tool === "chat") {
      const chatInput = document.getElementById("chatInput");

      if (chatInput) {
        chatInput.value = text;
        sendChatMessage();
      }
    } else {
      const toolInput = document.getElementById("toolInput");
      if (toolInput) toolInput.value = text;

      runAiTool(text, tool);
    }
  });

  document.getElementById("toolGenerateBtn")?.addEventListener("click", () => {
    const input = document.getElementById("toolInput");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    runAiTool(text, activeTool);
  });

  document.getElementById("sendChatBtn")?.addEventListener("click", sendChatMessage);

  document.getElementById("chatInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  });

  document.getElementById("askFollowupBtn")?.addEventListener("click", askIdeaFollowup);

  document.getElementById("followupInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      askIdeaFollowup();
    }
  });

  document.getElementById("clearChatBtn")?.addEventListener("click", () => {
    chatHistory = [];

    const container = document.getElementById("chatContainer");
    if (container) container.innerHTML = "";

    showToast("Chat history cleared!", "info");
  });

  document.getElementById("toolCopyBtn")?.addEventListener("click", () => {
    copyText(currentToolResult);
  });

  document.getElementById("toolRegenerateBtn")?.addEventListener("click", () => {
    if (!lastToolPayload) {
      showToast("Regenerate ke liye previous request nahi mili.", "error");
      return;
    }

    runAiTool(lastToolPayload.input, lastToolPayload.tool);
  });

  document.getElementById("remixBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("remixModal");
    if (modal) modal.style.display = "flex";
  });

  document.getElementById("makeBetterBtn")?.addEventListener("click", makeItBetter);
  document.getElementById("speakResultBtn")?.addEventListener("click", speakResult);

  document.getElementById("toolSaveBtn")?.addEventListener("click", () => {
    if (currentToolResult && currentToolInput) {
      saveToToolHistory(activeTool, currentToolInput, currentToolResult);
      showToast("⭐ Saved!", "success");
    }
  });

  document.getElementById("toolShareBtn")?.addEventListener("click", async () => {
    if (!currentToolResult) return;

    try {
      if (navigator.share) {
        await navigator.share({ title: "IdeaForgeX", text: currentToolResult });
      } else {
        await copyText(currentToolResult);
        showToast("Copied for sharing!", "info");
      }
    } catch {
      // User cancelled share.
    }
  });

  document.getElementById("themeToggleBtn")?.addEventListener("click", toggleTheme);
  document.getElementById("downloadPosterBtn")?.addEventListener("click", downloadPoster);
  document.getElementById("downloadCardBtn")?.addEventListener("click", downloadCard);

  document.getElementById("hubMicBtn")?.addEventListener("click", function () {
    startVoiceInput("hubInput", this);
  });

  document.getElementById("toolMicBtn")?.addEventListener("click", function () {
    startVoiceInput("toolInput", this);
  });

  document.querySelectorAll(".remix-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const style = button.getAttribute("data-style");
      remixContent(style);

      const modal = document.getElementById("remixModal");
      if (modal) modal.style.display = "none";
    });
  });

  document.getElementById("closeRemixModal")?.addEventListener("click", () => {
    const modal = document.getElementById("remixModal");
    if (modal) modal.style.display = "none";
  });

  // --------------------------------------------------------
  // BRAND MODAL
  // FIXED: "?.value = x" is invalid JS (optional chaining
  // cannot be assigned to). Replaced with a guarded assignment.
  // --------------------------------------------------------

  document.getElementById("openBrandBtn")?.addEventListener("click", () => {
    const nameInput = document.getElementById("brandNameInput");
    if (nameInput) nameInput.value = userBrand.name;

    const industryInput = document.getElementById("brandIndustryInput");
    if (industryInput) industryInput.value = userBrand.industry;

    const audienceInput = document.getElementById("brandAudienceInput");
    if (audienceInput) audienceInput.value = userBrand.audience;

    const modal = document.getElementById("brandModal");
    if (modal) modal.style.display = "flex";
  });

  document.getElementById("saveBrandBtn")?.addEventListener("click", saveBrand);

  document.getElementById("closeBrandBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("brandModal");
    if (modal) modal.style.display = "none";
  });

  // --------------------------------------------------------
  // BACKUP CODE MODAL
  // --------------------------------------------------------

  document.getElementById("openBackupBtn")?.addEventListener("click", () => {
    renderBackupCodeDisplay();

    const restoreInput = document.getElementById("restoreCodeInput");
    if (restoreInput) restoreInput.value = "";

    const modal = document.getElementById("backupModal");
    if (modal) modal.style.display = "flex";
  });

  document.getElementById("closeBackupBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("backupModal");
    if (modal) modal.style.display = "none";
  });

  document.getElementById("copyBackupCodeBtn")?.addEventListener("click", () => {
    copyText(getBackupCode());
  });

  document.getElementById("restoreBackupCodeBtn")?.addEventListener("click", () => {
    const input = document.getElementById("restoreCodeInput");
    restoreFromBackupCode(input?.value || "");
  });

  // --------------------------------------------------------
  // PROJECT MODAL
  // --------------------------------------------------------

  document.getElementById("newProjectBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("newProjectModal");
    if (modal) modal.style.display = "flex";
  });

  document.getElementById("homeProjectsViewAllBtn")?.addEventListener("click", () => {
    openToolWorkspace("projects");
  });

  // --------------------------------------------------------
  // FREE QUICK TOOLS
  // --------------------------------------------------------

  document.getElementById("openCalculatorBtn")?.addEventListener("click", () => {
    calcExpression = "";
    calcUpdateDisplay();
    const modal = document.getElementById("calculatorModal");
    if (modal) modal.style.display = "flex";
  });

  document.getElementById("closeCalculatorBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("calculatorModal");
    if (modal) modal.style.display = "none";
  });

  document.querySelectorAll(".calcBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      calcHandleInput(btn.getAttribute("data-calc"));
    });
  });

  document.getElementById("openQrBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("qrModal");
    if (modal) modal.style.display = "flex";

    const output = document.getElementById("qrCodeOutput");
    const downloadBtn = document.getElementById("downloadQrBtn");
    if (output) output.style.display = "none";
    if (downloadBtn) downloadBtn.style.display = "none";

    const input = document.getElementById("qrTextInput");
    if (input) input.value = "";
  });

  document.getElementById("closeQrBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("qrModal");
    if (modal) modal.style.display = "none";
  });

  document.getElementById("generateQrBtn")?.addEventListener("click", generateQrCode);
  document.getElementById("downloadQrBtn")?.addEventListener("click", downloadQrCode);

  document.getElementById("openPasswordBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("passwordModal");
    if (modal) modal.style.display = "flex";
    generatePassword();
  });

  document.getElementById("closePasswordBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("passwordModal");
    if (modal) modal.style.display = "none";
  });

  document.getElementById("generatePasswordBtn")?.addEventListener("click", generatePassword);

  document.getElementById("copyPasswordBtn")?.addEventListener("click", () => {
    const output = document.getElementById("passwordOutput");
    if (label) label.textContent = event.target.value;
  });
  document.getElementById("openUnitConverterBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("unitConverterModal");
    if (modal) modal.style.display = "flex";
    populateUnitSelects();
  });
  document.getElementById("closeUnitConverterBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("unitConverterModal");
    if (modal) modal.style.display = "none";
  });
  document.getElementById("unitCategorySelect")?.addEventListener("change", populateUnitSelects);
  document.getElementById("unitFromSelect")?.addEventListener("change", runUnitConversion);
  document.getElementById("unitToSelect")?.addEventListener("change", runUnitConversion);
  document.getElementById("unitFromValue")?.addEventListener("input", runUnitConversion);
  document.getElementById("createProjectBtn")?.addEventListener("click", createProject);
  document.getElementById("closeNewProjectBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("newProjectModal");
    if (modal) modal.style.display = "none";
  });
  document.getElementById("backToProjectsBtn")?.addEventListener("click", () => {
    const detail = document.getElementById("projectDetailView");
    if (detail) detail.style.display = "none";
    const list = document.getElementById("projectListView");
    if (list) list.style.display = "block";
    renderProjects();
  });
  document.getElementById("runAgentBtn")?.addEventListener("click", runBusinessAgent);
  document.getElementById("docAnalyzeBtn")?.addEventListener("click", analyzeDocument);
  const docFileInput = document.getElementById("docFileInput");
  const docUploadCard = document.getElementById("docUploadCard");
  if (docUploadCard && docFileInput) {
    docUploadCard.addEventListener("click", () => docFileInput.click());
    docFileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const input = document.getElementById("docTextInput");
          if (input) input.value = loadEvent.target.result || "";
          showToast("📄 Document loaded!", "success");
        };
        reader.readAsText(file);
      } else {
        showToast(
          "PDF/DOCX ko browser me directly text me read nahi kiya ja sakta. Text paste karein ya backend parser use karein.",
          "error"
        );
      }
    });
  }
  const imageUploadCard = document.getElementById("imageUploadCard");
  const imageFileInput = document.getElementById("imageFileInput");
  if (imageUploadCard && imageFileInput) {
    imageUploadCard.addEventListener("click", () => imageFileInput.click());
    imageFileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showToast("Sirf image file upload karein.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        window.currentImageBase64 = loadEvent.target.result;
        const preview = document.getElementById("imagePreview");
        if (preview) {
          preview.src = window.currentImageBase64;
          preview.style.display = "block";
        }
        const text = document.getElementById("imageUploadText");
        if (text) text.style.display = "none";
      };
      reader.readAsDataURL(file);
    });
  }
  document.getElementById("imageGenerateBtn")?.addEventListener("click", runImageTool);
  document.getElementById("imageActionSelect")?.addEventListener("change", (event) => {
    const question = document.getElementById("imageQuestionInput");
    if (!question) return;
    question.style.display = event.target.value === "ask" ? "block" : "none";
  });
  document.getElementById("imageCopyBtn")?.addEventListener("click", () => {
    const result = document.getElementById("imageResult");
    copyText(result?.innerText || "");
  });
  document.getElementById("imageShareBtn")?.addEventListener("click", async () => {
    const result = document.getElementById("imageResult");
    const text = result?.innerText || "";
    if (!text) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Image Analysis", text });
      } else {
        await copyText(text);
      }
    } catch {
      // User cancelled.
    }
  });
  document.getElementById("upgradeProBtn")?.addEventListener("click", () => {
    showToast("Payment integration coming soon!", "info");
  });
  document.getElementById("closeProModal")?.addEventListener("click", () => {
    const modal = document.getElementById("proModal");
    if (modal) modal.style.display = "none";
  });
  document.querySelectorAll(".hubChip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const tool = chip.getAttribute("data-tool");
      if (!tool) return;
      trackEvent("select_tool", { tool_name: tool });
      openToolWorkspace(tool);
    });
  });
  document.getElementById("viewAllToolsBtn")?.addEventListener("click", function () {
    const allToolsGrid = document.getElementById("allToolsGrid");
    if (!allToolsGrid) return;

    const isHidden = allToolsGrid.style.display === "none";

    allToolsGrid.style.display = isHidden ? "grid" : "none";
    this.setAttribute("aria-expanded", isHidden ? "true" : "false");
    this.innerHTML = isHidden ? "🧰 Hide Tools ▴" : "🧰 View All Tools ▾";

    if (isHidden) {
      allToolsGrid.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  const tips = [
    "Try the Business Agent! One click generates a full startup pack.",
    "Create a Project to organize all your AI assets.",
    "Use Quote Card Maker to turn text into a beautiful social image.",
    "Write professional Cold Emails in seconds.",
    "Set your Brand Profile so AI can use your brand automatically.",
    "Use Auto-Pilot to create multiple marketing assets together.",
    "Use AI Chat when you want a normal conversation with AI."
  ];

  const dailyTip = document.getElementById("dailyTip");
  if (dailyTip) dailyTip.textContent = tips[Math.floor(Math.random() * tips.length)];

  renderProjects();
  console.log("🚀 IdeaForgeX v11.10 initialized successfully.");
});
