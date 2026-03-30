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

function toggleTheme() {
  document.body.classList.toggle("light-theme");
}

document.addEventListener("fullscreenchange", syncFullscreenUI);

document.addEventListener("DOMContentLoaded", () => {
  syncFullscreenUI();

  document.querySelectorAll("[data-fullscreen]").forEach((button) => {
    button.addEventListener("click", toggleFullscreen);
  });

  const ladyBtn = document.getElementById("ladyBtn");
  const ladyPanel = document.getElementById("ladyPanel");
  const ladyClose = document.getElementById("ladyClose");
  const ladyExpandToggle = document.getElementById("ladyExpandToggle");
  const ladyRefreshMetrics = document.getElementById("ladyRefreshMetrics");
  const ladyToggleTheme = document.getElementById("ladyToggleTheme");

  const panelModeStorageKey = "lady-panel-mode";

  function setPanelExpanded(isExpanded) {
    if (!ladyPanel) return;

    ladyPanel.classList.toggle("expanded", isExpanded);

    if (ladyExpandToggle) {
      ladyExpandToggle.textContent = isExpanded ? "Minimize" : "Expand";
      ladyExpandToggle.setAttribute("aria-label", isExpanded ? "Minimize Lady panel" : "Expand Lady panel");
      ladyExpandToggle.setAttribute("aria-pressed", isExpanded ? "true" : "false");
      ladyExpandToggle.title = isExpanded ? "Minimize" : "Expand";
    }

    try {
      window.localStorage.setItem(panelModeStorageKey, isExpanded ? "expanded" : "minimized");
    } catch (err) {
      console.debug("Unable to store Lady panel mode:", err);
    }
  }

  function setPanelOpen(isOpen) {
    if (!ladyPanel) return;

    ladyPanel.classList.toggle("hidden", !isOpen);
    ladyPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");

    if (ladyBtn) {
      ladyBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  }

  if (ladyPanel) {
    const savedMode = window.localStorage.getItem(panelModeStorageKey);
    setPanelExpanded(savedMode === "expanded");
  }

  if (ladyBtn && ladyPanel) {
    ladyBtn.addEventListener("click", () => {
      const shouldOpen = ladyPanel.classList.contains("hidden");
      setPanelOpen(shouldOpen);
    });
  }

  if (ladyClose && ladyPanel) {
    ladyClose.addEventListener("click", () => {
      setPanelOpen(false);
    });
  }

  if (ladyExpandToggle && ladyPanel) {
    ladyExpandToggle.addEventListener("click", () => {
      const isExpanded = ladyPanel.classList.contains("expanded");
      setPanelExpanded(!isExpanded);
    });
  }

  if (ladyPanel) {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || ladyPanel.classList.contains("hidden")) return;

      if (ladyPanel.classList.contains("expanded")) {
        setPanelExpanded(false);
        return;
      }

      setPanelOpen(false);
    });
  }

  if (ladyRefreshMetrics) {
    ladyRefreshMetrics.addEventListener("click", () => {
      if (typeof window.fetchMetrics === "function") {
        window.fetchMetrics();
      }
    });
  }

  if (ladyToggleTheme) {
    ladyToggleTheme.addEventListener("click", toggleTheme);
  }
});

window.toggleFullscreen = toggleFullscreen;
window.toggleTheme = toggleTheme;
