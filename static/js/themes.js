/* =====================================================
   LADY LINUX - THEME ENGINE BRIDGE
   ===================================================== */

const DESIGN_PROFILE_STORAGE_KEY = "lady-design-profile";
const THEME_SELECTION_STORAGE_KEY = "lady-theme";
const ACTIVE_CUSTOM_SLOT_KEY = "lady-active-custom-slot";

const THEME_LABELS = {
  softcore: "Soft Core",
  crimson: "Crimson Core",
  glass: "Glass",
  terminal: "Terminal",
  "custom-1": "Custom 1",
  "custom-2": "Custom 2",
  "custom-3": "Custom 3",
  "custom-4": "Custom 4",
};

const FONT_FAMILY_MAP = {
  system: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  sans: '"Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  monospace: '"Cascadia Code", "Courier New", monospace',
};

const FONT_SIZE_MAP = {
  small: { scale: "0.92", base: "14px" },
  normal: { scale: "1", base: "16px" },
  large: { scale: "1.1", base: "18px" },
  "extra-large": { scale: "1.22", base: "20px" },
};

const CORNER_RADIUS_MAP = {
  small: { small: "6px", medium: "10px", large: "14px" },
  medium: { small: "8px", medium: "12px", large: "18px" },
  large: { small: "12px", medium: "18px", large: "24px" },
};

const SPACING_SCALE_MAP = {
  compact: { spacing: "0.9", density: "0.9" },
  normal: { spacing: "1", density: "1" },
  comfortable: { spacing: "1.1", density: "1.08" },
};

const COLOR_NAME_MAP = {
  black: "#000000",
  white: "#FFFFFF",
  brown: "#6F4E37",
  crimson: "#B22222",
  red: "#FF3B3B",
  orange: "#F97316",
  amber: "#F59E0B",
  yellow: "#FACC15",
  green: "#22C55E",
  teal: "#14B8A6",
  blue: "#3B82F6",
  navy: "#1E3A8A",
  purple: "#8B5CF6",
  violet: "#7C3AED",
  pink: "#EC4899",
  gray: "#6B7280",
  grey: "#6B7280",
  silver: "#9CA3AF",
  charcoal: "#1F2937",
  beige: "#D6C4A1",
  tan: "#D2B48C",
};

let THEMES = {};
let activeCustomSlot = null;

function normalizeBackendTheme(theme) {
  if (!theme || typeof theme !== "object") return null;

  if (theme.css_variables && typeof theme.css_variables === "object") {
    const css = theme.css_variables;
    return {
      name: theme.name,
      display_name: theme.display_name,
      css_variables: css,
      "bg-main": css["--bg-main"] || "#1C1F26",
      "bg-surface": css["--bg-surface"] || css["--bg-panel"] || css["--bg-main"] || "#242833",
      "bg-elevated": css["--bg-panel"] || css["--bg-surface"] || css["--bg-main"] || "#2B3040",
      "bg-input": css["--bg-panel"] || css["--bg-surface"] || css["--bg-main"] || "#2E3340",
      "text-main": css["--text-main"] || "#F7F9FC",
      "text-heading": css["--text-main"] || "#FFFFFF",
      accent: css["--accent"] || "#C4B5FD",
      "accent-hover": css["--accent"] || "#D6CBFF",
      "border-soft": css["--border-color"] || "#3A3F4F",
      "radius-large": "18px",
      "radius-medium": "12px",
      "radius-small": "8px",
      "shadow-main": "none",
      "transition-speed": "0.15s",
    };
  }

  return theme;
}

function notifyOverviewSync() {
  document.dispatchEvent(new CustomEvent("lady:overview-sync"));
}

function logActivity(message) {
  if (typeof window.logSystemActivity === "function") {
    window.logSystemActivity(message);
  }
}

function emitThemeApplied(themeKey, config) {
  const label = THEME_LABELS[themeKey] || "Custom Theme";
  document.dispatchEvent(
    new CustomEvent("lady:theme-applied", {
      detail: {
        theme: themeKey,
        label,
        config,
      },
    })
  );
}

