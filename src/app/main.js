import { createDefaultSettings, mergeWallpaperProperties } from "../settings/settingsStore.js";
import { normalizeNowPlayingSnapshot } from "../media/snapshot.js";
import { derivePlayerViewModel } from "../media/viewModel.js";
import { renderPlayer } from "../player/renderPlayer.js";
import { installArtworkFallback } from "../player/artworkDom.js";
import { updateProgressDom } from "../player/progressDom.js";
import {
  applyOptimisticPlaybackCommand,
  applyOptimisticPlaybackOverride,
  createOptimisticPlaybackOverride,
  shouldKeepOptimisticPlaybackOverride,
} from "../player/optimisticPlayback.js";
import { activeLyricIndex } from "../lyrics/lyricClock.js";
import { parseLrc } from "../lyrics/lrcParser.js";
import { createLyricProviderManager, lyricCacheKey } from "../lyrics/providerManager.js";
import { shouldRequestOnlineLyrics } from "../lyrics/lyricRequestState.js";
import { isLyricLookupInFlightOrExpected } from "../lyrics/lyricLoadingState.js";
import { renderLyrics } from "../lyrics/renderLyrics.js";
import { syncLyricVisualState } from "../lyrics/lyricVisualState.js";
import { applyBackgroundState, deriveBackgroundState } from "../background/backgroundState.js";
import { hasWallpaperMediaIntegration, registerWallpaperMediaIntegration } from "../we/wallpaperMediaIntegration.js";
import { nextPlayerStyleState } from "./playerActions.js";
import { registerWallpaperSettingsIntegration } from "../we/wallpaperSettingsIntegration.js";
import { fetchBridgeSources, sendBridgeCommand } from "../bridge/bridgeClient.js";
import { startBridgePolling } from "../bridge/bridgePolling.js";
import { canSwitchBridgeSource } from "../bridge/bridgeCapabilities.js";
import { allSourcesBlockedByPolicy } from "../bridge/sourcePolicy.js";
import { selectBridgeSource } from "../bridge/bridgeSourceSelection.js";
import { resolveBridgeRefreshSelection } from "../bridge/bridgeRefreshSelection.js";
import { switchToNextBridgeSource } from "../bridge/bridgeSourceSwitch.js";
import { chooseNowPlayingInput } from "../media/nowPlayingStore.js";
import { invokeMediaCommand } from "../media/mediaCommandRouter.js";
import { commandSourceIdForSnapshot } from "../media/commandSource.js";
import { createMediaTimelineClock, mediaIdentity } from "../media/mediaTimelineClock.js";
import { mediaRenderKey } from "../media/mediaRenderKey.js";
import { deriveInitialMediaInput } from "./initialMediaInput.js";
import { resolveDisplayMode } from "./displayMode.js";
import { refreshDelaysForCommand, shouldRefreshBridgeFreshAfterCommand } from "./commandRefreshSchedule.js";
import { hasSourcePolicySettingsUpdate, isBackgroundOnlySettingsUpdate } from "./settingsChangeType.js";
import { createFrameScheduler } from "./renderScheduler.js";
import { applySlotUpdates, createRenderSlotState, ensureRenderSlots, planSlotUpdates, slotWasUpdated } from "./renderSlots.js";

let settings = createDefaultSettings();
const search = new URLSearchParams(window.location.search);
if (search.has("mode")) {
  settings.defaultVisibility = search.get("mode");
}
if (search.get("lyricsStyle") === "immersive") {
  settings.lyricsStyle = "immersive";
}

