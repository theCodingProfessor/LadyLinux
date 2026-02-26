/* =====================================================
   LADY LINUX – THEME ENGINE (ISOLATED)
   ===================================================== */

/* =====================================================
   GLOBAL STATE
   ===================================================== */

let THEMES = {};
let activeCustomSlot = null;

/* =====================================================
   LOAD THEMES.JSON
   ===================================================== */

async function loadThemes() {
    try {
        const response = await fetch("themes.json");
        if (!response.ok) throw new Error("Failed to load themes.json");

        const data = await response.json();
        THEMES = data.themes || {};
    } catch (err) {
        console.error("Theme load error:", err);
    }
}

/* =====================================================
   APPLY THEME (JSON → CSS VARIABLES)
   ===================================================== */

function applyTheme(themeKey) {
    if (!THEMES[themeKey]) return;

    const theme = THEMES[themeKey];

    Object.entries(theme).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
    });

    localStorage.setItem("lady-theme", themeKey);
    updateActiveThemeCard(themeKey);
}

/* =====================================================
   RESTORE SAVED THEME
   ===================================================== */

function restoreTheme() {
    const saved = localStorage.getItem("lady-theme") || "soft";
    applyTheme(saved);
}

/* =====================================================
   THEME PICKER UI
   ===================================================== */

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

function initCustomThemes() {
    const slots = document.querySelectorAll("[data-custom-slot]");
    if (!slots.length) return;

    slots.forEach(slot => {
        const key = slot.getAttribute("data-custom-slot");

        loadCustomPreview(key);

        slot.addEventListener("click", () => {
            activeCustomSlot = key;

            const modal = new bootstrap.Modal(
                document.getElementById("customThemeModal")
            );
            modal.show();
        });
    });

    const saveBtn = document.getElementById("saveCustomTheme");
    if (saveBtn) {
        saveBtn.addEventListener("click", saveCustomTheme);
    }
}

function saveCustomTheme() {
    if (!activeCustomSlot) return;

    const accent = document.getElementById("customAccent").value;
    const background = document.getElementById("customBackground").value;
    const surface = document.getElementById("customSurface").value;

    THEMES[activeCustomSlot] = {
        ...THEMES[activeCustomSlot],
        "accent": accent,
        "accent-hover": accent,
        "bg-main": background,
        "bg-surface": surface,
        "bg-elevated": surface,
        "bg-input": surface
    };

    localStorage.setItem(
        activeCustomSlot,
        JSON.stringify(THEMES[activeCustomSlot])
    );

    loadCustomPreview(activeCustomSlot);
    applyTheme(activeCustomSlot);

    const modalInstance = bootstrap.Modal.getInstance(
        document.getElementById("customThemeModal")
    );
    if (modalInstance) modalInstance.hide();
}

function loadCustomPreview(slotKey) {
    const preview = document.getElementById(`preview-${slotKey}`);
    if (!preview) return;

    const stored = localStorage.getItem(slotKey);
    if (!stored) return;

    const data = JSON.parse(stored);

    preview.style.background =
        `linear-gradient(135deg, ${data["bg-main"]}, ${data["accent"]})`;
}

/* =====================================================
   REMOTE CSS LOADER (TEMP FIX)
   ===================================================== */

function loadCSS() {
    return fetch("https://raw.githubusercontent.com/theCodingProfessor/LadyLinux/Capstone_Dev_01/static/css/style.css")
        .then(res => res.text())
        .then(css => {
            const style = document.createElement("style");
            style.innerHTML = css;
            document.head.appendChild(style);
        })
        .catch(err => console.error("CSS load failed:", err));
}

/* =====================================================
   INITIALIZATION (THEMES ONLY)
   ===================================================== */

async function initThemes() {
    await loadCSS();      // load styling system
    await loadThemes();   // load theme JSON

    restoreTheme();       // apply saved/default theme

    initThemePicker();    // UI hooks
    initCustomThemes();   // custom theme system
}