function toNumber(value, fallback) {
  const numeric = parseFloat(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeHex(value, fallback) {
  if (typeof value !== "string") return fallback;
  const hex = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toUpperCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const chars = hex.slice(1).split("");
    return `#${chars.map((char) => `${char}${char}`).join("").toUpperCase()}`;
  }

  return fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex, "#000000");
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(rgb) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }

    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(hsl) {
  const h = ((hsl.h % 360) + 360) % 360 / 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;

  if (s === 0) {
    const value = l * 255;
    return { r: value, g: value, b: value };
  }

  const hueToRgb = (p, q, t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hueToRgb(p, q, h + 1 / 3) * 255,
    g: hueToRgb(p, q, h) * 255,
    b: hueToRgb(p, q, h - 1 / 3) * 255,
  };
}

function adjustLightness(hex, delta) {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: clamp(hsl.l + delta, 0, 100) }));
}

function mixHex(colorA, colorB, amount) {
  const ratio = clamp(amount, 0, 1);
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);

  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

function toRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const transform = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function inferTextMode(theme) {
  const explicit = typeof theme["text-mode"] === "string" ? theme["text-mode"].toLowerCase() : "";
  if (["auto", "light", "dark"].includes(explicit)) {
    return explicit;
  }

  const textMain = String(theme["text-main"] || "").toLowerCase();
  if (textMain.includes("#111") || textMain.includes("#000")) {
    return "dark";
  }

  return textMain ? "light" : "auto";
}

function themeToProfile(theme) {
  if (theme && theme.palette && theme.typography && theme.shape && theme.effects) {
    return theme;
  }

  const tokenTheme = theme && typeof theme === "object" ? theme : {};
  const fontSize = FONT_SIZE_MAP[tokenTheme["font-size"] || "normal"] || FONT_SIZE_MAP.normal;
  const spacingScale = SPACING_SCALE_MAP[tokenTheme["spacing-scale"] || "normal"] || SPACING_SCALE_MAP.normal;

  return {
    palette: {
      bg_main: tokenTheme["bg-main"] || "#1C1F26",
      accent_primary: tokenTheme.accent || tokenTheme["link-color"] || "#C4B5FD",
      text_mode: inferTextMode(tokenTheme),
    },
    typography: {
      font_family: "Inter",
      base_size: toNumber(fontSize.base, 16),
      scale: toNumber(fontSize.scale, 1),
    },
    shape: {
      radius: toNumber(tokenTheme["radius-medium"], 12),
      density: toNumber(spacingScale.density, 1),
    },
    effects: {
      shadow_strength: tokenTheme["shadow-main"] === "none" ? 0 : 0.25,
      motion_speed: Math.round(toNumber(tokenTheme["transition-speed"], 0.15) * 1000),
      glow_intensity: 0.2,
    },
  };
}

function profilePreviewGradient(profile) {
  return `linear-gradient(135deg, ${profile.palette.bg_main}, ${profile.palette.accent_primary})`;
}

function getThemeConfig(themeInput) {
  if (typeof themeInput === "string") {
    return THEMES[themeInput] || null;
  }

  if (themeInput && typeof themeInput === "object") {
    return themeInput;
  }

  return null;
}

