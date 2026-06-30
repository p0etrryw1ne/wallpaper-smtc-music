export function commandSourceIdForSnapshot(snapshot, bridgeState = {}) {
  if (bridgeState?.healthy !== true || bridgeState?.stale === true) return "";
  const bridgeSourceId = cleanText(bridgeState.snapshot?.sourceId);
  return cleanText(snapshot?.sourceId).toLowerCase() === bridgeSourceId.toLowerCase()
    ? bridgeSourceId
    : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
