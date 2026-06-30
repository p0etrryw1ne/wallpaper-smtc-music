export function resolveDisplayMode({
  requestedMode,
  fallbackMode = "expanded",
  showLyrics = true,
  lyricLineCount = 0,
  lyricsLoading = false
} = {}) {
  if (requestedMode === "lyrics" && showLyrics !== false && lyricsLoading === true) {
    return "lyrics";
  }

  if (requestedMode === "lyrics" && (showLyrics === false || lyricLineCount <= 0)) {
    return fallbackMode === "lyrics" ? "expanded" : fallbackMode;
  }

  return requestedMode || fallbackMode;
}
