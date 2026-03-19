/* =====================================================
   LADY LINUX - AI / CHAT SYSTEM
   ===================================================== */

const SYSTEM_ACTIVITY_STORAGE_KEY = "lady-system-activity";
const SYSTEM_ACTIVITY_LIMIT = 20;
const ACTION_MARKERS = ["LL_ACTION:", "LL_UI:", "json_LL_UI", "LL_THEME:"];
const THEME_TOKEN_KEYS = ["bg-main", "bg-surface", "accent", "accent-hover", "text-mode", "text_mode"];

let devShortcutBound = false;
let chatInitialized = false;
let pendingConfirmation = null;
let systemActivity = [];
// Store backend metadata from the most recent /ask_rag request for Dev Mode diagnostics.
let lastRagMeta = {
  model: "mistral",
  retrievedChunks: 0,
};

function isDevMode() {
  try {
    // Prioritize explicit UI toggle when present on the page.
    const toggle = document.getElementById("devModeToggle");
    if (toggle) {
      return Boolean(toggle.checked);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("dev") === "1") {
      localStorage.setItem("LL_DEV_MODE", "1");
      return true;
    }
    return localStorage.getItem("LL_DEV_MODE") === "1";
  } catch (err) {
    return false;
  }
}

function getChatElements() {
  return {
    form: document.getElementById("ucsChatForm"),
    input: document.getElementById("ucsPrompt"),
    response: document.getElementById("chatResponse"),
    status: document.getElementById("chatStatus"),
    confirmation: document.getElementById("chatConfirmation"),
    activity: document.getElementById("systemActivity"),
  };
}

function getTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function persistSystemActivity() {
  try {
    sessionStorage.setItem(SYSTEM_ACTIVITY_STORAGE_KEY, JSON.stringify(systemActivity));
  } catch (err) {
    console.error("Activity persistence failed:", err);
  }
}

function renderSystemActivity() {
  const { activity } = getChatElements();
  if (!activity) return;

  if (!systemActivity.length) {
    activity.innerHTML = "<ul class=\"activity-log\"><li class=\"text-muted\">No activity yet.</li></ul>";
    return;
  }

  activity.innerHTML = `
    <ul class="activity-log">
      ${systemActivity.map((entry) => `<li><span class="activity-time">${entry.time}</span> ${entry.message}</li>`).join("")}
    </ul>
  `;
}

function loadSystemActivity() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") {
      sessionStorage.removeItem(SYSTEM_ACTIVITY_STORAGE_KEY);
    }

    const raw = sessionStorage.getItem(SYSTEM_ACTIVITY_STORAGE_KEY);
    systemActivity = raw ? JSON.parse(raw) : [];
  } catch (err) {
    systemActivity = [];
  }

  renderSystemActivity();
}

function logSystemActivity(message) {
  if (!message) return;

  systemActivity = [
    { time: getTimestamp(), message },
    ...systemActivity,
  ].slice(0, SYSTEM_ACTIVITY_LIMIT);

  persistSystemActivity();
  renderSystemActivity();
}

function setChatStatus(state) {
  const { status } = getChatElements();
  if (!status) return;
  status.textContent = state;
  status.setAttribute("data-state", state);
}

function appendChatLine(label, text) {
  const { response } = getChatElements();
  if (!response) return;

  const line = document.createElement("p");
  line.className = "mb-2";
  line.innerHTML = `<strong>${label}:</strong> ${text}`;
  response.appendChild(line);
  response.scrollTop = response.scrollHeight;
}

function replaceLastAssistantLine(text, options = {}) {
  const { response } = getChatElements();
  if (!response) return;

  let line = response.querySelector("[data-streaming='true']");
  if (!line) {
    line = document.createElement("p");
    line.className = "mb-2";
    line.setAttribute("data-streaming", "true");
    response.appendChild(line);
  }

  // Route all assistant rendering through one function so Dev Mode and Markdown
  // behavior stay consistent across response updates.
  renderAssistantContent(line, text, options);
  response.scrollTop = response.scrollHeight;
}

