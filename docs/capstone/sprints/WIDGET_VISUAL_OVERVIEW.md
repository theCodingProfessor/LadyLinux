# Lady Widget - Visual Overview

## User Interface Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          LADY LINUX DASHBOARD                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                   [🦁]         │
│ Navigation   │ Main Content Area                                 (Hub)        │
│              │                                                                 │
│ • System     │  ┌─────────────────────────────────────────────┐             │
│ • Users      │  │  AI Console                                 │   ┌──────┐  │
│ • Network    │  │  ├─ System response                         │   │Panel │  │
│ • Logs       │  │  └─ Status: idle                            │   │      │  │
│              │  │                                             │   │ⓘ  ×  │  │
│              │  │  [Input field] [Send]                       │   ├──────┤  │
│              │  │  [Mic]                                      │   │      │  │
│              │  └─────────────────────────────────────────────┘   │ Chat │  │
│              │                                                    │History  │  │
│              │  ┌─────────────────────────────────────────────┐   │      │  │
│              │  │  Live Metrics                               │   │      │  │
│              │  │  • CPU: 45%  ████░░░░░░                    │   │ [Mic]│  │
│              │  │  • Memory: 72%  ███████░░                  │   │      │  │
│              │  │  • Disk: 23%  ██░░░░░░░░                   │   └──────┘  │
│              │  └─────────────────────────────────────────────┘             │
│              │                                                               │
│              │  ┌─────────────────────────────────────────────┐             │
│              │  │  Suggested Actions  │  Recent Activity      │             │
│              │  │  • Optimize system  │  • Config file edited │             │
│              │  │  • Clean up logs    │  • User login        │             │
│              │  │  • Update firewall  │  • Firewall rule     │             │
│              │  └─────────────────────────────────────────────┘             │
│              │                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Radial Menu - Closed State

```
                        ┌─ Positioned on right edge, middle
                        │
                        ▼
        ╔════════════════════════════════╗
        ║                                ║
        ║                                ║
        ║                          [🦁]  ║ ← Click to open
        ║                                ║
        ║                                ║
        ╚════════════════════════════════╝
```

## Radial Menu - Open State

```
                     ↑ Metrics Spoke
                  ⟲ (Refresh)
                /
              /
            ◉ ←─── Theme Spoke
          /   \    (Circle-half)
        /       \
      ▲         ▼
    Chat       Fullscreen
   Spoke        Spoke
   (Chat)      (Expand)
    │ │
    │ └─→ 🦁 (Hub - 45° rotation)
    │
    └─→ Rotates 45° when open
```

## Floating Chat Panel - Normal State

```
┌─────────────────────────────────────┐
│ Lady          [⛶] [×]              │  ← Header
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐│
│  │                                 ││
│  │  You: Hello                     ││
│  │                                 ││
│  │  Lady Linux: Hi! How can I help?││
│  │                                 ││
│  │                                 ││
│  └─────────────────────────────────┘│ ← Scrollable
│                                     │   response area
├─────────────────────────────────────┤
│ [Type here...       ] [🎤]          │ ← Input bar
└─────────────────────────────────────┘

Dimensions: 320px × 420px
Position: Left of hub button
Z-index: 9998
```

## Floating Chat Panel - Expanded State

```
┌──────────────────────────────────────────────────────────┐
│ Lady          [⛶] [×]                                   │  ← Header
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │                                                      ││
│  │  You: Hello                                          ││
│  │                                                      ││
│  │  Lady Linux: Hi! How can I help?                    ││
│  │                                                      ││
│  │  You: What's the system status?                     ││
│  │                                                      ││
│  │  Lady Linux: Let me check that for you...           ││
│  │  CPU: 45% | Memory: 72% | Disk: 23%               ││
│  │                                                      ││
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│ ← Much larger
│                                                          │   scrollable area
├──────────────────────────────────────────────────────────┤
│ [Type here...                       ] [🎤]              │ ← Input bar
└──────────────────────────────────────────────────────────┘

Dimensions: 600px × 700px
Position: Right edge with padding
Z-index: 9998 (same level, just resized)
```

## Message Format

```
┌─────────────────────────────────────┐
│ You: What's the time?               │ ← User message (muted color)
│                                     │
│ Lady Linux: It's 14:32 UTC.         │ ← AI message (main color)
│                                     │
│ You: Show CPU usage                 │
│                                     │
│ Lady Linux: Current CPU Usage:      │ ← Can include Markdown
│                                     │
│ **System Overview**                 │   - Code blocks
│ - CPU: 45%                          │   - Lists
│ - Memory: 72%                       │   - Formatting
│ - Disk: 23%                         │
│                                     │
└─────────────────────────────────────┘
```

## Interaction Sequence Diagram

