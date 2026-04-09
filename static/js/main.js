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
let currentServiceFilter = "relevant";

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

// Suppressed services — known false-positive failures, boot artifacts, LiveCD
// remnants that are always dead and carry no operational meaning.
const SERVICE_SUPPRESS_LIST = new Set([
  "casper", "casper-md5check", "oem-config", "cloud-init-local",
  "plymouth-start", "plymouth-quit", "plymouth-quit-wait",
  "plymouth-read-write", "plymouth-halt", "plymouth-poweroff",
  "plymouth-reboot", "plymouth-switch-root",
  "initrd-cleanup", "initrd-parse-etc", "initrd-switch-root",
  "initrd-udevadm-cleanup-db",
  "systemd-pcrphase", "systemd-pcrphase-initrd", "systemd-pcrphase-sysinit",
  "systemd-pcrmachine", "systemd-hibernate", "systemd-hibernate-resume",
  "systemd-hybrid-sleep", "systemd-suspend", "systemd-suspend-then-hibernate",
  "systemd-soft-reboot", "systemd-reboot", "systemd-halt", "systemd-poweroff",
  "systemd-bsod", "systemd-firstboot", "systemd-battery-check",
  "rescue", "emergency",
]);

// Relevant: services a sysadmin actually cares about on this machine.
function isRelevantService(service) {
  const name = String(service?.name || "").toLowerCase();

  if (SERVICE_SUPPRESS_LIST.has(name)) return false;

  // Lady Linux own stack
  if (name.startsWith("ladylinux-")) return true;

  // AI / infra
  if (["ollama", "docker", "postgres", "redis", "nginx",
       "ssh", "sshd"].includes(name)) return true;

  // Networking
  if (["networkmanager", "wpa_supplicant", "systemd-resolved",
       "systemd-networkd", "networkd-dispatcher",
       "openvpn", "wireguard"].includes(name)) return true;

  // Security / firewall
  if (["ufw", "apparmor", "auditd", "polkit", "fail2ban"].includes(name)) return true;

  // Core system services
  if (["cron", "rsyslog", "systemd-journald", "systemd-logind",
       "systemd-timesyncd", "systemd-udevd", "dbus",
       "irqbalance", "fwupd"].includes(name)) return true;

  // Display / session
  if (["lightdm", "gdm", "sddm", "user@1000",
       "getty@tty1"].includes(name)) return true;

  // Hardware / power / storage
  if (["udisks2", "upower", "bluetooth", "cups",
       "cups-browsed", "thermald", "tlp"].includes(name)) return true;

  // VM tools (relevant since Lady Linux runs in VMware)
  if (["open-vm-tools", "vgauth"].includes(name)) return true;

  return false;
}