const debugMedia = search.get("debug") === "media";
const lyricProvider = createLyricProviderManager();
const mediaClock = createMediaTimelineClock();
const mockLyricLines = parseLrc(mockLyrics()).lines;
const app = document.querySelector("#app");
installArtworkFallback(app);
const renderSlotState = createRenderSlotState();
let officialMediaInput = initialMediaInput(search);
let bridgeState = { healthy: false, stale: false, error: "", snapshot: null, sources: [], blockedByPolicy: false };
let currentLyricKey = "";
let loadedLyricKey = "";
let currentLyricLines = search.has("mock") ? mockLyricLines : [];
let pendingLyricKey = "";
let missingLyricKey = "";
let temporaryLyricFailureKey = "";
let temporaryLyricRetryAtMs = 0;
let temporaryLyricRetryTimer = 0;
let viewModeOverride = null;
let lyricsStyleOverride = null;
let selectedBridgeSourceId = "";
let manualBridgeSourceId = "";
let renderedStructureKey = "";
let latestSnapshot = normalizeNowPlayingSnapshot({});
let latestActiveLyricIndex = -1;
let bridgeRefreshToken = 0;
let optimisticPlaybackOverride = null;
let selectedSourceHoldUntilMs = 0;
let officialMediaPreviousKey = "";
const shouldPollBridge = !search.has("mock") || search.get("bridge") === "1";
const scheduleOfficialMediaUpdate = createFrameScheduler(commitOfficialMediaInput);

registerWallpaperEngineMediaListener();
registerWallpaperEngineSettingsListener();
registerPlayerCommandListener();
const stopBridgePolling = startBridgePolling({
  enabled: shouldPollBridge,
  fetchNowPlaying: startBridgeRefresh,
  onSnapshot(result) {
    commitBridgeRefresh(result);
  }
});
window.addEventListener("beforeunload", stopBridgePolling);
startDynamicMediaLoop();
render();

function render() {
  if (!app) return;

  const mediaInput = chooseNowPlayingInput({
    official: officialMediaInput,
    bridge: bridgeState,
  });
  const rawSnapshot = applyActiveOptimisticPlaybackOverride(normalizeNowPlayingSnapshot(mediaInput));
  const snapshot = mediaClock.sync(rawSnapshot, mediaIdentity(rawSnapshot));
  latestSnapshot = snapshot;
  prepareLyricsForSnapshot(snapshot);
  const commandSourceId = commandSourceIdForSnapshot(snapshot, bridgeState);
  const effectiveSettings = effectivePlayerSettings();
  const view = derivePlayerViewModel(snapshot, effectiveSettings, bridgeRuntimeState(bridgeState, {
    controlsAvailable: Boolean(commandSourceId),
    sourceSwitchAvailable: canSwitchBridgeSource(bridgeState, commandSourceId, settings)
  }));
  const lyricsLoading = isLyricsLoadingForSnapshot(snapshot);
  const requestedMode = resolveDisplayMode({
    requestedMode: viewModeOverride || view.mode,
    fallbackMode: view.mode,
    showLyrics: effectiveSettings.showLyrics,
    lyricLineCount: currentLyricLines.length,
    lyricsLoading
  });
  const displayView = { ...view, mode: requestedMode };
  const activeIndex = activeLyricIndex(currentLyricLines, Number(snapshot.timeline.position ?? 0) * 1000);
  const shouldRenderLyrics = displayView.mode === "lyrics" && effectiveSettings.showLyrics;

  app.dataset.view = displayView.mode;
  renderedStructureKey = bridgeStructureKey(bridgeState);
  applyCurrentBackground(snapshot);
  const slots = ensureRenderSlots(app);
  const slotUpdates = planSlotUpdates(renderSlotState, {
    player: renderPlayer(snapshot, displayView),
    lyrics: shouldRenderLyrics ? renderLyrics(currentLyricLines, activeIndex, { loading: lyricsLoading }) : "",
    debug: debugMedia ? renderMediaDebug({ officialMediaInput, bridgeState, snapshot, currentLyricKey, lyricLineCount: currentLyricLines.length }) : ""
  });
  applySlotUpdates(slots, slotUpdates);
  if (slotWasUpdated(slotUpdates, "player")) setupTitleMarquee(app);
  syncRenderedLyricsState({ shouldRenderLyrics, lyricsUpdated: slotWasUpdated(slotUpdates, "lyrics"), activeIndex, snapshot });
  refreshLyrics(snapshot);
}

