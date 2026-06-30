import { fetchBridgeSources, selectBridgeSourceById, selectNextBridgeSource } from "./bridgeClient.js";
import { selectBridgeSource, selectNextBridgeSourceId } from "./bridgeSourceSelection.js";
import { allSourcesBlockedByPolicy, applySourcePolicy } from "./sourcePolicy.js";

export async function switchToNextBridgeSource({
  fetchImpl = fetch,
  currentSourceId = "",
  settings = {},
  selectNext = selectNextBridgeSource,
  selectSource = selectBridgeSourceById,
  fetchSources = fetchBridgeSources
} = {}) {
  const sourcesResult = await fetchSources(fetchImpl, { fresh: true });
  if (sourcesResult?.healthy === true && sourcesResult.stale !== true) {
    const selectedSourceId = selectNextBridgeSourceId(sourcesResult.sources, currentSourceId, settings);
    const selected = selectedSourceId ? await selectSource(selectedSourceId, fetchImpl) : null;
    if (selectedSourceId && selected?.healthy !== true) {
      return {
        state: {
          healthy: true,
          stale: sourcesResult.stale === true,
          error: selected?.error || sourcesResult.error || "source selection failed",
          snapshot: null,
          sources: sourcesResult.sources,
          blockedByPolicy: allSourcesBlockedByPolicy(sourcesResult.sources, settings)
        },
        selectedSourceId: ""
      };
    }

    const source = selected?.healthy === true && selected.snapshot
      ? selected.snapshot
      : selectBridgeSource(sourcesResult.sources, selectedSourceId, settings) || null;
    return {
      state: {
        healthy: true,
        stale: selected?.healthy === true ? selected.stale === true : sourcesResult.stale === true,
        error: selected?.healthy === true ? selected.error || sourcesResult.error || "" : sourcesResult.error || "",
        snapshot: source,
        sources: sourcesResult.sources,
        blockedByPolicy: !source && allSourcesBlockedByPolicy(sourcesResult.sources, settings)
      },
      selectedSourceId: cleanSourceId(source?.sourceId) || selectedSourceId
    };
  }

  const switched = await selectNext(fetchImpl);
  if (switched?.healthy !== true) {
    return {
      state: {
        healthy: false,
        stale: false,
        error: switched?.error || sourcesResult?.error || "",
        snapshot: null,
        sources: [],
        blockedByPolicy: false
      },
      selectedSourceId: ""
    };
  }

  if (switched.snapshot && applySourcePolicy([switched.snapshot], settings).length === 0) {
    return {
      state: {
        healthy: true,
        stale: switched.stale === true,
        error: sourcesResult.error || switched.error || "",
        snapshot: null,
        sources: [],
        blockedByPolicy: true
      },
      selectedSourceId: ""
    };
  }

  const selectedSourceId = cleanSourceId(switched.snapshot?.sourceId);
  return {
    state: {
      healthy: true,
      stale: switched.stale === true,
      error: sourcesResult.error || switched.error || "",
      snapshot: switched.snapshot || null,
      sources: [],
      blockedByPolicy: false
    },
    selectedSourceId
  };
}

function cleanSourceId(value) {
  return typeof value === "string" ? value.trim() : "";
}
