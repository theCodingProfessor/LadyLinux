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
  const ladyRefreshMetrics = document.getElementById("ladyRefreshMetrics");
  const ladyToggleTheme = document.getElementById("ladyToggleTheme");

  if (ladyBtn && ladyPanel) {
    ladyBtn.addEventListener("click", () => {
      const isHidden = ladyPanel.classList.toggle("hidden");
      ladyPanel.setAttribute("aria-hidden", isHidden ? "true" : "false");
    });
  }

  if (ladyClose && ladyPanel) {
    ladyClose.addEventListener("click", () => {
      ladyPanel.classList.add("hidden");
      ladyPanel.setAttribute("aria-hidden", "true");
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