function renderMediaDebug(value) {
  return `<pre class="media-debug" aria-label="媒体调试">${escapeDebugText(JSON.stringify(value, null, 2))}</pre>`;
}

function escapeDebugText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function initialMediaInput(query) {
  return deriveInitialMediaInput(query, {
    hasWallpaperMedia: hasWallpaperMediaIntegration(window),
    createMockMedia: mockMedia,
  });
}

function registerWallpaperEngineMediaListener() {
  registerWallpaperMediaIntegration({
    host: window,
    onMediaInput(mediaInput) {
      if (!officialMediaPreviousKey) {
        officialMediaPreviousKey = currentRenderKey();
      }
      officialMediaInput = mediaInput;
      scheduleOfficialMediaUpdate();
    }
  });
}

function commitOfficialMediaInput() {
  const previousKey = officialMediaPreviousKey || currentRenderKey();
  officialMediaPreviousKey = "";
  const nextKey = currentRenderKey();
  if (previousKey !== nextKey || nextKey !== renderedStructureKey) {
    render();
  } else {
    updateLatestSnapshot();
    applyCurrentBackground();
    updateDynamicMediaState();
  }
}

function registerWallpaperEngineSettingsListener() {
  registerWallpaperSettingsIntegration({
    host: window,
    onSettings(properties) {
      const backgroundOnly = isBackgroundOnlySettingsUpdate(properties);
      settings = mergeWallpaperProperties(settings, properties);
      if (backgroundOnly) {
        applyCurrentBackground();
        return;
      }

      if (hasSourcePolicySettingsUpdate(properties)) {
        refreshSelectedBridgeSource();
      }
      render();
    }
  });
}

function applyCurrentBackground(snapshot = latestSnapshot) {
  if (!app) return;
  applyBackgroundState(app, deriveBackgroundState(snapshot, settings));
}

function refreshSelectedBridgeSource() {
  if (!bridgeState.healthy || !Array.isArray(bridgeState.sources)) return;

  const requestedSourceId = manualBridgeSourceId || selectedBridgeSourceId;
  const source = selectBridgeSource(bridgeState.sources, requestedSourceId, settings);
  selectedBridgeSourceId = source?.sourceId || "";
  if (manualBridgeSourceId && !sourceIdMatches(source, manualBridgeSourceId)) {
    manualBridgeSourceId = "";
  }
  bridgeState = {
    ...bridgeState,
    snapshot: source || null,
    blockedByPolicy: !source && allSourcesBlockedByPolicy(bridgeState.sources, settings)
  };
  renderedStructureKey = "";
}

async function pollBridgeSources(options = {}) {
  const result = await fetchBridgeSources(fetch, { fresh: options.fresh === true });
  const requestedSourceId = manualBridgeSourceId || selectedBridgeSourceId;
  return resolveBridgeRefreshSelection({
    sourcesResult: result,
    previousState: bridgeState,
    selectedSourceId: requestedSourceId,
    settings,
    preserveMissingSelected: options.preserveMissingSelected === true || selectedSourceHoldUntilMs > nowMs()
  });
}

async function startBridgeRefresh(options = {}) {
  const token = ++bridgeRefreshToken;
  try {
    return {
      token,
      result: await pollBridgeSources({
        fresh: options.fresh === true,
        preserveMissingSelected: options.preserveMissingSelected === true
      })
    };
  } catch (error) {
    return {
      token,
      result: {
        state: bridgeOfflineState(error),
        selectedSourceId: ""
      }
    };
  }
}

async function refreshBridgeState(options = {}) {
  if (!shouldPollBridge) return false;
  return commitBridgeRefresh(await startBridgeRefresh({
    fresh: options.fresh === true,
    preserveMissingSelected: options.preserveMissingSelected === true
  }), options);
}

