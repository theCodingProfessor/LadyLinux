import { subscribe } from "./ui_event_bus.js";

function updateMetric(valueId, barId, percent) {
  const valueEl = document.getElementById(valueId);
  const barEl = document.getElementById(barId);

  if (!valueEl || !barEl) return;

  if (!Number.isFinite(percent)) {
    valueEl.textContent = "N/A";
    barEl.style.width = "0%";
    barEl.setAttribute("aria-valuenow", "0");
    return;
  }

  const rounded = Math.round(percent);
  valueEl.textContent = `${rounded}%`;
  barEl.style.width = `${rounded}%`;
  barEl.setAttribute("aria-valuenow", String(rounded));

  const wrapper = barEl.closest(".progress");
  if (wrapper) {
    wrapper.setAttribute("aria-valuenow", String(rounded));
  }
}

function renderDashboardMetrics(metrics) {
  if (document.body?.getAttribute("data-page") !== "index") return;

  updateMetric("cpuLoad", "cpuProgress", metrics.cpu_load);
  updateMetric("memoryUsage", "memoryProgress", metrics.memory_usage);
  updateMetric("diskUsage", "diskProgress", metrics.disk_usage);
}

subscribe("metrics:update", (metrics) => {
  renderDashboardMetrics(metrics);
});
