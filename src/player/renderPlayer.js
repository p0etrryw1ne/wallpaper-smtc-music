import { normalizeArtworkSource } from "../media/artworkSource.js";

export function renderPlayer(snapshot = {}, model = {}) {
  if (model.visible !== true) return "";

  const mode = htmlAttr(model.mode || "expanded");
  const title = cleanText(snapshot.title) || "未检测到播放";
  const artist = cleanText(snapshot.artist);
  const thumbnail = normalizeArtworkSource(snapshot.thumbnail);
  const lyricsStyle = model.lyricsStyle === "immersive" ? "immersive" : "standard";
  const playState = snapshot.playbackState === "playing" ? "pause" : "play";
  const progress = progressState(snapshot.timeline, model);
  const controlsAvailable = model.controlsAvailable !== false;
  const sourceSwitchAvailable = model.sourceSwitchAvailable === true;

  if (mode === "compact") {
    return renderCompactPlayer({
      title,
      artist,
      cover: renderArtwork(thumbnail, "mini"),
      playState,
      progress,
      controlsAvailable,
      sourceSwitchAvailable,
      sourceStatus: model.sourceStatus
    });
  }

  if (lyricsStyle === "immersive") {
    return renderImmersiveLyricsPlayer({
      mode,
      title,
      artist,
      cover: renderArtwork(thumbnail),
      sourceStatus: model.sourceStatus
    });
  }

  const cover = renderArtwork(thumbnail);

  return `
<section class="player-shell" data-player-mode="${mode}" data-source-status="${htmlAttr(model.sourceStatus || "none")}">
  <button class="album-cover-button" type="button" data-action="toggle-compact" aria-label="切换播放器形态">
    ${cover}
  </button>
  <div class="track-panel">
    <button class="track-title-mask" type="button" data-action="toggle-player-style">
      ${titleMarquee("track-title", title)}
    </button>
    <span class="track-artist">${htmlText(artist)}</span>
  </div>
  <div class="progress-slot" data-progress-reserved="${String(progress.reserved)}" data-progress-visible="${String(progress.visible)}">
    <div class="progress-times">
      <span>${htmlText(progress.currentTime)}</span>
      <span>${htmlText(progress.durationTime)}</span>
    </div>
    <div class="progress-track" style="--progress-percent: ${htmlAttr(progress.percentText)}">
      <div class="progress-fill"></div>
    </div>
  </div>
  <div class="transport-controls" aria-label="播放控制">
    ${transportButton("switch-source", "切换媒体源", "switch-source", "", !sourceSwitchAvailable)}
    ${transportButton("volume-down", "音量降低", "volume-down", "", !controlsAvailable)}
    ${transportButton("previous", "上一首", "previous", "", !controlsAvailable)}
    ${transportButton("play-pause", playState === "pause" ? "暂停" : "播放", playState, playState, !controlsAvailable)}
    ${transportButton("next", "下一首", "next", "", !controlsAvailable)}
    ${transportButton("volume-up", "音量提高", "volume-up", "", !controlsAvailable)}
    ${transportButton("lyrics", "歌词", "lyrics")}
  </div>
</section>`.trim();
}

function renderArtwork(source, variant = "album") {
  const className = variant === "mini" ? "mini-art" : "album-art";
  if (!source) return `<div class="${className} ${className}-fallback" aria-hidden="true"></div>`;

  return `<img class="${className}" data-artwork-image src="${htmlAttr(source)}" alt=""><div class="${className} ${className}-fallback" data-artwork-fallback hidden aria-hidden="true"></div>`;
}

function renderImmersiveLyricsPlayer({ mode, title, artist, cover, sourceStatus }) {
  return `
<section class="player-shell player-shell--immersive" data-player-mode="${mode}" data-lyrics-style="immersive" data-source-status="${htmlAttr(sourceStatus || "none")}">
  <button class="album-cover-button" type="button" data-action="toggle-compact" aria-label="切换播放器形态">
    ${cover}
  </button>
  <div class="track-panel">
    <button class="track-title-mask" type="button" data-action="toggle-player-style">
      ${titleMarquee("track-title", title)}
    </button>
    <span class="track-artist">${htmlText(artist)}</span>
  </div>
</section>`.trim();
}

