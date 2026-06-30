export function mediaRenderKey(snapshot = {}, options = {}) {
  if (snapshot.hasMedia !== true) return "empty";

  return [
    text(snapshot.sourceId),
    text(snapshot.title),
    text(snapshot.artist),
    text(snapshot.album),
    boundedTextFingerprint(snapshot.thumbnail),
    text(snapshot.playbackState),
    text(snapshot.timeline?.status),
    boundedTextFingerprint(snapshot.lyrics),
    text(options.mode),
    text(options.lyricsStyle),
    String(options.showLyrics !== false),
    String(options.enableOnlineLyrics !== false),
    String(options.controlsAvailable === true),
    String(options.sourceSwitchAvailable === true),
  ].join("|");
}

function text(value) {
  return String(value ?? "").trim();
}

export function boundedTextFingerprint(value) {
  const input = text(value);
  if (input.length > 2048) {
    return `${input.length}:${hashText(`${input.slice(0, 1024)}\u0000${input.slice(-1024)}`)}`;
  }
  return `${input.length}:${hashText(input)}`;
}

function hashText(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return String(hash);
}