function commitBridgeRefresh(payload, options = {}) {
  if (!payload || payload.token !== bridgeRefreshToken) {
    return false;
  }

  const previousKey = bridgeStructureKey(bridgeState);
  bridgeState = payload.result.state;
  const nextSelectedSourceId = cleanSourceId(payload.result.selectedSourceId);
  selectedBridgeSourceId = nextSelectedSourceId;
  if (manualBridgeSourceId && manualBridgeSourceId.toLowerCase() !== nextSelectedSourceId.toLowerCase()) {
    manualBridgeSourceId = "";
  }
  const nextKey = bridgeStructureKey(bridgeState);
  if (options.forceRender || previousKey !== nextKey || nextKey !== renderedStructureKey) {
    render();
  } else {
    updateLatestSnapshot();
    updateDynamicMediaState();
  }
  return true;
}

async function refreshLyrics(snapshot) {
  if (!settings.showLyrics || !settings.enableOnlineLyrics || search.has("mock")) return;

  const nextKey = lyricCacheKey(snapshot);
  if (!shouldRequestOnlineLyrics({
    key: nextKey,
    currentKey: currentLyricKey,
    loadedKey: loadedLyricKey,
    pendingKey: pendingLyricKey,
    missingKey: missingLyricKey,
    temporaryFailureKey: temporaryLyricFailureKey,
    temporaryRetryAtMs: temporaryLyricRetryAtMs,
    nowMs: nowMs(),
    enabled: true
  })) return;

  pendingLyricKey = nextKey;
  const requestedKey = nextKey;
  const result = await lyricProvider.fetchLyricsResult(snapshot);
  if (requestedKey !== currentLyricKey) return;

  pendingLyricKey = "";
  if (Array.isArray(result.value?.lines) && result.value.lines.length > 0) {
    loadedLyricKey = requestedKey;
    missingLyricKey = "";
    clearTemporaryLyricFailure();
    currentLyricLines = result.value.lines;
    render();
    return;
  }

  if (result.temporaryFailure === true) {
    setTemporaryLyricFailure(requestedKey);
    render();
    return;
  }

  clearTemporaryLyricFailure();
  missingLyricKey = requestedKey;
  render();
}

function prepareLyricsForSnapshot(snapshot) {
  if (search.has("mock")) return;

  const nextKey = lyricCacheKey(snapshot);
  if (!nextKey) {
    currentLyricKey = "";
    loadedLyricKey = "";
    pendingLyricKey = "";
    missingLyricKey = "";
    clearTemporaryLyricFailure();
    currentLyricLines = [];
    return;
  }

  if (nextKey !== currentLyricKey) {
    currentLyricKey = nextKey;
    loadedLyricKey = "";
    pendingLyricKey = "";
    missingLyricKey = "";
    clearTemporaryLyricFailure();
    currentLyricLines = [];
  }

  if (snapshot.lyrics && loadedLyricKey !== `${nextKey}|official`) {
    currentLyricLines = parseLrc(snapshot.lyrics).lines;
    loadedLyricKey = `${nextKey}|official`;
    pendingLyricKey = "";
    missingLyricKey = "";
    clearTemporaryLyricFailure();
  }
}

function isLyricsLoadingForSnapshot(snapshot) {
  if (!settings.showLyrics || !settings.enableOnlineLyrics || search.has("mock")) return false;
  const key = lyricCacheKey(snapshot);
  return isLyricLookupInFlightOrExpected({
    key,
    currentKey: currentLyricKey,
    loadedKey: loadedLyricKey,
    pendingKey: pendingLyricKey,
    missingKey: missingLyricKey,
    temporaryFailureKey: temporaryLyricFailureKey,
    temporaryRetryAtMs: temporaryLyricRetryAtMs,
    nowMs: nowMs(),
    enabled: true
  });
}

function setTemporaryLyricFailure(key) {
  temporaryLyricFailureKey = key;
  temporaryLyricRetryAtMs = nowMs() + 3000;
  if (temporaryLyricRetryTimer) {
    window.clearTimeout(temporaryLyricRetryTimer);
  }
  temporaryLyricRetryTimer = window.setTimeout(() => {
    temporaryLyricRetryTimer = 0;
    if (temporaryLyricFailureKey === key) {
      render();
    }
  }, 3000);
}