// Active: only services currently running — useful for quick health checks.
function isActiveService(service) {
  return String(service?.status || "").toLowerCase() === "running";
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
  if (currentServiceFilter === "all") return rows;
  if (currentServiceFilter === "active") return rows.filter(isActiveService);
  if (currentServiceFilter === "relevant") return rows.filter(isRelevantService);
  // fallback
  return rows.filter(isRelevantService);
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
window.loadServices = loadServices;

/* =====================================================
   PROCESSES TAB
   Client-side sort + filter on top of the /api/system/processes payload.
   No backend changes — all logic operates on currentProcessData in memory.
   ===================================================== */

let currentProcessData = [];
let processSortKey = "cpu";
let processSortDir = "desc";
let processUserFilter = "all";
let processStatusFilter = "all";
let processHideKernel = false;

const KERNEL_PREFIXES = [
  "kworker", "kthread", "ksoftirqd", "migration", "rcu_", "watchdog",
  "pool_workqueue", "irq/", "kswapd", "khugepaged", "kcompactd",
];
const PROTECTED_PIDS = new Set([1, 2]);
const PROTECTED_NAMES = new Set(["systemd", "init", "kthreadd"]);

function isKernelThread(name) {
  const n = (name || "").toLowerCase();
  return KERNEL_PREFIXES.some((p) => n.startsWith(p));
}

async function loadProcesses() {
  if (getCurrentPageKey() !== "system") return;

  const tbody = document.querySelector("#processes-table-body");
  if (!tbody) return;

  try {
    const res = await fetch("/api/system/processes");
    if (!res.ok) throw new Error(`Processes API failed (${res.status})`);

    const data = await res.json();
    currentProcessData = data.processes || [];
    renderProcessTable();
  } catch (err) {
    console.error("loadProcesses:", err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Unable to load processes.</td></tr>';
    currentProcessData = [];
  }
}

function getFilteredProcesses() {
  return currentProcessData.filter((p) => {
    if (processHideKernel && isKernelThread(p.name)) return false;

    if (processUserFilter === "user" && p.user === "root") return false;
    if (processUserFilter === "root" && p.user !== "root") return false;

    if (processStatusFilter !== "all") {
      const status = (p.status || "").toLowerCase();
      if (status !== processStatusFilter) return false;
    }

    const query = (document.getElementById("process-search")?.value || "").toLowerCase();
    if (query && !(p.name || "").toLowerCase().includes(query)) return false;

    return true;
  });
}

function getSortedProcesses(rows) {
  return [...rows].sort((a, b) => {
    let result = 0;

    if (processSortKey === "pid") {
      result = (a.pid || 0) - (b.pid || 0);
    } else if (processSortKey === "name") {
      result = String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    } else if (processSortKey === "user") {
      result = String(a.user || "").localeCompare(String(b.user || ""), undefined, { sensitivity: "base" });
    } else if (processSortKey === "status") {
      result = String(a.status || "").localeCompare(String(b.status || ""), undefined, { sensitivity: "base" });
    } else if (processSortKey === "cpu") {
      result = (a.cpu || 0) - (b.cpu || 0);
    } else if (processSortKey === "mem") {
      result = (a.mem || 0) - (b.mem || 0);
    }

    return processSortDir === "desc" ? result * -1 : result;
  });
}

function renderProcessTable() {
  const tbody = document.querySelector("#processes-table-body");
  if (!tbody) return;

  const filtered = getFilteredProcesses();
  const sorted = getSortedProcesses(filtered);

  updateProcessSortIndicators();

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No processes match the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map((p) => {
  // Determine if this process is protected before building the row
  const isProtected = PROTECTED_PIDS.has(p.pid) || PROTECTED_NAMES.has(p.name);

  // Build kill button separately to avoid nested template literal conflicts
  const killBtn = isProtected
    ? `<button class="btn btn-sm btn-outline-danger" disabled title="Protected system process" type="button">Kill</button>`
    : `<button class="btn btn-sm btn-outline-danger" onclick="killProcess('${String(p.name).replace(/'/g, "\\'")}')" title="Kill ${p.name}" type="button">Kill</button>`;

  return `
    <tr>
      <td class="text-muted">${p.pid}</td>
      <td>${p.name}</td>
      <td class="text-muted">${p.user}</td>
      <td>${p.status}</td>
      <td>${p.cpu}%</td>
      <td>${p.mem}%</td>
      <td>${killBtn}</td>
    </tr>
  `;
}).join("");
}

function updateProcessSortIndicators() {
  document.querySelectorAll("[data-process-sort]").forEach((btn) => {
    const key = btn.getAttribute("data-process-sort");
    const icon = btn.querySelector("[data-sort-icon]");
    const header = btn.closest("th");
    const isActive = key === processSortKey;

    btn.classList.toggle("is-active", isActive);
    btn.setAttribute(
      "aria-label",
      isActive
        ? `Sorted by ${key} ${processSortDir}. Click to reverse.`
        : `Sort by ${key}.`
    );

    if (header) {
      header.setAttribute(
        "aria-sort",
        isActive ? (processSortDir === "asc" ? "ascending" : "descending") : "none"
      );
    }

    if (icon) {
      icon.className = `bi ${
        !isActive ? "bi-arrow-down-up" :
        processSortDir === "asc" ? "bi-caret-up-fill" : "bi-caret-down-fill"
      } ll-sort-icon`;
    }
  });
}

function initProcessControls() {
  document.querySelectorAll("[data-process-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-process-sort");
      if (processSortKey === key) {
        processSortDir = processSortDir === "asc" ? "desc" : "asc";
      } else {
        processSortKey = key;
        processSortDir = (key === "cpu" || key === "mem") ? "desc" : "asc";
      }
      renderProcessTable();
    });
  });

  document.querySelectorAll("[data-process-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      processUserFilter = btn.getAttribute("data-process-user");
      document.querySelectorAll("[data-process-user]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      renderProcessTable();
    });
  });

  const statusSelect = document.getElementById("process-status-filter");
  if (statusSelect) {
    statusSelect.addEventListener("change", () => {
      processStatusFilter = statusSelect.value;
      renderProcessTable();
    });
  }

  const kernelToggle = document.getElementById("process-hide-kernel");
  if (kernelToggle) {
    kernelToggle.addEventListener("change", () => {
      processHideKernel = kernelToggle.checked;
      renderProcessTable();
    });
  }

  document.getElementById("process-search")?.addEventListener("input", () => {
    renderProcessTable();
  });
}

async function killProcess(name) {
  if (PROTECTED_NAMES.has(name)) {
    console.warn("killProcess: refusing to kill protected process", name);
    return;
  }

  if (!name || !confirm(`Kill process "${name}"?`)) return;

  try {
    const res = await fetch(
      `/api/system/process/${encodeURIComponent(name)}/kill`,
      { method: "POST" }
    );
    const data = await res.json();
    console.log("killProcess:", data.message);
  } catch (err) {
    console.error("killProcess failed:", err);
  }

  await loadProcesses();
}

window.loadProcesses = loadProcesses;
window.killProcess = killProcess;

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

  // Poll processes only while the tab is visible — avoids 300-process fetches
  // on every interval when the user is on a different tab.
  let _processPoller = null;

  function startProcessPolling() {
    // Load immediately on tab show, then every 5s while active
    loadProcesses();
    if (!_processPoller) {
      _processPoller = setInterval(loadProcesses, 5000);
    }
  }

  function stopProcessPolling() {
    // Clear interval when user leaves the tab — no wasted fetches
    if (_processPoller) {
      clearInterval(_processPoller);
      _processPoller = null;
    }
  }

  const processesTabTrigger = document.getElementById("processes-tab");
  if (processesTabTrigger) {
    // Start polling when tab becomes active
    processesTabTrigger.addEventListener("shown.bs.tab", startProcessPolling);

    // Stop polling when user switches away
    processesTabTrigger.addEventListener("hide.bs.tab", stopProcessPolling);

    // If processes tab is the default active tab on page load, start immediately
    if (processesTabTrigger.classList.contains("active")) {
      startProcessPolling();
    }
  }

  initProcessControls();

  setInterval(() => {
    updateThemeIndicator();
  }, 5000);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}


/* =====================================================
   THEME EVENT LISTENER
   Applies theme variables from backend theme events
   ===================================================== */

window.applyThemeCssVars = applyThemeCssVars;
