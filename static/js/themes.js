/* =====================================================
   LADY LINUX – THEME ENGINE
   ===================================================== */

/* =====================================================
   GLOBAL STATE
   ===================================================== */

// In-memory theme registry loaded from themes.json + localStorage overrides.
let THEMES = {};
// Tracks which custom slot is currently being edited in the modal.
let activeCustomSlot = null;

/* =====================================================
   LOAD THEMES.JSON
   ===================================================== */

// Loads theme definitions and merges any persisted custom slot values.
async function loadThemes() {
    try {
        const response = await fetch("/static/themes.json");
        if (!response.ok) throw new Error("Failed to load themes.json");

        const data = await response.json();
        // Important variable: THEMES is the canonical source for applyTheme.
        THEMES = data.themes || {};

        // Merges per-theme localStorage overrides back into runtime theme map.
        Object.keys(THEMES).forEach(key => {
            const stored = localStorage.getItem(key);
            if (stored) {
                THEMES[key] = JSON.parse(stored);
            }
        });

    } catch (err) {
        // Side effect: logs theme loading errors without stopping script execution.
        console.error("Theme load error:", err);
    }
}

/* =====================================================
   APPLY THEME (JSON → CSS VARIABLES)
   ===================================================== */

// Applies one theme by key to document-level CSS custom properties.
function applyTheme(themeKey) {
    // Guard: skip when the requested key is missing.
    if (!THEMES[themeKey]) return;

    const theme = THEMES[themeKey];

    // Marks active theme on <html> for selectors that rely on data-theme.
    document.documentElement.setAttribute("data-theme", themeKey);

    // Execution flow: each JSON key/value becomes a CSS variable on :root scope.
    Object.entries(theme).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
    });

    // Persists chosen theme and refreshes active-state UI indicators.
    localStorage.setItem("lady-theme", themeKey);
    updateActiveThemeCard(themeKey);
}

/* =====================================================
   RESTORE SAVED THEME
   ===================================================== */

// Restores last selected theme, falling back to "soft" on first load.
function restoreTheme() {
    const saved = localStorage.getItem("lady-theme") || "soft";
    applyTheme(saved);
}

/* =====================================================
   THEME PICKER UI
   ===================================================== */

// Synchronizes .active state across preset and custom theme cards.
function updateActiveThemeCard(themeName) {
    document.querySelectorAll("[data-theme-select]").forEach(card => {
        card.classList.toggle(
            "active",
            card.getAttribute("data-theme-select") === themeName
        );
    });

    document.querySelectorAll("[data-custom-slot]").forEach(card => {
        card.classList.toggle(
            "active",
            card.getAttribute("data-custom-slot") === themeName
        );
    });
}

// Adds click handlers for built-in theme option cards.
function initThemePicker() {
    document.querySelectorAll("[data-theme-select]").forEach(card => {
        card.addEventListener("click", () => {
            const theme = card.getAttribute("data-theme-select");
            applyTheme(theme);
        });
    });
}

/* =====================================================
   CUSTOM THEMES
   ===================================================== */

// Initializes custom theme slot cards and save button handler.
function initCustomThemes() {
    const slots = document.querySelectorAll("[data-custom-slot]");
    if (!slots.length) return;

    slots.forEach(slot => {
        const key = slot.getAttribute("data-custom-slot");

        // Loads persisted preview gradient for each custom slot.
        loadCustomPreview(key);

        slot.addEventListener("click", () => {
            // Important variable: activeCustomSlot controls where save writes.
            activeCustomSlot = key;

            const modal = new bootstrap.Modal(
                document.getElementById("customThemeModal")
            );
            // Side effect: opens Bootstrap modal for editing custom theme colors.
            modal.show();
        });
    });

    const saveBtn = document.getElementById("saveCustomTheme");
    if (saveBtn) {
        saveBtn.addEventListener("click", saveCustomTheme);
    }
}

// Saves user-selected colors into THEME map + localStorage for current slot.
function saveCustomTheme() {
    if (!activeCustomSlot) return;

    const accent = document.getElementById("customAccent").value;
    const background = document.getElementById("customBackground").value;
    const surface = document.getElementById("customSurface").value;

    // Execution flow: extends existing slot data, then overrides key color entries.
    THEMES[activeCustomSlot] = {
        ...THEMES[activeCustomSlot],
        "accent": accent,
        "accent-hover": accent,
        "bg-main": background,
        "bg-surface": surface,
        "bg-elevated": surface,
        "bg-input": surface
    };

    // Side effect: persists custom slot payload under slot key in localStorage.
    localStorage.setItem(
        activeCustomSlot,
        JSON.stringify(THEMES[activeCustomSlot])
    );

    // Refreshes UI preview, applies theme live, then closes modal.
    loadCustomPreview(activeCustomSlot);
    applyTheme(activeCustomSlot);

    const modalInstance = bootstrap.Modal.getInstance(
        document.getElementById("customThemeModal")
    );
    if (modalInstance) modalInstance.hide();
}

// Renders the visual preview gradient for a saved custom slot.
function loadCustomPreview(slotKey) {
    const preview = document.getElementById(`preview-${slotKey}`);
    if (!preview) return;

    const stored = localStorage.getItem(slotKey);

    // If no stored theme → render empty state properly
    if (!stored) {
        preview.style.background = "transparent";
        preview.style.border = "1px dashed var(--border-soft)";
        return;
    }

    const data = JSON.parse(stored);

    preview.style.border = "none"; // remove dashed border when active
    preview.style.background =
        `linear-gradient(135deg, ${data["bg-main"]}, ${data["accent"]})`;
}



/* =====================================================
   INITIALIZATION (THEMES ONLY)
   ===================================================== */

// Public theme bootstrap entry used by main.js during app startup.
async function initThemes() {

    await loadThemes();   // load theme JSON

    restoreTheme();       // apply saved/default theme

    initThemePicker();    // UI hooks
    initCustomThemes();   // custom theme system
}
