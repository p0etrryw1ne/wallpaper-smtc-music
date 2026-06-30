export function applySourcePolicy(sources = [], settings = {}) {
  const blocked = normalizeSourceList(settings.blockedSources);
  const lowPriority = normalizeSourceList(settings.lowPrioritySources);
  const allowed = [...sources].filter((source) => !matchesAny(sourceIdentifier(source), blocked));
  const normal = allowed.filter((source) => !matchesAny(sourceIdentifier(source), lowPriority));

  return normal.length > 0 ? normal : allowed;
}

export function allSourcesBlockedByPolicy(sources = [], settings = {}) {
  const list = Array.isArray(sources) ? sources : [];
  return list.length > 0 && applySourcePolicy(list, settings).length === 0;
}

export function normalizeSourceList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeId).filter(Boolean);
  }

  if (typeof value !== "string") return [];
  return value
    .split(/[,;\n]+/)
    .map(normalizeId)
    .filter(Boolean);
}

function sourceIdentifier(source = {}) {
  return normalizeId(source.sourceId ?? source.source_id);
}

function matchesAny(sourceId, rules) {
  return rules.some((rule) => sourceId.includes(rule));
}

function normalizeId(value) {
  return String(value ?? "").trim().toLowerCase();
}