function clearTemporaryLyricFailure() {
  temporaryLyricFailureKey = "";
  temporaryLyricRetryAtMs = 0;
  if (temporaryLyricRetryTimer) {
    window.clearTimeout(temporaryLyricRetryTimer);
    temporaryLyricRetryTimer = 0;
  }
}

function registerPlayerCommandListener() {
  if (!app) return;

  app.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      handlePlayerAction(actionButton.dataset.action);
      return;
    }

    const button = event.target.closest("[data-command]");
    if (!button) return;

    const command = button.dataset.command;
    if (!command) return;

    if (command === "switch-source") {
      const switched = await switchToNextBridgeSource({
        fetchImpl: fetch,
        currentSourceId: latestSnapshot.sourceId || manualBridgeSourceId || selectedBridgeSourceId,
        settings
      });
      bridgeState = switched.state;
      selectedBridgeSourceId = switched.selectedSourceId;
      if (switched.selectedSourceId) {
        manualBridgeSourceId = switched.selectedSourceId;
      }
      holdSelectedSourceForCommandRefresh(switched.selectedSourceId);
      renderedStructureKey = "";
      render();
      return;
    }

    if (command === "lyrics") {
      viewModeOverride = app.dataset.view === "lyrics" || currentLyricLines.length === 0 ? "expanded" : "lyrics";
      render();
      return;
    }

    applyOptimisticMediaCommand(command);
    const commandSourceId = commandSourceIdForSnapshot(latestSnapshot, bridgeState);
    if (commandSourceId) {
      selectedBridgeSourceId = commandSourceId;
      holdSelectedSourceForCommandRefresh(commandSourceId);
    }
    const acceptedPromise = invokeMediaCommand(command, {
      fetch,
      sourceId: commandSourceId,
      sendBridgeCommand,
    });
    scheduleBridgeRefreshBurst(command);
    const accepted = await acceptedPromise;
    if (accepted) {
      return;
    } else {
      optimisticPlaybackOverride = null;
      await refreshBridgeState({ forceRender: false, fresh: true });
    }
  });
}

function applyOptimisticMediaCommand(command) {
  const nextSnapshot = applyOptimisticPlaybackCommand(latestSnapshot, command);
  if (nextSnapshot === latestSnapshot) return;

  optimisticPlaybackOverride = createOptimisticPlaybackOverride(latestSnapshot, command, nowMs());
  latestSnapshot = nextSnapshot;
  updatePlaybackButtons(latestSnapshot);
}

function handlePlayerAction(action) {
  if (action === "toggle-player-style") {
    const next = nextPlayerStyleState({
      currentView: app.dataset.view,
      currentStyle: lyricsStyleOverride || settings.lyricsStyle,
      defaultStyle: settings.lyricsStyle
    });
    lyricsStyleOverride = next.lyricsStyleOverride;
    viewModeOverride = next.viewModeOverride;
    render();
    return;
  }

  if (action === "toggle-compact") {
    viewModeOverride = "compact";
    render();
    return;
  }

  if (action === "toggle-expanded") {
    viewModeOverride = "expanded";
    render();
  }
}

function mockMedia(name) {
  if (name === "long") {
    return {
      sourceId: "mock",
      title: "Pretty Much（半夏心动）这是一条很长的歌名用于验证无缝慢速滚动",
      artist: "金色火种GoldenFire",
      album: "Mock Album",
      playbackState: "playing",
      position: 127,
      duration: 195
    };
  }

  if (name === "unknown-progress") {
    return {
      sourceId: "mock",
      title: "没有进度的歌",
      artist: "Mock Artist",
      playbackState: "playing"
    };
  }

  return {
    sourceId: "mock",
    title: "遥遥",
    artist: "陈沐妍 / 国风引力",
    album: "遥遥",
    playbackState: "playing",
    position: 185,
    duration: 209
  };
}