function themeTokensToCssVars(themeInput) {
  if (!themeInput || typeof themeInput !== "object" || themeInput.palette) {
    return {};
  }

  if (themeInput.css_variables && typeof themeInput.css_variables === "object") {
    return { ...themeInput.css_variables };
  }

  const cssVars = {};
  const tokenMap = {
    "bg-main": "--bg-main",
    "bg-surface": "--bg-surface",
    "bg-elevated": "--bg-panel",
    "bg-input": "--bg-panel",
    "text-main": "--text-main",
    "text-heading": "--text-main",
    "text-muted": "--text-muted",
    accent: "--accent",
    "accent-hover": "--accent-hover",
    "border-soft": "--border-color",
    "radius-small": "--radius-small",
    "radius-medium": "--radius-medium",
    "radius-large": "--radius-large",
    "transition-speed": "--transition-speed",
    "link-color": "--color-link",
  };

  Object.entries(tokenMap).forEach(([tokenKey, cssVar]) => {
    if (typeof themeInput[tokenKey] === "string" && themeInput[tokenKey].trim()) {
      cssVars[cssVar] = themeInput[tokenKey].trim();
    }
  });

  if (themeInput["shadow-main"] && themeInput["shadow-main"] !== "none") {
    cssVars["--shadow-strength"] = "0.25";
    cssVars["--effect-glow"] = themeInput["shadow-main"];
  } else if (themeInput["shadow-main"] === "none") {
    cssVars["--shadow-strength"] = "0";
    cssVars["--effect-glow"] = "none";
  }

  if (themeInput["font-family"] && FONT_FAMILY_MAP[themeInput["font-family"]]) {
    cssVars["--font-family-base"] = FONT_FAMILY_MAP[themeInput["font-family"]];
    cssVars["--font-family"] = FONT_FAMILY_MAP[themeInput["font-family"]];
  }

  if (themeInput["font-size"] && FONT_SIZE_MAP[themeInput["font-size"]]) {
    cssVars["--font-scale"] = FONT_SIZE_MAP[themeInput["font-size"]].scale;
  }

  if (themeInput["spacing-scale"] && SPACING_SCALE_MAP[themeInput["spacing-scale"]]) {
    cssVars["--spacing-scale"] = SPACING_SCALE_MAP[themeInput["spacing-scale"]].spacing;
    cssVars["--ui-density-scale"] = SPACING_SCALE_MAP[themeInput["spacing-scale"]].density;
  }

  if (cssVars["--accent"]) {
    const accent = normalizeHex(cssVars["--accent"], "#C4B5FD");
    cssVars["--color-focus-ring"] = toRgba(accent, 0.4);
    cssVars["--accent-soft"] = toRgba(accent, 0.12);
    cssVars["--color-on-accent"] = luminance(accent) > 0.55 ? "#111827" : "#F7F9FC";
    if (!cssVars["--color-link"]) {
      cssVars["--color-link"] = accent;
    }
  }

  return cssVars;
}

function applyCssVarOverrides(cssVars) {
  const root = document.documentElement;
  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

function setStoredValue(key, value) {
  if (typeof value === "string") {
    localStorage.setItem(key, value);
    return;
  }

  localStorage.removeItem(key);
}

function resolveFontOption(value) {
  return ["system", "sans", "serif", "monospace"].includes(value) ? value : "system";
}

function resolveFontSizeOption(value) {
  return ["small", "normal", "large", "extra-large"].includes(value) ? value : "normal";
}

function resolveCornerRadiusOption(value) {
  return ["small", "medium", "large"].includes(value) ? value : "medium";
}

function resolveSpacingOption(value) {
  return ["compact", "normal", "comfortable"].includes(value) ? value : "normal";
}

function createDerivedThemeConfig(options) {
  const accent = normalizeHex(options.accent, "#C4B5FD");
  const background = normalizeHex(options.background, "#1C1F26");
  const surface = normalizeHex(options.surface, background);
  const textMode = typeof options.textMode === "string" ? options.textMode.toLowerCase() : "auto";
  const textColor = normalizeHex(options.textColor, luminance(background) > 0.45 ? "#111827" : "#F7F9FC");
  const headingColor = normalizeHex(options.headingColor, textColor);
  const linkColor = normalizeHex(options.linkColor, accent);
  const borderColor = normalizeHex(options.borderColor, mixHex(surface, "#FFFFFF", 0.12));
  const fontFamily = resolveFontOption(options.fontFamily || "system");
  const fontSize = resolveFontSizeOption(options.fontSize || "normal");
  const cornerRadius = resolveCornerRadiusOption(options.cornerRadius || "medium");
  const spacingScale = resolveSpacingOption(options.spacingScale || "normal");
  const radius = CORNER_RADIUS_MAP[cornerRadius];

  return {
    "bg-main": background,
    "bg-surface": surface,
    "bg-elevated": surface,
    "bg-input": surface,
    "text-main": textColor,
    "text-heading": headingColor,
    "text-muted": toRgba(textColor, 0.72),
    accent,
    "accent-hover": adjustLightness(accent, luminance(accent) > 0.55 ? 6 : 10),
    "border-soft": borderColor,
    "link-color": linkColor,
    "font-family": fontFamily,
    "font-size": fontSize,
    "spacing-scale": spacingScale,
    "shadow-main": `0 20px 60px ${toRgba(background, 0.35)}`,
    "radius-small": radius.small,
    "radius-medium": radius.medium,
    "radius-large": radius.large,
    "transition-speed": "0.15s",
    "text-mode": ["light", "dark"].includes(textMode) ? textMode : "auto",
  };
}

function getActiveCustomSlot() {
  return activeCustomSlot || localStorage.getItem(ACTIVE_CUSTOM_SLOT_KEY) || "custom-1";
}

function readThemeBuilderValues(themeConfig = {}) {
  return {
    accent: document.getElementById("customAccent")?.value || themeConfig.accent || "#C4B5FD",
    background: document.getElementById("customBackground")?.value || themeConfig["bg-main"] || "#1C1F26",
    surface: document.getElementById("customSurface")?.value || themeConfig["bg-surface"] || "#242833",
    textColor: document.getElementById("customTextColor")?.value || themeConfig["text-main"] || "#F7F9FC",
    headingColor: document.getElementById("customHeadingColor")?.value || themeConfig["text-heading"] || themeConfig["text-main"] || "#F7F9FC",
    linkColor: document.getElementById("customLinkColor")?.value || themeConfig["link-color"] || themeConfig.accent || "#C4B5FD",
    borderColor: document.getElementById("customBorderColor")?.value || themeConfig["border-soft"] || "#3A3F4F",
    fontFamily: document.getElementById("customFontFamily")?.value || themeConfig["font-family"] || "system",
    fontSize: document.getElementById("customFontSize")?.value || themeConfig["font-size"] || "normal",
    cornerRadius: document.getElementById("customCornerRadius")?.value || "medium",
    spacingScale: document.getElementById("customSpacingScale")?.value || themeConfig["spacing-scale"] || "normal",
  };
}

function syncThemeBuilderControls(themeConfig = {}) {
  const values = {
    customTextColor: normalizeHex(themeConfig["text-main"], "#F7F9FC"),
    customHeadingColor: normalizeHex(themeConfig["text-heading"], normalizeHex(themeConfig["text-main"], "#F7F9FC")),
    customLinkColor: normalizeHex(themeConfig["link-color"] || themeConfig.accent, "#C4B5FD"),
    customBorderColor: normalizeHex(themeConfig["border-soft"], "#3A3F4F"),
    customFontFamily: resolveFontOption(themeConfig["font-family"] || "system"),
    customFontSize: resolveFontSizeOption(themeConfig["font-size"] || "normal"),
    customCornerRadius:
      themeConfig["radius-large"] === "24px" ? "large" : themeConfig["radius-large"] === "14px" ? "small" : "medium",
    customSpacingScale: resolveSpacingOption(themeConfig["spacing-scale"] || "normal"),
  };

  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = value;
    }
  });
}

