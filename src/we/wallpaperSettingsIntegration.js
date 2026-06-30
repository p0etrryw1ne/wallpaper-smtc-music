export function registerWallpaperSettingsIntegration({ host = globalThis.window, onSettings } = {}) {
  if (!host || typeof onSettings !== "function") {
    return false;
  }

  const applySettings = (properties) => {
    onSettings(properties && typeof properties === "object" ? properties : {});
  };

  host.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      applySettings(properties);
    }
  };

  replayQueuedWallpaperProperties(host, applySettings);
  return true;
}

function replayQueuedWallpaperProperties(host, applySettings) {
  const pending = Array.isArray(host.__pendingWallpaperUserProperties)
    ? host.__pendingWallpaperUserProperties.splice(0)
    : [];

  for (const properties of pending) {
    applySettings(properties);
  }
}
