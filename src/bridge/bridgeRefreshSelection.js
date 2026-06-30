import { allSourcesBlockedByPolicy, applySourcePolicy } from "./sourcePolicy.js";
import { selectBridgeSource } from "./bridgeSourceSelection.js";

export function resolveBridgeRefreshSelection({
  sourcesResult = {},
  previousState = {},
  selectedSourceId = "",
  settings = {},
  preserveMissingSelected = false,
} = {}) {
  if (sourcesResult?.healthy !== true) {
    return {
      state: {
        healthy: false,
        stale: false,
        error: sourcesResult?.error || "",
        snapshot: null,
        sources: [],
        blockedByPolicy: false
      },
      selectedSourceId: ""
    };
  }

  const sources = Array.isArray(sourcesResult.sources) ? sourcesResult.sources : [];
  const selected = cleanSourceId(selectedSourceId);
  const source = selectBridgeSource(sources, selected, settings);
  if (sourceMatches(source, selected) || !selected) {
    return selectedRefreshResult({
      source,
      sources,
      stale: sourcesResult.stale === true,
      error: sourcesResult.error || "",
      settings
    });
  }

  if (shouldPreserveMissingSelected(previousState, selected, settings, preserveMissingSelected)) {
    return preservedSelectedResult({
      previousState,
      selected,
      sources,
      stale: sourcesResult.stale === true,
      error: sourcesResult.error || ""
    });
  }

  return selectedRefreshResult({
    source,
    sources,
    stale: sourcesResult.stale === true,
    error: sourcesResult.error || "",
    settings
  });
}

function preservedSelectedResult({ previousState, selected, sources, stale, error }) {
  return {
    state: {
      healthy: true,
      stale,
      error,
      snapshot: previousState.snapshot,
      sources,
      blockedByPolicy: false
    },
    selectedSourceId: cleanSourceId(previousState.snapshot?.sourceId) || selected
  };
}

function selectedRefreshResult({ source, sources, stale, error, settings }) {
  return {
    state: {
      healthy: true,
      stale,
      error,
      snapshot: source || null,
      sources,
      blockedByPolicy: !source && allSourcesBlockedByPolicy(sources, settings)
    },
    selectedSourceId: cleanSourceId(source?.sourceId)
  };
}

function shouldPreserveMissingSelected(previousState, selectedSourceId, settings, preserveMissingSelected) {
  return preserveMissingSelected === true && canUsePreviousSelectedSnapshot(previousState, selectedSourceId, settings);
}

function canUsePreviousSelectedSnapshot(previousState, selectedSourceId, settings) {
  if (!selectedSourceId) return false;
  const previousSnapshot = previousState?.snapshot;
  if (!sourceMatches(previousSnapshot, selectedSourceId) || !hasMedia(previousSnapshot)) return false;
  return applySourcePolicy([previousSnapshot], settings).length > 0;
}

function sourceMatches(source, sourceId) {
  return Boolean(sourceId) && cleanSourceId(source?.sourceId ?? source?.source_id).toLowerCase() === sourceId.toLowerCase();
}

function hasMedia(source = {}) {
  return Boolean(cleanText(source.title) || cleanText(source.artist) || cleanText(source.album) || cleanText(source.thumbnail));
}

function cleanSourceId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
