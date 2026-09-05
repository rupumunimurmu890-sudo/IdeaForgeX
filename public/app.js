// ========================================
// IdeaForgeX - Main JavaScript
// ========================================

let currentReport = null;
let currentIdeaText = "";

const HISTORY_KEY = "ideaforgex_history";
const HISTORY_LIMIT = 10;

// ------------------------------------
// Toast helper
// ------------------------------------

function showToast(message, type) {

  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast toast" + (type || "Info").charAt(0).toUpperCase() + (type || "Info").slice(1);
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      toast.classList.add("show");
    });
  });

  setTimeout(function () {
    toast.classList.remove("show");
    setTimeout(function () { toast.remove(); }, 300);
  }, 3500);
}

// ------------------------------------
// History (localStorage)
// ------------------------------------

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveToHistory(ideaText, report) {

  try {

    let list = getHistory();

    list.unshift({
      idea: ideaText.slice(0, 80),
      score: report.score.overall,
      report: report,
      fullIdea: ideaText,
      savedAt: Date.now()
    });

    while (list.length > HISTORY_LIMIT) list.pop();

    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    renderHistory();

  } catch (error) {
    console.error("History save error:", error);
  }
}

function renderHistory() {

  const list = getHistory();
  const section = document.getElementById("ideaHistorySection");
  const row = document.getElementById("ideaHistoryRow");

  if (!section || !row) return;

  if (list.length === 0) {
    section.style.display = "none";
    return;
  }

  row.innerHTML = "";

  list.forEach(function (item) {

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "historyItem";
    btn.innerHTML =
      '<span class="historyItemScore">' + item.score + '/100</span>' +
      escapeHtml(item.idea);

    btn.addEventListener("click", function () {
      currentIdeaText = item.fullIdea;
      currentReport = item.report;
      document.getElementById("ideaInput").value = item.fullIdea;
      renderReport(item.report);
    });

    row.appendChild(btn);
  });

  section.style.display = "block";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ------------------------------------
// Report rendering
// ------------------------------------

const SECTION_DISPLAY = [
  { key: "IDEA", title: "💡 The Idea" },
  { key: "TARGET_CUSTOMERS", title: "🎯 Target Customers" },
  { key: "CUSTOMER_PROBLEM", title: "😣 Customer Problem" },
  { key: "REVENUE_MODEL", title: "💰 Revenue Model" },
  { key: "MARKET_ANALYSIS", title: "📊 Market Analysis" },
  { key: "COMPETITOR_ANALYSIS", title: "🥊 Competitor Analysis" },
  { key: "__SWOT__", title: "SWOT Analysis" },
  { key: "MARKETING_STRATEGY", title: "📣 Marketing Strategy" },
  { key: "STARTUP_COST", title: "💵 Estimated Startup Cost" },
  { key: "ONE_YEAR_PROJECTION", title: "📈 1-Year Projection" },
  { key: "RISKS", title: "⚠️ Risks" },
  { key: "GROWTH_STRATEGY", title: "🚀 Growth Strategy" }
];

function setBar(barId, valId, value) {

  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);

  const safeValue = typeof value === "number" ? value : 0;

  if (bar) bar.style.width = safeValue + "%";
  if (val) val.textContent = (typeof value === "number" ? value : "--") + "/100";
}