function populateCustomThemeModal(slotKey) {
  const config = getThemeConfig(slotKey) || {};
  const profile = themeToProfile(config);
  const accentInput = document.getElementById("customAccent");
  const backgroundInput = document.getElementById("customBackground");
  const surfaceInput = document.getElementById("customSurface");

  if (accentInput) {
    accentInput.value = normalizeHex(config.accent || (profile.palette && profile.palette.accent_primary), "#C4B5FD");
  }
  if (backgroundInput) {
    backgroundInput.value = normalizeHex(config["bg-main"] || (profile.palette && profile.palette.bg_main), "#1C1F26");
  }
  if (surfaceInput) {
    surfaceInput.value = normalizeHex(config["bg-surface"], normalizeHex(config["bg-main"], "#242833"));
  }

  syncThemeBuilderControls(config);
}

async function loadThemes() {
  try {
    const response = await fetch("/api/theme/themes");
    if (!response.ok) throw new Error("Failed to load backend themes");

    const data = await response.json();
    const rawThemes = Array.isArray(data.themes) ? data.themes : [];
    THEMES = {};

    rawThemes.forEach((theme) => {
      const normalizedTheme = normalizeBackendTheme(theme);
      if (!normalizedTheme || !normalizedTheme.name) return;
      THEMES[normalizedTheme.name] = normalizedTheme;
    });

    renderThemePreviews();
  } catch (err) {
    console.error("Theme load error:", err);
  }
}

