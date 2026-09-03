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
  // 🆕 Download PDF — reportSection ka screenshot
  // lekar multi-page PDF banate hain (isse Hindi/Tamil/
  // koi bhi language sahi dikhti hai, font embedding
  // ki zaroorat nahi padti)
  // ------------------------------------

  const downloadPdfBtn = document.getElementById("downloadPdfBtn");

  if (downloadPdfBtn) {

    downloadPdfBtn.addEventListener("click", async function () {

      if (!currentReport) return;

      const reportSection = document.getElementById("reportSection");

      if (!window.html2canvas || !window.jspdf) {
        showToast("PDF library load nahi hui, phir try करें।", "error");
        return;
      }

      const originalHtml = downloadPdfBtn.innerHTML;
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.innerHTML = '<span class="spinner"></span> PDF बना रहे हैं...';

      try {

        const canvas = await window.html2canvas(reportSection, {
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

        const fileName =
          "IdeaForgeX-Report-" + Date.now() + ".pdf";

        pdf.save(fileName);

        showToast("PDF download ho gaya!", "success");

      } catch (error) {

        console.error("PDF generation error:", error);
        showToast("PDF banane mein समस्या हुई।", "error");

      } finally {

        downloadPdfBtn.disabled = false;
        downloadPdfBtn.innerHTML = originalHtml;
      }
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

      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("ideaInput").focus();
    });
  }

});
