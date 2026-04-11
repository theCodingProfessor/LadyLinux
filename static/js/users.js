/*
════════════════════════════════════════════════════════════════════════════════
  Module: USERS
  File: static/js/users.js
  Template: templates/users.html
  Description: User and account management interface with sorting and detail panel
════════════════════════════════════════════════════════════════════════════════
*/

(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────────
     CONFIGURATION
     Centralized selectors and API endpoints
  ────────────────────────────────────────────────────────────────────────── */
  const CONFIG = {
    API_USERS: "/api/users",
    SELECTOR_USER_LIST: "#userList",
    SELECTOR_USER_COUNT: "#userCountBadge",
    SELECTOR_DETAIL_CONTENT: "#userDetailContent",
    SELECTOR_EDIT_BTN: "#editUserBtn",
    SELECTOR_CHANGE_PW_BTN: "#changePasswordBtn",
    SELECTOR_CHANGE_SHELL_BTN: "#changeShellBtn",
    SELECTOR_REMOVE_BTN: "#removeUserBtn",
    SELECTOR_EDIT_PW_ASSIST: "#editPasswordAssistBtn",
    SELECTOR_REMOVE_ASSIST: "#removeUserAssistBtn",
    SELECTOR_CONFIRM_PW: "#confirmPassword",
    SELECTOR_NEW_PW: "#newPassword",
    SELECTOR_PW_ERROR: "#passwordMatchError",
    SELECTOR_REFRESH_BTN: "#refreshUsersBtn",
    SELECTOR_ADD_ASSIST_BTN: "#addUserAssistBtn",
    SELECTOR_CHAT_INPUT: "#chatInput",
    SELECTOR_SORT_BUTTONS: "[data-users-sort]",
    SELECTOR_USER_ROWS: ".users-row-clickable",
  };

  /* ──────────────────────────────────────────────────────────────────────────
     STATE
     Mutable application state
  ────────────────────────────────────────────────────────────────────────── */
  const usersState = {
    selectedUser: null,
    sortKey: "name",
    sortDirection: "asc",
    allUsersData: [],
  };

  /* ──────────────────────────────────────────────────────────────────────────
     HELPER FUNCTIONS
  ────────────────────────────────────────────────────────────────────────── */
  function initials(name) {
    return (name || "?").slice(0, 2).toUpperCase();
  }

  function shellLabel(shell) {
    if (!shell) return "—";
    return `<span class="users-shell-badge">${shell.split("/").pop()}</span>`;
  }

  function truncate(str, n) {
    if (!str) return "—";
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  function $(sel) {
    return document.getElementById(sel) || document.querySelector(sel);
  }

  function setActionState(enabled) {
    [
      $(CONFIG.SELECTOR_EDIT_BTN),
      $(CONFIG.SELECTOR_CHANGE_PW_BTN),
      $(CONFIG.SELECTOR_CHANGE_SHELL_BTN),
      $(CONFIG.SELECTOR_REMOVE_BTN),
      $(CONFIG.SELECTOR_EDIT_PW_ASSIST),
      $(CONFIG.SELECTOR_REMOVE_ASSIST),
    ].forEach(btn => {
      if (btn) btn.disabled = !enabled;
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     LOAD USER LIST
  ────────────────────────────────────────────────────────────────────────── */
  async function loadUsers() {
    const userList = $(CONFIG.SELECTOR_USER_LIST);
    const userCountBadge = $(CONFIG.SELECTOR_USER_COUNT);

    userList.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
      <span class="spinner-border spinner-border-sm me-2"></span>Loading…</td></tr>`;

    try {
      const res = await fetch(CONFIG.API_USERS);
      const data = await res.json();
      const names = Array.isArray(data.users) ? data.users : [];
      userCountBadge.textContent = names.length;

      if (!names.length) {
        userList.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No users found</td></tr>`;
        return;
      }

      // Fetch full detail for all users in parallel so sort columns have real data
      const detailResults = await Promise.allSettled(
        names.map(name => fetch(`/api/users/${encodeURIComponent(name)}`).then(r => r.json()))
      );

      usersState.allUsersData = detailResults.map((result, i) => {
        if (result.status === "fulfilled" && result.value?.ok && result.value?.user) {
          return result.value.user;
        }
        return { name: names[i], uid: null, shell: null, home: null, gid: null, comment: null };
      });

      renderUserTable();

      if (usersState.allUsersData.length) selectUser(usersState.allUsersData[0].name);
    } catch (err) {
      userList.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">
        <i class="bi bi-exclamation-triangle me-1"></i>Failed to load users</td></tr>`;
      console.error("loadUsers:", err);
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     SORTING
  ────────────────────────────────────────────────────────────────────────── */
  function getSortedUsers(rows) {
    return [...rows].sort((a, b) => {
      let result = 0;
      if (usersState.sortKey === "name") {
        result = String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      } else if (usersState.sortKey === "uid") {
        const aNum = Number.isFinite(Number(a.uid)) ? Number(a.uid) : Infinity;
        const bNum = Number.isFinite(Number(b.uid)) ? Number(b.uid) : Infinity;
        result = aNum - bNum;
      } else if (usersState.sortKey === "shell") {
        result = String(a.shell || "").localeCompare(String(b.shell || ""), undefined, { sensitivity: "base" });
      } else if (usersState.sortKey === "home") {
        result = String(a.home || "").localeCompare(String(b.home || ""), undefined, { sensitivity: "base" });
      }
      return usersState.sortDirection === "desc" ? result * -1 : result;
    });
  }

  function updateUserSortIndicators() {
    document.querySelectorAll(CONFIG.SELECTOR_SORT_BUTTONS).forEach(button => {
      const sortKey = button.getAttribute("data-users-sort");
      const header = button.closest("th");
      const icon = button.querySelector("[data-sort-icon]");
      const isActive = sortKey === usersState.sortKey;

      if (header) {
        header.setAttribute("aria-sort",
          isActive ? (usersState.sortDirection === "asc" ? "ascending" : "descending") : "none");
      }
      button.classList.toggle("is-active", isActive);
      if (icon) {
        icon.className = `bi ${isActive
          ? (usersState.sortDirection === "asc" ? "bi-caret-up-fill" : "bi-caret-down-fill")
          : "bi-arrow-down-up"} ll-sort-icon`;
      }
    });
  }

  function initUserSorting() {
    document.querySelectorAll(CONFIG.SELECTOR_SORT_BUTTONS).forEach(button => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-users-sort");
        if (usersState.sortKey === key) {
          usersState.sortDirection = usersState.sortDirection === "asc" ? "desc" : "asc";
        } else {
          usersState.sortKey = key;
          usersState.sortDirection = "asc";
        }
        renderUserTable();
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     RENDER USER TABLE
  ────────────────────────────────────────────────────────────────────────── */
  function renderUserTable() {
    const userList = $(CONFIG.SELECTOR_USER_LIST);
    const sorted = getSortedUsers(usersState.allUsersData);

    userList.innerHTML = sorted.map(u => `
      <tr class="users-row-clickable${usersState.selectedUser === u.name ? " selected" : ""}"
          data-username="${u.name}" tabindex="0"
          role="button" aria-label="Select user ${u.name}">
        <td>
          <div class="users-avatar" style="width:32px;height:32px;font-size:0.72rem;">
            ${initials(u.name)}
          </div>
        </td>
        <td class="fw-medium">${u.name}</td>
        <td class="text-muted uid-cell" style="font-size:0.82rem">${u.uid ?? "—"}</td>
        <td class="shell-cell">${u.shell ? shellLabel(u.shell) : "—"}</td>
        <td class="text-muted home-cell" style="font-size:0.78rem">${truncate(u.home, 24)}</td>
      </tr>`).join("");

    document.querySelectorAll(CONFIG.SELECTOR_USER_ROWS).forEach(row => {
      row.addEventListener("click", () => selectUser(row.dataset.username));
      row.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") selectUser(row.dataset.username);
      });
    });

    updateUserSortIndicators();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     SELECT USER AND LOAD DETAIL
  ────────────────────────────────────────────────────────────────────────── */
  async function selectUser(name) {
    usersState.selectedUser = name;
    const detailContent = $(CONFIG.SELECTOR_DETAIL_CONTENT);

    document.querySelectorAll(CONFIG.SELECTOR_USER_ROWS).forEach(r =>
      r.classList.toggle("selected", r.dataset.username === name));

    ["editUserTarget", "changePwTarget", "changeShellTarget", "removeUserTarget"]
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
      });

    setActionState(true);

    // Apply this user's saved theme
    if (typeof window.setActiveUser === "function") {
      window.setActiveUser(name);
    }

    detailContent.innerHTML = `<div class="text-center text-muted py-4">
      <span class="spinner-border spinner-border-sm me-2"></span>Loading details…</div>`;

    try {
      // Use cached data from allUsersData — avoids duplicate fetch per click
      const cached = usersState.allUsersData.find(u => u.name === name);
      const data = cached ? { ok: true, user: cached } : { ok: false };

      if (!data.ok || !data.user) {
        detailContent.innerHTML = `<div class="users-detail-empty">
          <i class="bi bi-exclamation-circle"></i>
          ${data.stderr || "Could not load user details"}
        </div>`;
        return;
      }

      const u = data.user;

      // Fetch user's saved theme pref for the detail panel
      let savedTheme = null;
      if (typeof window.getUserTheme === "function") {
        savedTheme = await window.getUserTheme(name);
      }

      // Pre-fill modals
      const editComment = document.getElementById("editUserComment");
      const editShell = document.getElementById("editUserShellSelect");
      const shellSel = document.getElementById("shellSelect");
      if (editComment) editComment.value = u.comment || "";
      if (editShell) editShell.value = u.shell || "/bin/bash";
      if (shellSel) shellSel.value = u.shell || "/bin/bash";

      detailContent.innerHTML = `
        <div class="d-flex align-items-center gap-3 mb-4">
          <div class="users-avatar users-avatar-lg">${initials(u.name)}</div>
          <div>
            <div class="fw-semibold fs-5">${u.name}</div>
            <div class="text-muted" style="font-size:0.83rem">${u.comment || "No display name set"}</div>
            <div class="mt-1">${shellLabel(u.shell)}</div>
          </div>
        </div>
        <div class="users-detail-grid mb-3">
          <div class="users-detail-row">
            <span class="users-detail-label">UID</span>
            <span class="users-detail-value">${u.uid}</span>
          </div>
          <div class="users-detail-row">
            <span class="users-detail-label">GID</span>
            <span class="users-detail-value">${u.gid}</span>
          </div>
          <div class="users-detail-row">
            <span class="users-detail-label">Home Directory</span>
            <span class="users-detail-value">${u.home || "—"}</span>
          </div>
          <div class="users-detail-row">
            <span class="users-detail-label">Login Shell</span>
            <span class="users-detail-value">${u.shell || "—"}</span>
          </div>
        </div>
        <div class="users-section-divider"></div>
        <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
          <label class="users-detail-label mb-0" style="min-width:fit-content">Theme Preference</label>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <select class="form-select form-select-sm" id="userThemeSelect" style="width:auto;min-width:140px">
              <option value="">— use global —</option>
              <option value="softcore" ${savedTheme === "softcore" ? "selected" : ""}>Soft Core</option>
              <option value="crimson"  ${savedTheme === "crimson"  ? "selected" : ""}>Crimson</option>
              <option value="glass"    ${savedTheme === "glass"    ? "selected" : ""}>Glass</option>
              <option value="terminal" ${savedTheme === "terminal" ? "selected" : ""}>Terminal</option>
            </select>
            <button class="btn btn-primary btn-sm" id="saveUserThemeBtn">
              <i class="bi bi-check-lg me-1"></i>Save
            </button>
            <span class="text-muted d-none" id="userThemeSaved" style="font-size:0.78rem">
              <i class="bi bi-check-circle me-1 text-success"></i>Saved
            </span>
          </div>
        </div>
        <div class="users-section-divider"></div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                  data-bs-toggle="modal" data-bs-target="#editUserModal">
            <i class="bi bi-pencil"></i> Edit
          </button>
          <button class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                  data-bs-toggle="modal" data-bs-target="#changePasswordModal">
            <i class="bi bi-key"></i> Password
          </button>
          <button class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                  data-bs-toggle="modal" data-bs-target="#changeShellModal">
            <i class="bi bi-terminal"></i> Shell
          </button>
          <button class="btn btn-outline-danger btn-sm d-flex align-items-center gap-1 ms-auto"
                  data-bs-toggle="modal" data-bs-target="#removeUserModal">
            <i class="bi bi-person-x"></i> Remove
          </button>
        </div>`;

      // Wire theme save button
      document.getElementById("saveUserThemeBtn")?.addEventListener("click", async () => {
        const sel = document.getElementById("userThemeSelect");
        const savedEl = document.getElementById("userThemeSaved");
        if (!sel) return;
        const theme = sel.value;
        if (theme && typeof window.saveUserTheme === "function") {
          await window.saveUserTheme(name, theme);
          if (typeof window.applyTheme === "function") {
            window.applyTheme(theme, { remote: false, persist: false });
          }
        }
        if (savedEl) {
          savedEl.classList.remove("d-none");
          setTimeout(() => savedEl.classList.add("d-none"), 2000);
        }
      });
    } catch (err) {
      detailContent.innerHTML = `<div class="users-detail-empty">
        <i class="bi bi-exclamation-circle"></i>Failed to load details</div>`;
      console.error("selectUser:", err);
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     EVENT HANDLERS
  ────────────────────────────────────────────────────────────────────────── */
  function attachEventHandlers() {
    // Password validation
    $(CONFIG.SELECTOR_CONFIRM_PW)?.addEventListener("input", () => {
      const pw1 = $(CONFIG.SELECTOR_NEW_PW).value;
      const pw2 = $(CONFIG.SELECTOR_CONFIRM_PW).value;
      const err = $(CONFIG.SELECTOR_PW_ERROR);
      const match = pw1 === pw2 && pw1.length > 0;
      err.classList.toggle("d-none", !pw2 || match);
    });

    // Refresh button
    $(CONFIG.SELECTOR_REFRESH_BTN)?.addEventListener("click", loadUsers);

    // Assistant bridge
    function sendToAssistant(prompt) {
      const input = $(CONFIG.SELECTOR_CHAT_INPUT) || document.querySelector("[data-chat-input]");
      if (input) {
        input.value = prompt;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }
    }

    $(CONFIG.SELECTOR_ADD_ASSIST_BTN)?.addEventListener("click", () =>
      sendToAssistant("Add a new system user. What username and shell should I use?"));

    $(CONFIG.SELECTOR_EDIT_PW_ASSIST)?.addEventListener("click", () =>
      sendToAssistant(`Change the password for user "${usersState.selectedUser || ""}".`));

    $(CONFIG.SELECTOR_REMOVE_ASSIST)?.addEventListener("click", () =>
      sendToAssistant(`Remove the user "${usersState.selectedUser || ""}" from the system.`));
  }

  /* ──────────────────────────────────────────────────────────────────────────
     INITIALIZATION
  ────────────────────────────────────────────────────────────────────────── */
  function init() {
    console.log("Users module initializing…");
    attachEventHandlers();
    initUserSorting();
    loadUsers();
  }

  /* Auto-init on DOM ready */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* Optional: Export public API */
  window.UsersModule = {
    loadUsers,
    selectUser,
    getSelectedUser: () => usersState.selectedUser,
  };
}());