function renderReport(report) {

  const { score, sections } = report;

  document.getElementById("scoreOverall").textContent =
    typeof score.overall === "number" ? score.overall : "--";

  setBar("barMarket", "valMarket", score.market);
  setBar("barCompetition", "valCompetition", score.competition);
  setBar("barProfit", "valProfit", score.profit);
  setBar("barDifficulty", "valDifficulty", score.difficulty);

  const container = document.getElementById("reportSections");
  container.innerHTML = "";

  SECTION_DISPLAY.forEach(function (item) {

    if (item.key === "__SWOT__") {

      const card = document.createElement("div");
      card.className = "reportCard";
      card.innerHTML =
        '<div class="reportCardTitle">🧭 SWOT Analysis</div>' +
        '<div class="swotGrid">' +
          '<div class="swotBox swotStrengths"><div class="swotTitle">Strengths</div>' + escapeHtml(sections.SWOT_STRENGTHS || "") + '</div>' +
          '<div class="swotBox swotWeaknesses"><div class="swotTitle">Weaknesses</div>' + escapeHtml(sections.SWOT_WEAKNESSES || "") + '</div>' +
          '<div class="swotBox swotOpportunities"><div class="swotTitle">Opportunities</div>' + escapeHtml(sections.SWOT_OPPORTUNITIES || "") + '</div>' +
          '<div class="swotBox swotThreats"><div class="swotTitle">Threats</div>' + escapeHtml(sections.SWOT_THREATS || "") + '</div>' +
        '</div>';
      container.appendChild(card);
      return;
    }

    const content = sections[item.key] || "";
    if (!content) return;

    const card = document.createElement("div");
    card.className = "reportCard";
    card.innerHTML =
      '<div class="reportCardTitle">' + item.title + '</div>' +
      '<div class="reportCardBody">' + escapeHtml(content) + '</div>';
    container.appendChild(card);
  });

  document.getElementById("reportSection").style.display = "block";
  document.getElementById("reportSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function reportToPlainText(report) {

  const { score, sections } = report;

  let text = "IdeaForgeX — Startup Report\n\n";
  text += "Overall Score: " + score.overall + "/100\n";
  text += "Market Demand: " + score.market + "/100\n";
  text += "Low Competition: " + score.competition + "/100\n";
  text += "Profit Potential: " + score.profit + "/100\n";
  text += "Ease to Start: " + score.difficulty + "/100\n\n";

  SECTION_DISPLAY.forEach(function (item) {

    if (item.key === "__SWOT__") {
      text += "SWOT ANALYSIS\n";
      text += "Strengths:\n" + (sections.SWOT_STRENGTHS || "") + "\n";
      text += "Weaknesses:\n" + (sections.SWOT_WEAKNESSES || "") + "\n";
      text += "Opportunities:\n" + (sections.SWOT_OPPORTUNITIES || "") + "\n";
      text += "Threats:\n" + (sections.SWOT_THREATS || "") + "\n\n";
      return;
    }

    const content = sections[item.key];
    if (!content) return;

    text += item.title.replace(/^[^\w]+/, "").trim() + "\n" + content + "\n\n";
  });

  return text.trim();
}

// ------------------------------------
// Generate report
// ------------------------------------

async function generateReport() {

  const ideaInput = document.getElementById("ideaInput");
  const languageSelect = document.getElementById("languageSelect");
  const generateBtn = document.getElementById("generateBtn");

  const idea = ideaInput.value.trim();

  if (!idea) {
    showToast("Pehle apna idea likhein.", "error");
    return;
  }

  const originalHtml = generateBtn.innerHTML;
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="spinner"></span> Analyzing your idea...';

  try {

    const response = await fetch("/api/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea,
        language: languageSelect.value
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.report) {
      throw new Error(data?.error || "Report generate nahi ho paya.");
    }

    currentReport = data.report;
    currentIdeaText = idea;

    renderReport(data.report);
    saveToHistory(idea, data.report);

  } catch (error) {

    console.error("Generate report error:", error);
    showToast(error.message || "Kuch galat ho gaya, फिर try करें।", "error");

  } finally {

    generateBtn.disabled = false;
    generateBtn.innerHTML = originalHtml;
  }
}

// ------------------------------------
// 🆕 Generic PDF generator — kisi bhi section element
// ka screenshot lekar multi-page PDF banata hai
// ------------------------------------

async function downloadElementAsPdf(elementId, filePrefix, button) {

  const el = document.getElementById(elementId);

  if (!window.html2canvas || !window.jspdf) {
    showToast("PDF library load nahi hui, phir try करें।", "error");
    return;
  }

  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> PDF बना रहे हैं...';

  try {

    const canvas = await window.html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filePrefix + "-" + Date.now() + ".pdf");
    showToast("PDF download ho gaya!", "success");

  } catch (error) {

    console.error("PDF generation error:", error);
    showToast("PDF banane mein समस्या हुई।", "error");

  } finally {

    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function copyPlainText(text) {

  try {
    await navigator.clipboard.writeText(text);
    showToast("Copy ho gaya!", "success");
  } catch (error) {
    showToast("Copy nahi ho paya।", "error");
  }
}

async function sharePlainText(title, text) {

  if (navigator.share) {
    try {
      await navigator.share({ title, text });
    } catch (error) {
      // user cancelled — ignore
    }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copy ho gaya, ab share kar sakte ho।", "info");
    } catch (error) {
      showToast("Share/copy nahi ho paya।", "error");
    }
  }
}

// ------------------------------------
// 🚀 LAUNCH PLAN
// ------------------------------------

let currentLaunchPlan = null;

const LAUNCH_PLAN_DISPLAY = [
  { key: "BUDGET_BREAKDOWN", title: "💰 Budget Breakdown" },
  { key: "PREPARATION", title: "📋 Day 1–7: Preparation" },
  { key: "PRODUCT_DEVELOPMENT", title: "🛠️ Day 8–15: Product Development" },
  { key: "BRANDING", title: "🎨 Day 16–20: Branding" },
  { key: "MARKETING_LAUNCH", title: "📣 Day 21–25: Marketing" },
  { key: "LAUNCH_WEEK", title: "🚀 Day 26–30: Launch Week" },
  { key: "PRODUCT_IDEAS", title: "💡 Product Ideas" },
  { key: "PRICING", title: "🏷️ Pricing" },
  { key: "EXPECTED_SALES", title: "📈 Expected Sales (First 30 Days)" }
];

function renderSectionsInto(containerId, sectionsSpec, data) {

  const container = document.getElementById(containerId);
  container.innerHTML = "";

  sectionsSpec.forEach(function (item) {

    const content = data[item.key] || "";
    if (!content) return;

    const card = document.createElement("div");
    card.className = "reportCard";
    card.innerHTML =
      '<div class="reportCardTitle">' + item.title + '</div>' +
      '<div class="reportCardBody">' + escapeHtml(content) + '</div>';
    container.appendChild(card);
  });
}

function sectionsToPlainText(title, sectionsSpec, data) {

  let text = title + "\n\n";

  sectionsSpec.forEach(function (item) {
    const content = data[item.key];
    if (!content) return;
    text += item.title.replace(/^[^\w]+/, "").trim() + "\n" + content + "\n\n";
  });

  return text.trim();
}

async function generateLaunchPlan() {

  if (!currentIdeaText) {
    showToast("Pehle ek idea se report generate karein.", "error");
    return;
  }

  const btn = document.getElementById("generateLaunchPlanBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Launch plan बना रहे हैं...';

  try {

    const response = await fetch("/api/generate-launch-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: currentIdeaText,
        budget: document.getElementById("budgetInput")?.value.trim() || "",
        language: document.getElementById("languageSelect")?.value || "auto"
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.plan) {
      throw new Error(data?.error || "Launch plan generate nahi ho paya.");
    }

    currentLaunchPlan = data.plan;

    renderSectionsInto("launchPlanSections", LAUNCH_PLAN_DISPLAY, data.plan);

    const section = document.getElementById("launchPlanSection");
    section.style.display = "block";
    section.scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (error) {

    console.error("Launch plan error:", error);
    showToast(error.message || "Kuch galat ho gaya, फिर try करें।", "error");

  } finally {

    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ------------------------------------
// 🎤 PITCH DECK
// ------------------------------------

let currentPitchDeck = null;

const PITCH_DECK_DISPLAY = [
  { key: "PROBLEM", title: "Problem" },
  { key: "SOLUTION", title: "Solution" },
  { key: "MARKET", title: "Market" },
  { key: "PRODUCT", title: "Product" },
  { key: "BUSINESS_MODEL", title: "Business Model" },
  { key: "COMPETITION", title: "Competition" },
  { key: "FINANCIALS", title: "Financials" },
  { key: "GROWTH", title: "Growth Plan" },
  { key: "FUNDING_REQUIREMENT", title: "Funding Requirement" }
];

function renderPitchDeck(data) {

  const container = document.getElementById("pitchDeckSlides");
  container.innerHTML = "";

  PITCH_DECK_DISPLAY.forEach(function (item) {

    const content = data[item.key] || "";
    if (!content) return;

    const slide = document.createElement("div");
    slide.className = "pitchSlide";
    slide.innerHTML =
      '<div class="pitchSlideTitle">' + item.title + '</div>' +
      '<div class="pitchSlideBody">' + escapeHtml(content) + '</div>';
    container.appendChild(slide);
  });
}

async function generatePitchDeck() {

  if (!currentIdeaText) {
    showToast("Pehle ek idea se report generate karein.", "error");
    return;
  }

  const btn = document.getElementById("generatePitchDeckBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Pitch deck बना रहे हैं...';

  try {

    const response = await fetch("/api/generate-pitch-deck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: currentIdeaText,
        language: document.getElementById("languageSelect")?.value || "auto"
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.deck) {
      throw new Error(data?.error || "Pitch deck generate nahi ho paya.");
    }

    currentPitchDeck = data.deck;

    renderPitchDeck(data.deck);

    const section = document.getElementById("pitchDeckSection");
    section.style.display = "block";
    section.scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (error) {

    console.error("Pitch deck error:", error);
    showToast(error.message || "Kuch galat ho gaya, फिर try करें।", "error");

  } finally {

    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ------------------------------------
// 🆕 IdeaForge-AI Hub — AI Assistant, Writing,
// Translate, Calculator, Student
// ------------------------------------

let currentToolResult = "";
let currentToolInput = "";
let activeTool = "assistant";

const TOOL_TITLES = {
  assistant: "🤖 AI Assistant",
  writing: "✍️ Writing Assistant",
  translate: "🌐 Translate",
  calculator: "🧮 Calculator",
  student: "📚 Student Helper",
  image: "📸 Image Tools"
};

function openToolWorkspace(tool) {

  activeTool = tool;

  document.querySelectorAll(".hubChip").forEach(function (c) {
    c.classList.remove("active");
  });

  const activeChip = document.querySelector('.hubChip[data-tool="' + tool + '"]');
  if (activeChip) activeChip.classList.add("active");

  if (tool === "image") {

    document.getElementById("toolWorkspace").style.display = "none";
    const imgWorkspace = document.getElementById("imageToolWorkspace");
    imgWorkspace.style.display = "block";
    imgWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  document.getElementById("imageToolWorkspace").style.display = "none";

  document.getElementById("toolWorkspaceTitle").textContent = TOOL_TITLES[tool] || "🤖 AI Assistant";

  document.getElementById("writingOptions").style.display = tool === "writing" ? "flex" : "none";
  document.getElementById("translateOptions").style.display = tool === "translate" ? "flex" : "none";

  const workspace = document.getElementById("toolWorkspace");
  workspace.style.display = "block";
  workspace.scrollIntoView({ behavior: "smooth", block: "start" });

  document.getElementById("toolInput").focus();
}

let lastToolPayload = null;

// ------------------------------------
// 🆕 Soft daily usage limit (Free plan indicator)
// Client-side only — a UX nudge, not real enforcement.
// Real Pro/payment would need a backend + payment gateway,
// this just tracks & displays usage for now.
// ------------------------------------

const FREE_DAILY_LIMIT = 15;
const USAGE_KEY = "ideaforge_usage";

function getTodayUsage() {

  try {

    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(USAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};

    if (data.date !== today) {
      return { date: today, count: 0 };
    }

    return data;

  } catch (e) {
    return { date: new Date().toISOString().slice(0, 10), count: 0 };
  }
}

function incrementUsage() {

  try {
    const usage = getTodayUsage();
    usage.count += 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    renderUsageBanner();
  } catch (e) {}
}

function renderUsageBanner() {

  const banner = document.getElementById("usageBanner");
  if (!banner) return;

  const usage = getTodayUsage();
  const remaining = FREE_DAILY_LIMIT - usage.count;

  if (remaining <= 0) {

    banner.textContent = "आज की free limit खत्म हो गई (" + FREE_DAILY_LIMIT + "/" + FREE_DAILY_LIMIT + ") — कल फिर try करें, या Pro जल्द आ रहा है ✨";
    banner.classList.add("limitReached");
    banner.style.display = "block";

  } else if (usage.count > 0) {

    banner.textContent = "Free plan: आज " + usage.count + "/" + FREE_DAILY_LIMIT + " uses";
    banner.classList.remove("limitReached");
    banner.style.display = "block";

  } else {

    banner.style.display = "none";
  }
}

function hasUsageRemaining() {
  return getTodayUsage().count < FREE_DAILY_LIMIT;
}

async function runAiTool(input, tool) {

  if (!hasUsageRemaining()) {
    showToast("आज की free limit (" + FREE_DAILY_LIMIT + ") खत्म हो गई। कल फिर try करें।", "error");
    renderUsageBanner();
    return;
  }

  const btn = document.getElementById("toolGenerateBtn");
  const resultBox = document.getElementById("toolResult");
  const resultActions = document.getElementById("toolResultActions");

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> सोच रहे हैं...';

  resultBox.style.display = "none";
  resultActions.style.display = "none";

  try {

    const payload = {
      tool: tool,
      input: input,
      language: document.getElementById("languageSelect")?.value || "auto"
    };

    if (tool === "writing") {
      payload.writingType = document.getElementById("writingTypeSelect")?.value || "";
      payload.tone = document.getElementById("toneSelect")?.value || "";
    }

    if (tool === "translate") {
      payload.fromLanguage = document.getElementById("fromLanguageSelect")?.value || "auto";
      payload.toLanguage = document.getElementById("toLanguageSelect")?.value || "English";
    }

    lastToolPayload = payload;

    const response = await fetch("/api/ai-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.result) {
      throw new Error(data?.error || "Result generate nahi ho paya.");
    }

    incrementUsage();

    // 🆕 AI Smart Router — agar "auto" tool tha aur backend ne
    // koi specific category detect ki, toh UI ko usi tool pe
    // switch kar do (jaisa user ne khud wahi category choose ki ho)
    let effectiveTool = tool;

    if (tool === "auto" && data.route && TOOL_TITLES[data.route] && data.route !== "auto") {

      effectiveTool = data.route;
      openToolWorkspace(effectiveTool);
      document.getElementById("toolInput").value = input;
      showToast("✨ " + TOOL_TITLES[effectiveTool] + " detect kiya gaya", "info");
    }

    currentToolResult = data.result;
    currentToolInput = input;

    resultBox.textContent = data.result;
    resultBox.style.display = "block";
    resultActions.style.display = "flex";

    saveToToolHistory(effectiveTool, input, data.result);

  } catch (error) {

    console.error("AI tool error:", error);
    showToast(error.message || "Kuch galat ho gaya, फिर try करें।", "error");

  } finally {

    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ------------------------------------
// 🆕 Tool History (localStorage, last 15)
// ------------------------------------

const TOOL_HISTORY_KEY = "ideaforge_tool_history";
const TOOL_HISTORY_LIMIT = 15;

function getToolHistory() {
  try {
    const raw = localStorage.getItem(TOOL_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveToToolHistory(tool, input, result) {

  try {

    let list = getToolHistory();

    list.unshift({
      tool: tool,
      input: input,
      result: result,
      label: (TOOL_TITLES[tool] || tool) + ": " + input.slice(0, 50),
      savedAt: Date.now()
    });

    while (list.length > TOOL_HISTORY_LIMIT) list.pop();

    localStorage.setItem(TOOL_HISTORY_KEY, JSON.stringify(list));
    renderToolHistory();

  } catch (error) {
    console.error("Tool history save error:", error);
  }
}

function renderToolHistory() {

  const list = getToolHistory();
  const section = document.getElementById("toolHistorySection");
  const row = document.getElementById("toolHistoryRow");

  if (!section || !row) return;

  if (list.length === 0) {
    section.style.display = "none";
    return;
  }

  row.innerHTML = "";

  list.forEach(function (item) {

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "historyItem";
    btn.textContent = item.label;

    btn.addEventListener("click", function () {

      openToolWorkspace(item.tool);
      document.getElementById("toolInput").value = item.input;

      currentToolResult = item.result;
      currentToolInput = item.input;

      const resultBox = document.getElementById("toolResult");
      const resultActions = document.getElementById("toolResultActions");

      resultBox.textContent = item.result;
      resultBox.style.display = "block";
      resultActions.style.display = "flex";
    });

    row.appendChild(btn);
  });

  section.style.display = "block";
}

// ------------------------------------
// 🆕 Favorites (localStorage)
// ------------------------------------

const TOOL_FAVORITES_KEY = "ideaforge_tool_favorites";

function getToolFavorites() {
  try {
    const raw = localStorage.getItem(TOOL_FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveToToolFavorites(tool, input, result) {

  try {

    let list = getToolFavorites();

    list.unshift({
      tool: tool,
      input: input,
      result: result,
      label: (TOOL_TITLES[tool] || tool) + ": " + input.slice(0, 50),
      savedAt: Date.now()
    });

    localStorage.setItem(TOOL_FAVORITES_KEY, JSON.stringify(list));
    renderToolFavorites();
    showToast("Favorites mein save ho gaya! ⭐", "success");

  } catch (error) {
    console.error("Favorites save error:", error);
  }
}

function renderToolFavorites() {

  const list = getToolFavorites();
  const section = document.getElementById("toolFavoritesSection");
  const row = document.getElementById("toolFavoritesRow");

  if (!section || !row) return;

  if (list.length === 0) {
    section.style.display = "none";
    return;
  }

  row.innerHTML = "";

  list.forEach(function (item) {

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "historyItem";
    btn.textContent = "⭐ " + item.label;

    btn.addEventListener("click", function () {

      openToolWorkspace(item.tool);
      document.getElementById("toolInput").value = item.input;

      currentToolResult = item.result;
      currentToolInput = item.input;

      const resultBox = document.getElementById("toolResult");
      const resultActions = document.getElementById("toolResultActions");

      resultBox.textContent = item.result;
      resultBox.style.display = "block";
      resultActions.style.display = "flex";
    });

    row.appendChild(btn);
  });

  section.style.display = "block";
}

// ------------------------------------
// 🆕 UI Translation (buttons/menus, not just AI output)
// ------------------------------------

const UI_STRINGS = {
  en: {
    tagline: "AI Tools for Everyone",
    languageLabel: "🌐 Language",
    hubLabel: "✨ What do you want to do?",
    askAiBtn: "➤ Ask AI",
    chipAssistant: "🤖 AI Assistant",
    chipWriting: "✍️ Writing",
    chipTranslate: "🌐 Translate",
    chipCalculator: "🧮 Calculator",
    chipBusiness: "💼 Business",
    chipStudent: "📚 Student",
    chipStatus: "🎨 Status",
    chipAd: "📢 Advertisement",
    chipImage: "📸 Image Tools",
    chipVoice: "🎤 Voice AI",
    generateBtn: "✨ Generate",
    copyBtn: "📋 Copy",
    regenerateBtn: "🔄 Regenerate",
    saveBtn: "⭐ Save",
    shareBtn: "📤 Share"
  },
  hi: {
    tagline: "सबके लिए AI टूल्स",
    languageLabel: "🌐 भाषा",
    hubLabel: "✨ आप क्या करना चाहते हैं?",
    askAiBtn: "➤ AI से पूछें",
    chipAssistant: "🤖 AI सहायक",
    chipWriting: "✍️ लेखन",
    chipTranslate: "🌐 अनुवाद",
    chipCalculator: "🧮 कैलकुलेटर",
    chipBusiness: "💼 व्यापार",
    chipStudent: "📚 छात्र सहायता",
    chipStatus: "🎨 स्टेटस",
    chipAd: "📢 विज्ञापन",
    chipImage: "📸 इमेज टूल्स",
    chipVoice: "🎤 वॉइस AI",
    generateBtn: "✨ बनाएं",
    copyBtn: "📋 कॉपी",
    regenerateBtn: "🔄 दोबारा बनाएं",
    saveBtn: "⭐ सेव करें",
    shareBtn: "📤 शेयर करें"
  },
  bn: {
    tagline: "সবার জন্য AI টুলস",
    languageLabel: "🌐 ভাষা",
    hubLabel: "✨ আপনি কী করতে চান?",
    askAiBtn: "➤ AI কে জিজ্ঞাসা করুন",
    chipAssistant: "🤖 AI সহায়ক",
    chipWriting: "✍️ লেখা",
    chipTranslate: "🌐 অনুবাদ",
    chipCalculator: "🧮 ক্যালকুলেটর",
    chipBusiness: "💼 ব্যবসা",
    chipStudent: "📚 ছাত্র সহায়ক",
    chipStatus: "🎨 স্ট্যাটাস",
    chipAd: "📢 বিজ্ঞাপন",
    chipImage: "📸 ইমেজ টুলস",
    chipVoice: "🎤 ভয়েস AI",
    generateBtn: "✨ তৈরি করুন",
    copyBtn: "📋 কপি",
    regenerateBtn: "🔄 আবার তৈরি করুন",
    saveBtn: "⭐ সেভ করুন",
    shareBtn: "📤 শেয়ার করুন"
  },
  ur: {
    tagline: "سب کے لیے AI ٹولز",
    languageLabel: "🌐 زبان",
    hubLabel: "✨ آپ کیا کرنا چاہتے ہیں؟",
    askAiBtn: "➤ AI سے پوچھیں",
    chipAssistant: "🤖 AI اسسٹنٹ",
    chipWriting: "✍️ تحریر",
    chipTranslate: "🌐 ترجمہ",
    chipCalculator: "🧮 کیلکولیٹر",
    chipBusiness: "💼 کاروبار",
    chipStudent: "📚 طالب علم مدد",
    chipStatus: "🎨 اسٹیٹس",
    chipAd: "📢 اشتہار",
    chipImage: "📸 امیج ٹولز",
    chipVoice: "🎤 وائس AI",
    generateBtn: "✨ بنائیں",
    copyBtn: "📋 کاپی",
    regenerateBtn: "🔄 دوبارہ بنائیں",
    saveBtn: "⭐ محفوظ کریں",
    shareBtn: "📤 شیئر کریں"
  }
};

const UI_LANG_KEY = "ideaforge_ui_lang";

function applyUILanguage(lang) {

  const dict = UI_STRINGS[lang] || UI_STRINGS.en;

  document.querySelectorAll("[data-i18n]").forEach(function (el) {

    const key = el.getAttribute("data-i18n");

    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  try {
    localStorage.setItem(UI_LANG_KEY, lang);
  } catch (e) {}
}

function getSavedUILanguage() {
  try {
    return localStorage.getItem(UI_LANG_KEY) || "en";
  } catch (e) {
    return "en";
  }
}

// ------------------------------------
// 🆕 Voice input — browser ke native Speech
// Recognition API se (Chrome/Edge support karte hain)
// ------------------------------------

function startVoiceInput(targetTextareaId, micBtn) {

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionAPI) {
    showToast("Is browser mein voice input support nahi hai.", "error");
    return;
  }

  const recognition = new SpeechRecognitionAPI();
  recognition.lang = "hi-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micBtn.classList.add("listening");

  recognition.onresult = function (event) {

    const transcript = event.results[0][0].transcript;
    const textarea = document.getElementById(targetTextareaId);

    if (textarea) {
      textarea.value = (textarea.value ? textarea.value + " " : "") + transcript;
      textarea.dispatchEvent(new Event("input"));
    }
  };

  recognition.onerror = function (event) {
    console.error("Speech recognition error:", event.error);
    if (event.error !== "aborted") {
      showToast("Voice sunayi nahi diya, फिर try करें।", "error");
    }
  };

  recognition.onend = function () {
    micBtn.classList.remove("listening");
  };

  try {
    recognition.start();
  } catch (e) {
    micBtn.classList.remove("listening");
  }
}

// ------------------------------------
// 🆕 Image Tools — photo upload karke
// describe / extract text / ask about image
// ------------------------------------

let currentImageBase64 = "";
let currentImageResult = "";

function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function runImageTool() {

  if (!currentImageBase64) {
    showToast("Pehle ek photo upload karein.", "error");
    return;
  }

  if (!hasUsageRemaining()) {
    showToast("आज की free limit khatam ho gayi.", "error");
    return;
  }

  const btn = document.getElementById("imageGenerateBtn");
  const resultBox = document.getElementById("imageResult");
  const resultActions = document.getElementById("imageResultActions");

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analyze कर रहे हैं...';

  resultBox.style.display = "none";
  resultActions.style.display = "none";

  try {

    const action = document.getElementById("imageActionSelect")?.value || "describe";
    const question = document.getElementById("imageQuestionInput")?.value.trim() || "";
    const language = document.getElementById("languageSelect")?.value || "auto";

    const response = await fetch("/api/image-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: currentImageBase64,
        action, question, language
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.result) {
      throw new Error(data?.error || "Image analyze nahi ho payi.");
    }

    currentImageResult = data.result;
    resultBox.textContent = data.result;
    resultBox.style.display = "block";
    resultActions.style.display = "flex";

    incrementUsage();

  } catch (error) {

    console.error("Image tool error:", error);
    showToast(error.message || "Kuch galat ho gaya, फिर try करें।", "error");

  } finally {

    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ------------------------------------
// Init
// ------------------------------------

document.addEventListener("DOMContentLoaded", function () {

  renderHistory();
  renderToolHistory();
  renderToolFavorites();
  renderUsageBanner();

  applyUILanguage(getSavedUILanguage());

  const uiLanguageSelect = document.getElementById("uiLanguageSelect");
  if (uiLanguageSelect) {
    uiLanguageSelect.value = getSavedUILanguage();
    uiLanguageSelect.addEventListener("change", function () {
      applyUILanguage(uiLanguageSelect.value);
    });
  }

  const ideaInput = document.getElementById("ideaInput");
  const charCount = document.getElementById("charCount");

  if (ideaInput && charCount) {
    ideaInput.addEventListener("input", function () {
      charCount.textContent = ideaInput.value.length;
    });
  }

  const generateBtn = document.getElementById("generateBtn");
  if (generateBtn) {
    generateBtn.addEventListener("click", generateReport);
  }

  // ------------------------------------
  // Download PDF — reportSection ka screenshot lekar
  // multi-page PDF banate hain (isse Hindi/Tamil/koi bhi
  // language sahi dikhti hai, font embedding ki zaroorat nahi)
  // ------------------------------------

  const downloadPdfBtn = document.getElementById("downloadPdfBtn");

  if (downloadPdfBtn) {

    downloadPdfBtn.addEventListener("click", function () {

      if (!currentReport) return;
      downloadElementAsPdf("reportSection", "IdeaForgeX-Report", downloadPdfBtn);
    });
  }

  const copyReportBtn = document.getElementById("copyReportBtn");
  if (copyReportBtn) {
    copyReportBtn.addEventListener("click", async function () {

      if (!currentReport) return;

      try {
        await navigator.clipboard.writeText(reportToPlainText(currentReport));
        showToast("Report copy ho gaya!", "success");
      } catch (error) {
        showToast("Copy nahi ho paya।", "error");
      }
    });
  }

  const shareReportBtn = document.getElementById("shareReportBtn");
  if (shareReportBtn) {
    shareReportBtn.addEventListener("click", async function () {

      if (!currentReport) return;

      const text = reportToPlainText(currentReport);

      if (navigator.share) {

        try {
          await navigator.share({ title: "IdeaForgeX Report", text });
        } catch (error) {
          // user cancelled share — ignore
        }

      } else {

        try {
          await navigator.clipboard.writeText(text);
          showToast("Report copy ho gaya, ab share kar sakte ho।", "info");
        } catch (error) {
          showToast("Share/copy nahi ho paya।", "error");
        }
      }
    });
  }

  const newIdeaBtn = document.getElementById("newIdeaBtn");
  if (newIdeaBtn) {
    newIdeaBtn.addEventListener("click", function () {

      currentReport = null;
      currentIdeaText = "";

      document.getElementById("ideaInput").value = "";
      document.getElementById("charCount").textContent = "0";
      document.getElementById("reportSection").style.display = "none";
      document.getElementById("launchPlanSection").style.display = "none";
      document.getElementById("pitchDeckSection").style.display = "none";

      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("ideaInput").focus();
    });
  }

  // 🆕 Launch Plan
  const generateLaunchPlanBtn = document.getElementById("generateLaunchPlanBtn");
  if (generateLaunchPlanBtn) {
    generateLaunchPlanBtn.addEventListener("click", generateLaunchPlan);
  }

  const downloadLaunchPlanPdfBtn = document.getElementById("downloadLaunchPlanPdfBtn");
  if (downloadLaunchPlanPdfBtn) {
    downloadLaunchPlanPdfBtn.addEventListener("click", function () {
      downloadElementAsPdf("launchPlanSection", "IdeaForgeX-LaunchPlan", downloadLaunchPlanPdfBtn);
    });
  }

  const copyLaunchPlanBtn = document.getElementById("copyLaunchPlanBtn");
  if (copyLaunchPlanBtn) {
    copyLaunchPlanBtn.addEventListener("click", function () {
      if (!currentLaunchPlan) return;
      copyPlainText(sectionsToPlainText("IdeaForgeX — 30-Day Launch Plan", LAUNCH_PLAN_DISPLAY, currentLaunchPlan));
    });
  }

  const shareLaunchPlanBtn = document.getElementById("shareLaunchPlanBtn");
  if (shareLaunchPlanBtn) {
    shareLaunchPlanBtn.addEventListener("click", function () {
      if (!currentLaunchPlan) return;
      sharePlainText("IdeaForgeX Launch Plan", sectionsToPlainText("IdeaForgeX — 30-Day Launch Plan", LAUNCH_PLAN_DISPLAY, currentLaunchPlan));
    });
  }

  // 🆕 Pitch Deck
  const generatePitchDeckBtn = document.getElementById("generatePitchDeckBtn");
  if (generatePitchDeckBtn) {
    generatePitchDeckBtn.addEventListener("click", generatePitchDeck);
  }

  const downloadPitchDeckPdfBtn = document.getElementById("downloadPitchDeckPdfBtn");
  if (downloadPitchDeckPdfBtn) {
    downloadPitchDeckPdfBtn.addEventListener("click", function () {
      downloadElementAsPdf("pitchDeckSection", "IdeaForgeX-PitchDeck", downloadPitchDeckPdfBtn);
    });
  }

  const copyPitchDeckBtn = document.getElementById("copyPitchDeckBtn");
  if (copyPitchDeckBtn) {
    copyPitchDeckBtn.addEventListener("click", function () {
      if (!currentPitchDeck) return;
      copyPlainText(sectionsToPlainText("IdeaForgeX — Investor Pitch Deck", PITCH_DECK_DISPLAY, currentPitchDeck));
    });
  }

  const sharePitchDeckBtn = document.getElementById("sharePitchDeckBtn");
  if (sharePitchDeckBtn) {
    sharePitchDeckBtn.addEventListener("click", function () {
      if (!currentPitchDeck) return;
      sharePlainText("IdeaForgeX Pitch Deck", sectionsToPlainText("IdeaForgeX — Investor Pitch Deck", PITCH_DECK_DISPLAY, currentPitchDeck));
    });
  }

  // 🆕 Hub category chips
  document.querySelectorAll(".hubChip").forEach(function (chip) {

    chip.addEventListener("click", function () {

      const tool = chip.getAttribute("data-tool");
      const scrollTarget = chip.getAttribute("data-scroll");
      const externalUrl = chip.getAttribute("data-external");
      const isSoon = chip.getAttribute("data-soon");

      if (tool) {
        openToolWorkspace(tool);
        return;
      }

      if (scrollTarget) {
        const el = document.getElementById(scrollTarget);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (externalUrl) {
        window.open(externalUrl, "_blank");
        return;
      }

      if (isSoon) {
        showToast("Yeh feature jald aa raha hai! ✨", "info");
        return;
      }
    });
  });

  // 🆕 Hub "Ask AI" — seedha hub box se auto tool
  const hubAskBtn = document.getElementById("hubAskBtn");
  if (hubAskBtn) {
    hubAskBtn.addEventListener("click", function () {

      const text = document.getElementById("hubInput").value.trim();

      if (!text) {
        showToast("Pehle kuch likhein.", "error");
        return;
      }

      openToolWorkspace("assistant");
      document.getElementById("toolInput").value = text;
      runAiTool(text, "assistant");
    });
  }

  // 🆕 Tool workspace Generate button
  const toolGenerateBtn = document.getElementById("toolGenerateBtn");
  if (toolGenerateBtn) {
    toolGenerateBtn.addEventListener("click", function () {

      const text = document.getElementById("toolInput").value.trim();

      if (!text) {
        showToast("Pehle kuch likhein.", "error");
        return;
      }

      runAiTool(text, activeTool);
    });
  }

  const toolCopyBtn = document.getElementById("toolCopyBtn");
  if (toolCopyBtn) {
    toolCopyBtn.addEventListener("click", function () {
      if (!currentToolResult) return;
      copyPlainText(currentToolResult);
    });
  }

  const toolRegenerateBtn = document.getElementById("toolRegenerateBtn");
  if (toolRegenerateBtn) {
    toolRegenerateBtn.addEventListener("click", function () {

      if (!lastToolPayload) return;

      runAiTool(lastToolPayload.input, lastToolPayload.tool);
    });
  }

  const toolSaveBtn = document.getElementById("toolSaveBtn");
  if (toolSaveBtn) {
    toolSaveBtn.addEventListener("click", function () {

      if (!currentToolResult || !currentToolInput) return;
      saveToToolFavorites(activeTool, currentToolInput, currentToolResult);
    });
  }

  const toolShareBtn = document.getElementById("toolShareBtn");
  if (toolShareBtn) {
    toolShareBtn.addEventListener("click", function () {
      if (!currentToolResult) return;
      sharePlainText("IdeaForge-AI", currentToolResult);
    });
  }

  // 🆕 Voice input — hub aur tool workspace dono mein
  const hubMicBtn = document.getElementById("hubMicBtn");
  if (hubMicBtn) {
    hubMicBtn.addEventListener("click", function () {
      startVoiceInput("hubInput", hubMicBtn);
    });
  }

  const toolMicBtn = document.getElementById("toolMicBtn");
  if (toolMicBtn) {
    toolMicBtn.addEventListener("click", function () {
      startVoiceInput("toolInput", toolMicBtn);
    });
  }

  // 🆕 Voice AI chip — seedha AI Assistant kholo aur mic shuru karo
  const voiceAiChip = document.getElementById("voiceAiChip");
  if (voiceAiChip) {
    voiceAiChip.addEventListener("click", function () {
      openToolWorkspace("assistant");
      setTimeout(function () {
        const micBtn = document.getElementById("toolMicBtn");
        if (micBtn) startVoiceInput("toolInput", micBtn);
      }, 300);
    });
  }

  // 🆕 Image Tools — upload, action select, generate, copy/share
  const imageUploadCard = document.getElementById("imageUploadCard");
  const imageFileInput = document.getElementById("imageFileInput");

  if (imageUploadCard && imageFileInput) {

    imageUploadCard.addEventListener("click", function () {
      imageFileInput.click();
    });

    imageFileInput.addEventListener("change", async function () {

      const file = imageFileInput.files[0];
      if (!file) return;

      try {

        currentImageBase64 = await fileToBase64(file);

        const preview = document.getElementById("imagePreview");
        const uploadText = document.getElementById("imageUploadText");

        if (preview) {
          preview.src = currentImageBase64;
          preview.style.display = "block";
        }
        if (uploadText) {
          uploadText.style.display = "none";
        }

      } catch (error) {
        showToast("Photo load nahi ho payi।", "error");
      }
    });
  }

  const imageActionSelect = document.getElementById("imageActionSelect");
  if (imageActionSelect) {
    imageActionSelect.addEventListener("change", function () {

      const questionInput = document.getElementById("imageQuestionInput");
      if (questionInput) {
        questionInput.style.display = imageActionSelect.value === "ask" ? "block" : "none";
      }
    });
  }

  const imageGenerateBtn = document.getElementById("imageGenerateBtn");
  if (imageGenerateBtn) {
    imageGenerateBtn.addEventListener("click", runImageTool);
  }

  const imageCopyBtn = document.getElementById("imageCopyBtn");
  if (imageCopyBtn) {
    imageCopyBtn.addEventListener("click", function () {
      if (!currentImageResult) return;
      copyPlainText(currentImageResult);
    });
  }

  const imageShareBtn = document.getElementById("imageShareBtn");
  if (imageShareBtn) {
    imageShareBtn.addEventListener("click", function () {
      if (!currentImageResult) return;
      sharePlainText("IdeaForge-AI Image Tool", currentImageResult);
    });
  }

});
