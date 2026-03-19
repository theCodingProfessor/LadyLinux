/* =====================================================
   LADY LINUX - MAIN CONTROLLER
   ===================================================== */

document.documentElement.setAttribute("data-ui-ready", "false");

function getCurrentPageKey() {
  return document.body.getAttribute("data-page") || "index";
}

function updateOverviewStatus(key, value) {
  const target = document.querySelector(`[data-status-key="${key}"]`);
  if (target) {
    target.textContent = value;
  }
}

// Preserve the active services sort across live table refreshes.
let currentServicesData = [];
let currentSortKey = "service";
let currentSortDirection = "asc";
let currentServiceFilter = "managed";

const STATUS_SORT_PRIORITY = {
  running: 0,
  exited: 1,
  dead: 2,
  failed: 3,
  unknown: 4,
};

/*
---------------------------------------------------------
Track whether the periodic telemetry refresh has started.
This avoids creating duplicate timers during re-initialization.
---------------------------------------------------------
*/
/*
---------------------------------------------------------
Update the status cards on the Unified Control Surface.
---------------------------------------------------------
*/
function updateStatusUI(cpu, memory, disk, firewall, users, theme) {
  const cpuElement = document.getElementById("cpuLoad");
  const memoryElement = document.getElementById("memoryUsage");
  const diskElement = document.getElementById("diskUsage");
  const firewallElement = document.getElementById("firewallStatus");
  const usersElement = document.getElementById("activeUsers");
  const themeElement = document.getElementById("currentTheme");

  // Populate placeholders once telemetry is available.
  if (cpuElement && cpu != null) cpuElement.textContent = cpu;
  if (memoryElement && memory != null) memoryElement.textContent = memory;
  if (diskElement && disk != null) diskElement.textContent = disk;
  // Firewall is optional in the current layout; update only if the element exists.
  if (firewallElement && firewall != null) firewallElement.textContent = firewall;
  if (usersElement && users != null) usersElement.textContent = users;
  if (themeElement && theme != null) themeElement.textContent = theme;
}

/*
Load system telemetry from the backend and update non-metric overview values.
*/
async function loadSystemTelemetry() {
  // Metric cards now subscribe through static/js/system_metrics.js.
  // Keep this loader as a no-op for the current layout to avoid duplicate fetches.
  if (getCurrentPageKey() !== "index") return;

  try {
    const themeKey = localStorage.getItem("lady-theme");
    const themeValue = typeof window.getThemeLabel === "function"
      ? window.getThemeLabel(themeKey || "Default")
      : (themeKey || "Unknown");

    updateStatusUI(null, null, null, null, null, themeValue);
  } catch (error) {
    console.error("Failed to load system telemetry:", error);
  }
}

/**
 * Legacy alias to preserve existing call sites while telemetry loader was
 * renamed to loadSystemTelemetry().
 */
async function loadSystemStatus() {
  await loadSystemTelemetry();
}

/*
Fetches services from backend and populates the Services table.
This only runs on the System page to avoid touching other views.
*/
async function loadServices() {
  if (getCurrentPageKey() !== "system") return;

  const table = document.querySelector("#services-table-body");
  if (!table) return;

  try {
    const response = await fetch("/api/system/services");
    if (!response.ok) {
      throw new Error(`Services API failed (${response.status})`);
    }

    const data = await response.json();
    currentServicesData = normalizeServices(data.services || []);
    renderServiceTable(currentServicesData);

    // Broadcast normalized service state so other System page widgets can react
    // without introducing another fetch path or tight coupling to this module.
    if (window.eventBus && typeof window.eventBus.emit === "function") {
      window.eventBus.emit("services:update", currentServicesData);
    }
  } catch (error) {
    console.error("Failed to load services:", error);
    // Keep failure visible to users within the table region.
    table.innerHTML = '<tr><td colspan="4">Unable to load services.</td></tr>';
    currentServicesData = [];
    if (window.eventBus && typeof window.eventBus.emit === "function") {
      window.eventBus.emit("services:update", currentServicesData);
    }
  }
}

function normalizeServices(services) {
  return services.map((service, index) => ({
    ...service,
    // Keep a stable tiebreaker so repeated refreshes stay deterministic.
    originalIndex: index,
    uptime_seconds: Number.isFinite(Number(service.uptime_seconds)) ? Number(service.uptime_seconds) : null,
  }));
}

// Managed mode intentionally stays heuristic for now. It keeps the default
// view focused on Lady Linux and common app services without requiring a new
// backend classification model.
function isManagedService(service) {
  const name = String(service?.name || "").toLowerCase();
  const allowlist = ["ollama", "docker", "postgres", "redis", "nginx"];

  return name.startsWith("ladylinux-") || allowlist.some((entry) => name === entry || name.startsWith(`${entry}-`));
}

