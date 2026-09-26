// ============================================================
// IdeaForge-AI - Dropdown Menu + Fullscreen Panel Behavior
// Loaded after app.js. Does not touch any existing function in
// app.js — it only watches the same elements app.js already
// shows/hides and wraps whichever one is visible in fullscreen
// mode, with a Back button to return home.
// ============================================================

"use strict";

(function () {
  const menuTriggerBtn = document.getElementById("menuTriggerBtn");
  const menuSheet = document.getElementById("menuSheet");

  if (!menuTriggerBtn || !menuSheet) return;

  function isMenuOpen() {
    return menuSheet.style.display === "block";
  }

  function openMenu() {
    menuSheet.style.display = "block";
    menuTriggerBtn.classList.add("open");
    menuTriggerBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menuSheet.style.display = "none";
    menuTriggerBtn.classList.remove("open");
    menuTriggerBtn.setAttribute("aria-expanded", "false");
  }

  menuTriggerBtn.addEventListener("click", () => {
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Any tap inside the menu (a tool, a free quick tool, the idea
  // analyzer entry) closes the dropdown shortly after — app.js's
  // own click handlers (already bound to these same elements) run
  // first and flip the relevant section's display, which the
  // MutationObserver below picks up.
  menuSheet.addEventListener("click", (event) => {
    if (event.target.closest(".menuItem")) {
      setTimeout(closeMenu, 50);
    }
  });

  // ----------------------------------------------------------
  // Fullscreen panel handling
  // ----------------------------------------------------------

  // Groups of elements that should appear fullscreen together.
  // fullscreenId: the element that gets position:fixed + the
  // Back bar. hideIds: everything that must be reset to
  // display:none when the panel is closed.
  const PANEL_GROUPS = [
    { triggerId: "ideaSection", fullscreenId: "panelIdea", hideIds: ["ideaSection", "reportSection"] },
    { triggerId: "toolWorkspace", fullscreenId: "toolWorkspace", hideIds: ["toolWorkspace"] },
    { triggerId: "imageToolWorkspace", fullscreenId: "imageToolWorkspace", hideIds: ["imageToolWorkspace"] },
    { triggerId: "documentWorkspace", fullscreenId: "documentWorkspace", hideIds: ["documentWorkspace"] },
    { triggerId: "projectsSection", fullscreenId: "projectsSection", hideIds: ["projectsSection"] }
  ];

  let activeGroup = null;
  let backBar = null;

  function isVisible(el) {
    return !!el && el.style.display !== "none" && el.offsetParent !== null;
  }

  function buildBackBar() {
    const bar = document.createElement("div");
    bar.className = "panelBackBar";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panelBackBtn";
    btn.textContent = "← Back";
    btn.addEventListener("click", closePanel);

    bar.appendChild(btn);
    return bar;
  }

  function openPanel(group) {
    if (activeGroup === group) return;
    if (activeGroup) closePanel();

    activeGroup = group;
    document.body.classList.add("panelOpen");

    const fsEl = document.getElementById(group.fullscreenId);
    if (fsEl) {
      fsEl.classList.add("panelFullscreen");
      backBar = buildBackBar();
      fsEl.prepend(backBar);
    }

    window.scrollTo(0, 0);
  }

  function closePanel() {
    if (!activeGroup) return;

    const fsEl = document.getElementById(activeGroup.fullscreenId);
    if (fsEl) fsEl.classList.remove("panelFullscreen");

    if (backBar) {
      backBar.remove();
      backBar = null;
    }

    activeGroup.hideIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

    document.body.classList.remove("panelOpen");
    activeGroup = null;
  }

  // Idea Analyzer has no chip of its own in app.js (it used to
  // just sit open on the page) — give it a dedicated open action.
  document.getElementById("openIdeaAnalyzerItem")?.addEventListener("click", () => {
    const ideaSectionEl = document.getElementById("ideaSection");
    if (ideaSectionEl) ideaSectionEl.style.display = "block";
    openPanel(PANEL_GROUPS[0]);
    closeMenu();
  });

  // Watch every trigger element app.js already toggles; whenever
  // one becomes visible, open its fullscreen panel automatically.
  const observer = new MutationObserver(() => {
    for (const group of PANEL_GROUPS) {
      const triggerEl = document.getElementById(group.triggerId);
      if (isVisible(triggerEl)) {
        if (activeGroup !== group) {
          openPanel(group);
          closeMenu();
        }
        return;
      }
    }
  });

  PANEL_GROUPS.forEach((group) => {
    const el = document.getElementById(group.triggerId);
    if (el) {
      observer.observe(el, { attributes: true, attributeFilter: ["style"] });
    }
  });

  // Idea Analyzer used to be always visible — hide it by default
  // now that it opens on demand from the menu.
  const ideaSectionEl = document.getElementById("ideaSection");
  if (ideaSectionEl) ideaSectionEl.style.display = "none";
})();