```
User                 DOM                JavaScript           Backend
 │                   │                    │                    │
 ├─ Click Hub ──────>│                    │                    │
 │                   ├──> Toggle .is-open>│                    │
 │                   │    Animate spokes  │                    │
 │<─────────────────────────────────────  │                    │
 │  [Radial menu opens]                   │                    │
 │                   │                    │                    │
 ├─ Click Panel ────>│                    │                    │
 │  Spoke            ├──> Toggle .hidden >│                    │
 │                   │    Update aria     │                    │
 │<─────────────────────────────────────  │                    │
 │  [Panel appears]                       │                    │
 │                   │                    │                    │
 ├─ Type message ───>│                    │                    │
 │                   │                    │                    │
 ├─ Press ENTER ────>│                    │                    │
 │                   │  Input event       │                    │
 │                   │  listener fires    │                    │
 │                   │<─────────────────>│                    │
 │                   │  Create DOM node   │                    │
 │                   │  "You: message"    │                    │
 │<─────────────────────────────────────  │                    │
 │  [Message shown]  │                    │                    │
 │                   │                    ├──────────────────>│
 │                   │                    │ POST /api/stream  │
 │                   │                    │ prompt + context  │
 │                   │                    │<──────────────────┤
 │                   │                    │ Token stream      │
 │                   │  Response event    │                    │
 │                   │  listeners fire    │                    │
 │                   │<─────────────────>│                    │
 │                   │  Update DOM node   │                    │
 │                   │  "Lady: response"  │                    │
 │<─────────────────────────────────────  │                    │
 │  [Response shown]  │                    │                    │
 │                   │                    │                    │
 ├─ Click Expand ───>│                    │                    │
 │                   ├──> Toggle .expanded>│                    │
 │                   │    Save to storage │                    │
 │                   │    Resize animation│                    │
 │<─────────────────────────────────────  │                    │
 │  [Panel enlarged]  │                    │                    │
```

## State Machine Diagram

```
┌────────────────────────────────────────┐
│                                        │
│  Panel Closed                          │
│  (.hidden class present)               │
│                                        │
└────────────┬─────────────────────────┘
             │
    Click Panel Spoke
             │
             ▼
┌────────────────────────────────────────┐
│                                        │
│  Panel Open (Normal)                   │
│  (.hidden removed)                     │
│  (320x420px)                          │
│                                        │
└────┬──────────────────┬────────────────┘
     │                  │
Click │                  │ Click Expand
Close │                  │
     │                  ▼
     │  ┌────────────────────────────────────────┐
     │  │                                        │
     │  │  Panel Open (Expanded)                 │
     │  │  (.hidden removed)                     │
     │  │  (.expanded class added)               │
     │  │  (600x700px)                          │
     │  │                                        │
     │  └────┬──────────────────┬────────────────┘
     │       │                  │
     │  Click │                  │ Click Expand
     │  Close │                  │ (again)
     │       │                  │
     └───────┼──────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│                                        │
│  Panel Closed                          │
│  (.hidden class added)                 │
│                                        │
└────────────────────────────────────────┘
```

## CSS Animation Timeline

```
Radial Menu Opening (Staggered Spokes)

Timeline:   0ms        40ms       80ms       120ms
            │          │          │          │
Panel Spoke │ ─────────●─────────────────────── (visible)
            │  ▲
            │  └─ scale(0) → scale(1)
            │     transform: translate(-7px, -75px)
            │
Metrics     │          ─────────●───────────── (visible)
Spoke       │               ▲
            │               └─ Delayed 40ms
            │
Theme       │                    ─────────●── (visible)
Spoke       │                         ▲
            │                         └─ Delayed 80ms
            │
Fullscreen  │                              ──● (visible)
Spoke       │                              ▲
            │                              └─ Delayed 120ms
```

## File Organization

```
feb_lady/
│
├── templates/
│   ├── index.html ← Loads scripts in correct order
│   └── lady_panel.html ← Widget HTML structure
│
├── static/
│   │
│   ├── css/
│   │   └── style.css ← Widget CSS (panel, buttons, animations)
│   │
│   ├── js/
│   │   ├── global.js ← Radial menu + expand toggle handlers
│   │   ├── chat.js ← Message sending/receiving
│   │   ├── ladyWidget.js ← Input event listeners
│   │   ├── nav_controls.js ← Theme toggle
│   │   ├── voice_client.js ← Voice input
│   │   └── ...
│   │
│   └── images/ (if needed)
│
└── docs/
    ├── WIDGET_QUICK_REFERENCE.md ← Quick lookup guide
    ├── WIDGET_FEATURE_MAP.md ← Complete features
    ├── WIDGET_VALIDATION.md ← Testing checklist
    ├── IMPLEMENTATION_COMPLETE.md ← Full report
    └── WIDGET_FIX_SUMMARY.md ← What was fixed
```

## Color Scheme (CSS Variables)

```
--bg-main           Dark background
--bg-surface        Panel background
--accent            Button/highlight color (purple-ish)
--accent-soft       Soft accent (for backgrounds)
--text-main         Main text color
--text-muted        Muted/secondary text
--border-color      Border/divider color
--color-on-accent   Color on accent background
```

## Accessibility Features

```
✓ Keyboard Navigation
  - Enter key to send message
  - ESC key to close panel
  - Tab to navigate buttons
  
✓ ARIA Attributes
  - aria-label on all buttons
  - aria-pressed on expand toggle
  - aria-hidden on panel when closed
  - aria-expanded on hub button

✓ Visual Indicators
  - Color changes on hover
  - Scale transform on interaction
  - Rotation indicates state
  - Icon changes show functionality

✓ Semantic HTML
  - <button> elements for buttons
  - <input> for text field
  - Proper heading hierarchy
```

---

## Next Reload: State Persistence

```
Page Load
  │
  ├─> DOMContentLoaded fires
  │
  ├─> Check localStorage['lady-panel-expanded']
  │
  ├─> If "true"
  │   └─> Add .expanded class to panel
  │
  └─> Ready for interaction
```

---

**Visual Design Last Updated:** April 10, 2026