function setupTitleMarquee(root) {
  const titles = root.querySelectorAll(".track-title, .mini-title");

  for (const title of titles) {
    const mask = title.closest(".track-title-mask, .compact-title-mask");
    if (!title || !mask) continue;

    requestAnimationFrame(() => {
      const firstItem = title.querySelector?.(".title-marquee-item");
      const titleWidth = firstItem?.scrollWidth || title.scrollWidth;
      const overflow = titleWidth - mask.clientWidth;
      if (overflow <= 8) {
        title.dataset.scroll = "false";
        title.style.removeProperty("--marquee-distance");
        title.style.removeProperty("--marquee-duration");
        return;
      }

      const repeatGap = 64;
      const distance = titleWidth + repeatGap;
      title.dataset.scroll = "true";
      title.style.setProperty("--marquee-gap", `${repeatGap}px`);
      title.style.setProperty("--marquee-distance", `${distance}px`);
      title.style.setProperty("--marquee-duration", `${Math.max(60, Math.min(180, distance / 10))}s`);
    });
  }
}

function setupLyricsVisualState(root) {
  syncLyricVisualState(root);
}

function syncRenderedLyricsState({ shouldRenderLyrics, lyricsUpdated, activeIndex, snapshot }) {
  if (!shouldRenderLyrics) {
    latestActiveLyricIndex = -1;
    return;
  }

  const panel = app.querySelector(".lyrics-panel");
  if (!panel) return;

  if (lyricsUpdated) {
    panel.dataset.activeIndex = String(activeIndex);
    latestActiveLyricIndex = activeIndex;
    setupLyricsVisualState(app);
    return;
  }

  updateLyricElements(snapshot);
}

function startDynamicMediaLoop() {
  window.setInterval(updateDynamicMediaState, 180);
}

function updateLatestSnapshot() {
  const mediaInput = chooseNowPlayingInput({
    official: officialMediaInput,
    bridge: bridgeState,
  });
  const rawSnapshot = normalizeNowPlayingSnapshot(mediaInput);
  const adjustedSnapshot = applyActiveOptimisticPlaybackOverride(rawSnapshot);
  latestSnapshot = mediaClock.sync(adjustedSnapshot, mediaIdentity(adjustedSnapshot));
  latestActiveLyricIndex = -1;
}

function applyActiveOptimisticPlaybackOverride(snapshot) {
  const now = nowMs();
  const adjusted = applyOptimisticPlaybackOverride(snapshot, optimisticPlaybackOverride, now);
  if (!shouldKeepOptimisticPlaybackOverride(snapshot, optimisticPlaybackOverride, now)) {
    optimisticPlaybackOverride = null;
  }
  return adjusted;
}

function updateDynamicMediaState() {
  if (!app || latestSnapshot.hasMedia !== true) return;

  const snapshot = mediaClock.snapshot(latestSnapshot, mediaIdentity(latestSnapshot));
  updatePlaybackButtons(snapshot);
  updateProgressElements(snapshot);
  updateLyricElements(snapshot);
}

function updatePlaybackButtons(snapshot) {
  const state = snapshot.playbackState === "playing" ? "pause" : "play";
  const label = state === "pause" ? "暂停" : "播放";
  for (const button of app.querySelectorAll('[data-command="play-pause"]')) {
    if (button.dataset.state !== state) {
      button.dataset.state = state;
      button.setAttribute("aria-label", label);
      const icon = button.querySelector(".transport-icon");
      if (icon) icon.innerHTML = iconPath(state);
    }
  }
}

function updateProgressElements(snapshot) {
  updateProgressDom(app, snapshot);
}