function renderAssistantContent(line, reply, options = {}) {
  // The Dev Mode checkbox exists only on index; on other pages this resolves to null.
  const devMode = document.getElementById("devModeToggle");
  const isDevModeEnabled = Boolean(devMode && devMode.checked);
  const responseBox = document.createElement("span");
  const replyText = String(reply || "");
  const isPlaceholder = Boolean(options.isPlaceholder);

  line.innerHTML = "<strong>Lady Linux:</strong> ";
  line.appendChild(responseBox);

  if (isPlaceholder) {
    responseBox.textContent = replyText;
    return;
  }

  /*
  Dev Mode allows developers to inspect the raw LLM output
  instead of formatted Markdown.
  */
  if (isDevModeEnabled) {
    // Show raw LLM response
    let rawOutput = replyText;

    // Add backend diagnostics to help verify model + retrieval behavior.
    if (options.diagnostics) {
      const debugInfo = `
---- DEV INFO ----
Model: ${options.diagnostics.model}
Retrieved Chunks: ${options.diagnostics.retrievedChunks}
`;
      rawOutput += debugInfo;
    }

    responseBox.textContent = rawOutput;
    return;
  }

  /*
  Render LLM responses using Markdown.
  This allows code blocks and commands to display correctly.
  */
  if (window.marked && typeof window.marked.parse === "function") {
    responseBox.innerHTML = window.marked.parse(replyText);
  } else {
    // Fallback for safety in case the CDN script is unavailable.
    responseBox.textContent = replyText;
  }
}

function finalizeAssistantLine() {
  const { response } = getChatElements();
  const line = response ? response.querySelector("[data-streaming='true']") : null;
  if (line) {
    line.removeAttribute("data-streaming");
  }
}

function parseMarkedJsonSegment(fullText, marker) {
  const markerIndex = fullText.indexOf(marker);
  if (markerIndex === -1) return null;

  let index = markerIndex + marker.length;
  while (index < fullText.length && /\s/.test(fullText[index])) {
    index += 1;
  }

  if (fullText[index] === ":") {
    index += 1;
    while (index < fullText.length && /\s/.test(fullText[index])) {
      index += 1;
    }
  }

  if (fullText[index] !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let cursor = index; cursor < fullText.length; cursor += 1) {
    const char = fullText[cursor];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          start: markerIndex,
          end: cursor + 1,
          jsonText: fullText.slice(index, cursor + 1),
        };
      }
    }
  }

  return null;
}

function findStructuredSegment(fullText) {
  let best = null;

  ACTION_MARKERS.forEach((marker) => {
    const segment = parseMarkedJsonSegment(fullText, marker);
    if (segment && (!best || segment.start < best.start)) {
      best = segment;
    }
  });

  return best;
}

function stripStructuredSegments(fullText) {
  let cleanText = fullText;
  let segment = findStructuredSegment(cleanText);

  while (segment) {
    cleanText = `${cleanText.slice(0, segment.start)}${cleanText.slice(segment.end)}`;
    segment = findStructuredSegment(cleanText);
  }

  ACTION_MARKERS.forEach((marker) => {
    const index = cleanText.indexOf(marker);
    if (index !== -1) {
      cleanText = cleanText.slice(0, index);
    }
  });

  return cleanText.replace(/\n{3,}/g, "\n\n").trim();
}

function extractStructuredPayload(fullText) {
  const segment = findStructuredSegment(fullText);
  if (!segment) return null;

  try {
    const payload = JSON.parse(segment.jsonText);
    return payload && typeof payload === "object" ? payload : null;
  } catch (err) {
    return null;
  }
}

function normalizeThemePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const source =
    payload.theme && typeof payload.theme === "object" && !Array.isArray(payload.theme)
      ? payload.theme
      : payload.theme_config && typeof payload.theme_config === "object" && !Array.isArray(payload.theme_config)
        ? payload.theme_config
        : payload;

  const hasThemeTokens = THEME_TOKEN_KEYS.some((key) => typeof source[key] === "string" && source[key].trim());
  if (!hasThemeTokens || typeof window.createDerivedThemeConfig !== "function") {
    return null;
  }

  const bgMain = source["bg-main"] || source["bg-surface"] || "#1C1F26";
  const surface = source["bg-surface"] || bgMain;
  const config = window.createDerivedThemeConfig({
    accent: source.accent || "#C4B5FD",
    background: bgMain,
    surface,
    textMode: source["text-mode"] || source.text_mode || "auto",
  });

  if (typeof source["accent-hover"] === "string" && source["accent-hover"].trim()) {
    config["accent-hover"] = source["accent-hover"].trim();
  }

  return config;
}

function normalizeActionPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const themePayload = normalizeThemePayload(payload);
  if (themePayload) {
    return {
      action: "appearance.temp_theme",
      params: { themeConfig: themePayload },
    };
  }

  if (typeof payload.action !== "string" || !payload.action.trim()) {
    return null;
  }

  if (
    payload.action === "update_profile" &&
    payload.profile &&
    typeof payload.profile === "object" &&
    !Array.isArray(payload.profile)
  ) {
    return {
      action: "design.update_profile",
      params: { profile: payload.profile },
    };
  }

  if (payload.action === "set_theme" && typeof payload.theme === "string") {
    return {
      action: "appearance.set_theme",
      params: { theme: payload.theme },
    };
  }

  return {
    action: payload.action.trim(),
    params:
      payload.params && typeof payload.params === "object" && !Array.isArray(payload.params)
        ? payload.params
        : payload.profile && typeof payload.profile === "object" && !Array.isArray(payload.profile)
          ? payload.profile
          : {},
  };
}

function inferActionFromPrompt(prompt) {
  const text = String(prompt || "").trim().toLowerCase();
  if (!text) return null;

  let match = text.match(/change theme to ([a-z0-9-]+)/);
  if (match) return { action: "appearance.set_theme", params: { theme: match[1] } };

  if (text.includes("increase text size") || text.includes("large text")) {
    return { action: "appearance.set_text_size", params: { size: "large" } };
  }
  if (text.includes("extra large text")) {
    return { action: "appearance.set_text_size", params: { size: "extra-large" } };
  }
  if (text.includes("small text")) {
    return { action: "appearance.set_text_size", params: { size: "small" } };
  }
  if (text.includes("monospace")) {
    return { action: "appearance.set_font", params: { family: "monospace" } };
  }
  if (text.includes("serif")) {
    return { action: "appearance.set_font", params: { family: "serif" } };
  }
  if (text.includes("sans")) {
    return { action: "appearance.set_font", params: { family: "sans" } };
  }
  if (text.includes("enable high contrast")) {
    return { action: "appearance.toggle_contrast", params: { enabled: true } };
  }
  if (text.includes("disable high contrast")) {
    return { action: "appearance.toggle_contrast", params: { enabled: false } };
  }
  if (text.includes("show cpu")) return { action: "system.get_cpu", params: {} };
  if (text.includes("show memory")) return { action: "system.get_memory", params: {} };
  if (text.includes("show storage")) return { action: "system.get_storage", params: {} };
  if (text.includes("check firewall status") || text.includes("show firewall status")) {
    return { action: "firewall.get_status", params: {} };
  }
  if (text.includes("enable firewall")) return { action: "firewall.enable", params: {} };
  if (text.includes("disable firewall")) return { action: "firewall.disable", params: {} };

  match = text.match(/add user ([a-z0-9._-]+)/);
  if (match) return { action: "user.add", params: { username: match[1] } };

  match = text.match(/remove user ([a-z0-9._-]+)/);
  if (match) return { action: "user.remove", params: { username: match[1] } };

  match = text.match(/change password(?: for)? ([a-z0-9._-]+)/);
  if (match) return { action: "user.change_password", params: { username: match[1] } };

  return null;
}

function clearConfirmation() {
  const { confirmation } = getChatElements();
  if (!confirmation) return;
  confirmation.classList.add("d-none");
  confirmation.innerHTML = "";
  pendingConfirmation = null;
}

function renderConfirmation(actionName, params) {
  const { confirmation } = getChatElements();
  if (!confirmation || !window.LadyActions?.actions[actionName]) {
    return false;
  }

  const entry = window.LadyActions.actions[actionName];
  const summaryLines =
    typeof entry.buildSummary === "function" ? entry.buildSummary(params || {}) : [entry.description];

  confirmation.classList.remove("d-none");
  confirmation.innerHTML = `
    <div class="fw-semibold mb-2">Action detected: ${entry.confirmTitle || entry.name}</div>
    ${summaryLines.map((line) => `<div>${line}</div>`).join("")}
    <div class="chat-confirmation-actions">
      <button type="button" class="btn btn-primary" id="confirmActionBtn">Execute</button>
      <button type="button" class="btn btn-outline-secondary" id="cancelActionBtn">Cancel</button>
    </div>
  `;

  pendingConfirmation = { actionName, params: params || {} };
  setChatStatus("waiting for confirmation");
  logSystemActivity(`${entry.name} awaiting confirmation`);

  confirmation.querySelector("#confirmActionBtn")?.addEventListener("click", () => {
    const next = pendingConfirmation;
    clearConfirmation();
    if (next) {
      executeAction(next.actionName, next.params, { skipConfirmation: true });
    }
  });

  confirmation.querySelector("#cancelActionBtn")?.addEventListener("click", () => {
    clearConfirmation();
    appendChatLine("Lady Linux", "Action canceled.");
    logSystemActivity("Pending action canceled");
    setChatStatus("idle");
  });

  return true;
}

