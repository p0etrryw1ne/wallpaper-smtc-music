const DEFAULT_JITTER_TOLERANCE_MS = 180;
const DEFAULT_SEEK_THRESHOLD_MS = 5_000;

export function createMediaTimelineClock(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => performance.now();
  const jitterToleranceMs = Number(options.jitterToleranceMs ?? DEFAULT_JITTER_TOLERANCE_MS);
  const seekThresholdMs = Number(options.seekThresholdMs ?? DEFAULT_SEEK_THRESHOLD_MS);
  let state = null;

  return {
    sync(snapshot, mediaKey = mediaIdentity(snapshot)) {
      state = reconcileState(state, snapshot, mediaKey, now(), {
        jitterToleranceMs,
        seekThresholdMs,
      });
      return projectSnapshot(snapshot, state, now());
    },
    snapshot(snapshot, mediaKey = mediaIdentity(snapshot)) {
      if (!state || state.mediaKey !== mediaKey) {
        state = reconcileState(state, snapshot, mediaKey, now(), {
          jitterToleranceMs,
          seekThresholdMs,
        });
      }
      return projectSnapshot(snapshot, state, now());
    },
    reset() {
      state = null;
    },
  };
}

function reconcileState(previous, snapshot, mediaKey, atMs, options) {
  if (snapshot?.timeline?.status !== "known") {
    return null;
  }

  const incoming = clampPosition(Number(snapshot.timeline.position), Number(snapshot.timeline.duration));
  const duration = Number(snapshot.timeline.duration);
  const playbackState = snapshot.playbackState;
  const sampleAtMs = timelineSampleAtMs(snapshot, atMs);
  if (!previous || previous.mediaKey !== mediaKey || previous.playbackState !== playbackState) {
    return newState({ mediaKey, position: incoming, duration, playbackState, atMs: sampleAtMs });
  }

  const projected = projectPosition(previous, atMs);
  const diffMs = (incoming - projected) * 1000;
  const isBackward = diffMs < 0;
  const isSeek = Math.abs(diffMs) >= options.seekThresholdMs;
  const shouldAccept = Math.abs(diffMs) >= options.jitterToleranceMs
    && !(playbackState === "playing" && isBackward && !isSeek);

  if (!shouldAccept) {
    return {
      ...previous,
      duration,
      playbackState,
    };
  }

  return newState({ mediaKey, position: incoming, duration, playbackState, atMs: sampleAtMs });
}

function projectSnapshot(snapshot, state, atMs) {
  if (!state || snapshot?.timeline?.status !== "known") {
    return snapshot;
  }

  return {
    ...snapshot,
    timeline: {
      ...snapshot.timeline,
      position: projectPosition(state, atMs),
      duration: state.duration,
    },
  };
}

function projectPosition(state, atMs) {
  const elapsedSeconds = state.playbackState === "playing"
    ? Math.max(0, (atMs - state.atMs) / 1000)
    : 0;
  return clampPosition(state.position + elapsedSeconds, state.duration);
}

function newState({ mediaKey, position, duration, playbackState, atMs }) {
  return {
    mediaKey,
    position,
    duration,
    playbackState,
    atMs,
  };
}

function timelineSampleAtMs(snapshot, fallbackMs) {
  const sampledAtMs = Number(snapshot?.timeline?.sampledAtMs);
  return Number.isFinite(sampledAtMs) ? sampledAtMs : fallbackMs;
}

function clampPosition(position, duration) {
  if (!Number.isFinite(position)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, position);
  return Math.max(0, Math.min(position, duration));
}

export function mediaIdentity(snapshot = {}) {
  return [
    snapshot.sourceId,
    snapshot.title,
    snapshot.artist,
    snapshot.album,
    snapshot.timeline?.duration,
  ].map((value) => String(value ?? "").trim().toLowerCase()).join("|");
}
