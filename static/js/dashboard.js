import { subscribe } from "./ui_event_bus.js";

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "N/A";
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "N/A";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }

  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function formatLoadAvg(loadArr) {
  if (!Array.isArray(loadArr) || !loadArr.length) return "N/A";

  return (
    loadArr
      .map(Number)
      .filter(Number.isFinite)
      .map((value) => value.toFixed(2))
      .join(" / ") || "N/A"
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setBar(barId, percent) {
  const bar = document.getElementById(barId);
  if (!bar) return;

  const width = Number.isFinite(percent) ? Math.round(percent) : 0;
  bar.style.width = `${width}%`;
  bar.setAttribute("aria-valuenow", String(width));

  const wrapper = bar.closest(".progress");
  if (wrapper) wrapper.setAttribute("aria-valuenow", String(width));
}

function renderDashboardMetrics(metrics) {
  if (document.body?.getAttribute("data-page") !== "index") return;

  setText("cpuLoad", `Load ${formatLoadAvg(metrics.load_avg)}`);
  setText("cpuMeta", `${formatPercent(metrics.cpu_load)} utilization`);
  setBar("cpuProgress", metrics.cpu_load);

  setText(
    "memoryUsage",
    `${formatBytes(metrics.memory_used)} / ${formatBytes(metrics.memory_total)}`
  );
  setText("memoryMeta", `${formatPercent(metrics.memory_usage)} utilized`);
  setBar("memoryProgress", metrics.memory_usage);

  const diskFree = Number(metrics.disk_total) - Number(metrics.disk_used);
  setText(
    "diskUsage",
    `${formatBytes(metrics.disk_used)} / ${formatBytes(metrics.disk_total)}`
  );
  setText(
    "diskMeta",
    `${formatPercent(metrics.disk_usage)} used | ${formatBytes(diskFree)} free`
  );
  setBar("diskProgress", metrics.disk_usage);
}

subscribe("metrics:update", renderDashboardMetrics);