function formatServiceUptime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Status sort follows semantic service health order, not plain alphabetic text.
function getStatusRank(status) {
  const normalized = String(status || "unknown").trim().toLowerCase();
  return STATUS_SORT_PRIORITY[normalized] ?? STATUS_SORT_PRIORITY.unknown;
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

// Uptime sorts by numeric seconds. Missing values go last when ascending.
function compareServiceRows(a, b, sortKey, direction) {
  let result = 0;

  if (sortKey === "service") {
    result = compareText(a.name, b.name);
  } else if (sortKey === "status") {
    result = getStatusRank(a.status) - getStatusRank(b.status);
  } else if (sortKey === "uptime") {
    const aMissing = !Number.isFinite(a.uptime_seconds);
    const bMissing = !Number.isFinite(b.uptime_seconds);

    if (aMissing && bMissing) {
      result = 0;
    } else if (aMissing) {
      result = 1;
    } else if (bMissing) {
      result = -1;
    } else {
      result = a.uptime_seconds - b.uptime_seconds;
    }
  }

  if (result === 0) {
    result = a.originalIndex - b.originalIndex;
  }

  return direction === "desc" ? result * -1 : result;
}

function getSortedServices(rows) {
  return [...rows].sort((a, b) => compareServiceRows(a, b, currentSortKey, currentSortDirection));
}

function getVisibleServices(rows) {
  if (currentServiceFilter === "all") {
    return rows;
  }

  return rows.filter((service) => isManagedService(service));
}

function getSortIconClass(sortKey) {
  if (currentSortKey !== sortKey) return "bi-arrow-down-up";
  return currentSortDirection === "asc" ? "bi-caret-up-fill" : "bi-caret-down-fill";
}

function updateSortIndicators() {
  document.querySelectorAll("[data-services-sort]").forEach((button) => {
    const sortKey = button.getAttribute("data-services-sort");
    const header = button.closest("th");
    const icon = button.querySelector("[data-sort-icon]");
    const isActive = sortKey === currentSortKey;

    if (header) {
      header.setAttribute("aria-sort", isActive ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none");
    }

    button.setAttribute(
      "aria-label",
      isActive
        ? `Sorted by ${sortKey} ${currentSortDirection}. Activate to sort ${currentSortDirection === "asc" ? "descending" : "ascending"}.`
        : `Sort by ${sortKey} ascending.`
    );
    button.classList.toggle("is-active", isActive);

    if (icon) {
      icon.className = `bi ${getSortIconClass(sortKey)} ll-sort-icon`;
      icon.setAttribute("aria-hidden", "true");
    }
  });
}

function renderServiceTable(rows) {
  const table = document.querySelector("#services-table-body");
  if (!table) return;

  const sortedRows = getSortedServices(getVisibleServices(rows));
  table.innerHTML = "";

  if (!sortedRows.length) {
    table.innerHTML = `<tr><td colspan="4">No ${currentServiceFilter} services match the current view.</td></tr>`;
    updateSortIndicators();
    updateServiceFilterButtons();
    return;
  }

  sortedRows.forEach((service) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${service.name}</td>
      <td>${service.status || "unknown"}</td>
      <td>${formatServiceUptime(service.uptime_seconds)}</td>
      <td>
        <button class="btn btn-sm btn-outline-secondary"
                onclick="restartService('${service.name}')"
                type="button">
          Restart
        </button>
      </td>
    `;
    table.appendChild(row);
  });

  updateSortIndicators();
  updateServiceFilterButtons();
}

function toggleServicesSort(sortKey) {
  if (!sortKey) return;

  if (currentSortKey === sortKey) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortKey = sortKey;
    currentSortDirection = "asc";
  }

  renderServiceTable(currentServicesData);
}

function initServicesSorting() {
  document.querySelectorAll("[data-services-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleServicesSort(button.getAttribute("data-services-sort"));
    });
  });

  updateSortIndicators();
}

function updateServiceFilterButtons() {
  document.querySelectorAll("[data-service-filter]").forEach((button) => {
    const isActive = button.getAttribute("data-service-filter") === currentServiceFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setServiceFilter(nextFilter) {
  if (!nextFilter || currentServiceFilter === nextFilter) return;

  // Keep the filter sticky across live refreshes by storing it outside the
  // fetch cycle and always re-rendering from the full in-memory dataset.
  currentServiceFilter = nextFilter;
  renderServiceTable(currentServicesData);
}

function initServiceFilters() {
  document.querySelectorAll("[data-service-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      setServiceFilter(button.getAttribute("data-service-filter"));
    });
  });

  updateServiceFilterButtons();
}

/*
Triggers a service restart through backend endpoint and refreshes the table.
This helper is attached to window for inline button onclick support.
*/
async function restartService(name) {
  if (!name) return;

  try {
    await fetch(`/api/system/service/${encodeURIComponent(name)}/restart`, {
      method: "POST",
    });
  } catch (error) {
    console.error("Failed to restart service:", error);
  }

  await loadServices();
}

// Expose restartService globally because service rows call it via inline onclick.
window.restartService = restartService;

function updateThemeIndicator() {
  const themeEl = document.getElementById("currentTheme");
  if (!themeEl) return;

  const theme = localStorage.getItem("lady-theme") || "softcore";
  themeEl.textContent = theme === "soft" ? "softcore" : theme;
}

function applyThemeCssVars(cssVars) {
  Object.entries(cssVars || {}).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}

function syncOverviewFromDocument() {
  const themeKey = localStorage.getItem("lady-theme");
  const theme = typeof window.getThemeLabel === "function"
    ? window.getThemeLabel(themeKey || "Default")
    : (themeKey || "Default");

  // Theme changes are local UI state, so keep theme text synchronized.
  updateOverviewStatus("theme", theme);
}

function applyActionSummary(detail = {}) {
  if (detail.action === "appearance.set_theme") {
    syncOverviewFromDocument();
  }
}

function initAccordionPanels() {
  const triggers = document.querySelectorAll("[data-accordion-trigger]");
  if (!triggers.length) return;

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const targetId = trigger.getAttribute("data-accordion-target");
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      const shouldOpen = target.classList.contains("d-none");

      trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      const indicator = trigger.querySelector(".accordion-indicator");
      if (indicator) {
        indicator.innerHTML = shouldOpen ? "&#9660;" : "&#9654;";
      }

      target.classList.toggle("d-none", !shouldOpen);

      if (typeof window.logSystemActivity === "function") {
        const label = trigger.querySelector("span:last-child")?.textContent?.trim() || "Panel";
        window.logSystemActivity(`${label} ${target.classList.contains("d-none") ? "collapsed" : "expanded"}`);
      }
    });
  });
}

/**
 * Wire "You Can Ask" suggestion cards to the assistant input.
 *
 * Clicking a suggestion pre-fills the existing chat prompt field so users can
 * submit quickly without retyping common commands.
 */
function initAskSuggestions() {
  document.querySelectorAll(".ask-item").forEach((item) => {
    item.addEventListener("click", () => {
      const prompt = item.getAttribute("data-prompt") || "";
      const input = document.getElementById("ucsPrompt") || document.getElementById("prompt");

      if (input) {
        input.value = prompt;
        input.focus();
      }
    });
  });
}

async function initializeApp() {
  try {
    await initThemes();
    await loadNavigation();
    initAccordionPanels();
    initServiceFilters();
    initServicesSorting();
    initAskSuggestions();
    initChat();
    syncOverviewFromDocument();

    document.addEventListener("lady:overview-sync", syncOverviewFromDocument);
    document.addEventListener("lady:action-complete", (event) => {
      applyActionSummary(event.detail || {});
      syncOverviewFromDocument();
    });
    const handleThemeApplied = (e) => {
      const data = e.detail;

      if (!data) return;

      // support both formats
      const css = data.css || data.css_variables;

      if (css) {
        applyThemeCssVars(css);
      }

      const themeLabel = data.label || data.display_name || data.theme || "Custom";
      updateOverviewStatus("theme", themeLabel);
    };
    document.addEventListener("lady:theme-applied", handleThemeApplied);
    window.addEventListener("lady:theme-applied", handleThemeApplied);
  } catch (err) {
    console.error("Initialization error:", err);
  } finally {
    document.documentElement.setAttribute("data-ui-ready", "true");
  }
}

/*
---------------------------------------------------------
Run once the DOM is ready.
This ensures the page loads immediately and system data
loads asynchronously in the background.
---------------------------------------------------------
*/
window.addEventListener("DOMContentLoaded", () => {
  loadSystemTelemetry();
  loadServices();
  updateThemeIndicator();

  // Refresh service data whenever the Services tab becomes active.
  const servicesTabTrigger = document.getElementById("services-tab");
  if (servicesTabTrigger) {
    servicesTabTrigger.addEventListener("shown.bs.tab", () => {
      loadServices();
    });
  }

  setInterval(() => {
    updateThemeIndicator();
  }, 5000);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}

async function loadNavigation() {
  const response = await fetch("/static/nav.html");
  const navMarkup = await response.text();

  const container = document.getElementById("nav-container");
  if (!container) return;

  container.innerHTML = navMarkup;

  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  container.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    const normalizedHref = href.replace(/\/+$/, "") || "/";
    const isActive = normalizedHref === currentPath;

    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}


/* =====================================================
   THEME EVENT LISTENER
   Applies theme variables from backend theme events
   ===================================================== */

window.applyThemeCssVars = applyThemeCssVars;
