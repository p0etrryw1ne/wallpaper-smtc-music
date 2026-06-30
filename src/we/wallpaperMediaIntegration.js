import { fromWallpaperMedia } from "./officialMediaAdapter.js";

const MEDIA_LISTENERS = [
  {
    name: "wallpaperRegisterMediaPropertiesListener",
    map: (event) => ({
      title: event?.title,
      artist: event?.artist,
      album: event?.albumTitle ?? event?.album,
      contentType: event?.contentType,
      lyrics: event?.lyrics
    })
  },
  {
    name: "wallpaperRegisterMediaThumbnailListener",
    map: (event) => ({
      thumbnail: event?.thumbnail
    })
  },
  {
    name: "wallpaperRegisterMediaPlaybackListener",
    map: (event) => ({
      state: event?.state
    })
  },
  {
    name: "wallpaperRegisterMediaTimelineListener",
    map: (event) => ({
      position: event?.position,
      duration: event?.duration,
      sampledAtMs: event?.sampledAtMs
    })
  }
];

export function hasWallpaperMediaIntegration(host = globalThis.window) {
  return MEDIA_LISTENERS.some(({ name }) => typeof host?.[name] === "function");
}

export function registerWallpaperMediaIntegration({ host = globalThis.window, onMediaInput } = {}) {
  if (!host || typeof onMediaInput !== "function" || !hasWallpaperMediaIntegration(host)) {
    return false;
  }

  let payload = {};
  let thumbnailUpdatedSinceProperties = false;
  for (const { name, map } of MEDIA_LISTENERS) {
    registerHostListener(host, name, (event) => {
      const update = map(event);
      const carryThumbnailToNextIdentity = name === "wallpaperRegisterMediaThumbnailListener"
        && thumbnailMayBelongToNextIdentity(payload, update);
      if (name === "wallpaperRegisterMediaPropertiesListener" && mediaIdentityChanged(payload, update)) {
        payload = {
          state: payload.state,
          thumbnail: thumbnailUpdatedSinceProperties ? payload.thumbnail : ""
        };
      }
      payload = {
        ...payload,
        ...update
      };
      if (name === "wallpaperRegisterMediaThumbnailListener") {
        thumbnailUpdatedSinceProperties = carryThumbnailToNextIdentity;
      } else if (name === "wallpaperRegisterMediaPropertiesListener") {
        thumbnailUpdatedSinceProperties = false;
      }
      onMediaInput(fromWallpaperMedia(payload));
    });
  }

  registerHostListener(host, "wallpaperRegisterMediaStatusListener", (event) => {
    if (event?.enabled === false) {
      payload = {};
      thumbnailUpdatedSinceProperties = false;
      onMediaInput({});
    }
  });

  return true;
}

function registerHostListener(host, name, listener) {
  if (typeof host?.[name] === "function") {
    host[name](listener);
  }
}

function mediaIdentityChanged(previousPayload, update) {
  const previousKey = mediaIdentityKey(previousPayload);
  const nextKey = mediaIdentityKey({ ...previousPayload, ...update });
  return Boolean(previousKey && nextKey && previousKey !== nextKey);
}

function thumbnailMayBelongToNextIdentity(previousPayload, update) {
  const previousThumbnail = cleanText(previousPayload.thumbnail);
  const nextThumbnail = cleanText(update.thumbnail);
  return Boolean(mediaIdentityKey(previousPayload) && previousThumbnail && nextThumbnail && previousThumbnail !== nextThumbnail);
}

function mediaIdentityKey(payload = {}) {
  const title = cleanText(payload.title);
  const artist = cleanText(payload.artist);
  const album = cleanText(payload.album);
  if (!title && !artist && !album) return "";
  return [title, artist, album].map((value) => value.toLowerCase()).join("|");
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
