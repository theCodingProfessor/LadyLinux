/* =====================================================
   LADY LINUX – MAIN CONTROLLER
   ===================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    try {
        // 1. Load theme system FIRST (affects UI)
        await initThemes();

        // 2. Load navigation
        await loadNavigation();

        // 3. Initialize AI / Chat system
        initChat();

    } catch (err) {
        console.error("Initialization error:", err);
    }

});

/* =====================================================
   NAVIGATION LOADER
   ===================================================== */

async function loadNavigation() {
    const response = await fetch("nav.html");
    const navMarkup = await response.text();

    const container = document.querySelector("[data-nav-target]");
    if (!container) return;

    container.innerHTML = navMarkup;

    // highlight active page
    const currentPage = window.location.pathname.split("/").pop() || "index.html";

    container.querySelectorAll(".nav-link").forEach(link => {
        if (link.getAttribute("href") === currentPage) {
            link.classList.add("active");
        }
    });
}