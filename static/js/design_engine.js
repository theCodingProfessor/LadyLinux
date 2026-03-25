/* =====================================================
   LADY LINUX - DESIGN ENGINE
   ===================================================== */

(function () {
  const STORAGE_KEY = "lady-design-profile";
  const OVERRIDE_KEY = "lady-design-overrides";

  const DEFAULT_PROFILE = {
    palette: {
      bg_main: "#1C1F26",
      accent_primary: "#C4B5FD",
      text_mode: "auto",
    },
    typography: {
      font_family: "Inter",
      base_size: 16,
      scale: 1.0,
    },
    shape: {
      radius: 12,
      density: 1.0,
    },
    effects: {
      shadow_strength: 0.25,
      motion_speed: 150,
      glow_intensity: 0.2,
    },
  };

  let currentProfile = null;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toFiniteNumber(value, fallback) {
    const numeric = Number(value);
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

  function normalizeProfile(input) {
    const source = isPlainObject(input) ? input : {};
    const palette = isPlainObject(source.palette) ? source.palette : {};
    const typography = isPlainObject(source.typography) ? source.typography : {};
    const shape = isPlainObject(source.shape) ? source.shape : {};
    const effects = isPlainObject(source.effects) ? source.effects : {};
    const textMode = typeof palette.text_mode === "string" ? palette.text_mode.toLowerCase() : DEFAULT_PROFILE.palette.text_mode;

    return {
      palette: {
        bg_main: normalizeHex(palette.bg_main, DEFAULT_PROFILE.palette.bg_main),
        accent_primary: normalizeHex(palette.accent_primary, DEFAULT_PROFILE.palette.accent_primary),
        text_mode: ["auto", "light", "dark"].includes(textMode) ? textMode : DEFAULT_PROFILE.palette.text_mode,
      },
      typography: {
        font_family: typeof typography.font_family === "string" && typography.font_family.trim()
          ? typography.font_family.trim()
          : DEFAULT_PROFILE.typography.font_family,
        base_size: clamp(toFiniteNumber(typography.base_size, DEFAULT_PROFILE.typography.base_size), 12, 24),
        scale: clamp(toFiniteNumber(typography.scale, DEFAULT_PROFILE.typography.scale), 0.8, 1.6),
      },
      shape: {
        radius: clamp(toFiniteNumber(shape.radius, DEFAULT_PROFILE.shape.radius), 2, 36),
        density: clamp(toFiniteNumber(shape.density, DEFAULT_PROFILE.shape.density), 0.75, 1.5),
      },
      effects: {
        shadow_strength: clamp(toFiniteNumber(effects.shadow_strength, DEFAULT_PROFILE.effects.shadow_strength), 0, 0.6),
        motion_speed: clamp(toFiniteNumber(effects.motion_speed, DEFAULT_PROFILE.effects.motion_speed), 0, 600),
        glow_intensity: clamp(toFiniteNumber(effects.glow_intensity, DEFAULT_PROFILE.effects.glow_intensity), 0, 0.6),
      },
    };
  }

  function deepMergeProfile(baseProfile, partial) {
    const merged = deepClone(baseProfile);
    if (!isPlainObject(partial)) {
      return merged;
    }

    ["palette", "typography", "shape", "effects"].forEach((section) => {
      if (!isPlainObject(partial[section])) {
        return;
      }
      Object.keys(merged[section]).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(partial[section], key)) {
          merged[section][key] = partial[section][key];
        }
      });
    });

    return merged;
  }

  function deriveTokens(profile) {
    const bgMain = profile.palette.bg_main;
    const accentPrimary = profile.palette.accent_primary;
    const bgIsLight = luminance(bgMain) > 0.45;
    const accentIsLight = luminance(accentPrimary) > 0.55;
    let textPrimary = "#F7F9FC";

    if (profile.palette.text_mode === "dark") {
      textPrimary = "#111827";
    } else if (profile.palette.text_mode === "auto") {
      textPrimary = bgIsLight ? "#111827" : "#F7F9FC";
    }

    const computedBaseSize = clamp(
      Math.round(profile.typography.base_size * profile.typography.scale),
      12,
      28
    );

    return {
      "--bg-main": bgMain,
      "--bg-surface": adjustLightness(bgMain, bgIsLight ? -4 : 4),
      "--bg-panel": toRgba(bgMain, 0.85),
      "--color-bg-overlay": toRgba(bgMain, 0.85),
      "--border-color": mixHex(bgMain, accentPrimary, 0.08),
      "--color-border-soft": mixHex(bgMain, accentPrimary, 0.08),
      "--color-border-strong": mixHex(bgMain, accentPrimary, 0.18),
      "--text-main": textPrimary,
      "--color-text-secondary": mixHex(textPrimary, bgMain, 0.2),
      "--text-muted": mixHex(textPrimary, bgMain, 0.35),
      "--accent": accentPrimary,
      "--accent-hover": adjustLightness(accentPrimary, accentIsLight ? -8 : 8),
      "--color-accent-hover": adjustLightness(accentPrimary, accentIsLight ? -8 : 8),
      "--color-accent-active": adjustLightness(accentPrimary, accentIsLight ? -14 : 14),
      "--accent-soft": toRgba(accentPrimary, 0.12),
      "--color-focus-ring": toRgba(accentPrimary, 0.4),
      "--color-on-accent": luminance(accentPrimary) > 0.55 ? "#111827" : "#F7F9FC",
      "--font-family-base": `"${profile.typography.font_family}", "Segoe UI", sans-serif`,
      "--font-size-base": `${computedBaseSize}px`,
      "--radius-small": `${Math.max(2, Math.round(profile.shape.radius * 0.66))}px`,
      "--radius-medium": `${Math.round(profile.shape.radius)}px`,
      "--radius-large": `${Math.round(profile.shape.radius * 1.5)}px`,
      "--spacing-scale": String(profile.shape.density),
      "--transition-speed": `${Math.round(profile.effects.motion_speed)}ms`,
      "--shadow-strength": String(profile.effects.shadow_strength),
      "--effect-glow": `0 0 1.5rem ${toRgba(accentPrimary, profile.effects.glow_intensity)}`,
    };
  }

  function applyTokens(tokens) {
    const root = document.documentElement;
    Object.entries(tokens).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    root.style.fontSize = tokens["--font-size-base"];
  }

  function applyManualOverrides() {
    try {
      const raw = localStorage.getItem(OVERRIDE_KEY);
      if (!raw) return;
      const overrides = JSON.parse(raw);
      if (!overrides || typeof overrides !== "object") return;

      const root = document.documentElement;
      Object.entries(overrides).forEach(([key, value]) => {
        if (typeof value === "string") {
          root.style.setProperty(key, value);
        }
      });
    } catch {}
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (err) {
      console.error("DesignEngine save failed:", err);
    }
  }

  function loadSavedProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return normalizeProfile(JSON.parse(raw));
    } catch (err) {
      return null;
    }
  }

  function commitProfile(profile, persist) {
    currentProfile = normalizeProfile(profile);
    applyTokens(deriveTokens(currentProfile));
    applyManualOverrides();
    if (persist) {
      saveProfile(currentProfile);
    }
    return deepClone(currentProfile);
  }

  function getProfile() {
    return deepClone(currentProfile || DEFAULT_PROFILE);
  }

  function setProfile(profileObject) {
    return commitProfile(profileObject, true);
  }

  function updatePartial(partialObject) {
    const merged = deepMergeProfile(getProfile(), partialObject);
    return commitProfile(merged, true);
  }

  function resetToDefault() {
    return commitProfile(DEFAULT_PROFILE, true);
  }

  function exportProfile() {
    return getProfile();
  }

  function importProfile(profileObject) {
    return setProfile(profileObject);
  }

  function setManualOverrides(overridesObject) {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overridesObject));
    applyManualOverrides();
  }

  function clearManualOverrides() {
    localStorage.removeItem(OVERRIDE_KEY);
    commitProfile(getProfile(), false);
  }

  commitProfile(loadSavedProfile() || DEFAULT_PROFILE, false);

  window.DesignEngine = {
    getProfile,
    setProfile,
    updatePartial,
    resetToDefault,
    exportProfile,
    importProfile,
    setManualOverrides,
    clearManualOverrides,
  };
})();
