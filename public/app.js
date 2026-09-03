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
// Init
// ------------------------------------

document.addEventListener("DOMContentLoaded", function () {

  renderHistory();

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

});
