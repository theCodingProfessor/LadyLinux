# JavaScript Consolidation — Quick Start Guide

## The Pattern

**Move:** Inline `<script>` from template  
**To:** `/static/js/[page-name].js`  
**Wrap:** In IIFE for scope isolation  
**Link:** With `<script src="/static/js/[page-name].js"></script>`

---

## Step-by-Step Process

### Step 1: Create External File

```bash
touch /static/js/logs.js
```

### Step 2: Extract Inline Script

Copy everything from `<script>...</script>` in template.

### Step 3: Structure as Module

```javascript
// /static/js/logs.js
(function () {
  "use strict";

  /* CONFIG */
  const CONFIG = {
    API_JOURNAL: "/api/logs/journal",
    SELECTOR_OUTPUT: "#logOutput",
    SELECTOR_SEARCH: "#logSearch",
  };

  /* STATE */
  const logsState = {
    currentSource: { type: "journal" },
    lines: [],
  };

  /* FUNCTIONS */
  async function loadSource() {
    // ... implementation ...
  }

  function render() {
    // ... implementation ...
  }

  function attachHandlers() {
    // ... event listeners ...
  }

  /* INIT */
  function init() {
    attachHandlers();
    loadSource();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
```

### Step 4: Update Template

**Before:**
```html
<script>
  (function () {
    // ... 100+ lines ...
  }());
</script>
```

**After:**
```html
<script src="/static/js/logs.js"></script>
```

### Step 5: Test in Browser

1. Open DevTools → Console
2. Check for errors (red)
3. Test functionality
4. Check Network tab → script loads (200)

### Step 6: Commit

```bash
git add /static/js/logs.js templates/logs.html
git commit -m "refactor(js): extract logs inline script to external module"
```

---

## File Structure

```
/static/js/
├── archive/                (legacy)
│   ├── design_engine.js
│   ├── themes.js
│   └── global.js
├── logs.js                 ← NEW
├── users.js                ← NEW
├── os.js                   ← NEW
└── network.js              ← NEW
```

---

## Template Link Pattern

**Last in `<body>` before closing tag:**

```html
<body data-page="logs">
  <!-- content -->

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/static/js/archive/design_engine.js"></script>
  <!-- ... other shared scripts ... -->
  <script src="/static/js/logs.js"></script>  ← Page-specific script
</body>
```

---

## Key Patterns

### Config Object
```javascript
const CONFIG = {
  API_ENDPOINT: "/api/logs",
  SELECTOR_OUTPUT: "#logOutput",
  SELECTOR_SEARCH: "#logSearch",
  CACHE_TTL: 5 * 60 * 1000,
};
```

### State Object
```javascript
const logsState = {
  currentSource: null,
  lines: [],
  isLoading: false,
};
```

### Async/Await
```javascript
async function loadData() {
  try {
    const res = await fetch(CONFIG.API_ENDPOINT);
    const data = await res.json();
    logsState.lines = data.lines;
    render();
  } catch (err) {
    console.error(err);
  }
}
```

### Event Handlers
```javascript
function attachHandlers() {
  document.getElementById(CONFIG.SELECTOR_REFRESH)?.addEventListener("click", loadData);
  document.getElementById(CONFIG.SELECTOR_SEARCH)?.addEventListener("input", applyFilter);
}
```

### DOMContentLoaded
```javascript
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
```

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Element not found" | Selector mismatch | Check HTML id/class matches CONFIG |
| Script doesn't run | Async timing | Wrap in `DOMContentLoaded` listener |
| Functions undefined | IIFE scope | Export to window if needed |
| Network errors | Wrong API path | Verify CONFIG.API_* paths |

---

## Validation Checklist

- [ ] External file created at `/static/js/[page].js`
- [ ] All code from inline `<script>` copied to external file
- [ ] Wrapped in IIFE `(function() { ... }())`
- [ ] CONFIG object created with all selectors/endpoints
- [ ] State object initialized
- [ ] All functions defined and called in init()
- [ ] Event handlers attached in attachHandlers()
- [ ] Template has correct `<script src="/static/js/[page].js"></script>`
- [ ] Inline `<script>` block removed from template
- [ ] Browser loads page without errors
- [ ] DevTools Console shows no red errors
- [ ] DevTools Network shows script loading (200)
- [ ] All interactions work (click, input, load)
- [ ] Git committed with clear message

---

## Processing Order

1. logs.js (self-contained)
2. users.js
3. os.js
4. network.js
5. firewall.js
6. index.js (most complex)

---

## Benefits

✅ Separate concerns (HTML / JS)  
✅ Better caching  
✅ Easier testing  
✅ Clearer organization  
✅ Better debugging  
✅ Reusable code  

---

For detailed workflow: `JS_CONSOLIDATION_WORKFLOW.md`

