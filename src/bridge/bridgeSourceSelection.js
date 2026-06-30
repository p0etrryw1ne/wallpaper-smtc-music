import { applySourcePolicy } from "./sourcePolicy.js";

export function selectBridgeSource(sources = [], selectedSourceId = "", settings = {}) {
  const allowed = sourcesWithIdsInOrder(applySourcePolicy(sources, settings));
  if (allowed.length === 0) return null;

  const selected = normalizeId(selectedSourceId);
  if (selected) {
    const matched = allowed.find((source) => normalizeId(source.sourceId ?? source.source_id) === selected);
    if (matched) return matched;
  }

  return allowed[0];
}

export function selectNextBridgeSourceId(sources = [], selectedSourceId = "", settings = {}) {
  const allowed = controllableSourcesInOrder(applySourcePolicy(sources, settings));
  if (allowed.length === 0) return "";

  const selected = normalizeId(selectedSourceId) || normalizeId(settings.currentSourceId);
  const currentIndex = allowed.findIndex((source) => normalizeId(source.sourceId ?? source.source_id) === selected);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % allowed.length : 0;
  return sourceId(allowed[nextIndex]);
}

function sourceId(source = {}) {
  return String(source.sourceId ?? source.source_id ?? "").trim();
}

function sourcesWithIdsInOrder(sources = []) {
  return sources.filter((source) => normalizeId(sourceId(source)));
}

function controllableSourcesInOrder(sources = []) {
  const seen = new Set();
  const result = [];
  for (const source of sourcesWithIdsInOrder(sources)) {
    const id = normalizeId(sourceId(source));
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(source);
  }
  return result;
}

function normalizeId(value) {
  return String(value ?? "").trim().toLowerCase();
}
