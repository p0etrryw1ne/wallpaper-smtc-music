export function nextPlayerStyleState({ currentView, currentStyle, defaultStyle } = {}) {
  const activeStyle = normalizeStyle(currentStyle || defaultStyle);
  const nextStyle = activeStyle === "immersive" ? "standard" : "immersive";
  const view = normalizeView(currentView);

  return {
    lyricsStyleOverride: nextStyle,
    viewModeOverride: view || null
  };
}

function normalizeStyle(value) {
  return value === "immersive" ? "immersive" : "standard";
}

function normalizeView(value) {
  return value === "lyrics" || value === "compact" || value === "expanded" ? value : "";
}
