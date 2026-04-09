const ROUTE_ROWS = [];

ROUTE_ROWS.push(
  ["Page Delivery", "GET", "/", "api_layer/app.py", "templates/index.html", "TemplateResponse", "Browser entrypoint", "Home dashboard with AI console, live metrics, suggested actions, activity feed, and module links.", true],
  ["Page Delivery", "GET", "/network", "api_layer/app.py", "templates/network.html", "TemplateResponse", "Browser nav", "Network module page with interfaces, connections, routes, and firewall tabs.", true],
  ["Page Delivery", "GET", "/firewall", "api_layer/app.py", "RedirectResponse('/network')", "301 redirect", "Browser nav", "Legacy firewall path now redirects into the Network page.", true],
  ["Page Delivery", "GET,POST", "/users", "api_layer/app.py", "templates/users.html", "TemplateResponse", "Browser nav", "Users page using a master-detail layout and per-user theme controls.", true],
  ["Page Delivery", "GET,POST", "/os", "api_layer/app.py", "templates/os.html", "TemplateResponse", "Browser nav", "System control center with metrics, services, storage, appearance, and settings tabs.", true],
  ["Page Delivery", "GET", "/logs", "api_layer/app.py", "templates/logs.html", "TemplateResponse", "Browser nav", "Log viewer page with a custom terminal-style layout.", true],
  ["Assistant Transport", "GET", "/api/rag/status", "api_layer/app.py", "startup seeding flag", '{ "seeding": bool }', "os.html checkRagStatus()", "Lets the System page show whether first-boot RAG seeding is still running.", true],
  ["Assistant Transport", "POST", "/ask_llm", "api_layer/app.py", "_ollama_generate()", "Plain text", "No direct frontend fetch", "Direct one-shot model proxy outside the command and RAG flow.", false],
  ["Assistant Transport", "GET", "/ask_llm", "api_layer/app.py", "_ollama_generate()", '{ "output": string }', "No direct frontend fetch", "GET form of the direct LLM proxy.", false],
  ["Assistant Transport", "POST", "/ask_rag", "api_layer/app.py", "command kernel + prompt routing", "JSON route payload", "Wrapped by /api/prompt", "Primary non-streaming hybrid path: deterministic command, tool route, RAG route, or chat route.", false],
  ["Assistant Transport", "POST", "/api/prompt", "api_layer/app.py", "forward to /ask_rag", "JSON route payload", "chat.js sendPrompt()", "Frontend compatibility layer; the UI still posts here while the main logic lives in /ask_rag.", true],
  ["Assistant Transport", "POST", "/api/prompt/stream", "api_layer/app.py", "streaming hybrid transport", "NDJSON token/tool/ui events", "chat.js sendPrompt(); ladyWidget.js", "Unified streaming endpoint used by both chat surfaces.", true],
  ["Assistant Transport", "POST", "/ask", "api_layer/app.py", "non-streaming unified chat", "JSON type payload", "No direct frontend fetch", "Secondary unified endpoint that mirrors the same branch structure without streaming.", false],
  ["Assistant Transport", "POST", "/api/chat", "api_layer/app.py", 'proxy to Ollama "/api/chat"', "Raw Ollama chat JSON", "No direct frontend fetch", "Preserves message history and prepends live-state context when needed.", false],
  ["Assistant Transport", "POST", "/ask_firewall", "api_layer/app.py", "firewall JSON + model summary", "Plain text", "Legacy old chat path", "Feeds firewall status into the model for explanation.", false],
  ["Assistant Transport", "POST", "/disable_service", "api_layer/app.py", "validate_service_name() + run_command()", "{ status, message }", "No direct frontend fetch", "Backward-compatible path that disables and stops a service.", false],
  ["Assistant Transport", "POST", "/api/intent", "api_layer/app.py", "core/tools/os_core.handle_intent()", "Intent output", "No direct frontend fetch", "Low-level intent gateway into the core OS tool layer.", false],
  ["Assistant Transport", "WS", "/ws/ui", "api_layer/routes/ws.py", "core/event_bus.py + theme_service", "WebSocket text events", "ui_event_bus.js", "Push channel for theme_change events and the initial active theme payload.", true],
  ["Compatibility", "GET", "/api/system", "api_layer/app.py", "system_service.get_status()", "status alias payload", "No direct frontend fetch", "Backward-compatible status alias.", false],
  ["Compatibility", "GET", "/api/firewall", "api_layer/app.py", "os_core.handle_intent()", "firewall intent output", "No direct frontend fetch", "Legacy firewall alias routed through the intent layer.", false],
  ["Compatibility", "GET", "/api/users", "api_layer/app.py", "os_core.handle_intent()", "users intent output", "Path overlaps users router", "Legacy alias that overlaps the dedicated /api/users router.", true],
  ["Compatibility", "POST", "/api/service/{service}/{action}", "api_layer/app.py", "os_core.handle_intent()", "service intent output", "No direct frontend fetch", "Legacy service action endpoint mapped into the intent format.", false]
);

