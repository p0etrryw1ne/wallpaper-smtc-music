export function isLyricLookupInFlightOrExpected({
  key = "",
  currentKey = "",
  loadedKey = "",
  pendingKey = "",
  missingKey = "",
  temporaryFailureKey = "",
  temporaryRetryAtMs = 0,
  nowMs = 0,
  enabled = true
} = {}) {
  if (enabled !== true || !key || currentKey !== key) return false;
  if (missingKey === key) return false;
  if (loadedKey === key || loadedKey === `${key}|official`) return false;
  if (isTemporaryFailureActive({ key, temporaryFailureKey, temporaryRetryAtMs, nowMs })) return false;
  return pendingKey === key || loadedKey === "";
}

function isTemporaryFailureActive({ key, temporaryFailureKey, temporaryRetryAtMs, nowMs }) {
  if (temporaryFailureKey !== key) return false;
  return Number(nowMs) < Number(temporaryRetryAtMs);
}
