# JavaScript Consolidation Workflow

## Overview

Consolidate all inline `<script>` from template files into organized external JavaScript modules in `/static/js/`. Establish a single source of truth for page-specific functionality while maintaining clear separation of concerns.

---

## Phase 1: Audit & Planning

### 1.1 Identify Current State

```bash
# Find all templates with inline scripts
grep -l "<script>" templates/*.html

# Count inline script blocks per template
for f in templates/*.html; do
  count=$(grep -c "<script>" "$f" 2>/dev/null || echo 0)
  [ "$count" -gt 0 ] && echo "$f: $count blocks"
done
```

### 1.2 Current Directory Structure

```
/static/js/
├── archive/                    (existing: legacy/old code)
│   ├── design_engine.js
│   ├── themes.js
│   ├── global.js
│   └── ... (other shared)
└── (NEW SECTION - per-page external modules)
    ├── logs.js                 (extracted from templates/logs.html)
    ├── users.js                (extracted from templates/users.html)
    ├── os.js                   (extracted from templates/os.html)
    ├── network.js              (extracted from templates/network.html)
    └── index.js                (extracted from templates/index.html)
```

---

## Phase 2: JavaScript Organization

### 2.1 Module Structure

Each page gets its own external JavaScript file with a consistent pattern:

**File:** `/static/js/[page-name].js`

```javascript
/*
════════════════════════════════════════════════════════════════════════════════
  Module: [PAGE_NAME]
  File: static/js/[page-name].js
  Template: templates/[page-name].html
  Description: [Feature description]
════════════════════════════════════════════════════════════════════════════════
*/

(function () {
  "use strict";

  /* ── Configuration ── */
  const CONFIG = {
    // Page-specific constants, selectors, API endpoints
    ENDPOINT_USERS: "/api/users",
    SELECTOR_USER_LIST: "#userList",
    // ... etc
  };

  /* ── State ── */
  let appState = {
    selectedUser: null,
    sortKey: "name",
    sortDirection: "asc",
    // ... etc
  };

  /* ── Helpers ── */
  function helperFunction() { }

  /* ── Main Functions ── */
  async function loadData() { }
  function renderUI() { }
  function attachEventHandlers() { }

  /* ── Initialization ── */
  function init() {
    loadData();
    renderUI();
    attachEventHandlers();
  }

  /* ── Export to global scope (if needed) ── */
  window.PageName = {
    init,
    // Public API methods only
  };

  /* ── Auto-init when DOM ready ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
```

### 2.2 Naming Conventions

**File naming:**
```
/static/js/[page-name].js

Examples:
/static/js/logs.js          → logs page functionality
/static/js/users.js         → users page functionality  
/static/js/os.js            → os page functionality
/static/js/network.js       → network page functionality
/static/js/firewall.js      → firewall page functionality
```

**Function naming:**
```
// Page-specific functions — clear namespace
function renderLogsUI() { }
function loadUsersFromAPI() { }
function attachLogsEventHandlers() { }

// Avoid generic names that could conflict
✅  renderLogsUI()       ✅  loadUsersFromAPI()
❌  renderUI()           ❌  loadData()
```

**State object naming:**
```javascript
// Per-page state container
const logsState = {
  currentSource: { type: "journal", param: "", label: "Journal" },
  filterText: "",
  isAutoScroll: true,
};

const usersState = {
  selectedUser: null,
  sortKey: "name",
  sortDirection: "asc",
};
```

**Event handler naming:**
```javascript
// Clear, descriptive event handler names
function onUserRowClick(event) { }
function onSortButtonClick(event) { }
function onSearchInput(event) { }
function onRefreshButtonClick(event) { }

// Not just "handleClick", "onClick", etc.
```

---

## Phase 3: Extracting Inline JavaScript

### 3.1 Identify Inline Script Blocks

In the template, find all `<script>` tags (typically just before `</body>`):

