/* =====================================================
   LADY LINUX – MAIN CONTROLLER
   ===================================================== */

// Application startup flow:
// 1) Initialize themes so CSS variables are ready before rendering interactions.
// 2) Load shared navigation markup into the page.
// 3) Initialize chat/AI UI behaviors.
document.addEventListener("DOMContentLoaded", async () => {

    try {
        // Initializes theme engine and applies saved/default theme.
        await initThemes();

        // Fetches and injects navigation HTML into [data-nav-target].
       await loadNavigation();

        // Wires chat controls and related event handlers.
        initChat();

    } catch (err) {
        // Side effect: logs initialization failures for debugging.
        console.error("Initialization error:", err);
    }

});

/* =====================================================
   NAVIGATION LOADER
   ===================================================== */



async function loadNavigation() {
    // Requests the shared navigation partial from the local static path.
    const response = await fetch("/static/nav.html"); // ✅ LOCAL
    const navMarkup = await response.text();

    // Host element where the navigation markup is mounted.
    const container = document.querySelector("[data-nav-target]");
    // Execution guard: exit when the current page has no nav mount target.
    if (!container) return;

    // Side effect: replaces the target container's HTML with fetched nav markup.
    container.innerHTML = navMarkup;
}