ROUTE_ROWS.push(
  ["System", "GET", "/api/system/status", "api_layer/routes/system.py", "system_service.get_status()", "cpu/memory/disk/network/uptime snapshot", "No direct frontend fetch", "Broad status payload with cached psutil-backed fields.", false],
  ["System", "GET", "/api/system/metrics", "api_layer/routes/system.py", "system_service.get_metrics()", "cpu/memory/disk/network/system/processes", "system_metrics.js; network.html loadBandwidth()", "Main live metrics endpoint polled every 3 seconds by the shared metrics engine.", true],
  ["System", "GET", "/api/system/cpu", "api_layer/routes/system.py", "system_service.get_cpu()", '{ "cpu": number | null }', "No direct frontend fetch", "CPU-only projection of the shared status model.", false],
  ["System", "GET", "/api/system/memory", "api_layer/routes/system.py", "system_service.get_memory()", "{ memory_used, memory_total, memory_percent }", "No direct frontend fetch", "Memory-only projection of the shared status model.", false],
  ["System", "GET", "/api/system/disk", "api_layer/routes/system.py", "system_service.get_disk()", "{ disk_free, disk_total, disk_used, disk_percent }", "No direct frontend fetch", "Disk-only projection of the shared status model.", false],
  ["System", "GET", "/api/system/uptime", "api_layer/routes/system.py", "system_service.get_uptime()", '{ "uptime": seconds }', "No direct frontend fetch", "Current uptime using psutil when available.", false],
  ["System", "GET", "/api/system/users", "api_layer/routes/system.py", "users_service.list_users()", "{ ok, users, count }", "No direct frontend fetch", "System-scoped user list path backed by /etc/passwd parsing.", false],
  ["System", "GET", "/api/system/user/{name}", "api_layer/routes/system.py", "users_service.get_user()", "{ ok, user }", "No direct frontend fetch", "System-scoped user detail lookup.", false],
  ["System", "POST", "/api/system/user/{name}/refresh", "api_layer/routes/system.py", "users_service.refresh_user()", "{ ok, refreshed, user }", "No direct frontend fetch", "Refresh wrapper around the user lookup flow.", false],
  ["System", "GET", "/api/system/hostname", "api_layer/routes/system.py", "run_command(['hostnamectl'])", "{ ok, hostname, stderr }", "os.html loadSystemSettings()", "Reads the hostname through hostnamectl.", true],
  ["System", "POST", "/api/system/hostname", "api_layer/routes/system.py", "sudo hostnamectl set-hostname", "{ ok, hostname, stderr }", "No direct frontend fetch", "Writes a new hostname after minimal validation.", false],
  ["System", "GET", "/api/system/timezone", "api_layer/routes/system.py", "run_command(['timedatectl'])", "{ ok, timezone, stderr }", "os.html loadSystemSettings()", "Reads the configured timezone.", true],
  ["System", "POST", "/api/system/timezone", "api_layer/routes/system.py", "sudo timedatectl set-timezone", "{ ok, timezone, stderr }", "No direct frontend fetch", "Writes a new timezone.", false],
  ["System", "POST", "/api/system/github/refresh", "api_layer/routes/system.py", "detached refresh_git.sh subprocess", '{ "status": "ok|error", "message": string }', "os.html initGithubRefresh()", "Starts the Git refresh script in a detached process with a clean environment.", true],
  ["System", "GET", "/api/system/github/refresh/log", "api_layer/routes/system.py", "read refresh_api.log", "{ ok, log }", "No direct frontend fetch", "Returns the Git refresh log file when present.", false],
  ["Services", "GET", "/api/system/services", "api_layer/routes/services.py", "service_manager.list_services()", "{ ok, services[] }", "main.js loadServices()", "Lists systemd services with load, state, description, and computed uptime.", true],
  ["Services", "GET", "/api/system/service/{name}", "api_layer/routes/services.py", "service_manager.get_service()", "CommandResult + service/unit", "No direct frontend fetch", "Returns `systemctl status` output for one validated service.", false],
  ["Services", "GET", "/api/system/services/failed", "api_layer/routes/services.py", "service_manager.list_failed_services()", "{ ok, failed[] }", "No direct frontend fetch", "Filters the systemd list to failed units only.", false],
  ["Services", "POST", "/api/system/service/{name}/restart", "api_layer/routes/services.py", "service_manager.restart_service()", "CommandResult + restarted bool", "main.js restartService()", "Restarts a service and then the frontend reloads the table.", true],
  ["Services", "POST", "/api/system/service/{name}/stop", "api_layer/routes/services.py", "service_manager.stop_service()", "CommandResult + stopped bool", "No direct frontend fetch", "Stops a running service.", false],
  ["Services", "POST", "/api/system/service/{name}/start", "api_layer/routes/services.py", "service_manager.start_service()", "CommandResult + started bool", "No direct frontend fetch", "Starts a stopped service.", false],
  ["Services", "POST", "/api/system/service/{name}/enable", "api_layer/routes/services.py", "service_manager.enable_service()", "CommandResult + enabled bool", "No direct frontend fetch", "Enables a service on boot.", false],
  ["Services", "POST", "/api/system/service/{name}/disable", "api_layer/routes/services.py", "service_manager.disable_service()", "CommandResult + disabled bool", "No direct frontend fetch", "Disables a service from starting on boot.", false]
);