```html
<body data-page="logs">
  <!-- page content -->

  <!-- ── Inline script block ── -->
  <script>
  (function () {
    "use strict";
    
    // ... 100-200 lines of JS logic ...
    
  }());
  </script>
</body>
```

### 3.2 Extract to External File

1. Copy everything inside the `<script>` tags
2. Create `/static/js/[page-name].js`
3. Wrap in module structure (see 2.1 above)
4. Replace inline `<script>` with `<script src="/static/js/[page-name].js"></script>`

### 3.3 Refactor for External Context

**Problem:** Inline scripts can reference global variables, other scripts, and DOM directly.

**Solution:** Encapsulate state and create clear interfaces.

#### Example: logs.html → /static/js/logs.js

**Before (inline):**
```javascript
<script>
  (function () {
    let currentSource = { type: "journal" };
    
    function loadSource() {
      const lines = document.getElementById("linesSelect").value;
      const url = `/api/logs/journal?lines=${lines}`;
      // ...
    }
    
    // Wire events
    document.getElementById("refreshBtn").addEventListener("click", loadSource);
  }());
</script>
```

**After (external):**
```javascript
// /static/js/logs.js
(function () {
  "use strict";

  /* ── Configuration ── */
  const CONFIG = {
    API_JOURNAL: "/api/logs/journal",
    API_LADYLINUX: "/api/logs/ladylinux",
    API_FILES: "/api/logs/files",
    SELECTOR_OUTPUT: "#logOutput",
    SELECTOR_SEARCH: "#logSearch",
    SELECTOR_REFRESH: "#refreshBtn",
    SELECTOR_LINES: "#linesSelect",
  };

  /* ── State ── */
  const logsState = {
    currentSource: { type: "journal", param: "", label: "Journal" },
    filterText: "",
  };

  /* ── Helper: Safe DOM selector ── */
  function $(sel) {
    const el = document.getElementById(sel) || document.querySelector(sel);
    if (!el) console.warn(`Element not found: ${sel}`);
    return el;
  }

  /* ── Load log data ── */
  async function loadSource() {
    const out = $(CONFIG.SELECTOR_OUTPUT);
    const lines = $(CONFIG.SELECTOR_LINES).value;
    
    out.innerHTML = `<div class="log-empty">Loading…</div>`;
    
    try {
      let url;
      if (logsState.currentSource.type === "journal") {
        url = `${CONFIG.API_JOURNAL}?lines=${lines}`;
      } else {
        url = `${CONFIG.API_LADYLINUX}?lines=${lines}`;
      }
      
      const res = await fetch(url);
      const data = await res.json();
      renderLines(data.lines || []);
    } catch (err) {
      console.error("loadSource:", err);
      out.innerHTML = `<div class="log-line log-error">Failed: ${err.message}</div>`;
    }
  }

  /* ── Render log lines ── */
  function renderLines(lines) {
    // ... render logic ...
  }

  /* ── Event handlers ── */
  function attachEventHandlers() {
    $(CONFIG.SELECTOR_REFRESH)?.addEventListener("click", loadSource);
    $(CONFIG.SELECTOR_LINES)?.addEventListener("change", loadSource);
    $(CONFIG.SELECTOR_SEARCH)?.addEventListener("input", applyFilter);
  }

  /* ── Init ── */
  function init() {
    attachEventHandlers();
    loadSource();
  }

  /* ── Auto-init ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
```

---

## Phase 4: Template Updates

### 4.1 Remove Inline Script

**Before:**
```html
  <script>
  (function () {
    // 150+ lines of JS
  }());
  </script>
</body>
```

**After:**
```html
  <script src="/static/js/logs.js"></script>
</body>
```

### 4.2 Script Loading Order

Place external script tags **before closing `</body>`**, after Bootstrap and other dependencies:

