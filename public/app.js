// ========================================
// IdeaForgeX - Main JavaScript v3.0 (Real Image Gen)
// ========================================

let currentReport = null, currentIdeaText = "", isProUser = false;
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
    btn.innerHTML = '<span class="historyItemScore">'+item.score+'/100</span>' + escapeHtml(item.idea);
    btn.onclick = () => { currentIdeaText = item.fullIdea; currentReport = item.report; document.getElementById("ideaInput").value = item.fullIdea; renderReport(item.report); };
    row.appendChild(btn);
  }); sec.style.display = "block";
}
function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

const SECTION_DISPLAY = [
  { key: "IDEA", title: "💡 The Idea" }, { key: "TARGET_CUSTOMERS", title: "🎯 Target Customers" }, { key: "CUSTOMER_PROBLEM", title: "😣 Customer Problem" },
  { key: "REVENUE_MODEL", title: "💰 Revenue Model" }, { key: "MARKET_ANALYSIS", title: " Market Analysis" }, { key: "COMPETITOR_ANALYSIS", title: "🥊 Competitor Analysis" },
  { key: "__SWOT__", title: "SWOT Analysis" }, { key: "MARKETING_STRATEGY", title: "📣 Marketing Strategy" }, { key: "STARTUP_COST", title: "💵 Startup Cost" },
  { key: "ONE_YEAR_PROJECTION", title: " 1-Year Projection" }, { key: "RISKS", title: "⚠️ Risks" }, { key: "GROWTH_STRATEGY", title: "🚀 Growth Strategy" }
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
      card.innerHTML = '<div class="reportCardTitle">🧭 SWOT Analysis</div><div class="swotGrid"><div class="swotBox swotStrengths"><div class="swotTitle">Strengths</div>'+escapeHtml(sections.SWOT_STRENGTHS||"")+'</div><div class="swotBox swotWeaknesses"><div class="swotTitle">Weaknesses</div>'+escapeHtml(sections.SWOT_WEAKNESSES||"")+'</div><div class="swotBox swotOpportunities"><div class="swotTitle">Opportunities</div>'+escapeHtml(sections.SWOT_OPPORTUNITIES||"")+'</div><div class="swotBox swotThreats"><div class="swotTitle">Threats</div>'+escapeHtml(sections.SWOT_THREATS||"")+'</div></div>';
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
    const res = await fetch("/api/generate-report", { method: "POST", headers: { "Content-Type": "application/json", "X-User-ID": localStorage.getItem('uid')||'anon', "X-User-Plan": isProUser?"pro":"free" }, body: JSON.stringify({ idea, language: document.getElementById("languageSelect").value }) });
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
    const res = await fetch("/api/generate-launch-plan", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({idea:currentIdeaText, budget:document.getElementById("budgetInput")?.value||"", language:document.getElementById("languageSelect").value}) });
    const data = await res.json(); if(!res.ok||!data.success||!data.plan) throw new Error(data?.error);
    renderSectionsInto("launchPlanSections", [{key:"BUDGET_BREAKDOWN",title:"💰 Budget"},{key:"PREPARATION",title:" Prep"},{key:"PRODUCT_DEVELOPMENT",title:"🛠️ Dev"},{key:"BRANDING",title:"🎨 Brand"},{key:"MARKETING_LAUNCH",title:"📣 Marketing"},{key:"LAUNCH_WEEK",title:"🚀 Launch"},{key:"PRODUCT_IDEAS",title:"💡 Ideas"},{key:"PRICING",title:"🏷️ Pricing"},{key:"EXPECTED_SALES",title:"📈 Sales"}], data.plan);
    document.getElementById("launchPlanSection").style.display="block";
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}
function renderSectionsInto(cid, spec, data) { const c = document.getElementById(cid); c.innerHTML=""; spec.forEach(i => { if(!data[i.key]) return; const d=document.createElement("div"); d.className="reportCard"; d.innerHTML='<div class="reportCardTitle">'+i.title+'</div><div class="reportCardBody">'+escapeHtml(data[i.key])+'</div>'; c.appendChild(d); }); }

async function generatePitchDeck() {
  if(!currentIdeaText) { showToast("Pehle report generate karein.", "error"); return; }
  const btn = document.getElementById("generatePitchDeckBtn"); const orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Deck...';
  try {
    const res = await fetch("/api/generate-pitch-deck", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({idea:currentIdeaText, language:document.getElementById("languageSelect").value}) });
    const data = await res.json(); if(!res.ok||!data.success||!data.deck) throw new Error(data?.error);
    renderSectionsInto("pitchDeckSlides", [{key:"PROBLEM",title:"Problem"},{key:"SOLUTION",title:"Solution"},{key:"MARKET",title:"Market"},{key:"PRODUCT",title:"Product"},{key:"BUSINESS_MODEL",title:"Business"},{key:"COMPETITION",title:"Competition"},{key:"FINANCIALS",title:"Financials"},{key:"GROWTH",title:"Growth"},{key:"FUNDING_REQUIREMENT",title:"Funding"}], data.deck);
    document.getElementById("pitchDeckSection").style.display="block";
  } catch(e) { showToast(e.message, "error"); } finally { btn.disabled=false; btn.innerHTML=orig; }
}

