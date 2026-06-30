import { cleanArtworkSource, normalizeArtworkSource } from "../media/artworkSource.js";

const DEFAULT_WALLPAPER = "assets/default.png";
const DEFAULT_WALLPAPER_CSS_URL = "./assets/default.png";

export function deriveBackgroundState(snapshot = {}, settings = {}) {
  const enableCoverBackground = settings.enableCoverBackground === true;
  const customWallpaper = cleanImagePath(settings.customWallpaper);
  const cover = enableCoverBackground && snapshot.hasMedia === true ? cleanImagePath(snapshot.thumbnail) : "";
  const useCover = Boolean(cover);
  if (enableCoverBackground && snapshot.hasMedia === true && !useCover) return null;
  const blurPx = useCover
    ? clampNumber(settings.coverBackgroundBlur, 0, 100, 64)
    : clampNumber(settings.customWallpaperBlur, 0, 100, 0);

  return {
    mode: useCover ? "cover" : "wallpaper",
    image: useCover ? cover : customWallpaper || DEFAULT_WALLPAPER,
    blurPx,
    dimEnabled: settings.backgroundDim === true,
  };
}

export function applyBackgroundState(element, state) {
  if (!element || !state) return;
  const imageUrl = resolveCssUrlForElement(toCssImageUrl(state.image), element);
  const cssImage = `url("${escapeCssUrl(imageUrl)}")`;
  const blur = `${state.blurPx}px`;
  const dim = String(state.dimEnabled);
  const mode = state.mode;
  const cacheKey = `${cssImage}\n${blur}\n${dim}\n${mode}`;
  if (element.__weSmtcBackgroundStateKey === cacheKey) return;

  element.__weSmtcBackgroundStateKey = cacheKey;
  element.style.setProperty("--wallpaper-image", cssImage);
  element.style.setProperty("--wallpaper-blur", blur);
  element.dataset.backgroundDim = dim;
  element.dataset.backgroundMode = mode;
}

export function toCssImageUrl(value) {
  if (value === DEFAULT_WALLPAPER) return DEFAULT_WALLPAPER_CSS_URL;
  return normalizeArtworkSource(value);
}

function resolveCssUrlForElement(value, element) {
  const url = String(value || "");
  if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(url)) return url;

  const baseUri = element?.ownerDocument?.baseURI || globalThis.location?.href || "";
  if (!baseUri) return url;

  try {
    return new URL(url, baseUri).href;
  } catch {
    return url;
  }
}

const cleanImagePath = cleanArtworkSource;

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function escapeCssUrl(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