function executeAction(actionName, params, options = {}) {
  if (actionName === "design.update_profile") {
    if (window.DesignEngine && typeof window.DesignEngine.updatePartial === "function") {
      setChatStatus("executing");
      window.DesignEngine.updatePartial(params.profile || {});
      try {
        localStorage.removeItem("lady-theme");
      } catch (err) {
        console.error("Failed to clear preset theme state:", err);
      }
      if (typeof window.updateActiveThemeCard === "function") {
        window.updateActiveThemeCard("");
      }
      appendChatLine("Lady Linux", "Design profile updated.");
      logSystemActivity("Design profile updated");
      document.dispatchEvent(new CustomEvent("lady:overview-sync"));
      setChatStatus("idle");
      return true;
    }
    return false;
  }

  if (actionName === "appearance.temp_theme") {
    if (typeof window.applyTemporaryTheme === "function") {
      setChatStatus("executing");
      window.applyTemporaryTheme(params.themeConfig);
      appendChatLine("Lady Linux", "Temporary theme applied.");
      logSystemActivity("Temporary theme applied");
      setChatStatus("idle");
      return true;
    }
    return false;
  }

  const registry = window.LadyActions;
  if (!registry?.actions?.[actionName]) {
    appendChatLine("Lady Linux", `Unknown action: ${actionName}`);
    setChatStatus("idle");
    return false;
  }

  const entry = registry.actions[actionName];
  if (entry.requiresConfirmation && !options.skipConfirmation) {
    return renderConfirmation(actionName, params);
  }

  setChatStatus("executing");
  const result = registry.executeAction(actionName, params);
  if (result.ok) {
    appendChatLine("Lady Linux", result.result.message || `${entry.name} completed.`);
  } else {
    appendChatLine("Lady Linux", result.message || "Action failed.");
  }
  document.dispatchEvent(new CustomEvent("lady:overview-sync"));
  setChatStatus("idle");
  return result.ok;
}

/* Shared backend transport for all UI chat surfaces */
async function sendPrompt(prompt) {
  const response = await fetch("/api/prompt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      context: "ui",
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const responseClone = response.clone();
    let data;

    try {
      data = await response.json();
    } catch (err) {
      const text = await responseClone.text().catch(() => "");
      console.error("Invalid JSON response:", text);
      throw new Error("Backend returned invalid JSON");
    }

    // Persist metadata so Dev Mode can append diagnostics for the same request.
    lastRagMeta = {
      model: data?.model || "mistral",
      retrievedChunks: Number.isFinite(data?.retrieved_chunks) ? data.retrieved_chunks : 0,
    };

    // Prefer structured UI actions before legacy marker/text scanning.
    if (data.route === "ui" && data.action === "set_theme") {
      if (typeof window.applyTheme === "function") {
        window.applyTheme(data.action_args?.theme);
      }
      appendChatLine("Lady Linux", data.message || "Theme updated");
      return;
    }

    if (data.route === "command" && data.tool === "set_theme") {
      const event = data.data?.event || data.data;
      const css = data.data?.css || event?.css || event?.css_variables;

      if (css && typeof window.applyThemeCssVars === "function") {
        window.applyThemeCssVars(css);
      }

      window.dispatchEvent(
        new CustomEvent("lady:theme-applied", {
          detail: event,
        })
      );
    }

    if (data.tool === "set_ui_override" && data.data) {
      const overrides = data.data;

      Object.entries(overrides).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });

      appendChatLine("Lady Linux", data.message || "UI updated");

      console.log("[UI_OVERRIDE]", overrides);

      return;
    }

    if (data.route === "command") {
      return data.message || "Command executed";
    }

    return data?.response || data?.answer || "";
  }

  // Reset metadata when backend does not return structured JSON.
  lastRagMeta = {
    model: "mistral",
    retrievedChunks: 0,
  };
  return response.text();
}

function applyProfile(profile) {
  if (window.DesignEngine && typeof window.DesignEngine.updatePartial === "function") {
    window.DesignEngine.updatePartial(profile || {});
    return true;
  }
  return executeAction("design.update_profile", { profile: profile || {} });
}

function handleLLUI(responseText) {
  const match = String(responseText || "").match(/LL_UI:\s*(\{[\s\S]*?\})/);
  if (!match) return false;

  try {
    const command = JSON.parse(match[1]);
    if (command.action === "update_profile") {
      return applyProfile(command.profile);
    }
    return false;
  } catch (err) {
    console.error("Failed to parse LL_UI command:", err);
    return false;
  }
}

