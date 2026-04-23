/* =====================================================
   LADY LINUX - ACTION REGISTRY
   ===================================================== */

(function () {
  function getById(id) {
    return document.getElementById(id);
  }

  function describeAction(label) {
    if (typeof window.recordActionHistory === "function") {
      window.recordActionHistory(label);
    }
  }

  function emitUpdate(channel, detail) {
    document.dispatchEvent(new CustomEvent(channel, { detail }));
  }

  function upsertUser(username, role) {
    const list = getById("userList");
    if (!list || !username) return;

    const normalized = String(username).trim();
    let existing = Array.from(list.querySelectorAll("[data-username]")).find(
      (item) => item.getAttribute("data-username").toLowerCase() === normalized.toLowerCase()
    );

    const inTableBody = String(list.tagName || "").toUpperCase() === "TBODY";

    if (!existing) {
      existing = document.createElement(inTableBody ? "tr" : "li");
      existing.setAttribute("data-username", normalized);

      if (inTableBody) {
        existing.innerHTML = `
          <td class="user-name"></td>
          <td><span class="badge user-role"></span></td>
          <td>Active</td>
          <td>${new Date().toLocaleString()}</td>
        `;
      } else {
        existing.className = "list-group-item d-flex justify-content-between align-items-center";
        existing.innerHTML = "<span class=\"user-name\"></span><span class=\"badge user-role\"></span>";
      }

      list.appendChild(existing);
    }

    const nameEl = existing.querySelector(".user-name");
    const roleEl = existing.querySelector(".user-role");
    if (nameEl) nameEl.textContent = normalized;
    if (roleEl) roleEl.textContent = role || "Standard";
  }

  function removeUserFromList(username) {
    const list = getById("userList");
    if (!list || !username) return false;

    const normalized = String(username).trim().toLowerCase();
    const target = Array.from(list.querySelectorAll("[data-username]")).find(
      (item) => item.getAttribute("data-username").toLowerCase() === normalized
    );

    if (!target) return false;
    target.remove();
    return true;
  }

  function setSystemPanel(panelId, title, description) {
    const panel = getById(panelId);
    if (!panel) return;

    const titleEl = panel.querySelector("[data-panel-title]");
    const bodyEl = panel.querySelector("[data-panel-value]");
    const metaEl = panel.querySelector("[data-panel-meta]");

    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = description;
    if (metaEl) metaEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  function setFirewallStatus(label, detail) {
    const status = getById("firewallStatusValue");
    const meta = getById("firewallStatusMeta");
    const response = getById("firewallResponse");
    const json = getById("firewallJSON");

    if (status) status.textContent = label;
    if (meta) meta.textContent = detail;
    if (response) response.textContent = detail;
    if (json) {
      json.textContent = JSON.stringify(
        {
          status: label,
          detail,
          updated_at: new Date().toISOString(),
        },
        null,
        2
      );
    }
  }

  function resolveTextSize(size) {
    const map = {
      small: "small",
      normal: "normal",
      large: "large",
      "extra large": "extra-large",
      extra_large: "extra-large",
      "extra-large": "extra-large",
    };
    return map[String(size || "").toLowerCase()] || "normal";
  }

  function resolveFontFamily(font) {
    const map = {
      system: "system",
      sans: "sans",
      serif: "serif",
      monospace: "monospace",
    };
    return map[String(font || "").toLowerCase()] || "system";
  }

  function resolveBoolean(value) {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "").toLowerCase();
    return ["1", "true", "on", "yes", "enable", "enabled"].includes(normalized);
  }

  const actions = {
    "system.get_cpu": {
      name: "Get CPU Status",
      description: "Refresh the CPU panel with the latest summary.",
      handler() {
        setSystemPanel("cpuPanel", "CPU", "CPU load is stable at 23% across 8 threads.");
        describeAction("checked CPU status");
        emitUpdate("lady:action-complete", { action: "system.get_cpu" });
        return { message: "CPU panel updated." };
      },
    },
    "system.get_memory": {
      name: "Get Memory Status",
      description: "Refresh the memory panel with the latest summary.",
      handler() {
        setSystemPanel("memoryPanel", "Memory", "6.4 GB in use, 9.2 GB available.");
        describeAction("checked memory status");
        emitUpdate("lady:action-complete", { action: "system.get_memory" });
        return { message: "Memory panel updated." };
      },
    },
    "system.get_storage": {
      name: "Get Storage Status",
      description: "Refresh the storage panel with the latest summary.",
      handler() {
        setSystemPanel("storagePanel", "Storage", "124 GB free on root, 2 volumes mounted.");
        describeAction("checked storage status");
        emitUpdate("lady:action-complete", { action: "system.get_storage" });
        return { message: "Storage panel updated." };
      },
    },
    "firewall.get_status": {
      name: "Get Firewall Status",
      description: "Refresh the firewall status card.",
      handler() {
        setFirewallStatus("Active", "Firewall is enabled with 4 allow rules and 1 deny rule.");
        describeAction("checked firewall status");
        emitUpdate("lady:action-complete", { action: "firewall.get_status" });
        return { message: "Firewall status updated." };
      },
    },
    "firewall.enable": {
      name: "Enable Firewall",
      description: "Enable the firewall protections.",
      handler() {
        setFirewallStatus("Active", "Firewall enabled. Default deny inbound, allow outbound.");
        describeAction("enabled firewall");
        emitUpdate("lady:action-complete", { action: "firewall.enable" });
        return { message: "Firewall enabled." };
      },
    },
    "firewall.disable": {
      name: "Disable Firewall",
      description: "Disable the firewall protections.",
      requiresConfirmation: true,
      confirmTitle: "Disable Firewall",
      buildSummary() {
        return ["This will remove active packet filtering until re-enabled."];
      },
      handler() {
        setFirewallStatus("Disabled", "Firewall disabled. Network traffic is no longer filtered.");
        describeAction("disabled firewall");
        emitUpdate("lady:action-complete", { action: "firewall.disable" });
        return { message: "Firewall disabled." };
      },
    },
    "user.add": {
      name: "Add User",
      description: "Add a user to the current user list.",
      handler(params = {}) {
        const username = params.username || params.user || "new-user";
        const role = params.role || "Standard";
        upsertUser(username, role);
        describeAction(`added user ${username}`);
        emitUpdate("lady:action-complete", { action: "user.add", username });
        return { message: `User ${username} added.` };
      },
    },
    "user.remove": {
      name: "Remove User",
      description: "Remove a user from the current user list.",
      requiresConfirmation: true,
      confirmTitle: "Delete User",
      buildSummary(params = {}) {
        return [`User: ${params.username || params.user || "unknown"}`];
      },
      handler(params = {}) {
        const username = params.username || params.user || "unknown";
        removeUserFromList(username);
        describeAction(`removed user ${username}`);
        emitUpdate("lady:action-complete", { action: "user.remove", username });
        return { message: `User ${username} removed.` };
      },
    },
    "user.change_password": {
      name: "Change Password",
      description: "Mark a password change event for a user.",
      handler(params = {}) {
        const username = params.username || params.user || "selected user";
        describeAction(`changed password for ${username}`);
        emitUpdate("lady:action-complete", { action: "user.change_password", username });
        return { message: `Password change queued for ${username}.` };
      },
    },
    "appearance.set_theme": {
      name: "Set Theme",
      description: "Apply an existing theme by key.",
      handler(params = {}) {
        const theme = params.theme || params.value;
        if (theme && typeof window.applyTheme === "function") {
          window.applyTheme(theme);
          describeAction(`changed theme to ${theme}`);
          emitUpdate("lady:action-complete", { action: "appearance.set_theme", theme });
          return { message: `Theme changed to ${theme}.` };
        }
        return { message: "Theme change ignored." };
      },
    },
    "appearance.set_text_size": {
      name: "Set Text Size",
      description: "Apply a text size preference.",
      handler(params = {}) {
        const size = resolveTextSize(params.size || params.value);
        if (typeof window.updateAdvancedSetting === "function") {
          window.updateAdvancedSetting("textSize", size);
        }
        describeAction(`set text size to ${size}`);
        emitUpdate("lady:action-complete", { action: "appearance.set_text_size", size });
        return { message: `Text size set to ${size}.` };
      },
    },
    "appearance.set_font": {
      name: "Set Font Family",
      description: "Apply a font family preference.",
      handler(params = {}) {
        const family = resolveFontFamily(params.family || params.font || params.value);
        if (typeof window.updateAdvancedSetting === "function") {
          window.updateAdvancedSetting("fontFamily", family);
        }
        describeAction(`switched font to ${family}`);
        emitUpdate("lady:action-complete", { action: "appearance.set_font", family });
        return { message: `Font changed to ${family}.` };
      },
    },
    "appearance.toggle_contrast": {
      name: "Toggle High Contrast",
      description: "Enable or disable high contrast mode.",
      handler(params = {}) {
        const enabled = resolveBoolean(params.enabled ?? params.value);
        if (typeof window.updateAdvancedSetting === "function") {
          window.updateAdvancedSetting("highContrast", enabled);
        }
        describeAction(`${enabled ? "enabled" : "disabled"} high contrast`);
        emitUpdate("lady:action-complete", { action: "appearance.toggle_contrast", enabled });
        return { message: `High contrast ${enabled ? "enabled" : "disabled"}.` };
      },
    },
  };

  function executeAction(actionName, params) {
    const entry = actions[actionName];
    if (!entry || typeof entry.handler !== "function") {
      return { ok: false, message: `Unknown action: ${actionName}` };
    }

    const result = entry.handler(params || {});
    return {
      ok: true,
      entry,
      result: result || {},
    };
  }

  window.LadyActions = {
    actions,
    executeAction,
  };
})();
