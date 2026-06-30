const DEFAULT_MODE = "expanded";
const VALID_MODES = new Set(["expanded", "lyrics", "compact"]);

export function derivePlayerViewModel(snapshot, settings = {}, runtimeState = {}) {
  const playerEnabled = settings.enablePlayer !== false;
  if (!playerEnabled) {
    return idleView();
  }

  const hasMedia = snapshot?.hasMedia === true;
  const lyricsStyle = normalizeLyricsStyle(settings.lyricsStyle);
  const mode = normalizeMode(settings.defaultVisibility);
  const sourceStatus = normalizeSourceStatus(runtimeState.sourceStatus, hasMedia);

  if (!hasMedia && settings.hideWhenNoMedia !== false) {
    return idleView();
  }

  const timelineStatus = snapshot?.timeline?.status === "known" ? "known" : "unknown";

  return {
    visible: true,
    sourceStatus,
    mode,
    lyricsStyle,
    timelineStatus,
    progressSlotReserved: true,
    progressVisible: timelineStatus === "known",
    controlsAvailable: runtimeState.controlsAvailable === true,
    sourceSwitchAvailable: runtimeState.sourceSwitchAvailable === true
  };
}

function idleView() {
  return {
    visible: false,
    sourceStatus: "none",
    mode: "idle",
    timelineStatus: "unknown",
    progressSlotReserved: false,
    progressVisible: false
  };
}

function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : DEFAULT_MODE;
}

function normalizeLyricsStyle(value) {
  return value === "immersive" ? "immersive" : "standard";
}

function normalizeSourceStatus(value, hasMedia) {
  if (value === "loading" || value === "stale") return value;
  return hasMedia ? "active" : "none";
}
