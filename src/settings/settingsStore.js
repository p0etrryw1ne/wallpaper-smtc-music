export { normalizeSourceList as parseSourceList } from "../bridge/sourcePolicy.js";

const DEFAULT_LOW_PRIORITY_SOURCES = "edge, chrome, firefox, brave, opera, browser";
const DISPLAY_MODES = new Set(["expanded", "lyrics", "compact"]);
const LYRICS_STYLES = new Set(["standard", "immersive"]);

export function createDefaultSettings() {
  return {
    enablePlayer: true,
    defaultVisibility: "expanded",
    hideWhenNoMedia: true,
    lyricsStyle: "standard",
    showLyrics: true,
    enableOnlineLyrics: true,
    enableCoverBackground: false,
    customWallpaper: "assets/default.png",
    customWallpaperBlur: 0,
    coverBackgroundBlur: 64,
    backgroundDim: false,
    lowPrioritySources: DEFAULT_LOW_PRIORITY_SOURCES,
    blockedSources: ""
  };
}

export function mergeWallpaperProperties(previousSettings, properties = {}) {
  const next = { ...previousSettings };

  assignBoolean(next, properties, "enablePlayer");
  assignEnum(next, properties, "defaultVisibility", DISPLAY_MODES);
  assignBoolean(next, properties, "hideWhenNoMedia");
  assignBoolean(next, properties, "showLyrics");
  assignBoolean(next, properties, "enableOnlineLyrics");
  assignEnum(next, properties, "lyricsStyle", LYRICS_STYLES);
  assignLegacyBackgroundSettings(next, properties);
  assignBoolean(next, properties, "enableCoverBackground");
  assignString(next, properties, "customWallpaper", { allowEmpty: true });
  assignNumber(next, properties, "customWallpaperBlur");
  assignNumber(next, properties, "coverBackgroundBlur");
  assignBoolean(next, properties, "backgroundDim");
  assignString(next, properties, "lowPrioritySources", { allowEmpty: true });
  assignString(next, properties, "blockedSources", { allowEmpty: true });

  return next;
}

function assignLegacyBackgroundSettings(target, properties) {
  const modeUpdate = propertyUpdate(properties, "backgroundMode");
  if (modeUpdate.exists && typeof modeUpdate.value === "string") {
    if (modeUpdate.value === "cover") target.enableCoverBackground = true;
    if (modeUpdate.value === "wallpaper") target.enableCoverBackground = false;
  }

  const blurUpdate = propertyUpdate(properties, "backgroundBlur");
  if (!blurUpdate.exists || blurUpdate.value === "") return;
  const value = Number(blurUpdate.value);
  if (!Number.isFinite(value)) return;

  if (target.enableCoverBackground) {
    target.coverBackgroundBlur = value;
  } else {
    target.customWallpaperBlur = value;
  }
}

function assignBoolean(target, properties, name) {
  const update = propertyUpdate(properties, name);
  if (!update.exists) return;

  if (typeof update.value === "boolean") {
    target[name] = update.value;
    return;
  }

  if (typeof update.value === "number" && Number.isFinite(update.value)) {
    target[name] = update.value !== 0;
    return;
  }

  if (typeof update.value === "string") {
    const value = update.value.trim().toLowerCase();
    if (value === "true" || value === "1") target[name] = true;
    if (value === "false" || value === "0") target[name] = false;
  }
}

function assignEnum(target, properties, name, allowedValues) {
  const update = propertyUpdate(properties, name);
  if (!update.exists || typeof update.value !== "string") return;
  if (allowedValues.has(update.value)) target[name] = update.value;
}

function assignNumber(target, properties, name) {
  const update = propertyUpdate(properties, name);
  if (!update.exists || update.value === "") return;
  const value = Number(update.value);
  if (Number.isFinite(value)) target[name] = value;
}

function assignString(target, properties, name, options = {}) {
  const update = propertyUpdate(properties, name);
  if (!update.exists) return;
  const value = nestedStringValue(update.value);
  if (value === null) return;
  if (!options.allowEmpty && value.trim() === "") return;
  target[name] = value;
}

function propertyUpdate(properties, name) {
  if (!Object.prototype.hasOwnProperty.call(properties, name)) {
    return { exists: false, value: undefined };
  }

  const property = properties[name];
  return {
    exists: true,
    value: property && Object.prototype.hasOwnProperty.call(property, "value")
      ? property.value
      : property
  };
}

function nestedStringValue(value, depth = 0) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value) || depth >= 4) return null;

  for (const key of ["value", "file", "url", "path", "src", "thumbnail", "artwork"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const nested = nestedStringValue(value[key], depth + 1);
      if (nested !== null) return nested;
    }
  }

  return null;
}
