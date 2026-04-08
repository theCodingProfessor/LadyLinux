/* =====================================================
   LADY LINUX - AI / CHAT SYSTEM
   ===================================================== */

const SYSTEM_ACTIVITY_STORAGE_KEY = "lady-system-activity";
const CHAT_HISTORY_STORAGE_KEY = "lady-chat-history";
const SYSTEM_ACTIVITY_LIMIT = 20;
const ACTION_MARKERS = ["LL_ACTION:", "LL_UI:", "json_LL_UI", "LL_THEME:"];
const THEME_TOKEN_KEYS = ["bg-main", "bg-surface", "accent", "accent-hover", "text-mode", "text_mode"];

let devShortcutBound = false;
let chatInitialized = false;
let pendingConfirmation = null;
let systemActivity = [];
let conversationHistory = [];
const MAX_HISTORY_TURNS = 10;
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

function persistChatHistory() {
  try {
    sessionStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(conversationHistory));
  } catch (err) {
    console.error("Chat history persistence failed:", err);
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

function loadChatHistory() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") {
      sessionStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
      return;
    }

    const raw = sessionStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    conversationHistory = raw ? JSON.parse(raw) : [];
  } catch (err) {
    conversationHistory = [];
  }

  if (!conversationHistory.length) return;

  const { response } = getChatElements();
  if (response) {
    response.innerHTML = "";
    for (const msg of conversationHistory) {
      const label = msg.role === "user" ? "You" : "Lady Linux";
      appendChatLine(label, msg.content);
    }
  }
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
  // Add user turn to history before sending so backend sees full context
  conversationHistory.push({ role: "user", content: prompt });
  persistChatHistory();

  const response = await fetch("/api/prompt/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      messages: conversationHistory,
      // Derive page context from current URL path so the backend knows where
      // the user is and can inject page-relevant live data automatically.
      context: ({
        "/":        "dashboard",
        "/os":      "system-monitor",
        "/network": "network-manager",
        "/users":   "user-manager",
        "/logs":    "log-viewer",
      })[window.location.pathname] ?? "unknown",
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedText = "";
  let finalPayload = null;

  // Kick off a visible "thinking" indicator immediately
  replaceLastAssistantLine("▌", { isPlaceholder: true });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process every complete line in the buffer
    const lines = buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        // Malformed line — skip
        continue;
      }

      if (event.type === "token") {
        // Append token and update the DOM live
        accumulatedText += event.text || "";
        replaceLastAssistantLine(accumulatedText, {});

      } else if (event.type === "done") {
        // LLM finished — record metadata for Dev Mode
        lastRagMeta = {
          model: event.model || "mistral",
          retrievedChunks: Number.isFinite(event.retrieved_chunks)
            ? event.retrieved_chunks
            : 0,
        };
        finalPayload = accumulatedText;

      } else if (
        event.type === "tool" ||
        event.type === "command" ||
        event.type === "ui"
      ) {
        // Instant structured response — no streaming needed
        lastRagMeta = { model: "mistral", retrievedChunks: 0 };

        // Handle set_theme: return a descriptive string rather than bare return
        if (event.route === "ui" && event.action === "set_theme") {
          finalPayload = event.message || "Theme updated";
        // Handle set_ui_override: apply CSS vars directly and return a string
        } else if (event.tool === "set_ui_override" || event.action === "set_ui_override") {
          const rawData = event.data;
          const overrides = rawData?.data || rawData;
          const cssVars = Object.fromEntries(
            Object.entries(overrides || {}).filter(([key]) => key.startsWith("--"))
          );
          Object.entries(cssVars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
          });
          finalPayload = event.message || "UI updated";
        // Handle list_services: format service data as readable text
        } else if (event.tool === "list_services" && event.data?.services?.length) {
          const services = event.data.services;
          const lines = services.map(
            (s) => `• ${s.name} — ${s.status || "unknown"}`
          );
          if (typeof window.loadServices === "function") {
            window.loadServices();
          }
          finalPayload = `${event.message || "Services retrieved"}\n\n${lines.join("\n")}`;
        } else if (event.tool === "check_process") {
          const d = event.data?.data || event.data || {};
          const proc = d.process || event.data?.process || "process";
          const running = d.running ?? event.data?.running;
          finalPayload = running
            ? `✓ ${proc} is running. PIDs: ${(d.pids || []).join(", ") || "unknown"}`
            : `✗ ${proc} is not running.`;
        } else if (event.tool === "kill_process") {
          finalPayload = event.message
            || event.data?.message
            || "Kill command sent.";
        } else if (!event.tool || !event.data) {
          finalPayload = event.message || "Done.";
        } else {
          // Format as the legacy response string so processAssistantReply works
          finalPayload = event.message || "";
          // Preserve structured payload for action handling by embedding it
          // in the same format the old JSON path used
          if (event.data || event.action) {
            const structuredHint = JSON.stringify({
              route: event.route,
              message: event.message,
              tool: event.tool,
              action: event.action,
              action_args: event.action_args,
              data: event.data,
            });
            finalPayload = `${event.message || ""}\n%%LLACTION%%: ${structuredHint}`;
          }
        }

      } else if (event.type === "error") {
        throw new Error(event.message || "Backend error");
      }
    }
  }

  // Handle any remaining buffer content
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim());
      if (event.type === "token") {
        accumulatedText += event.text || "";
        finalPayload = accumulatedText;
      }
    } catch {
      // Incomplete final line — ignore
    }
  }

  if (finalPayload === null) {
    throw new Error("Stream ended without a response");
  }

  // Append assistant turn and cap history to avoid context overflow
  conversationHistory.push({ role: "assistant", content: finalPayload });
  if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
  }
  persistChatHistory();

  return finalPayload;
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
  loadChatHistory();

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
  initMemoryPanel();
}