ROUTE_ROWS.push(
  ["Network", "GET", "/api/network/status", "api_layer/routes/network.py", "network_service.network_status()", "links[] + routes[]", "network.html loadStatus(); loadRoutes()", "Combines link and route reads so the page can fill both the status strip and the routes tab.", true],
  ["Network", "GET", "/api/network/interfaces", "api_layer/routes/network.py", "network_service.network_interfaces()", "interfaces[]", "network.html loadInterfaces()", "Parses `ip -brief address` into interface rows.", true],
  ["Network", "GET", "/api/network/connections", "api_layer/routes/network.py", "network_service.network_connections()", "connections[]", "network.html loadConnections()", "Returns raw `ss -tunap` lines; the page parses them client-side.", true],
  ["Network", "GET", "/api/network/interface/{name}", "api_layer/routes/network.py", "network_service.network_interface()", "detail payload", "No direct frontend fetch", "Single-interface projection of the interface data.", false],
  ["Network", "POST", "/api/network/interface/{name}/restart", "api_layer/routes/network.py", "network_service.restart_interface()", "down/up results + restarted bool", "network.html restartInterface()", "Bounces an interface with `ip link set dev down/up`.", true],
  ["Firewall", "GET", "/api/firewall/status", "api_layer/routes/firewall.py", "firewall_service.firewall_status()", "status + raw ufw output", "network.html loadFirewall()", "Reads `ufw status verbose` through the shared command runner.", true],
  ["Firewall", "GET", "/api/firewall/rules", "api_layer/routes/firewall.py", "firewall_service.firewall_rules()", "rules[]", "network.html loadFirewall()", "Reads numbered UFW rules and keeps only rule rows.", true],
  ["Firewall", "GET", "/api/firewall/rule/{rule_id}", "api_layer/routes/firewall.py", "firewall_service.firewall_rule()", "matched rule or error", "No direct frontend fetch", "Looks up one numbered firewall rule.", false],
  ["Firewall", "POST", "/api/firewall/reload", "api_layer/routes/firewall.py", "firewall_service.firewall_reload()", "reloaded bool", "No direct frontend fetch", "Reloads UFW through the shared command runner.", false],
  ["Storage", "GET", "/api/storage/summary", "api_layer/routes/storage.py", "storage_service.storage_summary()", "disk_total/used/free/percent", "No direct frontend fetch", "Root filesystem summary based on shutil.disk_usage.", false],
  ["Storage", "GET", "/api/storage/mounts", "api_layer/routes/storage.py", "storage_service.storage_mounts()", "mounts[]", "No direct frontend fetch", "Parses `df -hT` into a mount table.", false],
  ["Storage", "GET", "/api/storage/partitions", "api_layer/routes/storage.py", "storage_service.get_disk_partitions()", "partitions[]", "os.html loadStoragePartitions()", "Uses psutil to list mounted partitions; loaded lazily when the Storage tab opens.", true],
  ["Storage", "GET", "/api/storage/top-usage", "api_layer/routes/storage.py", "storage_service.top_usage()", "entries[] + cache fields", "No direct frontend fetch", "Cached `du -x -h -d 1 /` scan with a 60-second in-memory TTL.", false],
  ["Logs", "GET", "/api/logs/recent", "api_layer/routes/logs.py", "log_service.recent_logs()", "lines[]", "No direct frontend fetch", "Recent journal entries with a bounded line count.", false],
  ["Logs", "GET", "/api/logs/errors", "api_layer/routes/logs.py", "log_service.error_logs()", "lines[]", "No direct frontend fetch", "Recent error-priority journal entries.", false],
  ["Logs", "GET", "/api/logs/service/{name}", "api_layer/routes/logs.py", "log_service.service_logs()", "service + lines[]", "No direct frontend fetch", "Journal lines for one systemd unit.", false],
  ["Logs", "GET", "/api/logs/journal", "api_layer/routes/logs.py", "log_service.journal_logs()", "lines[]", "logs.html loadSource()", "General journal endpoint used by the built-in Journal source.", true],
  ["Logs", "GET", "/api/logs/files", "api_layer/routes/logs.py", "log_service.list_log_files()", "files[]", "logs.html loadFileList()", "Lists readable text log files under /var/log.", true],
  ["Logs", "GET", "/api/logs/file", "api_layer/routes/logs.py", "log_service.read_log_file()", "lines[] + path", "logs.html loadSource()", "Reads a specific /var/log file after resolving and constraining the path.", true],
  ["Logs", "GET", "/api/logs/ladylinux", "api_layer/routes/logs.py", "log_service.ladylinux_logs()", "lines[]", "logs.html loadSource()", "Reads the Lady Linux action log file.", true],
  ["Packages", "GET", "/api/packages/search", "api_layer/routes/packages.py", "package_service.search_packages()", "packages[]", "No direct frontend fetch", "Searches package metadata with apt-cache.", false],
  ["Packages", "GET", "/api/packages/installed", "api_layer/routes/packages.py", "package_service.installed_packages()", "packages[]", "No direct frontend fetch", "Filters the installed package list for the query term.", false],
  ["Packages", "POST", "/api/packages/install", "api_layer/routes/packages.py", "501 response in route module", "HTTP 501 error payload", "No direct frontend fetch", "Explicitly disabled because the service account does not have install privileges.", false]
);

