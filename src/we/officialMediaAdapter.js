import { normalizePlaybackState } from "../media/snapshot.js";

export function fromWallpaperMedia(payload = {}) {
  const media = {
    sourceId: "wallpaper-engine",
    title: stringOrEmpty(payload.title),
    artist: stringOrEmpty(payload.artist),
    album: stringOrEmpty(payload.album),
    thumbnail: stringOrEmpty(payload.thumbnail),
    playbackState: normalizePlaybackState(payload.state ?? payload.playbackState),
    position: numberOrNull(payload.position),
    duration: numberOrNull(payload.duration),
  };
  const sampledAtMs = numberOrNull(payload.sampledAtMs ?? payload.sampled_at_ms);
  if (sampledAtMs !== null) media.sampledAtMs = sampledAtMs;
  const lyrics = stringOrEmpty(payload.lyrics);
  if (lyrics) media.lyrics = lyrics;
  return media;
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