function applyTheme(themeInput, options = {}) {
  if (typeof themeInput === "string" && options.remote !== false) {
    fetch(`/api/theme/theme/${encodeURIComponent(themeInput)}/apply`, {
      method: "POST",
    }).catch((error) => {
      console.error("Backend theme apply error:", error);
    });

    return true;
  }

  const themeConfig = getThemeConfig(themeInput);
  if (!themeConfig || !window.DesignEngine) return false;

  const profile = themeToProfile(themeConfig);
  const cssVarOverrides = themeTokensToCssVars(themeConfig);
  const persist = options.persist !== false;
  const previousProfile = localStorage.getItem(DESIGN_PROFILE_STORAGE_KEY);
  const previousThemeSelection = localStorage.getItem(THEME_SELECTION_STORAGE_KEY);
  const themeKey = typeof themeInput === "string" ? themeInput : "temporary";

  document.documentElement.setAttribute("data-theme", themeKey);
  window.DesignEngine.setProfile(profile);
  applyCssVarOverrides(cssVarOverrides);

  if (persist) {
    if (typeof themeInput === "string") {
      localStorage.setItem(THEME_SELECTION_STORAGE_KEY, themeInput);
      updateActiveThemeCard(themeInput);
      emitThemeApplied(themeInput, themeConfig);
      logActivity(`Theme changed to ${THEME_LABELS[themeInput] || themeInput}`);
    } else {
      localStorage.removeItem(THEME_SELECTION_STORAGE_KEY);
      updateActiveThemeCard("");
      emitThemeApplied("custom", themeConfig);
      logActivity("Theme changed to Custom Theme");
    }
  } else {
    setStoredValue(DESIGN_PROFILE_STORAGE_KEY, previousProfile);
    setStoredValue(THEME_SELECTION_STORAGE_KEY, previousThemeSelection);
    updateActiveThemeCard("");
  }

  notifyOverviewSync();
  return true;
}

function applyTemporaryTheme(themeConfig) {
  return applyTheme(themeConfig, { persist: false });
}

function applyAndSaveCustomTheme(slotKey, themeConfig, activityMessage) {
  THEMES[slotKey] = themeConfig;
  localStorage.setItem(slotKey, JSON.stringify(themeConfig));
  localStorage.setItem(ACTIVE_CUSTOM_SLOT_KEY, slotKey);
  activeCustomSlot = slotKey;
  loadCustomPreview(slotKey);
  applyTheme(slotKey);
  return true;
}

function resolveColorValue(rawValue, fallback) {
  if (typeof rawValue !== "string") return fallback;
  const trimmed = rawValue.trim().toLowerCase();
  const normalized = normalizeHex(trimmed, "");
  if (normalized) return normalized;
  return COLOR_NAME_MAP[trimmed] || fallback;
}

