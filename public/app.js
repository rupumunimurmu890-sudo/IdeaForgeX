// ========================================
// IdeaForgeX - Main JavaScript v7.0 (Phase 4: Smart Context)
// ========================================

let currentReport = null, currentIdeaText = "", isProUser = false;
let userBrand = { name: "", industry: "", audience: "" }; // 🆕 Phase 4
const HISTORY_KEY = "ideaforgex_history", HISTORY_LIMIT = 10;
const FREE_DAILY_LIMIT = 15, USAGE_KEY = "ideaforge_usage";

function showToast(msg, type) {
  const c = document.getElementById("toastContainer"); if (!c) return;
  const t = document.createElement("div"); t.className = "toast toast" + (type||"Info").charAt(0).toUpperCase() + (type||"Info").slice(1); t.textContent = msg;
  c.appendChild(t); requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add("show")));
  setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(), 300); }, 3500);
}

function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch(e){ return []; } }
function saveToHistory(idea, report) {
  let list = getHistory(); list.unshift({ idea: idea.slice(0,80), score: report.score.overall, report, fullIdea: idea, savedAt: Date.now() });
  while(list.length > HISTORY_LIMIT) list.pop(); localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); renderHistory();
}
function renderHistory() {
  const list = getHistory(), sec = document.getElementById("ideaHistorySection"), row = document.getElementById("ideaHistoryRow");
  if (!sec || !row) return; if (list.length === 0) { sec.style.display = "none"; return; }
  row.innerHTML = ""; list.forEach(item => {
    const btn = document.createElement("button"); btn.type="button"; btn.className="historyItem";
    btn.innerHTML = '<span class="historyItemScore">'+item.score+'/100</span><span class="historyItemText">' + escapeHtml(item.idea) + '</span>';
    btn.onclick = () => { currentIdeaText = item.fullIdea; currentReport = item.report; document.getElementById("ideaInput").value = item.fullIdea; renderReport(item.report); };
    row.appendChild(btn);
  }); sec.style.display = "block";
}
function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

const SECTION_DISPLAY = [
  { key: "IDEA", title: "💡 The Idea" }, { key: "TARGET_CUSTOMERS", title: "🎯 Target Customers" }, { key: "CUSTOMER_PROBLEM", title: "😣 Customer Problem" },
  { key: "REVENUE_MODEL", title: "💰 Revenue Model" }, { key: "MARKET_ANALYSIS", title: "📊 Market Analysis" }, { key: "COMPETITOR_ANALYSIS", title: " Competitor Analysis" },
  { key: "__SWOT__", title: "SWOT Analysis" }, { key: "MARKETING_STRATEGY", title: "📣 Marketing Strategy" }, { key: "STARTUP_COST", title: "💵 Startup Cost" },
  { key: "ONE_YEAR_PROJECTION", title: "📈 1-Year Projection" }, { key: "RISKS", title: "️ Risks" }, { key: "GROWTH_STRATEGY", title: "🚀 Growth Strategy" }
];

function setBar(barId, valId, val) { const b = document.getElementById(barId), v = document.getElementById(valId); if(b) b.style.width = (val||0)+"%"; if(v) v.textContent = (typeof val==="number"?val:"--")+"/100"; }

function renderReport(report) {
  const { score, sections } = report;
  document.getElementById("scoreOverall").textContent = typeof score.overall === "number" ? score.overall : "--";
  setBar("barMarket", "valMarket", score.market); setBar("barCompetition", "valCompetition", score.competition);
  setBar("barProfit", "valProfit", score.profit); setBar("barDifficulty", "valDifficulty", score.difficulty);
  const container = document.getElementById("reportSections"); container.innerHTML = "";
  SECTION_DISPLAY.forEach(item => {
    if (item.key === "__SWOT__") {
      const card = document.createElement("div"); card.className = "reportCard";
      card.innerHTML = '<div class="reportCardTitle"> SWOT Analysis</div><div class="swotGrid"><div class="swotBox swotStrengths"><div class="swotTitle">Strengths</div>'+escapeHtml(sections.SWOT_STRENGTHS||"")+'</div><div class="swotBox swotWeaknesses"><div class="swotTitle">Weaknesses</div>'+escapeHtml(sections.SWOT_WEAKNESSES||"")+'</div><div class="swotBox swotOpportunities"><div class="swotTitle">Opportunities</div>'+escapeHtml(sections.SWOT_OPPORTUNITIES||"")+'</div><div class="swotBox swotThreats"><div class="swotTitle">Threats</div>'+escapeHtml(sections.SWOT_THREATS||"")+'</div></div>';
      container.appendChild(card); return;
    }
    const content = sections[item.key] || ""; if (!content) return;
    const card = document.createElement("div"); card.className = "reportCard";
    card.innerHTML = '<div class="reportCardTitle">'+item.title+'</div><div class="reportCardBody">'+escapeHtml(content)+'</div>';
    container.appendChild(card);
  });
  document.getElementById("reportSection").style.display = "block";
  document.getElementById("reportSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function generateReport() {
  const idea = document.getElementById("ideaInput").value.trim(); if (!idea) { showToast("Idea likhein.", "error"); return; }
  const btn = document.getElementById("generateBtn"); const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analyzing...';
  try {
    const res = await fetch("/api/generate-report", { method: "POST", headers: { "Content-Type": "application/json", "X-User-ID": localStorage.getItem('uid')||'anon', "X-User-Plan": isProUser?"pro":"free" }, body: JSON.stringify({ idea, language: document.getElementById("languageSelect").value, brand: userBrand }) });
    const data = await res.json();
    if (!res.ok || !data.success || !data.report) { if(data.limitReached) showToast("Limit khatam!", "error"); throw new Error(data?.error || "Error."); }
    currentReport = data.report; currentIdeaText = idea; renderReport(data.report); saveToHistory(idea, data.report);
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled = false; btn.innerHTML = orig; }
}

async function downloadElementAsPdf(elId, prefix, btn) {
  if (!window.html2canvas || !window.jspdf) { showToast("PDF lib load nahi hui.", "error"); return; }
  const el = document.getElementById(elId); const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> PDF...';
  try {
    const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: "#fff" }); const { jsPDF } = window.jspdf; const pdf = new jsPDF("p", "mm", "a4");
    const imgW = pdf.internal.pageSize.getWidth(), imgH = (canvas.height * imgW) / canvas.width;
    let hLeft = imgH, pos = 0; const imgData = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", 0, pos, imgW, imgH); hLeft -= pdf.internal.pageSize.getHeight();
    while (hLeft > 0) { pos = hLeft - imgH; pdf.addPage(); pdf.addImage(imgData, "JPEG", 0, pos, imgW, imgH); hLeft -= pdf.internal.pageSize.getHeight(); }
    pdf.save(prefix+"-"+Date.now()+".pdf"); showToast("PDF Downloaded!", "success");
  } catch(e) { showToast("PDF Error.", "error"); } finally { btn.disabled = false; btn.innerHTML = orig; }
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); showToast("Copied!", "success"); } catch(e){ showToast("Copy failed.", "error"); } }