/* Shared LL_UI / LL_ACTION / LL_THEME parsing pipeline */
function processAssistantReply(prompt, rawReply, options = {}) {
  const fullReply = String(rawReply || "");
  const streamResult = {
    payload: extractStructuredPayload(fullReply),
    cleanText: stripStructuredSegments(fullReply),
  };
  let actionHandled = false;

  const structuredAction =
    options.skipUpdateProfile &&
    streamResult.payload &&
    streamResult.payload.action === "update_profile"
      ? null
      : normalizeActionPayload(streamResult.payload);
  if (structuredAction) {
    actionHandled = executeAction(structuredAction.action, structuredAction.params);
  }

  if (!actionHandled && streamResult.cleanText && typeof window.applyThemeInstructionFromText === "function") {
    actionHandled = window.applyThemeInstructionFromText(streamResult.cleanText);
  }

  if (!actionHandled && typeof window.applyThemeInstructionFromText === "function") {
    actionHandled = window.applyThemeInstructionFromText(prompt);
  }

  if (!actionHandled) {
    const inferredAction = inferActionFromPrompt(prompt);
    if (inferredAction) {
      actionHandled = executeAction(inferredAction.action, inferredAction.params);
    }
  }

  if (!actionHandled && !streamResult.cleanText) {
    appendChatLine("Lady Linux", "No actionable result was returned.");
  }

  if (!pendingConfirmation) {
    setChatStatus("idle");
  }

  if (isDevMode() && streamResult.payload) {
    console.log("LL_ACTION", streamResult.payload);
  }

  return streamResult;
}

async function handlePrompt(prompt) {
  appendChatLine("You", prompt);
  logSystemActivity(`Command received: ${prompt}`);
  clearConfirmation();
  setChatStatus("thinking");
  replaceLastAssistantLine("...", { isPlaceholder: true });

  try {
    const reply = await sendPrompt(prompt);
    // Use raw response for Dev Mode visibility and cleaned response for user Markdown.
    const cleanedReply = stripStructuredSegments(reply) || "...";
    const devMode = document.getElementById("devModeToggle");
    replaceLastAssistantLine(devMode && devMode.checked ? reply : cleanedReply, {
      diagnostics: lastRagMeta,
    });
    finalizeAssistantLine();
    const llUiHandled = handleLLUI(reply);
    processAssistantReply(prompt, reply, { skipUpdateProfile: llUiHandled });
  } catch (err) {
    finalizeAssistantLine();
    appendChatLine("Lady Linux", `Request failed: ${err.message}`);
    setChatStatus("idle");
  }
}

function initChat() {
  if (chatInitialized) return;

  const { form, input } = getChatElements();
  if (!form || !input) return;

  chatInitialized = true;
  loadSystemActivity();

  // Keep Dev Mode toggle state persistent across reloads for developer workflows.
  const devModeToggle = document.getElementById("devModeToggle");
  if (devModeToggle) {
    devModeToggle.checked = localStorage.getItem("LL_DEV_MODE") === "1";
    devModeToggle.addEventListener("change", () => {
      if (devModeToggle.checked) {
        localStorage.setItem("LL_DEV_MODE", "1");
      } else {
        localStorage.removeItem("LL_DEV_MODE");
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    input.value = "";
    await handlePrompt(prompt);
  });

  if (!devShortcutBound) {
    devShortcutBound = true;
    document.addEventListener("keydown", (event) => {
      if (!event.ctrlKey || !event.altKey || event.key.toLowerCase() !== "d") {
        return;
      }

      try {
        if (localStorage.getItem("LL_DEV_MODE") === "1") {
          localStorage.removeItem("LL_DEV_MODE");
          console.log("LL_DEV_MODE disabled");
        } else {
          localStorage.setItem("LL_DEV_MODE", "1");
          console.log("LL_DEV_MODE enabled");
        }
      } catch (err) {
        console.log("LL_DEV_MODE toggle failed");
      }
    });
  }

  const fullscreenBtn = document.getElementById("fullscreenBtn");
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      const doc = document.documentElement;
      if (!document.fullscreenElement) {
        doc.requestFullscreen().catch((err) => {
          alert(`Fullscreen request failed: ${err.message}`);
        });
        fullscreenBtn.textContent = "Exit Fullscreen";
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
        fullscreenBtn.textContent = "Fullscreen";
      }
    });

    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        fullscreenBtn.textContent = "Exit Fullscreen";
      } else {
        fullscreenBtn.textContent = "Fullscreen";
      }
    });
  }

  setChatStatus("idle");
}

window.logSystemActivity = logSystemActivity;
window.recordActionHistory = logSystemActivity;
window.sendPrompt = sendPrompt;
window.processAssistantReply = processAssistantReply;