function renderCompactPlayer({ title, artist, cover, playState, progress, controlsAvailable, sourceSwitchAvailable, sourceStatus }) {
  return `
<section class="compact-player" data-player-mode="compact" data-source-status="${htmlAttr(sourceStatus || "none")}" data-source-switch-available="${String(sourceSwitchAvailable)}">
  <button class="compact-art-button" type="button" data-action="toggle-expanded" aria-label="切换到展开播放器">
    ${cover}
  </button>
  <div class="compact-body">
    <div class="compact-meta">
      <button class="compact-title-mask" type="button" data-action="toggle-player-style">
        ${titleMarquee("mini-title", title)}
      </button>
      <span class="mini-artist">${htmlText(artist)}</span>
    </div>
    <div class="compact-controls" aria-label="迷你播放控制">
      ${transportButton("previous", "上一首", "previous", "", !controlsAvailable)}
      ${transportButton("play-pause", playState === "pause" ? "暂停" : "播放", playState, playState, !controlsAvailable)}
      ${transportButton("next", "下一首", "next", "", !controlsAvailable)}
    </div>
    <div class="compact-progress" data-progress-reserved="${String(progress.reserved)}" data-progress-visible="${String(progress.visible)}">
      <div class="progress-track compact-progress-track" style="--progress-percent: ${htmlAttr(progress.percentText)}">
        <div class="progress-fill"></div>
      </div>
    </div>
  </div>
</section>`.trim();
}

function transportButton(command, label, iconName, state = "", disabled = false) {
  const stateAttr = state ? ` data-state="${htmlAttr(state)}"` : "";
  const disabledAttr = disabled ? " disabled" : "";
  return `<button class="transport-button" type="button" data-command="${htmlAttr(command)}" aria-label="${htmlAttr(label)}"${stateAttr}${disabledAttr}>${iconSvg(iconName)}</button>`;
}

function titleMarquee(className, title) {
  const text = htmlText(title);
  const attr = htmlAttr(title);
  return `<span class="${htmlAttr(className)}" data-marquee-text="${attr}"><span class="title-marquee-item">${text}</span><span class="title-marquee-item" aria-hidden="true">${text}</span></span>`;
}

function iconSvg(name) {
  const path = ICON_PATHS[name] || "";
  return `<svg class="transport-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

function progressState(timeline = {}, model = {}) {
  const reserved = model.progressSlotReserved === true;
  const visible = reserved && model.progressVisible === true && timeline.status === "known";
  if (!visible) {
    return {
      reserved,
      visible: false,
      currentTime: "",
      durationTime: "",
      percentText: "0%"
    };
  }

  const position = Number(timeline.position);
  const duration = Number(timeline.duration);
  const percent = duration > 0 ? Math.max(0, Math.min(100, (position / duration) * 100)) : 0;
  return {
    reserved,
    visible: true,
    currentTime: formatTime(position),
    durationTime: formatTime(duration),
    percentText: `${trimPercent(percent)}%`
  };
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function trimPercent(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function htmlText(value) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function htmlAttr(value) {
  return htmlText(value).replaceAll('"', "&quot;");
}

const ICON_PATHS = {
  "switch-source": '<path d="M4 7h9l-2-2 1.4-1.4L17.8 9l-5.4 5.4L11 13l2-2H4z"></path><path d="M20 17h-9l2 2-1.4 1.4L6.2 15l5.4-5.4L13 11l-2 2h9z"></path>',
  "volume-down": '<path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16 11h5v2h-5z"></path>',
  "volume-up": '<path d="M3 9v6h4l5 4V5L7 9z"></path><path d="M18 8h2v3h3v2h-3v3h-2v-3h-3v-2h3z"></path>',
  previous: '<path d="M6 5h2v14H6z"></path><path d="M18 5v14l-9-7z"></path>',
  next: '<path d="M16 5h2v14h-2z"></path><path d="M6 5v14l9-7z"></path>',
  pause: '<path d="M7 5h4v14H7z"></path><path d="M13 5h4v14h-4z"></path>',
  play: '<path d="M8 5v14l11-7z"></path>',
  lyrics: '<path d="M5 5h14v2H5z"></path><path d="M5 10h10v2H5z"></path><path d="M5 15h14v2H5z"></path><path d="M5 20h7v2H5z"></path>'
};