function updateLyricElements(snapshot) {
  if (app.dataset.view !== "lyrics" || currentLyricLines.length === 0) return;

  const activeIndex = activeLyricIndex(currentLyricLines, Number(snapshot.timeline.position ?? 0) * 1000);
  if (activeIndex === latestActiveLyricIndex) return;

  latestActiveLyricIndex = activeIndex;
  const panel = app.querySelector(".lyrics-panel");
  if (!panel) return;

  panel.dataset.activeIndex = String(activeIndex);
  syncLyricVisualState(app);
}

function bridgeStructureKey(state = bridgeState) {
  return currentRenderKey(state);
}

function effectivePlayerSettings() {
  return { ...settings, lyricsStyle: lyricsStyleOverride || settings.lyricsStyle };
}

function bridgeRuntimeState(state = bridgeState, overrides = {}) {
  if (state?.stale === true) return { sourceStatus: "stale" };
  if (state?.healthy === true) return { sourceStatus: "active", ...overrides };
  return { sourceStatus: "none", ...overrides };
}

function bridgeOfflineState(error) {
  return {
    healthy: false,
    stale: false,
    error: error instanceof Error ? error.message : String(error ?? ""),
    snapshot: null,
    sources: [],
    blockedByPolicy: false
  };
}

function currentRenderKey(state = bridgeState) {
  const snapshot = normalizeNowPlayingSnapshot(chooseNowPlayingInput({
    official: officialMediaInput,
    bridge: state
  }));
  const effectiveSettings = effectivePlayerSettings();
  const commandSourceId = commandSourceIdForSnapshot(snapshot, state);

  return mediaRenderKey(snapshot, {
    mode: viewModeOverride || effectiveSettings.defaultVisibility,
    lyricsStyle: effectiveSettings.lyricsStyle,
    showLyrics: effectiveSettings.showLyrics,
    enableOnlineLyrics: effectiveSettings.enableOnlineLyrics,
    controlsAvailable: Boolean(commandSourceId),
    sourceSwitchAvailable: canSwitchBridgeSource(state, commandSourceId, settings),
  });
}

function scheduleBridgeRefresh(delayMs = 700, options = {}) {
  if (!shouldPollBridge) return;
  window.setTimeout(() => {
    refreshBridgeState({
      forceRender: false,
      fresh: options.fresh === true,
      preserveMissingSelected: Number(options.preserveMissingSelectedUntil ?? 0) > nowMs()
    });
  }, delayMs);
}

function scheduleBridgeRefreshBurst(command) {
  const fresh = shouldRefreshBridgeFreshAfterCommand(command);
  const preserveMissingSelectedUntil = selectedSourceHoldUntilMs;
  for (const delayMs of refreshDelaysForCommand(command)) {
    scheduleBridgeRefresh(delayMs, { fresh, preserveMissingSelectedUntil });
  }
}

function holdSelectedSourceForCommandRefresh(sourceId = "") {
  const selectedSourceId = cleanSourceId(sourceId);
  if (selectedSourceId) {
    manualBridgeSourceId = selectedSourceId;
    selectedBridgeSourceId = selectedSourceId;
  }
  selectedSourceHoldUntilMs = nowMs() + 5000;
}

function sourceIdMatches(source, sourceId) {
  return cleanSourceId(source?.sourceId ?? source?.source_id).toLowerCase() === cleanSourceId(sourceId).toLowerCase();
}

function cleanSourceId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function iconPath(name) {
  if (name === "pause") return '<path d="M7 5h4v14H7z"></path><path d="M13 5h4v14h-4z"></path>';
  if (name === "play") return '<path d="M8 5v14l11-7z"></path>';
  return "";
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function mockLyrics() {
  return `
[00:00.00]遥遥
[00:14.00]雨落在窗沿
[00:28.00]风把思念吹远
[00:42.00]我在人海之间
[00:56.00]听见你轻声呼唤
[01:10.00]越过漫长夜晚
[01:24.00]仍向同一束光靠岸
[01:38.00]遥遥相望也不算遗憾
[01:52.00]只要心还记得答案
[02:06.00]山海之间
[02:20.00]仍有回声相连
[02:34.00]等到风停那一天
[02:48.00]再把故事说完
`;
}
