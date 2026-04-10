function toggleFullscreen() {
  const doc = document.documentElement;

  if (!document.fullscreenElement) {
    doc.requestFullscreen().catch((err) => {
      console.error("Fullscreen error:", err);
    });
  } else {
    document.exitFullscreen?.();
  }
}

function syncFullscreenUI() {
  const isFull = Boolean(document.fullscreenElement);

  document.querySelectorAll("[data-fullscreen]").forEach((button) => {
    const mode = button.getAttribute("data-fullscreen-label");
    button.textContent = mode === "text" ? (isFull ? "Exit Fullscreen" : "Fullscreen") : (isFull ? "Exit" : "FS");
    button.title = isFull ? "Exit Fullscreen" : "Fullscreen";
  });
}


document.addEventListener("fullscreenchange", syncFullscreenUI);

document.addEventListener("DOMContentLoaded", () => {
  syncFullscreenUI();

  document.querySelectorAll("[data-fullscreen]").forEach((button) => {
    button.addEventListener("click", toggleFullscreen);
  });

  // Radial menu state
  const radialRoot     = document.getElementById("ladyRadialRoot");
  const ladyBtn        = document.getElementById("ladyBtn");
  const ladyPanel      = document.getElementById("ladyPanel");
  const ladyClose      = document.getElementById("ladyClose");
  const ladySpokePanel = document.getElementById("ladySpokePanel");

  // Toggle radial open/close on hub click
  if (ladyBtn && radialRoot) {
    ladyBtn.addEventListener("click", () => {
      const isOpen = radialRoot.classList.toggle("is-open");
      ladyBtn.classList.toggle("is-open", isOpen);

      // If closing radial, also close panel
      if (!isOpen && ladyPanel) {
        ladyPanel.classList.add("hidden");
        ladyPanel.setAttribute("aria-hidden", "true");
      }
    });
  }

  // Panel spoke opens the chat panel without closing radial
  if (ladySpokePanel && ladyPanel) {
    ladySpokePanel.addEventListener("click", () => {
      const isHidden = ladyPanel.classList.toggle("hidden");
      ladyPanel.setAttribute("aria-hidden", String(isHidden));
    });
  }

  // Close button collapses panel only, leaves radial open
  if (ladyClose && ladyPanel) {
    ladyClose.addEventListener("click", () => {
      ladyPanel.classList.add("hidden");
      ladyPanel.setAttribute("aria-hidden", "true");
    });
  }

  // Metrics spoke
  const ladySpokeMetrics = document.getElementById("ladySpokeMetrics");
  if (ladySpokeMetrics) {
    ladySpokeMetrics.addEventListener("click", () => {
      if (typeof window.fetchMetrics === "function") window.fetchMetrics();
    });
  }

  // Theme spoke — calls shared handleThemeToggle from nav_controls.js
  const ladySpokeTheme = document.getElementById("ladySpokeTheme");
  if (ladySpokeTheme) {
    ladySpokeTheme.addEventListener("click", () => {
      if (typeof window.handleThemeToggle === "function") {
        window.handleThemeToggle();
      } else {
        document.getElementById("navThemeToggle")?.click();
      }
    });
  }

  // Close radial when clicking outside both the root and the panel
  document.addEventListener("click", (e) => {
    if (
      radialRoot &&
      ladyPanel &&
      !radialRoot.contains(e.target) &&
      !ladyPanel.contains(e.target)
    ) {
      radialRoot.classList.remove("is-open");
      ladyBtn?.classList.remove("is-open");
    }
  });
});

window.toggleFullscreen = toggleFullscreen;

// ── Context Nav Collapse Toggle ──────────────────────────────
(function initContextNavCollapse() {
  const STORAGE_KEY = "lady-context-nav-collapsed";
  const btn = document.getElementById("contextNavToggle");
  const links = document.getElementById("contextNavLinks");
  if (!btn || !links) return;

  // Restore saved state
  if (localStorage.getItem(STORAGE_KEY) === "true") {
    links.classList.add("context-nav-collapsed");
    btn.classList.add("context-nav-is-collapsed");
  }

  btn.addEventListener("click", () => {
    const isNowCollapsed = links.classList.toggle("context-nav-collapsed");
    btn.classList.toggle("context-nav-is-collapsed", isNowCollapsed);
    localStorage.setItem(STORAGE_KEY, String(isNowCollapsed));
  });
})();
