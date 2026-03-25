/*
-------------------------------------------------------
Lady Linux - Shared System Metrics Engine
-------------------------------------------------------

Single polling service used by all UI pages.

Responsibilities:
- Poll backend metrics endpoint
- Cache latest metrics payload
- Emit updates through UI event bus
- Prevent duplicate pollers
*/

import { emit } from "./ui_event_bus.js";

const METRICS_ENDPOINT = "/api/system/metrics";
const POLL_INTERVAL = 3000;

function normalizeMetrics(data) {
  const cpu = data?.cpu || {};
  const memory = data?.memory || {};
  const disk = data?.disk || {};
  const network = data?.network || {};
  const system = data?.system || {};

  return {
    ...data,
    cpu_load: Number(cpu.percent),
    memory_used: Number(memory.used),
    memory_total: Number(memory.total),
    memory_usage: Number(memory.percent),
    disk_used: Number(disk.used),
    disk_total: Number(disk.total),
    disk_usage: Number(disk.percent),
    network_rx: Number(network.total_recv),
    network_tx: Number(network.total_sent),
    network_download_speed: Number(network.download_speed),
    network_upload_speed: Number(network.upload_speed),
    process_count: Number(data?.processes),
    uptime: Number(system.uptime),
    platform: system.platform,
    arch: system.arch,
    load_avg: [cpu?.load?.["1m"], cpu?.load?.["5m"], cpu?.load?.["15m"]].map((value) => Number(value)),
  };
}

if (!window.__LL_METRICS_ENGINE) {
  window.__LL_METRICS_ENGINE = {
    running: false,
    cache: null,
    intervalId: null,
  };

  async function pollMetrics() {
    try {
      const response = await fetch(METRICS_ENDPOINT, { cache: "no-store" });
      if (!response.ok) return;

      const data = await response.json();
      const normalized = normalizeMetrics(data);
      window.__LL_METRICS_ENGINE.cache = normalized;
      emit("metrics:update", normalized);
    } catch (error) {
      console.warn("Metrics poll failed", error);
    }
  }

  window.fetchMetrics = pollMetrics;

  function startEngine() {
    if (window.__LL_METRICS_ENGINE.running) return;

    window.__LL_METRICS_ENGINE.running = true;
    pollMetrics();
    window.__LL_METRICS_ENGINE.intervalId = window.setInterval(pollMetrics, POLL_INTERVAL);
  }

  startEngine();
}

export function getLatestMetrics() {
  return window.__LL_METRICS_ENGINE?.cache ?? null;
}