//  SMART ROUTER (Updated with Real Image Gen)
function smartRouteInput(input) {
  const t = input.toLowerCase().trim();
  if (/[\d]+\s*[\+\-\*\/\^]\s*[\d]+/.test(t) || /\b(calculate|math|kitna|jod|guna)\b/.test(t)) return 'calculator';
  if (/\b(translate|anuvad|in hindi|in english|meaning)\b/.test(t)) return 'translate';
  if (/\b(write|draft|email|letter|essay|likho)\b/.test(t)) return 'writing';
  if (/\b(explain|define|what is|kya hai|history|science)\b/.test(t)) return 'student';
  if (/\b(code|program|script|function|python|javascript|html|css|react|api)\b/.test(t)) return 'code';
  if (/\b(logo|brand|design|icon|symbol|emblem)\b/.test(t)) return 'logo';
  if (/\b(post|tweet|instagram|linkedin|facebook|social media|caption|reel)\b/.test(t)) return 'social';
  // 🆕 Real Image Detection
  if (/\b(image|picture|photo|draw|generate image|banaiye|tasveer|chitra|painting)\b/.test(t)) return 'ai-image';
  return 'assistant';
}

// Hub & Tools Logic
let currentToolResult = "", currentToolInput = "", activeTool = "assistant", lastToolPayload = null;
const TOOL_TITLES = { assistant: "🤖 AI Assistant", writing: "✍️ Writing", translate: "🌐 Translate", calculator: "🧮 Calculator", student: " Student", code: "💻 Code Generator", logo: "🎨 Logo Maker", social: " Social Media", image: "📸 Image Tools", "ai-image": "🖼️ Real Image Gen" };

function openToolWorkspace(tool) {
  activeTool = tool;
  document.querySelectorAll(".hubChip").forEach(c => c.classList.remove("active"));
  const chip = document.querySelector('.hubChip[data-tool="'+tool+'"]'); if(chip) chip.classList.add("active");
  
  if (tool === "image") { document.getElementById("toolWorkspace").style.display="none"; document.getElementById("imageToolWorkspace").style.display="block"; return; }
  
  document.getElementById("imageToolWorkspace").style.display="none";
  document.getElementById("toolWorkspaceTitle").textContent = TOOL_TITLES[tool] || "🤖 AI Assistant";
  
  // Hide all specific options
  ["writingOptions", "translateOptions", "codeOptions", "logoOptions", "socialOptions", "aiImageOptions"].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).style.display = "none";
  });

  if (tool === "writing") document.getElementById("writingOptions").style.display = "flex";
  if (tool === "translate") document.getElementById("translateOptions").style.display = "flex";
  if (tool === "code") document.getElementById("codeOptions").style.display = "flex";
  if (tool === "logo") document.getElementById("logoOptions").style.display = "flex";
  if (tool === "social") document.getElementById("socialOptions").style.display = "flex";
  if (tool === "ai-image") document.getElementById("aiImageOptions").style.display = "flex"; // 🆕
  
  const ws = document.getElementById("toolWorkspace"); ws.style.display="block"; ws.scrollIntoView({behavior:"smooth"});
  document.getElementById("toolInput").focus();
}

function getTodayUsage() {
  const today = new Date().toISOString().slice(0,10); const raw = localStorage.getItem(USAGE_KEY); const d = raw?JSON.parse(raw):{};
  return d.date !== today ? {date:today, count:0} : d;
}
function incrementUsage() { const u = getTodayUsage(); u.count++; localStorage.setItem(USAGE_KEY, JSON.stringify(u)); renderUsageBanner(); }
function renderUsageBanner() {
  const b = document.getElementById("usageBanner"); if(!b) return; const u = getTodayUsage(), rem = FREE_DAILY_LIMIT - u.count;
  if(rem<=0) { b.textContent="Free limit khatam! Pro upgrade karein."; b.classList.add("limitReached"); b.style.display="block"; }
  else if(u.count>0) { b.textContent="Free: "+u.count+"/"+FREE_DAILY_LIMIT+" ("+rem+" left)"; b.classList.remove("limitReached"); b.style.display="block"; }
  else b.style.display="none";
}
function hasUsageRemaining() { return isProUser || getTodayUsage().count < FREE_DAILY_LIMIT; }

