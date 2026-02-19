/* =====================================================
   LADY LINUX – UNIFIED SYSTEM CONTROLLER
   ===================================================== */


/* =====================================================
   THEME MANAGEMENT (SINGLE SOURCE OF TRUTH)
   ===================================================== */

function setTheme(themeName) {
    document.documentElement.setAttribute("data-theme", themeName);
    localStorage.setItem("lady-theme", themeName);
    updateActiveThemeCard(themeName);
}

function loadSavedTheme() {
    const saved = localStorage.getItem("lady-theme") || "soft";
    document.documentElement.setAttribute("data-theme", saved);
}

function updateActiveThemeCard(themeName) {
    document.querySelectorAll("[data-theme-select]").forEach(card => {
        card.classList.remove("active");
        if (card.getAttribute("data-theme-select") === themeName) {
            card.classList.add("active");
        }
    });
}

function initThemePicker() {
    const cards = document.querySelectorAll("[data-theme-select]");
    if (!cards.length) return;

    const currentTheme = localStorage.getItem("lady-theme") || "soft";
    updateActiveThemeCard(currentTheme);

    cards.forEach(card => {
        card.addEventListener("click", () => {
            const theme = card.getAttribute("data-theme-select");
            setTheme(theme);
        });
    });
}


/* =====================================================
   STREAMING HELPER (for AI responses)
   ===================================================== */

async function streamToElement(url, payload, targetElement) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Server error (${response.status})`);
        }

        if (!response.body) {
            throw new Error("Streaming not supported.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            accumulated += decoder.decode(value, { stream: true });
            targetElement.innerHTML =
                `<p><strong>Lady Linux:</strong> ${accumulated}</p>`;
            targetElement.scrollTop = targetElement.scrollHeight;
        }

    } catch (err) {
        targetElement.innerHTML +=
            `<p><strong>Error:</strong> ${err.message}</p>`;
    }
}


/* =====================================================
   ROUTING SYSTEM
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
   GENERAL AI (Index & System pages)
   ===================================================== */

function initGeneralAI() {
    const form = document.getElementById("aiForm");
    const input = document.getElementById("aiInput");
    const response = document.getElementById("aiResponse");

    if (!form || !input || !response) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const userMessage = input.value.trim();
        if (!userMessage) return;

        response.classList.remove("hidden");
        response.innerHTML =
            `<p><strong>You:</strong> ${userMessage}</p>`;

        input.value = "";

        // Theme command detection
        const lower = userMessage.toLowerCase();

        if (lower.includes("crimson")) {
            setTheme("crimson");
            return;
        }
        if (lower.includes("glass")) {
            setTheme("glass");
            return;
        }
        if (lower.includes("terminal") || lower.includes("minimal")) {
            setTheme("terminal");
            return;
        }
        if (lower.includes("soft") || lower.includes("default")) {
            setTheme("soft");
            return;
        }

        // Page routing
        const routed = handleRouting(userMessage);
        if (routed) return;

        // Send to AI backend
        await streamToElement("/ask_phi3",
            { prompt: userMessage },
            response
        );
    });
}


/* =====================================================
   USERS MODULE
   ===================================================== */

function initUsersModule() {
    const form = document.getElementById("usersAIForm");
    const input = document.getElementById("usersAIInput");
    const response = document.getElementById("usersAIResponse");

    if (!form || !input || !response) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const prompt = input.value.trim();
        if (!prompt) return;

        response.classList.remove("hidden");
        response.innerHTML =
            `<p><strong>Users Module:</strong><br>${prompt}</p>`;

        input.value = "";
    });

    // Wire user action buttons
    const addUserBtn = document.getElementById("addUserBtn");
    if (addUserBtn) {
        addUserBtn.addEventListener("click", () => {
            response.classList.remove("hidden");
            response.innerHTML =
                `<p><strong>Action:</strong> Add User dialog would open here.</p>`;
        });
    }

    const changePasswordBtn = document.getElementById("changePasswordBtn");
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener("click", () => {
            response.classList.remove("hidden");
            response.innerHTML =
                `<p><strong>Action:</strong> Change Password dialog would open here.</p>`;
        });
    }

    const removeUserBtn = document.getElementById("removeUserBtn");
    if (removeUserBtn) {
        removeUserBtn.addEventListener("click", () => {
            response.classList.remove("hidden");
            response.innerHTML =
                `<p><strong>Action:</strong> Remove User confirmation would appear here.</p>`;
        });
    }
}


/* =====================================================
   FIREWALL MODULE
   ===================================================== */

function initFirewallModule() {
    const form = document.getElementById("firewallForm");
    const input = document.getElementById("firewallPrompt");
    const response = document.getElementById("firewallResponse");
    const jsonBox = document.getElementById("firewallJSON");

    if (!form || !input || !response) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const prompt = input.value.trim();
        if (!prompt) return;

        response.innerHTML =
            `<p><strong>You:</strong> ${prompt}</p>`;

        if (jsonBox) jsonBox.textContent = "Loading...";

        try {
            const res = await fetch("/ask_firewall", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
            });

            if (!res.ok) {
                throw new Error(`Server error (${res.status})`);
            }

            const data = await res.json();

            response.innerHTML +=
                `<p><strong>Lady Linux:</strong> ${data.output}</p>`;

            if (jsonBox) {
                jsonBox.textContent =
                    JSON.stringify(data.firewall_json, null, 2);
            }

        } catch (err) {
            response.innerHTML +=
                `<p><strong>Error:</strong> ${err.message}</p>`;
            if (jsonBox) jsonBox.textContent = "Error loading firewall data.";
        }
    });
}


/* =====================================================
   OS MODULE
   ===================================================== */

function initOSModule() {
    const form = document.getElementById("osForm");
    const input = document.getElementById("osPrompt");
    const response = document.getElementById("osResponse");

    if (!form || !input || !response) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const prompt = input.value.trim();
        if (!prompt) return;

        response.classList.remove("hidden");
        response.innerHTML =
            `<p><strong>You:</strong> ${prompt}</p>`;

        input.value = "";

        await streamToElement("/ask_phi3", { prompt }, response);
    });
}


/* =====================================================
   INITIALIZATION
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    loadSavedTheme();
    initThemePicker();

    initGeneralAI();
    initUsersModule();
    initFirewallModule();
    initOSModule();

});
