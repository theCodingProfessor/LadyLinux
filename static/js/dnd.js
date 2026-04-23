/* =====================================================
   LADY LINUX - DRAG AND DROP
   Handles all SortableJS-based reordering:
     - Index dashboard widget sections
     - System Control Center tab bar
   Depends on: SortableJS (loaded before this script)
   ===================================================== */

/* ── Dashboard Widget Order (index.html) ──────────────── */
(function initDashboardDnD() {
  const STORAGE_KEY = "lady-dashboard-order";
  const container = document.getElementById("dashboard-sortable");
  if (!container || typeof Sortable === "undefined") return;

  // Restore saved widget order before first paint
  function restoreOrder() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const order = JSON.parse(saved);
      order.forEach((widgetId) => {
        const el = container.querySelector(`[data-widget-id="${widgetId}"]`);
        if (el) container.appendChild(el);
      });
    } catch (e) {
      console.warn("DnD: could not restore dashboard order", e);
    }
  }

  restoreOrder();

  Sortable.create(container, {
    animation: 180,
    handle: ".ll-drag-handle",
    ghostClass: "ll-drag-ghost",
    chosenClass: "ll-drag-chosen",
    dragClass: "ll-dragging",
    onEnd() {
      const order = [...container.querySelectorAll("[data-widget-id]")]
        .map((el) => el.getAttribute("data-widget-id"));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    },
  });
})();

/* ── System Tab Order (os.html) ───────────────────────── */
(function initSystemTabsDnD() {
  const STORAGE_KEY = "lady-system-tabs-order";
  const tabList = document.getElementById("systemTabs");
  if (!tabList || typeof Sortable === "undefined") return;

  // Restore saved tab order — moves <li> elements, Bootstrap wiring
  // stays intact because data-bs-target travels with the button
  function restoreTabOrder() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const order = JSON.parse(saved);
      order.forEach((tabId) => {
        const li = tabList.querySelector(`[data-tab-id="${tabId}"]`);
        if (li) tabList.appendChild(li);
      });
    } catch (e) {
      console.warn("DnD: could not restore tab order", e);
    }
  }

  restoreTabOrder();

  Sortable.create(tabList, {
    animation: 150,
    ghostClass: "ll-tab-drag-ghost",
    chosenClass: "ll-tab-drag-chosen",
    filter: ".nav-link",
    preventOnFilter: false,
    onEnd() {
      const order = [...tabList.querySelectorAll("[data-tab-id]")]
        .map((li) => li.getAttribute("data-tab-id"));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    },
  });
})();

/* ── Metric Card Order (os.html > System Metrics pane) ── */
(function initMetricCardsDnD() {
  const STORAGE_KEY = "lady-metric-cards-order";
  const grid = document.querySelector(".ll-os-metric-grid");
  if (!grid || typeof Sortable === "undefined") return;

  // Restore saved card order before metrics data loads into them.
  // Cards are direct children of the grid — safe to reorder by appending.
  function restoreOrder() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const order = JSON.parse(saved);
      order.forEach((metricId) => {
        const el = grid.querySelector(`[data-metric-id="${metricId}"]`);
        if (el) grid.appendChild(el);
      });
    } catch (e) {
      console.warn("DnD: could not restore metric card order", e);
    }
  }

  restoreOrder();

  Sortable.create(grid, {
    animation: 180,
    handle: ".ll-metric-drag-handle",
    ghostClass: "ll-drag-ghost",
    chosenClass: "ll-drag-chosen",
    dragClass: "ll-dragging",
    onEnd() {
      const order = [...grid.querySelectorAll("[data-metric-id]")]
        .map((el) => el.getAttribute("data-metric-id"));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    },
  });
})();