ROUTE_ROWS.push(
  ["Themes", "GET", "/api/theme/themes", "api_layer/routes/theme.py", "theme_service.list_themes()", "themes[] + active_theme", "themes.js loadThemes()", "Lists and validates theme JSON files from the `themes/` directory.", true],
  ["Themes", "GET", "/api/theme/active", "api_layer/routes/theme.py", "theme_service.get_active_theme()", '{ "ok": true, "theme": {...} }', "themes.js restoreTheme()", "Returns the persisted active theme, creating fallback state if needed.", true],
  ["Themes", "GET", "/api/theme/theme/{name}", "api_layer/routes/theme.py", "theme_service.get_theme()", "{ ok, theme }", "No direct frontend fetch", "Returns one validated theme by name.", false],
  ["Themes", "POST", "/api/theme/theme/{name}/apply", "api_layer/routes/theme.py", "theme_service.apply_theme()", "{ ok, applied, css, event }", "themes.js applyTheme(); ui_event_bus.js receives push", "Persists the active theme, builds a theme_change event, and publishes it on the backend event bus.", true],
  ["Users", "GET", "/api/users", "api_layer/routes/users.py", "users_service.list_users()", "{ ok, users, count }", "users.html loadUsers()", "Primary users API route backed by /etc/passwd parsing.", true],
  ["Users", "GET", "/api/users/{name}", "api_layer/routes/users.py", "users_service.get_user()", "{ ok, user }", "users.html loadUsers() fan-out", "Returns uid, gid, comment, home, and shell for one account.", true],
  ["Users", "POST", "/api/users/{name}/refresh", "api_layer/routes/users.py", "users_service.refresh_user()", "{ ok, refreshed, user }", "No direct frontend fetch", "Refresh wrapper around the user detail lookup.", false],
  ["Users", "GET", "/api/users/{name}/prefs", "api_layer/routes/users.py", "users_service.get_user_prefs()", "{ ok, user, prefs }", "user_theme.js fetchUserPrefs()", "Reads per-user preferences from config/user_prefs.json.", true],
  ["Users", "PUT", "/api/users/{name}/prefs", "api_layer/routes/users.py", "users_service.set_user_prefs()", "{ ok, user, prefs, updated }", "user_theme.js putUserPrefs()", "Persists validated user preference keys, currently including theme.", true]
);