```html
<body data-page="logs">
  <!-- page content -->

  <!-- Bootstrap & shared libraries (already loaded) -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/static/js/archive/design_engine.js"></script>
  <script src="/static/js/archive/themes.js"></script>
  <!-- ... other shared scripts ... -->

  <!-- Page-specific scripts (NEW) -->
  <script src="/static/js/logs.js"></script>
</body>
```

### 4.3 Verify ID/Class Dependencies

Before removing inline script, verify all selectors exist in HTML:

```javascript
// In logs.js, these must exist in logs.html:
CONFIG.SELECTOR_OUTPUT       → #logOutput
CONFIG.SELECTOR_SEARCH       → #logSearch
CONFIG.SELECTOR_REFRESH      → #refreshBtn
CONFIG.SELECTOR_LINES        → #linesSelect

// Check in HTML:
<div id="logOutput" class="log-output"></div>  ✅
<input id="logSearch" />                       ✅
<button id="refreshBtn" />                     ✅
<select id="linesSelect" />                    ✅
```

---

## Phase 5: Modularization Best Practices

### 5.1 Avoid Global Pollution

**❌ BAD:**
```javascript
// Pollutes window scope
function renderUI() { }
function loadData() { }
renderUI();
loadData();
```

**✅ GOOD:**
```javascript
(function () {
  "use strict";
  
  function renderUI() { }
  function loadData() { }
  
  function init() {
    loadData();
    renderUI();
  }
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}()); // IIFE wraps everything
```

### 5.2 Configuration at Top

```javascript
// ✅ GOOD: centralized config
const CONFIG = {
  API_ENDPOINT: "/api/users",
  SELECTOR_LIST: "#userList",
  SELECTOR_DETAIL: "#userDetailPanel",
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
};

// Later in code:
const res = await fetch(CONFIG.API_ENDPOINT);
const el = document.getElementById(CONFIG.SELECTOR_LIST);
```

**Benefits:**
- Easy to find/change selectors and endpoints
- Clear what the module needs
- Can be exported for testing

### 5.3 State Management

```javascript
// Centralized state object
const usersState = {
  selectedUser: null,
  sortKey: "name",
  sortDirection: "asc",
  users: [],
  lastFetch: null,
};

// Functions update state predictably
function selectUser(name) {
  usersState.selectedUser = name;
  renderUserDetail();
}

function setSortKey(key) {
  usersState.sortKey = key;
  renderUserTable();
}
```

### 5.4 Async/Await Pattern

```javascript
// ✅ Prefer async/await over .then() chains
async function loadAndRender() {
  try {
    const response = await fetch(CONFIG.API_ENDPOINT);
    const data = await response.json();
    usersState.users = data.users;
    renderUserTable();
  } catch (err) {
    console.error("Load failed:", err);
    showErrorMessage("Failed to load users");
  }
}
```

### 5.5 Event Delegation

For dynamic lists, use event delegation instead of individual listeners:

```javascript
// ❌ AVOID: adds listener to each row
document.querySelectorAll(".user-row").forEach(row => {
  row.addEventListener("click", handleRowClick);
});

// ✅ BETTER: single listener on container
document.getElementById("userList").addEventListener("click", (e) => {
  const row = e.target.closest(".user-row");
  if (row) handleRowClick(row);
});
```

---

## Phase 6: Testing & Validation

### 6.1 Pre-Migration Checklist

Before removing inline script:

- [ ] All referenced element IDs exist in HTML
- [ ] All referenced element classes exist in HTML  
- [ ] All API endpoints are correct
- [ ] All event handler names are defined
- [ ] No other scripts depend on window-scoped functions
- [ ] Script logic doesn't depend on execution order

### 6.2 Browser Testing

After moving to external file:

```bash
1. Open page in browser
2. Open DevTools → Console
3. Look for errors (red text)
4. Look for warnings (yellow text)
5. Test all functionality:
   - Click buttons → handlers fire
   - Fill forms → validation works
   - Load data → renders correctly
   - Search/filter → works as expected
```