async function generateLaunchPlan() {
  if(!currentIdeaText) { showToast("Pehle report generate karein.", "error"); return; }
  const btn = document.getElementById("generateLaunchPlanBtn"); const orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Planning...';
  try {
    const res = await fetch("/api/generate-launch-plan", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({idea:currentIdeaText, budget:document.getElementById("budgetInput")?.value||"", language:document.getElementById("languageSelect").value, brand: userBrand}) });
    const data = await res.json(); if(!res.ok||!data.success||!data.plan) throw new Error(data?.error);
    renderSectionsInto("launchPlanSections", [{key:"BUDGET_BREAKDOWN",title:"💰 Budget"},{key:"PREPARATION",title:"📋 Prep"},{key:"PRODUCT_DEVELOPMENT",title:"🛠️ Dev"},{key:"BRANDING",title:"🎨 Brand"},{key:"MARKETING_LAUNCH",title:"📣 Marketing"},{key:"LAUNCH_WEEK",title:"🚀 Launch"},{key:"PRODUCT_IDEAS",title:"💡 Ideas"},{key:"PRICING",title:"️ Pricing"},{key:"EXPECTED_SALES",title:"📈 Sales"}], data.plan);
    document.getElementById("launchPlanSection").style.display="block";
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}
function renderSectionsInto(cid, spec, data) { const c = document.getElementById(cid); c.innerHTML=""; spec.forEach(i => { if(!data[i.key]) return; const d=document.createElement("div"); d.className="reportCard"; d.innerHTML='<div class="reportCardTitle">'+i.title+'</div><div class="reportCardBody">'+escapeHtml(data[i.key])+'</div>'; c.appendChild(d); }); }

async function generatePitchDeck() {
  if(!currentIdeaText) { showToast("Pehle report generate karein.", "error"); return; }
  const btn = document.getElementById("generatePitchDeckBtn"); const orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Deck...';
  try {
    const res = await fetch("/api/generate-pitch-deck", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({idea:currentIdeaText, language:document.getElementById("languageSelect").value, brand: userBrand}) });
    const data = await res.json(); if(!res.ok||!data.success||!data.deck) throw new Error(data?.error);
    renderSectionsInto("pitchDeckSlides", [{key:"PROBLEM",title:"Problem"},{key:"SOLUTION",title:"Solution"},{key:"MARKET",title:"Market"},{key:"PRODUCT",title:"Product"},{key:"BUSINESS_MODEL",title:"Business"},{key:"COMPETITION",title:"Competition"},{key:"FINANCIALS",title:"Financials"},{key:"GROWTH",title:"Growth"},{key:"FUNDING_REQUIREMENT",title:"Funding"}], data.deck);
    document.getElementById("pitchDeckSection").style.display="block";
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}