const GROUP_ORDER = [
  "Page Delivery",
  "Assistant Transport",
  "Compatibility",
  "System",
  "Services",
  "Network",
  "Firewall",
  "Storage",
  "Logs",
  "Packages",
  "Themes",
  "Users",
];

const RAG_SCENARIOS = {
  deterministic: {
    title: "Deterministic command",
    subtitle: "Prompt: 'restart nginx'",
    notes: [
      "The request hits `run_command_kernel()` before any retrieval work starts.",
      "Regex rules in `core/command/command_kernel.py` recognize restart, theme, firewall, and service-list patterns.",
      "The backend executes the mapped function through `ToolRouter.execute()` instead of asking the model to invent a command.",
      "This path bypasses RAG entirely.",
    ],
    callout: ["info", "Why it exists", "Fast, narrow actions stay deterministic so the assistant is predictable for service and theme commands."],
    active: ["input", "kernel", "tool-router", "service-layer", "response"],
  },
  rag: {
    title: "Retrieval-backed answer",
    subtitle: "Prompt: 'Explain how the Lady Linux architecture works'",
    notes: [
      "If the command kernel does nothing, `classify_prompt()` routes question-shaped prompts into the RAG branch.",
      "The backend chooses a domain such as `docs`, `code`, or `system-help`, optionally adds live state, then calls `retrieve()`.",
      "The retriever embeds the query, searches Qdrant, filters weak results, and formats evidence blocks.",
      "That evidence becomes part of the prompt sent to `_ollama_generate()`.",
    ],
    callout: ["info", "Important nuance", "The code does not have a separate 'RAG miss then fallback' branch. Prompt classification decides whether retrieval is used."],
    active: ["input", "kernel", "prompt-router", "live-state", "retriever", "llm", "response"],
  },
  chat: {
    title: "Chat fallback",
    subtitle: "Prompt: 'Do you remember what I asked earlier?'",
    notes: [
      "Conversational self-reference is intercepted before ordinary question routing.",
      "That sends the request to the `chat` branch rather than the retrieval branch.",
      "Live system state can still be injected, but retrieved project chunks are not used on this path.",
      "Streaming requests still return token events over `/api/prompt/stream`.",
    ],
    callout: ["warn", "Where fallback really happens", "The fallback is from prompt classification after the deterministic kernel does nothing, not from a failed vector search."],
    active: ["input", "kernel", "prompt-router", "llm", "response"],
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function routeObjects() {
  return ROUTE_ROWS.map(([group, method, route, origin, layer, returns, frontend, note, frontendCalled]) => ({
    group, method, route, origin, layer, returns, frontend, note, frontendCalled,
  }));
}

function initNavState() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-doc-link]").forEach((link) => {
    if (link.getAttribute("href") === current) link.classList.add("is-active");
  });
}

