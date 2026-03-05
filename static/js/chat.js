/* =====================================================
   LADY LINUX – UNIFIED SYSTEM CONTROLLER (JSON DRIVEN)
   ===================================================== */

/* =====================================================
   GLOBAL THEME REGISTRY
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
   APPLY THEME
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
   NAVIGATION LOADER
   ===================================================== */

async function loadNavigation() {
    try {
        const response = await fetch("nav.html");
        if (!response.ok) throw new Error("Failed to load nav");

        const navMarkup = await response.text();
        const navContainer = document.querySelector("nav[data-nav-target]");

        if (navContainer) {
            navContainer.innerHTML = navMarkup;
            highlightActiveNavLink();
        }
    } catch (err) {
        console.error("Navigation load error:", err);
    }
}

function highlightActiveNavLink() {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";

    document.querySelectorAll(".nav-link").forEach(link => {
        const href = link.getAttribute("href");
        if (href === currentPage) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });
}

/* =====================================================
   THEME PICKER
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
   CUSTOM THEME SYSTEM
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

    // Mutate runtime theme
    THEMES[activeCustomSlot] = {
        ...THEMES[activeCustomSlot],
        "accent": accent,
        "accent-hover": accent,
        "bg-main": background,
        "bg-surface": surface,
        "bg-elevated": surface,
        "bg-input": surface
    };

    // Persist custom theme separately
    localStorage.setItem(activeCustomSlot, JSON.stringify(THEMES[activeCustomSlot]));

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
        `linear-gradient(135deg, ${data["bg-main"] || data.background}, ${data["accent"]})`;
}

/* =====================================================
   STREAMING HELPER
   ===================================================== */

async function streamToElement(url, payload, targetElement) {

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.body) throw new Error("Streaming not supported.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            accumulated += decoder.decode(value, { stream: true });
            targetElement.innerHTML =
                `<p><strong>Lady Linux:</strong> ${accumulated}</p>`;
        }

    } catch (err) {
        targetElement.innerHTML +=
            `<p><strong>Error:</strong> ${err.message}</p>`;
    }
}

/* =====================================================
   ROUTING
   ===================================================== */

function handleRouting(inputText) {

    const text = inputText.toLowerCase().trim();

    const routes = {
        "users": "users.html",
        "system": "system.html",
        "firewall": "firewall.html",
        "os": "os.html",
        "home": "index.html"
    };

    for (const [keyword, path] of Object.entries(routes)) {
        if (text === keyword || text.includes(`${keyword} page`)) {
            window.location.href = path;
            return true;
        }
    }

    return false;
}

/* =====================================================
   GENERAL AI HANDLER
   ===================================================== */

function initGeneralAI() {

    const form = document.getElementById("aiForm");
    if (!form) return;

    form.addEventListener("submit", (e) => {

        e.preventDefault();
        const input = document.getElementById("aiInput");
        const prompt = input.value.trim().toLowerCase();
        if (!prompt) return;

        if (THEMES[prompt]) {
            applyTheme(prompt);
            input.value = "";
            return;
        }

        if (handleRouting(prompt)) return;

        input.value = "";
    });
}

function initFirewallAssistant() {

    const firewallForm = document.getElementById("firewallForm");
    if (!firewallForm) return;

    const firewallPrompt = document.getElementById("firewallPrompt");
    const firewallResponse = document.getElementById("firewallResponse");

    firewallForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const prompt = (firewallPrompt?.value || "").trim();
        if (!prompt) return;

        if (firewallResponse) {
            firewallResponse.textContent = `You: ${prompt}\n\nLoading firewall data...`;
        }

        try {
            const res = await fetch("/ask_firewall", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt })
            });

            const text = await res.text();
            if (firewallResponse) {
                firewallResponse.textContent = text;
            }
        } catch (err) {
            if (firewallResponse) {
                firewallResponse.textContent = `Lady Linux: Error - ${err.message}`;
            }
        }
    });
}

async function loadFirewallJsonPanel() {

    const firewallJsonEl = document.getElementById("firewallJSON");
    if (!firewallJsonEl) return;

    try {
        const res = await fetch("/firewall_status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const fwJson = await res.json();
        firewallJsonEl.textContent = JSON.stringify(fwJson, null, 2);
    } catch (err) {
        firewallJsonEl.textContent = `Unable to load firewall JSON: ${err.message}`;
    }
}

/* =====================================================
   OS PAGE — RAG PANEL
   ===================================================== */

function initOsPanel() {

    const form = document.getElementById("osForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const input = document.getElementById("osPrompt");
        const responseBox = document.getElementById("osResponse");
        const prompt = input.value.trim();
        if (!prompt) return;

        // Show the response area with a loading state
        responseBox.classList.remove("hidden");
        responseBox.innerHTML = "<p><em>Thinking…</em></p>";

        // Stream the RAG-augmented answer from Mistral
        await streamToElement(
            "/ask_rag",
            { prompt: prompt, domain: "os" },
            responseBox
        );

        input.value = "";
    });
}

/* =====================================================
   INITIALIZATION
   ===================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    await loadThemes();

    await loadNavigation();

    restoreTheme();

    initThemePicker();
    initCustomThemes();
    initGeneralAI();
    initFirewallAssistant();
    await loadFirewallJsonPanel();
    initOsPanel();
});