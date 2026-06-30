import { applySourcePolicy } from "./sourcePolicy.js";

export function canSwitchBridgeSource(state = {}, displayedSourceId = "", settings = {}) {
  if (state?.healthy !== true || state?.stale === true) return false;

  const selectedSourceId = normalizeId(state.snapshot?.sourceId ?? state.snapshot?.source_id);
  const displayed = normalizeId(displayedSourceId);
  if (selectedSourceId && displayed && selectedSourceId === displayed) return true;

  return policyVisibleSourceCount(state.sources, settings) > 1;
}

function policyVisibleSourceCount(sources = [], settings = {}) {
  const unique = new Set();
  for (const source of applySourcePolicy(Array.isArray(sources) ? sources : [], settings)) {
    const id = normalizeId(source?.sourceId ?? source?.source_id);
    if (id) unique.add(id);
  }
  return unique.size;
}

function normalizeId(value) {
  return String(value ?? "").trim().toLowerCase();
}