function initViewToggles() {
  document.querySelectorAll("[data-view-group]").forEach((group) => {
    const name = group.getAttribute("data-view-group");
    const buttons = group.querySelectorAll("[data-view-toggle]");
    const panels = document.querySelectorAll(`[data-view-panel-group="${name}"]`);
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.getAttribute("data-view-toggle");
        buttons.forEach((item) => item.classList.toggle("is-active", item === button));
        panels.forEach((panel) => panel.classList.toggle("is-active", panel.getAttribute("data-view-panel") === target));
      });
    });
  });
}

function initMockStateToggles() {
  document.querySelectorAll("[data-mock-controls]").forEach((wrapper) => {
    const target = document.getElementById(wrapper.getAttribute("data-mock-controls"));
    if (!target) return;
    wrapper.querySelectorAll("[data-mock-state]").forEach((button) => {
      button.addEventListener("click", () => {
        const state = button.getAttribute("data-mock-state");
        target.setAttribute("data-state", state);
        wrapper.querySelectorAll("[data-mock-state]").forEach((item) => item.classList.toggle("is-active", item === button));
      });
    });
  });
}

function initCounts() {
  const routes = routeObjects();
  document.querySelectorAll("[data-route-total]").forEach((node) => node.textContent = String(routes.length));
  document.querySelectorAll("[data-frontend-total]").forEach((node) => node.textContent = String(routes.filter((item) => item.frontendCalled).length));
  document.querySelectorAll("[data-group-total]").forEach((node) => {
    const group = node.getAttribute("data-group-total");
    node.textContent = String(routes.filter((item) => item.group === group).length);
  });
}

function methodClass(method) {
  const first = String(method || "").split(",")[0].trim().toLowerCase();
  if (first === "post") return "method-post";
  if (first === "put") return "method-put";
  if (first === "patch") return "method-patch";
  if (first === "delete") return "method-delete";
  if (first === "ws") return "method-ws";
  return "method-get";
}

function renderRouteCard(route) {
  const search = [route.group, route.method, route.route, route.origin, route.layer, route.returns, route.frontend, route.note].join(" ").toLowerCase();
  return `
    <details class="route-card" data-route-card data-group="${escapeHtml(route.group)}" data-key="${escapeHtml(normalizeKey(route.group))}" data-frontend="${route.frontendCalled ? "true" : "false"}" data-search="${escapeHtml(search)}">
      <summary>
        <div class="route-card__header">
          <div>
            <div class="route-path">${escapeHtml(route.route)}</div>
            <div class="small-copy">${escapeHtml(route.note)}</div>
          </div>
          <div class="chip-row">
            <span class="method-chip ${methodClass(route.method)}">${escapeHtml(route.method)}</span>
            <span class="soft-chip">${escapeHtml(route.group)}</span>
          </div>
        </div>
      </summary>
      <div class="route-card__body">
        <div class="meta-grid">
          <div class="meta-row"><label>Origin</label><div><code>${escapeHtml(route.origin)}</code></div></div>
          <div class="meta-row"><label>Linked Layer</label><div><code>${escapeHtml(route.layer)}</code></div></div>
          <div class="meta-row"><label>Returns</label><div>${escapeHtml(route.returns)}</div></div>
          <div class="meta-row"><label>Frontend</label><div>${escapeHtml(route.frontend)}</div></div>
          <div class="meta-row"><label>Role</label><div class="body-copy">${escapeHtml(route.note)}</div></div>
        </div>
      </div>
    </details>
  `;
}

