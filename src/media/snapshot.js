export function createEmptySnapshot() {
  return {
    sourceId: "",
    title: "",
    artist: "",
    album: "",
    thumbnail: null,
    playbackState: "stopped",
    timeline: {
      status: "unknown",
      position: null,
      duration: null
    },
    hasMedia: false
  };
}

export function normalizeNowPlayingSnapshot(input = {}) {
  const title = cleanText(input.title);
  const artist = cleanText(input.artist);
  const album = cleanText(input.album);
  const sourceId = cleanText(input.sourceId ?? input.sourceAppUserModelId);
  const thumbnail = cleanText(input.thumbnail) || null;
  const hasMedia = Boolean(title || artist || album);

  return {
    sourceId,
    title,
    artist,
    album,
    thumbnail,
    playbackState: normalizePlaybackState(input.playbackState ?? input.isPlaying),
    timeline: normalizeTimeline(input),
    lyrics: cleanText(input.lyrics),
    hasMedia
  };
}

export function normalizePlaybackState(value) {
  if (value === 1) return "playing";
  if (value === 2) return "paused";
  if (value === true) return "playing";
  if (value === false) return "paused";

  const state = cleanText(value).toLowerCase();
  if (state === "playing" || state === "play") return "playing";
  if (state === "paused" || state === "pause") return "paused";
  if (state.endsWith("(4)")) return "playing";
  if (state.endsWith("(5)")) return "paused";
  return "stopped";
}

export function normalizeTimeline(input = {}) {
  const position = finiteNumber(input.position);
  const duration = finiteNumber(input.duration);
  if (position === null || duration === null || duration <= 0) {
    return {
      status: "unknown",
      position: null,
      duration: null
    };
  }

  const timeline = {
    status: "known",
    position: Math.max(0, Math.min(position, duration)),
    duration
  };
  const sampledAtMs = finiteNumber(input.sampledAtMs ?? input.sampled_at_ms);
  if (sampledAtMs !== null) {
    timeline.sampledAtMs = sampledAtMs;
  }
  return timeline;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