### 6.3 DevTools Verification

**Sources tab:**
- [ ] External JS file loads (Network tab shows 200 status)
- [ ] No 404 errors for missing dependencies
- [ ] Script appears in Sources tab

**Console tab:**
- [ ] No `Uncaught ReferenceError` for missing functions
- [ ] No `Cannot read property of undefined`
- [ ] No CORS errors if fetching APIs

### 6.4 Functional Testing

For each page, test:

| Feature | Test | Expected |
|---------|------|----------|
| Load data | Visit page | Data loads automatically |
| Click handlers | Click buttons | Functions execute |
| Input handlers | Type in search | Live filter/update |
| API calls | Monitor Network tab | Requests to correct endpoints |
| Error handling | Disconnect network | Error displayed, no crashes |

---

## Phase 7: Processing Order

Recommend this order (dependency-aware):

1. **logs.js** ← Start here (self-contained, minimal dependencies)
2. **users.js** ← Similar structure to logs
3. **os.js** ← Medium complexity
4. **network.js** ← More complex
5. **firewall.js** ← Most complex
6. **index.js** ← Affects multiple features

---

## Phase 8: Git Workflow

### 8.1 Create External File

```bash
# Create new JS file
touch static/js/[page-name].js

# Stage it
git add static/js/[page-name].js
```

### 8.2 Commit

```bash
git commit -m "refactor(js): extract [page-name] inline script to external module

- Moved inline <script> from templates/[page-name].html to static/js/[page-name].js
- Wrapped in IIFE for scope isolation
- Centralized config and state objects
- Replaced HTML script tag with src= link
- All functionality preserved, zero behavioral changes"
```

### 8.3 Two-Commit Pattern (Optional)

For clarity, you can split into two commits:

```bash
# Commit 1: Add the external JS file
git add static/js/logs.js
git commit -m "feat(js): add logs page module"

# Commit 2: Update template to use it
git add templates/logs.html
git commit -m "refactor(html): link external logs.js instead of inline script"
```

---

## Phase 9: Maintenance Guidelines

### 9.1 Adding New Features

When adding new page features:

1. ✅ **DO** add code to external `/static/js/[page-name].js`
2. ✅ **DO** add new selectors to `CONFIG` object
3. ✅ **DO** group related functions together with comments
4. ✅ **DO** test in browser DevTools before committing
5. ❌ **DON'T** add inline `<script>` tags in templates
6. ❌ **DON'T** create global functions (everything in IIFE)

### 9.2 Sharing Code Across Pages

If two pages need the same functionality:

**Option A:** Create shared utility module
```javascript
// /static/js/shared/utils.js
export function formatDate(date) { ... }
export function validateEmail(email) { ... }

// /static/js/logs.js
// import { formatDate } from './shared/utils.js';
```

**Option B:** Put in archive/global.js if it's truly global

### 9.3 Refactoring Existing Code

To improve existing page JS:

1. Never add inline `<script>` to template
2. Always edit the external JS file
3. Test thoroughly before committing
4. Add comments explaining why changes were made

---

## Phase 10: Common Patterns & Examples

### 10.1 Simple Data Load + Render

```javascript
// logs.js pattern
(function () {
  "use strict";

  const CONFIG = { API: "/api/logs", SELECTOR: "#logOutput" };
  const state = { lines: [] };

  async function loadData() {
    try {
      const res = await fetch(CONFIG.API);
      const data = await res.json();
      state.lines = data.lines;
      render();
    } catch (err) {
      console.error(err);
    }
  }

  function render() {
    const el = document.getElementById(CONFIG.SELECTOR);
    el.innerHTML = state.lines.map(l => `<div>${l}</div>`).join("");
  }

  function init() {
    loadData();
  }

  document.addEventListener("DOMContentLoaded", init);
}());
```

### 10.2 Form Submission + Validation

