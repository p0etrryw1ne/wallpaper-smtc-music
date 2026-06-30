export function chooseNowPlayingInput({ official = {}, bridge = {} } = {}) {
  if (bridge.healthy === true && hasBridgeMedia(bridge.snapshot)) {
    return bridge.snapshot;
  }

  if (bridge.healthy === true && bridge.blockedByPolicy === true) {
    return {};
  }

  if (
    bridge.healthy === true
    && bridge.stale !== true
    && !cleanText(bridge.error)
    && Array.isArray(bridge.sources)
    && bridge.sources.length === 0
  ) {
    return {};
  }

  return official ?? {};
}

function hasBridgeMedia(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  return Boolean(cleanText(snapshot.title) || cleanText(snapshot.artist) || cleanText(snapshot.album) || cleanText(snapshot.thumbnail));
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
