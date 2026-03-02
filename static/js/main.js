/* =====================================================
   LADY LINUX - MAIN CONTROLLER
   ===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initThemes();
    await loadNavigation();
    initChat();
  } catch (err) {
    console.error("Initialization error:", err);
  }
});

async function loadNavigation() {
  const response = await fetch("/static/nav.html");
  const navMarkup = await response.text();

  const container = document.getElementById("nav-container");
  if (!container) return;

  container.innerHTML = navMarkup;

  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  container.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    const normalizedHref = href.replace(/\/+$/, "") || "/";
    const isActive = normalizedHref === currentPath;

    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}
