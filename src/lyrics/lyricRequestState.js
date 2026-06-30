export function shouldRequestOnlineLyrics({
  key = "",
  currentKey = "",
  loadedKey = "",
  pendingKey = "",
  missingKey = "",
  temporaryFailureKey = "",
  temporaryRetryAtMs = 0,
  nowMs = 0,
  enabled = true,
} = {}) {
  if (enabled !== true || !key) return false;
  if (currentKey && currentKey !== key) return false;
  if (loadedKey === key || loadedKey === `${key}|official`) return false;
  if (pendingKey === key) return false;
  if (missingKey === key) return false;
  if (isTemporaryFailureActive({ key, temporaryFailureKey, temporaryRetryAtMs, nowMs })) return false;
  return true;
}

function isTemporaryFailureActive({ key, temporaryFailureKey, temporaryRetryAtMs, nowMs }) {
  if (temporaryFailureKey !== key) return false;
  return Number(nowMs) < Number(temporaryRetryAtMs);
}