function formatToolResult(text, tool) {
  if (tool === "code") return text.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>').replace(/\n/g, '<br>');
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// 🆕 Main Tool Runner (Handles both Text and Real Images)
async function runAiTool(input, tool) {
  if (!hasUsageRemaining()) { showToast("Limit khatam! Pro lein.", "error"); return; }
  const btn = document.getElementById("toolGenerateBtn"), resBox = document.getElementById("toolResult"), resAct = document.getElementById("toolResultActions");
  const orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Thinking...'; 
  resBox.style.display="none"; resAct.style.display="none";
  // Hide previous image if any
  const imgBox = document.getElementById("generatedImageBox"); if(imgBox) imgBox.style.display="none";

  try {
    const payload = { tool, input, language: document.getElementById("languageSelect")?.value || "auto" };
    if(tool==="writing") { payload.writingType = document.getElementById("writingTypeSelect")?.value; payload.tone = document.getElementById("toneSelect")?.value; }
    if(tool==="translate") { payload.fromLanguage = document.getElementById("fromLanguageSelect")?.value; payload.toLanguage = document.getElementById("toLanguageSelect")?.value; }
    if(tool==="code") { payload.codeLang = document.getElementById("codeLangSelect")?.value; }
    if(tool==="logo") { payload.logoStyle = document.getElementById("logoStyleSelect")?.value; }
    if(tool==="social") { payload.platform = document.getElementById("platformSelect")?.value; }
    if(tool==="ai-image") { payload.style = document.getElementById("imageStyleSelect")?.value; } // 🆕
    lastToolPayload = payload;
    
    // 🆕 Handle Real Image Generation
    if (tool === "ai-image") {
      const res = await fetch("/api/generate-image", { method:"POST", headers:{"Content-Type":"application/json","X-User-ID":localStorage.getItem('uid')||'anon',"X-User-Plan":isProUser?"pro":"free"}, body:JSON.stringify({ prompt: input, style: payload.style }) });
      const data = await res.json();
      if(!res.ok||!data.success||!data.image) throw new Error(data?.error || "Image generate nahi hui.");
      if(!isProUser) incrementUsage();
      
      // Show Image
      const imgEl = document.getElementById("generatedImage");
      imgEl.src = data.image;
      imgBox.style.display="block";
      currentToolResult = "Image Generated Successfully";
      resAct.style.display="flex";
      return; // Exit here as we don't need text box for images
    }

    // Standard Text Tools
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

const TH_KEY="ideaforge_tool_history"; function getTH(){ try{return JSON.parse(localStorage.getItem(TH_KEY))||[];}catch(e){return[];} }
function saveToTH(t,i,r){ let l=getTH(); l.unshift({tool:t,input:i,result:r,label:(TOOL_TITLES[t]||t)+": "+i.slice(0,50),savedAt:Date.now()}); while(l.length>15)l.pop(); localStorage.setItem(TH_KEY,JSON.stringify(l)); renderTH(); }
function renderTH(){ const l=getTH(),s=document.getElementById("toolHistorySection"),r=document.getElementById("toolHistoryRow"); if(!s||!r)return; if(l.length===0){s.style.display="none";return;} r.innerHTML=""; l.forEach(i=>{const b=document.createElement("button");b.type="button";b.className="historyItem";b.textContent=i.label;b.onclick=()=>{openToolWorkspace(i.tool);document.getElementById("toolInput").value=i.input;currentToolResult=i.result;document.getElementById("toolResult").innerHTML=formatToolResult(i.result, i.tool);document.getElementById("toolResult").style.display="block";};r.appendChild(b);}); s.style.display="block"; }

const UI_STRINGS = { en: { tagline: "AI Tools for Everyone", askAiBtn: "➤ Ask AI" }, hi: { tagline: "सबके लिए AI टूल्स", askAiBtn: "➤ AI से पूछें" } }; 
function applyUILanguage(lang) { const d = UI_STRINGS[lang]||UI_STRINGS.en; document.querySelectorAll("[data-i18n]").forEach(el => { const k=el.getAttribute("data-i18n"); if(d[k]) el.textContent=d[k]; }); localStorage.setItem("ideaforge_ui_lang", lang); }

function startVoiceInput(targetId, btn) { const S = window.SpeechRecognition||window.webkitSpeechRecognition; if(!S){showToast("Voice support nahi hai.","error");return;} const r=new S(); r.lang="hi-IN"; btn.classList.add("listening"); r.onresult=e=>{document.getElementById(targetId).value += e.results[0][0].transcript;}; r.onend=()=>btn.classList.remove("listening"); try{r.start();}catch(e){btn.classList.remove("listening");} }

document.addEventListener("DOMContentLoaded", () => {
  isProUser = localStorage.getItem('ideaforge_pro') === 'true'; 
  if(!localStorage.getItem('uid')) localStorage.setItem('uid', 'user_'+Math.random().toString(36).substr(2,9));
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
  document.getElementById("hubMicBtn")?.addEventListener("click", function(){ startVoiceInput("hubInput", this); });
  document.getElementById("toolMicBtn")?.addEventListener("click", function(){ startVoiceInput("toolInput", this); });
  
  document.querySelectorAll(".hubChip").forEach(chip => {
    chip.addEventListener("click", () => {
      const t = chip.getAttribute("data-tool"); if(t) openToolWorkspace(t);
      const s = chip.getAttribute("data-scroll"); if(s) document.getElementById(s)?.scrollIntoView({behavior:"smooth"});
    });
  });
});