function applyThemeInstructionFromText(text) {
  if (typeof text !== "string" || !text.trim()) return false;

  const lower = text.toLowerCase();
  const extract = (pattern) => {
    const match = lower.match(pattern);
    return match ? match[1] : "";
  };

  const accent = resolveColorValue(extract(/accent(?: color)?(?: to| is)?\s+(#[0-9a-f]{3,6}|[a-z]+)/i), "");
  const background = resolveColorValue(extract(/background(?: color)?(?: to| is)?\s+(#[0-9a-f]{3,6}|[a-z]+)/i), "");
  const panel = resolveColorValue(extract(/panel(?: color)?(?: to| is)?\s+(#[0-9a-f]{3,6}|[a-z]+)/i), "");
  const textColor = resolveColorValue(extract(/text(?: color)?(?: to| is)?\s+(#[0-9a-f]{3,6}|[a-z]+)/i), "");
  const headingColor = resolveColorValue(extract(/heading(?: color)?(?: to| is)?\s+(#[0-9a-f]{3,6}|[a-z]+)/i), "");

  if (!accent && !background && !panel && !textColor && !headingColor) {
    return false;
  }

  const slotKey = getActiveCustomSlot();
  const base = { ...(THEMES[slotKey] || THEMES.soft || {}) };
  const themeConfig = createDerivedThemeConfig({
    accent: accent || base.accent || "#C4B5FD",
    background: background || base["bg-main"] || "#1C1F26",
    surface: panel || base["bg-surface"] || background || "#242833",
    textColor: textColor || base["text-main"] || "",
    headingColor: headingColor || base["text-heading"] || textColor || "",
    linkColor: base["link-color"] || accent || base.accent || "#C4B5FD",
    borderColor: base["border-soft"] || "",
    fontFamily: base["font-family"] || "system",
    fontSize: base["font-size"] || "normal",
    cornerRadius:
      base["radius-large"] === "24px" ? "large" : base["radius-large"] === "14px" ? "small" : "medium",
    spacingScale: base["spacing-scale"] || "normal",
  });

  applyAndSaveCustomTheme(slotKey, themeConfig, `Theme builder updated ${THEME_LABELS[slotKey] || slotKey}`);
  return true;
}

function restoreTheme() {
  const saved = localStorage.getItem(THEME_SELECTION_STORAGE_KEY) || "softcore";
  if (saved && THEMES[saved]) {
    applyTheme(saved, { remote: false });
    return;
  }

  updateActiveThemeCard("");
  notifyOverviewSync();
}

function updateActiveThemeCard(themeName) {
  document.querySelectorAll("[data-theme-select]").forEach((card) => {
    card.classList.toggle("active", card.getAttribute("data-theme-select") === themeName);
  });

  document.querySelectorAll("[data-custom-slot]").forEach((card) => {
    card.classList.toggle("active", card.getAttribute("data-custom-slot") === themeName);
  });
}

function renderThemePreviews() {
  document.querySelectorAll("[data-theme-select]").forEach((card) => {
    const key = card.getAttribute("data-theme-select");
    const preview = card.querySelector(".theme-preview");
    if (preview && THEMES[key]) {
      preview.style.background = profilePreviewGradient(themeToProfile(THEMES[key]));
      preview.style.borderColor = "var(--border-color)";
    }
  });
}

function initThemePicker() {
  document.querySelectorAll("[data-theme-select]").forEach((card) => {
    card.addEventListener("click", () => {
      const theme = card.getAttribute("data-theme-select");
      applyTheme(theme);
    });
  });
}

function initThemeBuilderToggle() {
  const toggle = document.getElementById("themeBuilderToggle");
  const panel = document.getElementById("themeBuilderPanel");
  if (!toggle || !panel) return;

  toggle.addEventListener("change", () => {
    panel.classList.toggle("d-none", !toggle.checked);
  });
}

function initCustomThemes() {
  const slots = document.querySelectorAll("[data-custom-slot]");
  if (!slots.length) {
    initThemeBuilderToggle();
    return;
  }

  slots.forEach((slot) => {
    const key = slot.getAttribute("data-custom-slot");
    loadCustomPreview(key);

    slot.addEventListener("click", () => {
      activeCustomSlot = key;
      localStorage.setItem(ACTIVE_CUSTOM_SLOT_KEY, key);
      populateCustomThemeModal(key);
      const modal = new bootstrap.Modal(document.getElementById("customThemeModal"));
      modal.show();
    });
  });

  const saveBtn = document.getElementById("saveCustomTheme");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveCustomTheme);
  }

  initThemeBuilderToggle();
}

function saveCustomTheme() {
  const slotKey = getActiveCustomSlot();
  const themeConfig = createDerivedThemeConfig(readThemeBuilderValues(THEMES[slotKey] || {}));
  applyAndSaveCustomTheme(slotKey, themeConfig, `Theme changed to ${THEME_LABELS[slotKey] || slotKey}`);

  const modalInstance = bootstrap.Modal.getInstance(document.getElementById("customThemeModal"));
  if (modalInstance) modalInstance.hide();
}

function loadCustomPreview(slotKey) {
  const preview = document.getElementById(`preview-${slotKey}`);
  if (!preview) return;

  const themeConfig = THEMES[slotKey];
  if (!themeConfig) {
    preview.style.background = "transparent";
    preview.style.border = "1px dashed var(--border-color)";
    return;
  }

  preview.style.border = "1px solid var(--border-color)";
  preview.style.background = profilePreviewGradient(themeToProfile(themeConfig));
}

async function initThemes() {
  await loadThemes();
  restoreTheme();
  initThemePicker();
  initCustomThemes();
}

window.applyTheme = applyTheme;
window.applyTemporaryTheme = applyTemporaryTheme;
window.applyThemeInstructionFromText = applyThemeInstructionFromText;
window.createDerivedThemeConfig = createDerivedThemeConfig;
window.getThemeLabel = (themeKey) => THEME_LABELS[themeKey] || themeKey || "Default";
window.updateActiveThemeCard = updateActiveThemeCard;
window.initThemes = initThemes;
