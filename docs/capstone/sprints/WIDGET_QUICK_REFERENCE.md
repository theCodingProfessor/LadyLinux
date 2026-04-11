# Lady Widget - Quick Reference Card

## Quick Start
1. **Load Page** → Widget hub visible (🦁 emoji on right edge)
2. **Click Hub** → Radial menu opens with 4 spokes
3. **Click Chat Spoke** → Panel appears for messaging
4. **Type & Enter** → Send message to Lady Linux
5. **Click Expand** → Enlarge panel to see more content

---

## Element Reference

```
#ladyRadialRoot
├─ #ladyBtn (🦁 emoji button)
├─ #ladySpokePanel (chat icon)
├─ #ladySpokeMetrics (refresh icon)
├─ #ladySpokeTheme (circle-half icon)
└─ #ladySpokeFullscreen (expand icon)

#ladyPanel
├─ .lady-header
│  ├─ "Lady" title
│  └─ .lady-header-actions
│     ├─ #ladyExpandToggle (expand icon)
│     └─ #ladyClose (close button ×)
├─ #lady-response (message area - scrollable)
└─ .lady-input
   ├─ #lady-input (text input)
   └─ [data-mic-btn] (voice button)
```

---

## CSS Classes

| Class | Purpose | Trigger |
|-------|---------|---------|
| `.is-open` | Radial menu open | On #ladyBtn click |
| `.hidden` | Panel not visible | On #ladyClose click |
| `.expanded` | Panel enlarged | On #ladyExpandToggle click |
| `.lady-message` | Message styling | DOM creation |
| `.lady-message-user` | User message color | DOM creation |

---

## JavaScript Functions

| Function | File | Purpose |
|----------|------|---------|
| `initLadyWidget()` | ladyWidget.js | Setup input listeners |
| `window.sendPrompt()` | chat.js | Send message to backend |
| `window.processAssistantReply()` | chat.js | Parse AI response |
| `window.fetchMetrics()` | system_metrics.js | Refresh metrics |
| `window.handleThemeToggle()` | nav_controls.js | Toggle theme |

---

## Key IDs to Know

```javascript
// Control elements
const hub = document.getElementById("ladyBtn");
const panel = document.getElementById("ladyPanel");
const input = document.getElementById("lady-input");
const response = document.getElementById("lady-response");
const expandBtn = document.getElementById("ladyExpandToggle");
const closeBtn = document.getElementById("ladyClose");

// Spokes
const spokePanel = document.getElementById("ladySpokePanel");
const spokeMetrics = document.getElementById("ladySpokeMetrics");
const spokeTheme = document.getElementById("ladySpokeTheme");
const spokeFS = document.getElementById("ladySpokeFullscreen");
```

---

## Event Listeners

```javascript
// Hub click: toggle radial menu
ladyBtn.addEventListener("click", () => {
  radialRoot.classList.toggle("is-open");
});

// Input: send on Enter
input.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    await window.sendPrompt(input.value);
  }
});

// Expand: toggle size
expandBtn.addEventListener("click", () => {
  panel.classList.toggle("expanded");
  localStorage.setItem("lady-panel-expanded", panel.classList.contains("expanded"));
});
```

---

## LocalStorage Keys

```javascript
// Save expanded state
localStorage.setItem("lady-panel-expanded", "true" | "false");

// Retrieve on load
const wasExpanded = localStorage.getItem("lady-panel-expanded") === "true";
```

---

## CSS Key Properties

```css
/* Panel sizes */
.lady-panel {
  width: 320px;
  height: 420px;
}

.lady-panel.expanded {
  width: 600px;
  height: 700px;
}

/* Visibility */
.hidden {
  display: none !important;
}

/* Z-index stack */
.lady-radial-root { z-index: 9999; }
.lady-panel { z-index: 9998; }
```

---

## Common Tasks

### Add a new spoke button
```html
<button id="ladySpokeMyFeature" class="lady-spoke" style="--spoke-angle: 270deg;">
  <i class="bi bi-icon-name"></i>
</button>
```

```javascript
const spoke = document.getElementById("ladySpokeMyFeature");
spoke?.addEventListener("click", () => {
  // Your action here
});
```

### Send a message programmatically
```javascript
const prompt = "Check system status";
const response = await window.sendPrompt(prompt);
console.log(response);
```

### Manually toggle panel
```javascript
const panel = document.getElementById("ladyPanel");
panel.classList.toggle("hidden");
panel.setAttribute("aria-hidden", String(panel.classList.contains("hidden")));
```

### Access message history
```javascript
const messages = document.querySelectorAll(".lady-message");
messages.forEach(msg => console.log(msg.textContent));
```

### Clear all messages
```javascript
document.getElementById("lady-response").innerHTML = "";
```

---

## Debugging Tips

```javascript
// Check if widget initialized
console.log(document.getElementById("lady-input") !== null);

// Check current state
const panel = document.getElementById("ladyPanel");
console.log("Panel hidden?", panel.classList.contains("hidden"));
console.log("Panel expanded?", panel.classList.contains("expanded"));

// Check localStorage
console.log("Expanded state:", localStorage.getItem("lady-panel-expanded"));

// Monitor messages
document.getElementById("lady-response").addEventListener("DOMNodeInserted", (e) => {
  console.log("New message:", e.target.textContent);
});

// Check event listeners (in DevTools)
// Right-click element → Inspect → Event Listeners tab
```

---

## Troubleshooting

| Issue | Debug Step | Solution |
|-------|-----------|----------|
| Panel won't show | Check `.hidden` class | Remove .hidden or click spoke |
| Input not working | Check element exists | Reload page, check console |
| Messages not appearing | Check #lady-response | Verify sendPrompt returns data |
| Expand button broken | Check .expanded class | Check CSS loaded |
| State not persisting | Check localStorage | Browser privacy settings |

---

## Performance Notes

- **No major performance concerns**
- CSS animations use GPU (transform, opacity)
- Event listeners attached once on DOMContentLoaded
- Message scrolling handled by browser
- No polling or timers used

---

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ | Full support |
| Firefox | ✅ | Full support |
| Safari | ✅ | Full support |
| Edge | ✅ | Full support |
| IE 11 | ❌ | classList not supported |

---

## Related Documentation

- **WIDGET_FIX_SUMMARY.md** - What was fixed and why
- **WIDGET_FEATURE_MAP.md** - Complete feature documentation
- **WIDGET_VALIDATION.md** - Testing and validation
- **IMPLEMENTATION_COMPLETE.md** - Full implementation report

---

**Last Updated:** April 10, 2026 | **Version:** 1.0

