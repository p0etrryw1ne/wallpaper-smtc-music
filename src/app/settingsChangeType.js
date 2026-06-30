const BACKGROUND_SETTING_KEYS = new Set([
  "enableCoverBackground",
  "customWallpaper",
  "customWallpaperBlur",
  "coverBackgroundBlur",
  "backgroundDim",
  "backgroundMode",
  "backgroundBlur",
]);

const SOURCE_POLICY_SETTING_KEYS = new Set([
  "lowPrioritySources",
  "blockedSources",
]);

export function isBackgroundOnlySettingsUpdate(properties = {}) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return false;

  const keys = Object.keys(properties);
  return keys.length > 0 && keys.every((key) => BACKGROUND_SETTING_KEYS.has(key));
}

export function hasSourcePolicySettingsUpdate(properties = {}) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return false;

  return Object.keys(properties).some((key) => SOURCE_POLICY_SETTING_KEYS.has(key));
}