function initMemoryPanel() {
  // Dashboard memory panel
  const toggleBtn = document.getElementById("memoryPanelToggle");
  const chevron = document.getElementById("memoryChevron");
  const body = document.getElementById("memoryPanelBody");
  const clearBtn = document.getElementById("memoryClearBtn");
  const memoryList = document.getElementById("memoryList");

  if (toggleBtn && body) {
    toggleBtn.addEventListener("click", () => {
      const isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", String(!isExpanded));
      body.style.display = isExpanded ? "none" : "";
      if (chevron) {
        chevron.className = isExpanded ? "bi bi-chevron-down" : "bi bi-chevron-up";
      }
    });
  }

  if (clearBtn && memoryList) {
    clearBtn.addEventListener("click", () => {
      memoryList.innerHTML = "<li class=\"text-muted fst-italic\">No memories stored.</li>";
    });
  }

  // Lady widget memory panel
  const ladyToggleBtn = document.getElementById("ladyMemoryToggle");
  const ladyChevron = document.getElementById("ladyMemoryChevron");
  const ladyBody = document.getElementById("ladyMemoryBody");
  const ladyClearBtn = document.getElementById("ladyMemoryClearBtn");
  const ladyMemoryList = document.getElementById("ladyMemoryList");

  if (ladyToggleBtn && ladyBody) {
    ladyToggleBtn.addEventListener("click", () => {
      const isExpanded = ladyToggleBtn.getAttribute("aria-expanded") === "true";
      ladyToggleBtn.setAttribute("aria-expanded", String(!isExpanded));
      ladyBody.style.display = isExpanded ? "none" : "";
      if (ladyChevron) {
        ladyChevron.className = isExpanded ? "bi bi-chevron-down" : "bi bi-chevron-up";
      }
    });
  }

  if (ladyClearBtn && ladyMemoryList) {
    ladyClearBtn.addEventListener("click", () => {
      ladyMemoryList.innerHTML = "<li class=\"text-muted fst-italic\">No memories stored.</li>";
    });
  }
}

window.logSystemActivity = logSystemActivity;
window.recordActionHistory = logSystemActivity;
window.sendPrompt = sendPrompt;
window.processAssistantReply = processAssistantReply;

document.addEventListener("DOMContentLoaded", () => {
  initMemoryPanel();
  initChat();
});
