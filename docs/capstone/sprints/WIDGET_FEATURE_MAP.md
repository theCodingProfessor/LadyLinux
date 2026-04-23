# Lady Linux Widget - Complete Feature Map

## Widget Interaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    LADY LINUX WIDGET                        │
└─────────────────────────────────────────────────────────────┘

1. RADIAL HUB (Right side, middle)
   ┌──────────────────┐
   │   🦁 (Emoji)    │ ← Click to toggle radial menu
   └──────────────────┘
         │
         ├─ When OPEN, shows 4 spokes:
         │
         ├─ 1️⃣  PANEL SPOKE (Chat icon)
         │    └─ Opens/closes the chat panel
         │       └─ If closed, clicking opens it
         │       └─ If open, clicking closes it
         │
         ├─ 2️⃣  METRICS SPOKE (Refresh icon)
         │    └─ Calls window.fetchMetrics()
         │    └─ Refreshes system metrics
         │
         ├─ 3️⃣  THEME SPOKE (Circle-half icon)
         │    └─ Toggles light/dark theme
         │
         └─ 4️⃣  FULLSCREEN SPOKE (Expand icon)
              └─ Toggles fullscreen mode

2. FLOATING CHAT PANEL
   ┌────────────────────────────────────────┐
   │  Lady  [Expand] [Close]               │ ← Header
   ├────────────────────────────────────────┤
   │                                        │
   │  ┌──────────────────────────────────┐ │
   │  │                                  │ │
   │  │   Response Area (scrollable)     │ │ ← Shows:
   │  │   - User messages                │ │   - Chat history
   │  │   - AI responses                 │ │   - System responses
   │  │                                  │ │
   │  └──────────────────────────────────┘ │
   │                                        │
   ├────────────────────────────────────────┤
   │ [Input field        ] [Mic button]    │ ← Input area
   │ Type message here...  (voice input)    │
   └────────────────────────────────────────┘

3. PANEL CONTROLS
   
   EXPAND BUTTON (↗️ icon):
   - Click to enlarge panel
   - Expands from 320x420px to 600x700px
   - State persists on page reload
   - Click again to minimize
   
   CLOSE BUTTON (× icon):
   - Closes the panel (hides with .hidden class)
   - Keeps radial menu open
   - Press ESC to close as alternative

4. INPUT BEHAVIOR
   
   Text Input Field:
   - Type your message
   - Press ENTER to send
   - Triggers handlePrompt() → sendPrompt() chain
   - Clears input after sending
   
   Response Display:
   - User message appears with "You:" prefix
   - AI response appears with "Lady Linux:" prefix
   - Auto-scrolls to latest message

5. VOICE INPUT (Mic Button)
   
   - Toggles voice recording mode
   - States: idle, listening, processing, speaking, error
   - Auto-transcribes speech to text
   - Inserts into input field
```

## Event Flow Diagram

```
USER ACTION
    ↓
[Click Hub Button]
    ├─→ Toggle .is-open on radial root
    ├─→ Rotate hub 45deg
    └─→ Show/hide 4 spokes with staggered animation

[Click Panel Spoke]
    └─→ Toggle .hidden on panel
        └─→ Update aria-hidden attribute

[Click Expand Button]
    ├─→ Toggle .expanded on panel
    ├─→ Save state to localStorage
    └─→ Resize panel (320x420 ↔ 600x700)

[Type & Press ENTER in Input]
    ├─→ Get input value
    ├─→ Create "You:" message
    ├─→ Append to response area
    ├─→ Call window.sendPrompt()
    │   └─→ POST to /api/prompt/stream
    │       └─→ Stream response tokens
    ├─→ Create "Lady Linux:" message
    ├─→ Process assistant reply
    │   ├─→ Check for structured actions
    │   ├─→ Execute if theme/appearance change
    │   └─→ Render Markdown
    └─→ Scroll to latest message
```

## CSS Classes Used

```
.lady-radial-root
  ├─ .is-open (when menu is expanded)
  ├─ .lady-spoke
  │  ├─ #ladySpokePanel (visible when is-open)
  │  ├─ #ladySpokeMetrics
  │  ├─ #ladySpokeTheme
  │  └─ #ladySpokeFullscreen
  └─ .lady-btn
     └─ .is-open (rotates 45deg)

.lady-panel
  ├─ .hidden (display: none when closed)
  ├─ .expanded (600x700px when expanded)
  ├─ .lady-header
  │  └─ .lady-header-actions
  │     ├─ .lady-expand-toggle (with hover effects)
  │     └─ .lady-close
  ├─ #lady-response (scrollable content area)
  └─ .lady-input (input bar at bottom)
     ├─ #lady-input (text field)
     └─ [data-mic-btn] (voice input)

.lady-message (both user and AI)
  └─ .lady-message-user (user messages have muted color)
```

## JavaScript Files Involved

```
1. /static/js/global.js
   - Initializes all radial menu handlers
   - Handles expand/collapse toggle
   - Saves/restores panel state
   - Manages click-outside behavior

2. /static/js/ladyWidget.js
   - Initializes input event listeners
   - Handles Enter key submission
   - Manages message display
   - Calls sendPrompt from chat.js

3. /static/js/chat.js
   - Provides window.sendPrompt()
   - Handles streaming responses
   - Processes assistant replies
   - Manages conversation history
```

## Testing Workflow

```
1. Load page
   ✓ Widget hub visible at right-middle
   ✓ Panel hidden (display: none)
   ✓ Radial menu closed

2. Click hub (emoji button)
   ✓ Radial opens with 4 spokes
   ✓ Hub rotates 45°
   ✓ Spokes fan out with stagger animation

3. Click panel spoke (chat icon)
   ✓ Panel appears left of hub
   ✓ Panel has 320x420px size
   ✓ Input field focused

4. Type message & press ENTER
   ✓ Message appears in response area
   ✓ Input clears
   ✓ AI response streams in
   ✓ Panel auto-scrolls

5. Click expand button
   ✓ Panel grows to 600x700px
   ✓ Button shows minimized state
   ✓ Response area larger

6. Reload page
   ✓ Expanded state persists
   ✓ Panel still expanded

7. Click theme spoke
   ✓ Theme toggles light/dark

8. Click metrics spoke
   ✓ System metrics refresh
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Panel not showing | Hidden class not toggling | Check global.js handlers |
| Input not working | Script not loading | Check script src paths in index.html |
| Messages not displaying | lady-response element missing | Verify lady_panel.html structure |
| Expand not working | Event listener not attached | Check ladyExpandToggle handler |
| State not persisting | localStorage not working | Check browser permissions |

