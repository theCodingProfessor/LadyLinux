/**
 * static/js/nav_controls.js
 *
 * Handles the navbar dark/light toggle and notification dropdown.
 * Depends on: themes.js (window.applyTheme must be available).
 * Load order: after themes.js, after DOMContentLoaded fires.
 */

(function () {
  "use strict";

  /* ── Theme toggle ─────────────────────────────────────────── */

  // The two named themes used for the quick toggle.
  // Change these keys to match whichever themes you want to swap.
  const DARK_THEME  = "terminal";
  const LIGHT_THEME = "softcore";

  // localStorage key shared with themes.js
  const LS_THEME_KEY = "lady-theme";

  const themeBtn  = document.getElementById("navThemeToggle");
  const themeIcon = document.getElementById("navThemeIcon");

  /**
   * Update the navbar icon to reflect the currently active theme.
   * Moon = currently dark (click to go light); Sun = currently light (click to go dark).
   */
  function syncThemeIcon(activeTheme) {
    if (!themeIcon) return;
    const isDark = activeTheme === DARK_THEME;
    themeIcon.className = isDark
      ? "bi bi-sun-fill"           // dark mode active → show sun (switch to light)
      : "bi bi-moon-stars-fill";   // light mode active → show moon (switch to dark)
  }

  /**
   * Sync BOTH the navbar icon and the radial spoke icon to reflect active theme.
   * Called on toggle and on page load.
   */
  function syncAllThemeIcons(activeTheme) {
    syncThemeIcon(activeTheme);

    const spokeIcon = document.querySelector("#ladySpokeTheme i");
    if (spokeIcon) {
      const isDark = activeTheme === DARK_THEME;
      spokeIcon.className = isDark ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
    }
  }

  /**
   * Toggle between dark and light named themes.
   * Delegates to window.applyTheme without syncing to the backend.
   */
  function handleThemeToggle() {
    if (typeof window.applyTheme !== "function") {
      console.warn("[nav_controls] window.applyTheme not available");
      return;
    }

    const current = localStorage.getItem(LS_THEME_KEY) || DARK_THEME;
    const next = current === DARK_THEME ? LIGHT_THEME : DARK_THEME;

    window.applyTheme(next, { remote: false, persist: true });
    localStorage.setItem(LS_THEME_KEY, next);
    syncAllThemeIcons(next);
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", handleThemeToggle);

    // Sync both icons on page load — short delay so restoreTheme() runs first
    setTimeout(() => {
      const saved = localStorage.getItem(LS_THEME_KEY) || DARK_THEME;
      syncAllThemeIcons(saved);
    }, 100);
  }

  // Expose for global.js spoke wiring
  window.handleThemeToggle = handleThemeToggle;
  window.syncAllThemeIcons = syncAllThemeIcons;


  /* ── Notification dropdown ────────────────────────────────── */

  const notifList      = document.getElementById("navNotifList");
  const notifEmpty     = document.getElementById("navNotifEmpty");
  const notifBadge     = document.getElementById("navNotifBadge");
  const notifMarkRead  = document.getElementById("navNotifMarkRead");

  /**
   * Notification item shape:
   *   { id, icon, text, sub, href, read }
   *
   * In future this can be fetched from /api/notifications.
   * For now, static stubs are used as a UI scaffold.
   */
  let notifications = [
    // Stub entries — replace with a fetch() call when the API is ready
    { id: 1, icon: "bi-hdd",         text: "Disk usage above 80%",      sub: "2 min ago",  href: "/os",       read: false },
    { id: 2, icon: "bi-shield-x",    text: "UFW blocked 3 connections",  sub: "14 min ago", href: "/firewall", read: false },
    { id: 3, icon: "bi-cpu",         text: "CPU spike detected (92%)",   sub: "1 hr ago",   href: "/os",       read: true  },
  ];

  /** Build and render all notification list items into #navNotifList */
  function renderNotifications() {
    if (!notifList) return;

    const unread = notifications.filter((n) => !n.read);

    // Toggle empty-state visibility
    if (notifEmpty) notifEmpty.classList.toggle("d-none", notifications.length > 0);

    // Update badge
    if (notifBadge) {
      if (unread.length > 0) {
        notifBadge.textContent = unread.length;
        notifBadge.classList.remove("d-none");
      } else {
        notifBadge.classList.add("d-none");
      }
    }

    // Clear existing items before re-render
    notifList.innerHTML = "";

    notifications.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <a
          class="dropdown-item d-flex align-items-start gap-2 py-2 ${item.read ? "opacity-50" : ""}"
          href="${item.href || '#'}"
          data-notif-id="${item.id}"
          style="font-size: 0.82rem; white-space: normal;"
        >
          <!-- Icon col -->
          <i class="bi ${item.icon} mt-1 flex-shrink-0" style="color: var(--accent);"></i>
          <!-- Text col -->
          <div class="flex-grow-1 min-width-0">
            <div class="fw-semibold lh-sm">${item.text}</div>
            <div class="text-muted" style="font-size: 0.72rem;">${item.sub}</div>
          </div>
          <!-- Unread dot -->
          ${!item.read ? '<span class="flex-shrink-0 rounded-circle ms-1 mt-1" style="width:6px;height:6px;background:var(--accent);display:inline-block;"></span>' : ""}
        </a>`;

      // Mark individual item as read on click
      li.querySelector("a").addEventListener("click", () => {
        item.read = true;
        renderNotifications();   // re-render badge + items
      });

      notifList.appendChild(li);
    });
  }

  /** Mark all notifications read */
  if (notifMarkRead) {
    notifMarkRead.addEventListener("click", (e) => {
      e.preventDefault();
      notifications.forEach((n) => (n.read = true));
      renderNotifications();
    });
  }

  // Initial render
  renderNotifications();

}());