```javascript
(function () {
  "use strict";

  const CONFIG = {
    API: "/api/users",
    FORM: "#addUserForm",
    SUBMIT: "#submitBtn",
  };

  async function handleSubmit(e) {
    e.preventDefault();
    
    const form = document.getElementById(CONFIG.FORM);
    const data = new FormData(form);
    
    try {
      const res = await fetch(CONFIG.API, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(data)),
        headers: { "Content-Type": "application/json" },
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const result = await res.json();
      console.log("Success:", result);
      form.reset();
    } catch (err) {
      console.error(err);
    }
  }

  function init() {
    document.getElementById(CONFIG.SUBMIT)?.addEventListener("click", handleSubmit);
  }

  document.addEventListener("DOMContentLoaded", init);
}());
```

### 10.3 Filtering + Sorting

```javascript
(function () {
  "use strict";

  const CONFIG = { SELECTOR_SEARCH: "#searchInput" };
  const state = { items: [], filter: "" };

  function applyFilter() {
    state.filter = document.getElementById(CONFIG.SELECTOR_SEARCH).value.toLowerCase();
    render();
  }

  function render() {
    const filtered = state.items.filter(item =>
      item.name.toLowerCase().includes(state.filter)
    );
    // render filtered items...
  }

  function init() {
    document.getElementById(CONFIG.SELECTOR_SEARCH)?.addEventListener("input", applyFilter);
  }

  document.addEventListener("DOMContentLoaded", init);
}());
```

---

## Benefits of External JS

✅ **Separation of Concerns** — HTML structure separate from JS logic  
✅ **Reusability** — Easy to share code across pages  
✅ **Caching** — Browser caches external JS files  
✅ **Testing** — Easier to unit test external modules  
✅ **Maintainability** — Inline scripts scattered; external is organized  
✅ **Performance** — Can minify/compress external files  
✅ **Debugging** — Clearer stack traces in DevTools  

---

## Troubleshooting

### Issue: "Element not found" errors

**Problem:** JavaScript tries to access element that doesn't exist in DOM.

**Cause:** Script loads before DOM is ready OR selector name is wrong.

**Fix:**
```javascript
// Wrap in DOMContentLoaded
document.addEventListener("DOMContentLoaded", init);

// OR add null checks
const el = document.getElementById("myId");
if (el) {
  el.addEventListener("click", handler);
}
```

### Issue: Functions not defined

**Problem:** Template tries to call function that's only in external JS.

**Cause:** Function is wrapped in IIFE, not exposed to window.

**Fix:** Export to window if needed:
```javascript
window.PageName = {
  publicFunction: function() { },
  // Only export public API
};
```

### Issue: Script loads but doesn't do anything

**Problem:** No errors, but functionality doesn't work.

**Cause:** Likely selector name mismatch or async issue.

**Fix:**
```javascript
// Add debug logging
console.log("Page script loaded");
console.log("Element found:", document.getElementById("myId"));

// Test in console:
document.getElementById("myId")  // Should return element, not null
```

---

## Summary

**Single Source of Truth for JS:**
- All page functionality → `/static/js/[page-name].js`
- All state → centralized `state` object
- All configuration → `CONFIG` object at top
- All HTML selectors in `CONFIG`

**Structure:**
```
/static/js/[page-name].js
  ├── CONFIG (selectors, endpoints, constants)
  ├── state (mutable page state)
  ├── Helper functions
  ├── Main functions (load, render, handlers)
  └── init() wrapper
```

**Testing:**
- DevTools Console → no errors
- DevTools Network → correct endpoints
- DevTools Sources → script loads
- Manual testing → all interactions work

**Git Workflow:**
```bash
git add static/js/[page-name].js
git add templates/[page-name].html
git commit -m "refactor(js): extract [page] inline script to external module"
```

See full workflow: `JS_CONSOLIDATION_WORKFLOW.md` (or reference this document)

