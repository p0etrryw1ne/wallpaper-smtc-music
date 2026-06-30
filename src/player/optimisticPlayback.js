export function applyOptimisticPlaybackCommand(snapshot, command) {
  if (command !== "play-pause" || !snapshot || typeof snapshot !== "object") {
    return snapshot;
  }

  return {
    ...snapshot,
    playbackState: snapshot.playbackState === "playing" ? "paused" : "playing",
  };
}

export function createOptimisticPlaybackOverride(snapshot, command, nowMs, ttlMs = 1500) {
  const nextSnapshot = applyOptimisticPlaybackCommand(snapshot, command);
  if (nextSnapshot === snapshot) return null;

  return {
    mediaKey: optimisticPlaybackIdentity(snapshot),
    playbackState: nextSnapshot.playbackState,
    expiresAtMs: Number(nowMs) + Number(ttlMs),
  };
}

export function applyOptimisticPlaybackOverride(snapshot, override, nowMs) {
  if (!shouldKeepOptimisticPlaybackOverride(snapshot, override, nowMs)) return snapshot;

  return {
    ...snapshot,
    playbackState: override.playbackState,
  };
}

export function shouldKeepOptimisticPlaybackOverride(snapshot, override, nowMs) {
  if (!snapshot || typeof snapshot !== "object" || !override) return false;
  if (Number(nowMs) >= Number(override.expiresAtMs)) return false;
  if (optimisticPlaybackIdentity(snapshot) !== override.mediaKey) return false;
  return snapshot.playbackState !== override.playbackState;
}

function optimisticPlaybackIdentity(snapshot = {}) {
  return [
    snapshot.sourceId,
    snapshot.title,
    snapshot.artist,
    snapshot.album,
  ].map((value) => String(value ?? "").trim().toLowerCase()).join("|");
}
