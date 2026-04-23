# JavaScript Consolidation Example: logs.js

This document shows the refactored `logs.js` module extracted from `templates/logs.html` inline script.

---

## File: `/static/js/logs.js`

```javascript
/*
════════════════════════════════════════════════════════════════════════════════
  Module: LOGS
  File: static/js/logs.js
  Template: templates/logs.html
  Description: Log viewer interface with multi-source support, search, and filtering
════════════════════════════════════════════════════════════════════════════════
*/

(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────────
     CONFIGURATION
     Centralized selectors, API endpoints, and constants
  ────────────────────────────────────────────────────────────────────────── */
  const CONFIG = {
    // API Endpoints
    API_JOURNAL: "/api/logs/journal",
    API_LADYLINUX: "/api/logs/ladylinux",
    API_FILES: "/api/logs/files",

    // DOM Selectors
    SELECTOR_OUTPUT: "#logOutput",
    SELECTOR_SEARCH: "#logSearch",
    SELECTOR_CLEAR_SEARCH: "#clearSearchBtn",
    SELECTOR_REFRESH: "#refreshBtn",
    SELECTOR_LINES: "#linesSelect",
    SELECTOR_AUTOSCROLL: "#autoScrollToggle",
    SELECTOR_COPY: "#copyBtn",
    SELECTOR_FILE_LIST: "#fileList",
    SELECTOR_SOURCE_LABEL: "#logSourceLabel",
    SELECTOR_LINE_COUNT: "#logLineCount",

    // CSS Classes
    CLASS_SOURCE_ITEM: ".source-item",
    CLASS_LOG_LINE: ".log-line",
    CLASS_LOG_ERROR: "log-error",
    CLASS_LOG_WARN: "log-warn",
    CLASS_LOG_INFO: "log-info",
    CLASS_HIDDEN: "ll-hidden",

    // Constants
    LINE_DEFAULTS: [50, 100, 200, 500],
  };

  /* ──────────────────────────────────────────────────────────────────────────
     STATE
     Mutable application state — single source of truth for UI state
  ────────────────────────────────────────────────────────────────────────── */
  const logsState = {
    currentSource: {
      type: "journal",   // "journal" | "ladylinux" | "file"
      param: "",         // optional param (unit name or file path)
      label: "Journal",  // display name
    },
    lines: [],           // current log lines
    filterText: "",      // current search filter
    isLoading: false,
  };

  /* ──────────────────────────────────────────────────────────────────────────
     HELPERS: Safe DOM access
  ────────────────────────────────────────────────────────────────────────── */
  function $(selector) {
    const el = document.getElementById(selector) || document.querySelector(selector);
    if (!el && selector.startsWith("#")) {
      console.warn(`DOM element not found: ${selector}`);
    }
    return el;
  }

  /* ──────────────────────────────────────────────────────────────────────────
     lineClass()
     Classify a raw log line into a CSS level class for styling.
     More specific patterns checked first (error > warn > info > default).
  ────────────────────────────────────────────────────────────────────────── */
  function lineClass(text) {
    if (/error|fail|critical|emerg|alert|crit/i.test(text)) {
      return CONFIG.CLASS_LOG_ERROR;
    }
    if (/warn|warning/i.test(text)) {
      return CONFIG.CLASS_LOG_WARN;
    }
    if (/\binfo\b/i.test(text)) {
      return CONFIG.CLASS_LOG_INFO;
    }
    return ""; // default styling
  }

  /* ──────────────────────────────────────────────────────────────────────────
     renderLines(lines)
     Render log lines in reverse order (newest first).
     Escape HTML, apply level classes, hide by filter.
  ────────────────────────────────────────────────────────────────────────── */
  function renderLines(lines) {
    const out = $(CONFIG.SELECTOR_OUTPUT);
    const filter = logsState.filterText.toLowerCase();

    if (!lines || lines.length === 0) {
      out.innerHTML = `<div class="log-empty">No log entries found.</div>`;
      updateCount();
      return;
    }

    // Reverse: API returns oldest first, we want newest at top
    const reversed = [...lines].reverse();

    // Build HTML — batch DOM manipulation for performance
    out.innerHTML = reversed.map(line => {
      const cls = lineClass(line);
      const hidden = filter && !line.toLowerCase().includes(filter) ? ` ${CONFIG.CLASS_HIDDEN}` : "";

      // Escape HTML entities to prevent XSS
      const safe = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      return `<div class="${CONFIG.CLASS_LOG_LINE}${cls ? " " + cls : ""}${hidden}">${safe}</div>`;
    }).join("");

    updateCount();

    // Auto-scroll: newest-first means scroll to top
    const autoScroll = $(CONFIG.SELECTOR_AUTOSCROLL);
    if (autoScroll && autoScroll.checked) {
      out.scrollTop = 0;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     updateCount()
     Update the line count badge showing visible / total lines.
  ────────────────────────────────────────────────────────────────────────── */
  function updateCount() {
    const all = document.querySelectorAll(`${CONFIG.SELECTOR_OUTPUT} ${CONFIG.CLASS_LOG_LINE}`).length;
    const visible = document.querySelectorAll(
      `${CONFIG.SELECTOR_OUTPUT} ${CONFIG.CLASS_LOG_LINE}:not(.${CONFIG.CLASS_HIDDEN})`
    ).length;

    const countEl = $(CONFIG.SELECTOR_LINE_COUNT);
    if (countEl) {
      countEl.textContent = `${visible} / ${all} lines`;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     loadSource()
     Fetch log data from the appropriate API based on currentSource.
  ────────────────────────────────────────────────────────────────────────── */
  async function loadSource() {
    const out = $(CONFIG.SELECTOR_OUTPUT);
    const linesSelect = $(CONFIG.SELECTOR_LINES);
    const lines = linesSelect ? linesSelect.value : 100;

    logsState.isLoading = true;
    out.innerHTML = `<div class="log-empty">
      <span class="spinner-border spinner-border-sm"></span>Loading…</div>`;

    try {
      let url;

      if (logsState.currentSource.type === "journal") {
        const p = new URLSearchParams({ lines });
        if (logsState.currentSource.param) {
          p.set("unit", logsState.currentSource.param);
        }
        url = `${CONFIG.API_JOURNAL}?${p}`;

      } else if (logsState.currentSource.type === "ladylinux") {
        url = `${CONFIG.API_LADYLINUX}?lines=${lines}`;

      } else if (logsState.currentSource.type === "file") {
        url = `/api/logs/file?${new URLSearchParams({
          path: logsState.currentSource.param,
          lines,
        })}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      logsState.lines = data.lines || [];
      renderLines(logsState.lines);

    } catch (err) {
      console.error("loadSource error:", err);
      out.innerHTML = `<div class="log-line ${CONFIG.CLASS_LOG_ERROR}">
        <i class="bi bi-exclamation-triangle me-1"></i>Failed to load: ${err.message}</div>`;
      updateCount();

    } finally {
      logsState.isLoading = false;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     loadFileList()
     Populate the sidebar with dynamically discovered log files.
  ────────────────────────────────────────────────────────────────────────── */
  async function loadFileList() {
    const container = $(CONFIG.SELECTOR_FILE_LIST);
    if (!container) return;

    try {
      const response = await fetch(CONFIG.API_FILES);
      const data = await response.json();
      const files = data.files || [];

      if (files.length === 0) {
        container.innerHTML = `<div class="text-muted" style="font-size:0.72rem;padding:0.4rem 0.75rem;">
          No readable files</div>`;
        return;
      }

      // Render buttons for each file
      container.innerHTML = files.map(filename => `
        <button class="${CONFIG.CLASS_SOURCE_ITEM}"
                type="button"
                data-source="file"
                data-param="/var/log/${filename}"
                data-label="${filename}">
          <i class="bi bi-file-text"></i>${filename}
        </button>`).join("");

      // Attach handlers to dynamically created buttons
      container.querySelectorAll(CONFIG.CLASS_SOURCE_ITEM).forEach(btn => {
        btn.addEventListener("click", () => selectSource(btn));
      });

    } catch (err) {
      console.error("loadFileList error:", err);
      container.innerHTML = `<div class="text-muted" style="font-size:0.72rem;padding:0.4rem 0.75rem;">
        <i class="bi bi-exclamation-triangle me-1"></i>Could not load files</div>`;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     selectSource(btn)
     Handle source selection. Update state, highlight button, fetch new data.
  ────────────────────────────────────────────────────────────────────────── */
  function selectSource(btn) {
    // Deactivate all, activate clicked
    document.querySelectorAll(CONFIG.CLASS_SOURCE_ITEM).forEach(b => {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    // Update state from button data attributes
    logsState.currentSource = {
      type: btn.dataset.source || "",
      param: btn.dataset.param || "",
      label: btn.dataset.label || btn.textContent.trim(),
    };

    // Update UI label
    const labelEl = $(CONFIG.SELECTOR_SOURCE_LABEL);
    if (labelEl) {
      labelEl.textContent = logsState.currentSource.label;
    }

    // Fetch new data
    loadSource();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     applyFilter()
     Client-side filtering: hide/show lines based on search text.
     Does not require refetch.
  ────────────────────────────────────────────────────────────────────────── */
  function applyFilter() {
    const searchInput = $(CONFIG.SELECTOR_SEARCH);
    const filter = searchInput ? searchInput.value.toLowerCase() : "";

    logsState.filterText = filter;

    document.querySelectorAll(`${CONFIG.SELECTOR_OUTPUT} ${CONFIG.CLASS_LOG_LINE}`).forEach(el => {
      const matches = !filter || el.textContent.toLowerCase().includes(filter);
      el.classList.toggle(CONFIG.CLASS_HIDDEN, !matches);
    });

    updateCount();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     copyVisible()
     Copy all visible (non-filtered) log lines to clipboard.
  ────────────────────────────────────────────────────────────────────────── */
  function copyVisible() {
    const visible = document.querySelectorAll(
      `${CONFIG.SELECTOR_OUTPUT} ${CONFIG.CLASS_LOG_LINE}:not(.${CONFIG.CLASS_HIDDEN})`
    );

    if (visible.length === 0) {
      console.warn("No visible lines to copy");
      return;
    }

    const text = [...visible]
      .map(el => el.textContent)
      .join("\n");

    navigator.clipboard.writeText(text)
      .then(() => {
        const btn = $(CONFIG.SELECTOR_COPY);
        if (btn) {
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `<i class="bi bi-check-lg" style="color:var(--log-green)"></i>`;
          setTimeout(() => {
            btn.innerHTML = originalHTML;
          }, 1500);
        }
      })
      .catch(err => {
        console.error("Copy failed:", err);
      });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     ATTACH EVENT HANDLERS
     Wire all interactive elements.
  ────────────────────────────────────────────────────────────────────────── */
  function attachEventHandlers() {
    // Static source items in sidebar
    document.querySelectorAll(CONFIG.CLASS_SOURCE_ITEM).forEach(btn => {
      btn.addEventListener("click", () => selectSource(btn));
    });

    // Toolbar: refresh and lines-per-load
    $(CONFIG.SELECTOR_REFRESH)?.addEventListener("click", loadSource);
    $(CONFIG.SELECTOR_LINES)?.addEventListener("change", loadSource);

    // Search: live filter + clear
    $(CONFIG.SELECTOR_SEARCH)?.addEventListener("input", applyFilter);
    $(CONFIG.SELECTOR_CLEAR_SEARCH)?.addEventListener("click", () => {
      const searchInput = $(CONFIG.SELECTOR_SEARCH);
      if (searchInput) {
        searchInput.value = "";
        applyFilter();
      }
    });

    // Copy button
    $(CONFIG.SELECTOR_COPY)?.addEventListener("click", copyVisible);
  }

  /* ──────────────────────────────────────────────────────────────────────────
     INITIALIZATION
  ────────────────────────────────────────────────────────────────────────── */
  function init() {
    console.log("Logs module initializing…");
    attachEventHandlers();
    loadFileList();
    loadSource();
  }

  /* Auto-init on DOM ready */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ── Optional: Export public API to window if needed by other scripts ── */
  window.LogsModule = {
    getCurrentSource: () => logsState.currentSource,
    getLines: () => logsState.lines,
    reload: loadSource,
  };
}());
```

---

## Template Change: logs.html

### Before:

```html
  <script>
  (function () {
    // ... 150+ lines of inline JS ...
  }());
  </script>
</body>
```

### After:

```html
  <script src="/static/js/logs.js"></script>
</body>
```

---

## Key Features of This Module

✅ **Centralized CONFIG** — All selectors and endpoints in one place  
✅ **Isolated STATE** — Single `logsState` object tracks everything  
✅ **Helper Functions** — Descriptive names, single responsibility  
✅ **Error Handling** — Try/catch with user-friendly messages  
✅ **Async/Await** — Clean promise handling  
✅ **Event Delegation** — Handles dynamic DOM elements  
✅ **Auto-init** — Runs automatically when DOM is ready  
✅ **Public API** — Optional exports for other scripts  

---

## Testing Checklist

- [ ] Page loads without console errors
- [ ] Initial log data loads
- [ ] Sidebar sources clickable
- [ ] Search filter works (lines hide/show)
- [ ] Clear search button works
- [ ] Refresh button reloads current source
- [ ] Copy button copies visible lines
- [ ] Auto-scroll checkbox works
- [ ] Lines-per-load selector works
- [ ] Dynamic file list populates

---

## Module Structure Benefits

| Aspect | Benefit |
|--------|---------|
| CONFIG object | All magic strings in one place, easy to change |
| STATE object | Clear what data the module owns |
| Helper functions | Code reuse, single responsibility |
| IIFE wrapper | No global pollution, scope isolation |
| Error handling | User-friendly error messages |
| DOMContentLoaded | Guarantees DOM ready |
| Public API | Optional interface for other scripts |