function buildRouteCatalog() {
  const container = document.getElementById("routeCatalog");
  if (!container) return;
  const routes = routeObjects();
  container.innerHTML = GROUP_ORDER.map((group) => {
    const rows = routes.filter((item) => item.group === group);
    return `
      <section class="route-group" data-route-group="${escapeHtml(group)}">
        <div class="route-group__head">
          <div>
            <h3>${escapeHtml(group)}</h3>
            <div class="small-copy">${rows.length} observed route${rows.length === 1 ? "" : "s"}</div>
          </div>
          <span class="soft-chip"><span data-visible-count="${escapeHtml(group)}">${rows.length}</span> visible</span>
        </div>
        <div class="route-group__grid">${rows.map(renderRouteCard).join("")}</div>
      </section>
    `;
  }).join("");
  filterRouteCatalog();
}

function activeRouteFilter() {
  const active = document.querySelector("[data-route-filter].is-active");
  return active ? active.getAttribute("data-route-filter") : "all";
}

function filterRouteCatalog() {
  const input = document.getElementById("routeSearch");
  const query = String(input ? input.value : "").trim().toLowerCase();
  const filter = activeRouteFilter();
  let visible = 0;

  document.querySelectorAll("[data-route-card]").forEach((card) => {
    const matchesQuery = !query || (card.getAttribute("data-search") || "").includes(query);
    const matchesFilter =
      filter === "all" ||
      (filter === "frontend" && card.getAttribute("data-frontend") === "true") ||
      (filter !== "frontend" && card.getAttribute("data-key") === filter);
    const show = matchesQuery && matchesFilter;
    card.classList.toggle("hidden", !show);
    if (show) visible += 1;
  });

  document.querySelectorAll("[data-route-group]").forEach((section) => {
    const group = section.getAttribute("data-route-group");
    const count = section.querySelectorAll("[data-route-card]:not(.hidden)").length;
    section.classList.toggle("hidden", count === 0);
    const badge = document.querySelector(`[data-visible-count="${CSS.escape(group)}"]`);
    if (badge) badge.textContent = String(count);
  });

  const total = document.getElementById("visibleRouteCount");
  if (total) total.textContent = String(visible);
}

function initRouteFilters() {
  const input = document.getElementById("routeSearch");
  if (input) input.addEventListener("input", filterRouteCatalog);
  document.querySelectorAll("[data-route-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-route-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      filterRouteCatalog();
    });
  });
}

function renderScenario(name) {
  const scenario = RAG_SCENARIOS[name];
  if (!scenario) return;
  const title = document.getElementById("scenarioTitle");
  const subtitle = document.getElementById("scenarioSubtitle");
  const notes = document.getElementById("scenarioNotes");
  const callout = document.getElementById("scenarioCallout");
  if (!title || !subtitle || !notes || !callout) return;

  title.textContent = scenario.title;
  subtitle.textContent = scenario.subtitle;
  notes.innerHTML = scenario.notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  callout.className = `scenario-callout${scenario.callout[0] === "warn" ? " warn" : ""}`;
  callout.innerHTML = `<strong>${escapeHtml(scenario.callout[1])}</strong><div class="small-copy mt-2">${escapeHtml(scenario.callout[2])}</div>`;

  document.querySelectorAll("[data-step-key]").forEach((step) => {
    step.classList.toggle("is-active", scenario.active.includes(step.getAttribute("data-step-key")));
  });
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-scenario") === name);
  });
}

function initScenarioButtons() {
  const first = document.querySelector("[data-scenario]");
  if (!first) return;
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", () => renderScenario(button.getAttribute("data-scenario")));
  });
  renderScenario(first.getAttribute("data-scenario"));
}

document.addEventListener("DOMContentLoaded", () => {
  initNavState();
  initViewToggles();
  initMockStateToggles();
  initCounts();
  buildRouteCatalog();
  initRouteFilters();
  initScenarioButtons();
});