function smartRouteInput(input) {
  const t = input.toLowerCase().trim();
  if (/[\d]+\s*[\+\-\*\/\^]\s*[\d]+/.test(t) || /\b(calculate|math|kitna|jod|guna)\b/.test(t)) return 'calculator';
  if (/\b(translate|anuvad|in hindi|in english|meaning)\b/.test(t)) return 'translate';
  if (/\b(write|draft|email|letter|essay|likho)\b/.test(t)) return 'writing';
  if (/\b(explain|define|what is|kya hai|history|science)\b/.test(t)) return 'student';
  if (/\b(code|program|script|function|python|javascript|html|css|react|api)\b/.test(t)) return 'code';
  if (/\b(logo|brand|design|icon|symbol|emblem)\b/.test(t)) return 'logo';
  if (/\b(post|tweet|instagram|linkedin|facebook|social media|caption|reel)\b/.test(t)) return 'social';
  if (/\b(image|picture|photo|draw|generate image|banaiye|tasveer|chitra|painting)\b/.test(t)) return 'ai-image';
  if (/\b(promote|marketing|advertisement|ad|campaign|shop|business promote)\b/.test(t)) return 'autopilot';
  if (/\b(document|pdf|analyze document|summary|notes)\b/.test(t)) return 'document';
  if (/\b(goal|plan|roadmap|kaise karein|how to achieve|target)\b/.test(t)) return 'goalplan';
  if (/\b(profit|loss|money|calculate business|investment|roi|kamaai)\b/.test(t)) return 'moneycalc';
  if (/\b(improve|feedback|suggestion|better idea|idea check)\b/.test(t)) return 'improveidea';
  // 🆕 Phase 4 Routing
  if (/\b(roast|shark tank|critique|brutal|idea check)\b/.test(t)) return 'roast';
  if (/\b(poster|banner|flyer|graphic design)\b/.test(t)) return 'poster';
  if (/\b(video|script|youtube|reel|shorts|tiktok)\b/.test(t)) return 'video';
  if (/\b(workflow|batch|all in one|complete pack)\b/.test(t)) return 'workflow';
  return 'assistant';
}

let currentToolResult = "", currentToolInput = "", activeTool = "assistant", lastToolPayload = null;
const TOOL_TITLES = { assistant: "🤖 AI Assistant", autopilot: "🚀 Auto-Pilot", goalplan: "🎯 Goal Plan", moneycalc: "💰 Money Calc", improveidea: " Improve Idea", roast: "🦈 Roast Idea", poster: "🖼️ Poster Maker", video: "🎬 Video Script", workflow: "⚙️ AI Workflow", writing: "✍️ Writing", translate: " Translate", calculator: "🧮 Calculator", student: "📚 Student", code: "💻 Code", logo: "🎨 Logo", social: "📱 Social", socialpack: " Social Pack", "ai-image": "🖼️ Real Image", document: "📄 Doc AI", image: "📸 Image Tools" };

function openToolWorkspace(tool) {
  activeTool = tool;
  document.querySelectorAll(".hubChip").forEach(c => c.classList.remove("active"));
  const chip = document.querySelector('.hubChip[data-tool="'+tool+'"]'); if(chip) chip.classList.add("active");
  
  document.getElementById("toolWorkspace").style.display = "none";
  document.getElementById("imageToolWorkspace").style.display = "none";
  document.getElementById("documentWorkspace").style.display = "none";
  
  if (tool === "image") { document.getElementById("imageToolWorkspace").style.display = "block"; return; }
  if (tool === "document") { document.getElementById("documentWorkspace").style.display = "block"; return; }
  
  document.getElementById("toolWorkspaceTitle").textContent = TOOL_TITLES[tool] || "🤖 AI Assistant";
  
  ["writingOptions", "translateOptions", "codeOptions", "logoOptions", "socialOptions", "aiImageOptions", "goalOptions", "moneyOptions", "posterOptions", "videoOptions", "workflowOptions"].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).style.display = "none";
  });

  if (tool === "writing") document.getElementById("writingOptions").style.display = "flex";
  if (tool === "translate") document.getElementById("translateOptions").style.display = "flex";
  if (tool === "code") document.getElementById("codeOptions").style.display = "flex";
  if (tool === "logo") document.getElementById("logoOptions").style.display = "flex";
  if (tool === "social") document.getElementById("socialOptions").style.display = "flex";
  if (tool === "ai-image") document.getElementById("aiImageOptions").style.display = "flex";
  if (tool === "goalplan") document.getElementById("goalOptions").style.display = "flex";
  if (tool === "moneycalc") document.getElementById("moneyOptions").style.display = "flex";
  if (tool === "poster") document.getElementById("posterOptions").style.display = "flex";
  if (tool === "video") document.getElementById("videoOptions").style.display = "flex";
  if (tool === "workflow") document.getElementById("workflowOptions").style.display = "flex";
  
  document.getElementById("toolWorkspace").style.display = "block";
  document.getElementById("toolWorkspace").scrollIntoView({behavior:"smooth"});
  document.getElementById("toolInput").focus();
}

function getTodayUsage() {
  const today = new Date().toISOString().slice(0,10); const raw = localStorage.getItem(USAGE_KEY); const d = raw?JSON.parse(raw):{};
  return d.date !== today ? {date:today, count:0} : d;
}
function incrementUsage() { const u = getTodayUsage(); u.count++; localStorage.setItem(USAGE_KEY, JSON.stringify(u)); renderUsageBanner(); }
function renderUsageBanner() {
  const b = document.getElementById("usageBanner"); if(!b) return;
  const u = getTodayUsage(), rem = FREE_DAILY_LIMIT - u.count;
  if(rem<=0) { document.getElementById("usageText").textContent = "⚠️ Free Plan Limit Reached! Upgrade to Pro for unlimited access."; b.classList.add("limitReached"); b.style.display="block"; }
  else if(u.count>0) { document.getElementById("usageText").textContent = `Free Plan • ${rem} AI uses remaining today`; b.classList.remove("limitReached"); b.style.display="block"; }
  else { document.getElementById("usageText").textContent = `Free Plan • ${FREE_DAILY_LIMIT} AI uses remaining today`; b.classList.remove("limitReached"); b.style.display="block"; }
}
function hasUsageRemaining() { return isProUser || getTodayUsage().count < FREE_DAILY_LIMIT; }

