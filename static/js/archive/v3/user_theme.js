/**
 * static/js/user_theme.js
 *
 * Per-user theme preference bridge.
 *
 * Usage:
 *   1. Call `window.setActiveUser(username)` when a user is selected
 *      (e.g. from users.html after login or user-switch).
 *   2. Call `window.saveUserTheme(username, themeName)` when a user
 *      deliberately picks a theme — this persists to the backend AND
 *      updates localStorage so restoreTheme() still works offline.
 *   3. On page load, call `window.applyUserTheme(username)` to load
 *      that user's saved theme (overrides the global active theme).
 *
 * This file must be loaded AFTER themes.js.
 */

(function () {
  "use strict";

  const LS_ACTIVE_USER_KEY = "ll-active-user";

  /* ── Internal helpers ── */

  function activeUser() {
    return sessionStorage.getItem(LS_ACTIVE_USER_KEY) || null;
  }

  async function fetchUserPrefs(username) {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/prefs`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.ok ? data.prefs : null;
    } catch {
      return null;
    }
  }

  async function putUserPrefs(username, prefs) {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  /* ── Public API ── */

  /**
   * Set the active user for this browser session.
   * Immediately fetches and applies their saved theme if one exists.
   */
  async function setActiveUser(username) {
    if (!username) {
      sessionStorage.removeItem(LS_ACTIVE_USER_KEY);
      return;
    }
    sessionStorage.setItem(LS_ACTIVE_USER_KEY, username);
    await applyUserTheme(username);
  }

  /**
   * Fetch the user's saved theme and apply it.
   * Falls back silently to whatever theme is already active.
   */
  async function applyUserTheme(username) {
    const target = username || activeUser();
    if (!target) return;

    const prefs = await fetchUserPrefs(target);
    if (!prefs || !prefs.theme) return;

    const themeName = prefs.theme;

    /* Apply via the existing themes.js pipeline */
    if (typeof window.applyTheme === "function") {
      window.applyTheme(themeName, { remote: false, persist: false });
    }

    /* Keep localStorage in sync so restoreTheme() works on next cold load */
    try {
      localStorage.setItem("lady-theme", themeName);
    } catch { /* storage unavailable — non-fatal */ }
  }

  /**
   * Save a theme choice for a user.
   * Called from the theme picker when a user is active.
   */
  async function saveUserTheme(username, themeName) {
    const target = username || activeUser();
    if (!target || !themeName) return { ok: false, stderr: "Missing user or theme" };

    /* Optimistically update localStorage */
    try {
      localStorage.setItem("lady-theme", themeName);
    } catch { /* non-fatal */ }

    return await putUserPrefs(target, { theme: themeName });
  }

  /**
   * Return the saved theme name for a user, or null.
   */
  async function getUserTheme(username) {
    const prefs = await fetchUserPrefs(username);
    return prefs ? (prefs.theme || null) : null;
  }

  /* ── Auto-apply on page load ── */
  document.addEventListener("DOMContentLoaded", () => {
    const user = activeUser();
    if (user) applyUserTheme(user);
  });

  /* ── Expose globals ── */
  window.setActiveUser   = setActiveUser;
  window.applyUserTheme  = applyUserTheme;
  window.saveUserTheme   = saveUserTheme;
  window.getUserTheme    = getUserTheme;
  window.getActiveUser   = activeUser;

}());