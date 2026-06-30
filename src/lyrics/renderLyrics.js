export function renderLyrics(lines = [], activeIndex = -1, options = {}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    if (options.loading === true) {
      return '<section class="lyrics-panel lyrics-panel--loading" data-active-index="-1" data-visual-ready="true" data-lyrics-loading="true"><div class="lyric-line lyric-line--loading" data-index="-1" data-visual-active="false">歌词加载中</div></section>';
    }
    return "";
  }

  const lyricLines = lines
    .map((line, index) => {
      return `<div class="lyric-line" data-index="${index}" data-visual-active="false">${escapeHtml(line?.text ?? "")}</div>`;
    })
    .join("");

  return `<section class="lyrics-panel" data-active-index="-1" data-visual-ready="false">${lyricLines}</section>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