function formatToolResult(text, tool) {
  if (tool === "code") return text.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>').replace(/\n/g, '<br>');
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function renderAutopilotResult(pkg) {
  const container = document.getElementById("autopilotResult"); container.innerHTML = "";
  const sections = [{ key: "AD_COPY", title: "📢 Ad Copy" }, { key: "INSTAGRAM_CAPTION", title: "📸 Instagram Caption" }, { key: "FACEBOOK_POST", title: "📘 Facebook Post" }, { key: "WHATSAPP_MESSAGE", title: "💬 WhatsApp Message" }, { key: "POSTER_TEXT", title: "🎨 Poster Text" }, { key: "IMAGE_PROMPT", title: "🖼️ Image Prompt" }, { key: "VIDEO_PROMPT", title: "🎥 Video Prompt" }, { key: "HASHTAGS", title: "#️⃣ Hashtags" }];
  sections.forEach(s => { if (pkg[s.key]) { const div = document.createElement("div"); div.className = "autopilot-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(pkg[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

function renderSocialPackResult(pack) {
  const container = document.getElementById("socialPackResult"); container.innerHTML = "";
  const sections = [{ key: "INSTAGRAM", title: "📸 Instagram" }, { key: "FACEBOOK", title: "📘 Facebook" }, { key: "WHATSAPP", title: "💬 WhatsApp" }, { key: "YOUTUBE_TITLE", title: "🎬 YouTube Title" }, { key: "YOUTUBE_DESCRIPTION", title: "📝 YouTube Description" }, { key: "SHORTS_CAPTION", title: "⚡ Shorts Caption" }, { key: "HASHTAGS", title: "#️⃣ Hashtags" }, { key: "THUMBNAIL_PROMPT", title: "🖼️ Thumbnail Prompt" }];
  sections.forEach(s => { if (pack[s.key]) { const div = document.createElement("div"); div.className = "autopilot-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(pack[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

function renderGoalResult(plan) {
  const container = document.getElementById("goalResult"); container.innerHTML = "";
  const sections = [{ key: "OVERVIEW", title: "🎯 Strategy Overview" }, { key: "MILESTONES", title: "🏆 Key Milestones" }, { key: "ACTION_PLAN", title: "📅 Action Plan" }, { key: "RESOURCES_NEEDED", title: "🛠️ Resources Needed" }, { key: "POTENTIAL_OBSTACLES", title: "⚠️ Potential Obstacles" }];
  sections.forEach(s => { if (plan[s.key]) { const div = document.createElement("div"); div.className = "goal-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(plan[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

function renderMoneyResult(calc) {
  const container = document.getElementById("moneyResult"); container.innerHTML = "";
  const sections = [{ key: "INVESTMENT_BREAKDOWN", title: "💰 Investment Breakdown" }, { key: "MONTHLY_EXPENSES", title: "📉 Monthly Expenses" }, { key: "REVENUE_MODEL", title: "💵 Revenue Model" }, { key: "PROFIT_PROJECTION", title: "📈 Profit Projection" }, { key: "BREAK_EVEN", title: "⚖️ Break-Even Point" }, { key: "RISKS", title: "⚠️ Financial Risks" }];
  sections.forEach(s => { if (calc[s.key]) { const div = document.createElement("div"); div.className = "money-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(calc[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

function renderImproveResult(feedback) {
  const container = document.getElementById("improveResult"); container.innerHTML = "";
  const sections = [{ key: "VERDICT", title: "⚖️ Final Verdict" }, { key: "WHAT_WORKS", title: "✅ What Works" }, { key: "WHAT_IS_MISSING", title: "❌ What is Missing" }, { key: "PRICING_STRATEGY", title: "️ Pricing Strategy" }, { key: "TARGET_AUDIENCE", title: "🎯 Target Audience" }, { key: "IMMEDIATE_NEXT_STEPS", title: "🚀 Immediate Next Steps" }];
  sections.forEach(s => { if (feedback[s.key]) { const div = document.createElement("div"); div.className = "improve-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(feedback[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

// 🆕 Phase 4: Roast Result
function renderRoastResult(roast) {
  const container = document.getElementById("roastResult"); container.innerHTML = "";
  const score = roast.SHARK_SCORE || "?";
  container.innerHTML = `<div class="shark-score"> ${score}/10</div>`;
  const sections = [{ key: "THE_GOOD", title: "✅ The Good" }, { key: "THE_ROAST", title: " The Brutal Truth" }, { key: "THE_FIX", title: "🛠️ The Fix" }, { key: "FINAL_VERDICT", title: "⚖️ Final Verdict" }];
  sections.forEach(s => { if (roast[s.key]) { const div = document.createElement("div"); div.className = "roast-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(roast[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

function renderPosterResult(poster, theme) {
  document.getElementById("posterHeadline").textContent = poster.HEADLINE || "Headline";
  document.getElementById("posterSubhead").textContent = poster.SUBHEADLINE || "Subheadline";
  document.getElementById("posterBody").textContent = poster.BODY || "Body text goes here.";
  document.getElementById("posterFooter").textContent = poster.FOOTER || "Footer / CTA";
  document.getElementById("posterPreview").style.background = theme;
  document.getElementById("posterPreviewBox").style.display = "block";
}

function renderVideoResult(video) {
  const container = document.getElementById("videoResult"); container.innerHTML = "";
  const sections = [{ key: "TITLE", title: "🎬 Video Title" }, { key: "HOOK", title: "🪝 Hook (First 3s)" }, { key: "INTRO", title: "🎙️ Intro" }, { key: "BODY", title: "🎥 Main Script / Scenes" }, { key: "CTA", title: "📢 Call to Action" }, { key: "HASHTAGS", title: "#️⃣ Hashtags" }];
  sections.forEach(s => { if (video[s.key]) { const div = document.createElement("div"); div.className = "video-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(video[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

function renderWorkflowResult(workflow) {
  const container = document.getElementById("workflowResult"); container.innerHTML = "";
  const sections = [{ key: "PART_1", title: "📦 Part 1" }, { key: "PART_2", title: "📦 Part 2" }, { key: "PART_3", title: "📦 Part 3" }];
  sections.forEach(s => { if (workflow[s.key]) { const div = document.createElement("div"); div.className = "workflow-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(workflow[s.key])}</p>`; container.appendChild(div); } });
  container.style.display = "block";
}

async function runAiTool(input, tool) {
  if (!hasUsageRemaining()) { showToast("Limit khatam! Pro lein.", "error"); return; }
  const btn = document.getElementById("toolGenerateBtn"), resBox = document.getElementById("toolResult"), resAct = document.getElementById("toolResultActions");
  const orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Thinking...'; 
  resBox.style.display="none"; resAct.style.display="none";
  document.getElementById("autopilotResult").style.display="none";
  document.getElementById("socialPackResult").style.display="none";
  document.getElementById("goalResult").style.display="none";
  document.getElementById("moneyResult").style.display="none";
  document.getElementById("improveResult").style.display="none";
  document.getElementById("roastResult").style.display="none";
  document.getElementById("videoResult").style.display="none";
  document.getElementById("workflowResult").style.display="none";
  document.getElementById("posterPreviewBox").style.display="none";
  const imgBox = document.getElementById("generatedImageBox"); if(imgBox) imgBox.style.display="none";

  const isBilingual = document.getElementById("bilingualToggle")?.checked || false;

  try {
    const payload = { tool, input, language: document.getElementById("languageSelect")?.value || "auto", brand: userBrand, bilingual: isBilingual };
    if(tool==="writing") { payload.writingType = document.getElementById("writingTypeSelect")?.value; payload.tone = document.getElementById("toneSelect")?.value; }
    if(tool==="translate") { payload.fromLanguage = document.getElementById("fromLanguageSelect")?.value; payload.toLanguage = document.getElementById("toLanguageSelect")?.value; }
    if(tool==="code") { payload.codeLang = document.getElementById("codeLangSelect")?.value; }
    if(tool==="logo") { payload.logoStyle = document.getElementById("logoStyleSelect")?.value; }
    if(tool==="social") { payload.platform = document.getElementById("platformSelect")?.value; }
    if(tool==="ai-image") { payload.style = document.getElementById("imageStyleSelect")?.value; }
    lastToolPayload = payload;
    
    if (tool === "autopilot") {
      const res = await fetch("/api/ai-autopilot", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ input, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.package) throw new Error(data?.error || "Autopilot package generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderAutopilotResult(data.package); currentToolResult = JSON.stringify(data.package); resAct.style.display="flex"; return;
    }

    if (tool === "socialpack") {
      const res = await fetch("/api/social-pack", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ content: input, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.pack) throw new Error(data?.error || "Social pack generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderSocialPackResult(data.pack); currentToolResult = JSON.stringify(data.pack); resAct.style.display="flex"; return;
    }

    if (tool === "goalplan") {
      const timeframe = document.getElementById("goalTimeframeSelect")?.value || "6 Months";
      const res = await fetch("/api/goal-plan", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ goal: input, timeframe, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.plan) throw new Error(data?.error || "Goal plan generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderGoalResult(data.plan); currentToolResult = JSON.stringify(data.plan); resAct.style.display="flex"; return;
    }

    if (tool === "moneycalc") {
      const investment = document.getElementById("moneyInvestment")?.value || "₹10,000";
      const type = document.getElementById("moneyTypeSelect")?.value || "Small Business";
      const res = await fetch("/api/money-calc", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ business: input, investment, type, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.calc) throw new Error(data?.error || "Money calc generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderMoneyResult(data.calc); currentToolResult = JSON.stringify(data.calc); resAct.style.display="flex"; return;
    }

    if (tool === "improveidea") {
      const res = await fetch("/api/improve-idea", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ idea: input, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.feedback) throw new Error(data?.error || "Improve idea generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderImproveResult(data.feedback); currentToolResult = JSON.stringify(data.feedback); resAct.style.display="flex"; return;
    }

    //  Phase 4: Roast
    if (tool === "roast") {
      const res = await fetch("/api/roast-idea", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ idea: input, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.roast) throw new Error(data?.error || "Roast generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderRoastResult(data.roast); currentToolResult = JSON.stringify(data.roast); resAct.style.display="flex"; return;
    }

    if (tool === "poster") {
      const theme = document.getElementById("posterThemeSelect")?.value || "linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;";
      const res = await fetch("/api/generate-poster", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ topic: input, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.poster) throw new Error(data?.error || "Poster content generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderPosterResult(data.poster, theme);
      currentToolResult = `${data.poster.HEADLINE} - ${data.poster.SUBHEADLINE}`;
      resAct.style.display="flex"; return;
    }

    if (tool === "video") {
      const platform = document.getElementById("videoPlatformSelect")?.value || "YouTube Long";
      const res = await fetch("/api/generate-video", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ topic: input, platform, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.video) throw new Error(data?.error || "Video script generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderVideoResult(data.video); currentToolResult = JSON.stringify(data.video); resAct.style.display="flex"; return;
    }

    if (tool === "workflow") {
      const type = document.getElementById("workflowTypeSelect")?.value || "startup-launch";
      const res = await fetch("/api/run-workflow", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ topic: input, type, brand: userBrand }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.workflow) throw new Error(data?.error || "Workflow generate nahi hua.");
      if(!isProUser) incrementUsage();
      renderWorkflowResult(data.workflow); currentToolResult = JSON.stringify(data.workflow); resAct.style.display="flex"; return;
    }

    if (tool === "ai-image") {
      const res = await fetch("/api/generate-image", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ prompt: input, style: payload.style }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.image) throw new Error(data?.error || "Image generate nahi hui.");
      if(!isProUser) incrementUsage();
      const imgEl = document.getElementById("generatedImage"); imgEl.src = data.image; imgBox.style.display="block";
      currentToolResult = "Image Generated Successfully"; resAct.style.display="flex"; return;
    }

    const res = await fetch("/api/ai-tool", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify(payload) });
    const data = await res.json();
    if(!res.ok||!data.success||!data.result) throw new Error(data?.error);
    if(!isProUser) incrementUsage();
    
    let effTool = tool;
    if(tool==="auto" && data.route && TOOL_TITLES[data.route] && data.route!=="auto") { effTool = data.route; openToolWorkspace(effTool); document.getElementById("toolInput").value = input; showToast("✨ "+TOOL_TITLES[effTool]+" detected", "info"); }
    
    currentToolResult = data.result; currentToolInput = input; 
    resBox.innerHTML = formatToolResult(data.result, effTool);
    resBox.style.display="block"; resAct.style.display="flex";
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}

async function remixContent(style) {
  if (!currentToolResult || currentToolResult === "Image Generated Successfully" || currentToolResult.startsWith('{')) { showToast("Text content par hi Remix kaam karta hai.", "error"); return; }
  const btn = document.getElementById("remixBtn"); const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Remixing...';
  try {
    const res = await fetch("/api/remix", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ text: currentToolResult, style, brand: userBrand }) });
    const data = await res.json();
    if(!res.ok||!data.success||!data.result) throw new Error(data?.error);
    if(!isProUser) incrementUsage();
    currentToolResult = data.result;
    document.getElementById("toolResult").innerHTML = formatToolResult(data.result, activeTool);
    showToast(`✨ Content remixed: ${style}`, "success");
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}

async function makeItBetter() {
  if (!currentToolResult || currentToolResult === "Image Generated Successfully" || currentToolResult.startsWith('{')) { showToast("Text content par hi Make Better kaam karta hai.", "error"); return; }
  const btn = document.getElementById("makeBetterBtn"); const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Improving...';
  try {
    const res = await fetch("/api/remix", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ text: currentToolResult, style: "professional, detailed, and highly improved", brand: userBrand }) });
    const data = await res.json();
    if(!res.ok||!data.success||!data.result) throw new Error(data?.error);
    if(!isProUser) incrementUsage();
    currentToolResult = data.result;
    document.getElementById("toolResult").innerHTML = formatToolResult(data.result, activeTool);
    showToast("🚀 Content improved!", "success");
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}

async function analyzeDocument() {
  const text = document.getElementById("docTextInput").value.trim();
  if (!text) { showToast("Document upload karein ya text paste karein.", "error"); return; }
  const btn = document.getElementById("docAnalyzeBtn"); const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analyzing...';
  try {
    const res = await fetch("/api/document-ai", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ text }) });
    const data = await res.json();
    if(!res.ok||!data.success||!data.analysis) throw new Error(data?.error);
    if(!isProUser) incrementUsage();
    const resultDiv = document.getElementById("docResult"); resultDiv.innerHTML = "";
    const sections = [{ key: "SUMMARY", title: "📋 Summary" }, { key: "KEY_POINTS", title: "🎯 Key Points" }, { key: "QUESTIONS_ANSWERS", title: "❓ Q&A" }, { key: "SIMPLE_EXPLANATION", title: "📖 Simple Explanation" }, { key: "MCQS", title: " MCQs" }];
    sections.forEach(s => { if (data.analysis[s.key]) { const div = document.createElement("div"); div.className = "autopilot-section"; div.innerHTML = `<h4>${s.title}</h4><p>${escapeHtml(data.analysis[s.key])}</p>`; resultDiv.appendChild(div); } });
    resultDiv.style.display = "block"; showToast("Document analyzed successfully!", "success");
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}

function speakResult() {
  if (!currentToolResult || currentToolResult === "Image Generated Successfully" || currentToolResult.startsWith('{')) { showToast("Text content ko hi bola ja sakta hai.", "error"); return; }
  if (!window.speechSynthesis) { showToast("Voice support nahi hai.", "error"); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(currentToolResult);
  utterance.lang = "hi-IN"; utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance); showToast("🔊 Speaking...", "info");
}

async function downloadPoster() {
  if (!window.html2canvas) { showToast("PDF/Image lib load nahi hui.", "error"); return; }
  const btn = document.getElementById("downloadPosterBtn");
  const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Downloading...';
  try {
    const posterEl = document.getElementById("posterPreview");
    const canvas = await window.html2canvas(posterEl, { scale: 2, backgroundColor: null, useCORS: true });
    const link = document.createElement('a');
    link.download = 'IdeaForge-Poster-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast("🖼️ Poster downloaded as PNG!", "success");
  } catch(e) { showToast("Poster download failed.", "error"); } finally { btn.disabled = false; btn.innerHTML = orig; }
}

const TH_KEY="ideaforge_tool_history"; function getTH(){ try{return JSON.parse(localStorage.getItem(TH_KEY))||[];}catch(e){return[];} }
function saveToTH(t,i,r){ let l=getTH(); l.unshift({tool:t,input:i,result:r,label:(TOOL_TITLES[t]||t)+": "+i.slice(0,50),savedAt:Date.now()}); while(l.length>15)l.pop(); localStorage.setItem(TH_KEY,JSON.stringify(l)); renderTH(); }
function renderTH(){ const l=getTH(),s=document.getElementById("toolHistorySection"),r=document.getElementById("toolHistoryRow"); if(!s||!r)return; if(l.length===0){s.style.display="none";return;} r.innerHTML=""; l.forEach(i=>{const b=document.createElement("button");b.type="button";b.className="historyItem";b.innerHTML='<span class="historyItemText">'+escapeHtml(i.label)+'</span>';b.onclick=()=>{openToolWorkspace(i.tool);document.getElementById("toolInput").value=i.input;currentToolResult=i.result;document.getElementById("toolResult").innerHTML=formatToolResult(i.result, i.tool);document.getElementById("toolResult").style.display="block";};r.appendChild(b);}); s.style.display="block"; }

const UI_STRINGS = { en: { tagline: "One AI Workspace for Everything", askAiBtn: "➤ Ask AI" }, hi: { tagline: "सबके लिए AI वर्कस्पेस", askAiBtn: "➤ AI से पूछें" } }; 
function applyUILanguage(lang) { const d = UI_STRINGS[lang]||UI_STRINGS.en; document.querySelectorAll("[data-i18n]").forEach(el => { const k=el.getAttribute("data-i18n"); if(d[k]) el.textContent=d[k]; }); localStorage.setItem("ideaforge_ui_lang", lang); }

function startVoiceInput(targetId, btn) { const S = window.SpeechRecognition||window.webkitSpeechRecognition; if(!S){showToast("Voice support nahi hai.","error");return;} const r=new S(); r.lang="hi-IN"; btn.classList.add("listening"); r.onresult=e=>{document.getElementById(targetId).value += e.results[0][0].transcript;}; r.onend=()=>btn.classList.remove("listening"); try{r.start();}catch(e){btn.classList.remove("listening");} }

// 🆕 Phase 4: Brand Logic
function loadBrand() {
  try {
    const saved = localStorage.getItem('ideaforge_brand');
    if (saved) userBrand = JSON.parse(saved);
  } catch(e) {}
}
function saveBrand() {
  userBrand = {
    name: document.getElementById("brandNameInput").value.trim(),
    industry: document.getElementById("brandIndustryInput").value.trim(),
    audience: document.getElementById("brandAudienceInput").value.trim()
  };
  localStorage.setItem('ideaforge_brand', JSON.stringify(userBrand));
  showToast("👤 Brand Profile Saved! AI will now use it.", "success");
  document.getElementById("brandModal").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  isProUser = localStorage.getItem('ideaforge_pro') === 'true'; 
  if(!localStorage.getItem('uid')) localStorage.setItem('uid', 'user_'+Math.random().toString(36).substr(2,9));
  loadBrand(); // 🆕 Load brand on start
  renderHistory(); renderTH(); renderUsageBanner(); applyUILanguage(localStorage.getItem("ideaforge_ui_lang")||"en");
  
  document.getElementById("generateBtn")?.addEventListener("click", generateReport);
  document.getElementById("generateLaunchPlanBtn")?.addEventListener("click", generateLaunchPlan);
  document.getElementById("generatePitchDeckBtn")?.addEventListener("click", generatePitchDeck);
  
  document.getElementById("hubAskBtn")?.addEventListener("click", () => {
    const t = document.getElementById("hubInput").value.trim(); if(!t) return;
    const tool = smartRouteInput(t); openToolWorkspace(tool); document.getElementById("toolInput").value = t; runAiTool(t, tool);
  });
  
  document.getElementById("toolGenerateBtn")?.addEventListener("click", () => {
    const t = document.getElementById("toolInput").value.trim(); if(!t) return; runAiTool(t, activeTool);
  });
  
  document.getElementById("toolCopyBtn")?.addEventListener("click", () => copyText(currentToolResult));
  document.getElementById("toolRegenerateBtn")?.addEventListener("click", () => lastToolPayload && runAiTool(lastToolPayload.input, lastToolPayload.tool));
  document.getElementById("remixBtn")?.addEventListener("click", () => { document.getElementById("remixModal").style.display = "flex"; });
  document.getElementById("makeBetterBtn")?.addEventListener("click", makeItBetter);
  document.getElementById("speakResultBtn")?.addEventListener("click", speakResult);
  document.getElementById("toolSaveBtn")?.addEventListener("click", () => { if(currentToolResult && currentToolInput) { saveToTH(activeTool, currentToolInput, currentToolResult); showToast("⭐ Saved!", "success"); } });
  document.getElementById("toolShareBtn")?.addEventListener("click", () => { if(currentToolResult) { if(navigator.share) navigator.share({title:"IdeaForge-AI", text:currentToolResult}); else { copyText(currentToolResult); showToast("Copied for sharing!", "info"); } } });
  
  document.getElementById("downloadPosterBtn")?.addEventListener("click", downloadPoster);
  
  document.getElementById("hubMicBtn")?.addEventListener("click", function(){ startVoiceInput("hubInput", this); });
  document.getElementById("toolMicBtn")?.addEventListener("click", function(){ startVoiceInput("toolInput", this); });
  
  document.querySelectorAll(".remix-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const style = btn.getAttribute("data-style");
      remixContent(style);
      document.getElementById("remixModal").style.display = "none";
    });
  });
  document.getElementById("closeRemixModal")?.addEventListener("click", () => { document.getElementById("remixModal").style.display = "none"; });
  
  // 🆕 Phase 4: Brand Modal Events
  document.getElementById("openBrandBtn")?.addEventListener("click", () => {
    document.getElementById("brandNameInput").value = userBrand.name || "";
    document.getElementById("brandIndustryInput").value = userBrand.industry || "";
    document.getElementById("brandAudienceInput").value = userBrand.audience || "";
    document.getElementById("brandModal").style.display = "flex";
  });
  document.getElementById("saveBrandBtn")?.addEventListener("click", saveBrand);
  document.getElementById("closeBrandBtn")?.addEventListener("click", () => { document.getElementById("brandModal").style.display = "none"; });
  
  document.getElementById("docAnalyzeBtn")?.addEventListener("click", analyzeDocument);
  const docFileInput = document.getElementById("docFileInput");
  const docUploadCard = document.getElementById("docUploadCard");
  if (docUploadCard && docFileInput) {
    docUploadCard.addEventListener("click", () => docFileInput.click());
    docFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { document.getElementById("docTextInput").value = ev.target.result; showToast("Document loaded!", "success"); };
        reader.readAsText(file);
      }
    });
  }
  
  const imageUploadCard = document.getElementById("imageUploadCard");
  const imageFileInput = document.getElementById("imageFileInput");
  if (imageUploadCard && imageFileInput) {
    imageUploadCard.addEventListener("click", () => imageFileInput.click());
    imageFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        window.currentImageBase64 = ev.target.result;
        document.getElementById("imagePreview").src = window.currentImageBase64;
        document.getElementById("imagePreview").style.display = "block";
        document.getElementById("imageUploadText").style.display = "none";
      };
      reader.readAsDataURL(file);
    });
  }
  document.getElementById("imageGenerateBtn")?.addEventListener("click", async () => {
    if (!window.currentImageBase64) { showToast("Pehle image upload karein.", "error"); return; }
    if (!hasUsageRemaining()) { showToast("Limit khatam!", "error"); return; }
    const btn = document.getElementById("imageGenerateBtn"); const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analyzing...';
    try {
      const action = document.getElementById("imageActionSelect").value;
      const question = document.getElementById("imageQuestionInput").value;
      const res = await fetch("/api/image-tool", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ imageBase64: window.currentImageBase64, action, question }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.result) throw new Error(data?.error);
      if(!isProUser) incrementUsage();
      const resultDiv = document.getElementById("imageResult");
      resultDiv.innerHTML = formatToolResult(data.result, "image");
      resultDiv.style.display = "block";
      document.getElementById("imageResultActions").style.display = "flex";
      showToast("Image analyzed!", "success");
    } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
  });
  document.getElementById("imageActionSelect")?.addEventListener("change", (e) => {
    document.getElementById("imageQuestionInput").style.display = e.target.value === "ask" ? "block" : "none";
  });
  document.getElementById("imageCopyBtn")?.addEventListener("click", () => copyText(document.getElementById("imageResult").innerText));
  document.getElementById("imageShareBtn")?.addEventListener("click", () => { if(navigator.share) navigator.share({title:"Image Analysis", text:document.getElementById("imageResult").innerText}); else copyText(document.getElementById("imageResult").innerText); });
  
  document.getElementById("upgradeProBtn")?.addEventListener("click", () => { showToast("Payment integration coming soon!", "info"); });
  document.getElementById("closeProModal")?.addEventListener("click", () => { document.getElementById("proModal").style.display = "none"; });
  
  document.querySelectorAll(".hubChip").forEach(chip => {
    chip.addEventListener("click", () => {
      const t = chip.getAttribute("data-tool"); if(t) openToolWorkspace(t);
    });
  });
  
  const tips = [
    "Set your Brand Profile! AI will use it in every tool automatically.",
    "Try 'Roast My Idea' for a brutal but fair Shark Tank style critique!",
    "Enable 'Bilingual Output' to get results in English + Hindi together.",
    "Use Poster Maker to create beautiful social media graphics in seconds!",
    "Try Video Script tool for YouTube Shorts or Instagram Reels!"
  ];
  document.getElementById("dailyTip").textContent = tips[Math.floor(Math.random() * tips.length)];
});
