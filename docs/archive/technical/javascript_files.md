# JavaScript File Documentation

This document describes the JavaScript files under `static/js` and what each file is responsible for.

## Active Files

### `static/js/main.js`
Purpose:
- Main UI controller for page initialization, navigation loading, telemetry polling, and service actions.

Key behaviors:
- Loads page/navigation state.
- Refreshes system status cards.
- Triggers service actions (for example restart requests).
- Coordinates accordion/suggestion UI setup.

### `static/js/chat.js`
Purpose:
- Primary chat/assistant client logic.

Key behaviors:
- Sends prompts to backend endpoints.
- Renders assistant responses and status lines.
- Handles Dev Mode diagnostics metadata.
- Parses structured assistant payload segments (actions/theme).
- Integrates confirmation flow before high-impact actions.

### `static/js/actions.js`
Purpose:
- Frontend action registry and action execution helpers.

Key behaviors:
- Executes UI/system actions requested from chat payloads.
- Updates user/system/firewall panels in the UI.
- Emits custom events for cross-module sync.
- Records action history when available.

### `static/js/themes.js`
Purpose:
- Theme engine bridge for selecting, applying, and persisting themes.

Key behaviors:
- Maps theme presets to CSS variables.
- Applies typography/color settings.
- Persists theme selection in browser storage.
- Emits theme-application events for other modules.

### `static/js/design_engine.js`
Purpose:
- Profile-driven design token computation and normalization.

Key behaviors:
- Normalizes profile settings (palette, typography, shape, effects).
- Converts profile fields to final CSS tokens.
- Applies manual overrides and saves profile state.

### `static/js/dashboard.js`
Purpose:
- Dashboard metric polling and rendering.

Key behaviors:
- Polls metrics on interval.
- Computes normalized percentages (CPU/memory/disk).
- Updates metric labels and progress bars.

### `static/js/ladyWidget.js`
Purpose:
- Floating mini console widget behavior.

Key behaviors:
- Controls launcher/open/close interactions.
- Hides widget on full console page.
- Sends lightweight prompt interactions from widget UI.

### `static/js/chat_old.js`
Purpose:
- Legacy chat script kept for fallback/reference.

Key behaviors:
- Implements older streaming chat response rendering logic.

## Archive Files

Files in `static/js/archive/` are not primary runtime scripts. They are retained as historical references:
- `chat_archive.js`
- `chat_js_tossed_archive.js`
- `chat_old_archive.js`

## Loading Notes

- Page templates should only include the scripts needed for that page.
- `chat.js`, `main.js`, `actions.js`, and theme modules are expected to be the active runtime path.
- Archive scripts should not be loaded in production templates.
