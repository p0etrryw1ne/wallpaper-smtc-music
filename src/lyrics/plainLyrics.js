export function plainLyricsToLines(plainLyricsText) {
  return cleanText(plainLyricsText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      timeMs: index * 4000,
      text: line,
    }));
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
