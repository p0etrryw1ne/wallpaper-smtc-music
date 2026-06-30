import { fetchBridgeLyrics } from "./providers/bridgeProvider.js";
import { fetchConfiguredLyrics } from "./configuredLyricProvider.js";

export function createLyricProviderManager(options = {}) {
  const cache = new Map();
  const providerTimeoutMs = finitePositiveNumber(options.providerTimeoutMs, 4500);
  const providers = options.providers ?? (options.provider ? [options.provider] : [
    fetchConfiguredLyrics,
    fetchBridgeLyrics,
  ]);

  async function fetchLyricsResult(media) {
    const key = lyricCacheKey(media);
    if (!key) return { value: null, temporaryFailure: false };
    if (cache.has(key)) return { value: cache.get(key), temporaryFailure: false };

    const result = await fetchFromProviders(providers, media, providerTimeoutMs);
    if (result.temporaryFailure !== true) {
      cache.set(key, Array.isArray(result.value?.lines) && result.value.lines.length > 0 ? result.value : null);
    }
    return result;
  }

  return {
    fetchLyricsResult,
    async fetchLyrics(media) {
      const result = await fetchLyricsResult(media);
      return result.value;
    },
  };
}

async function fetchFromProviders(providers, media, providerTimeoutMs) {
  let hadFailure = false;
  for (const provider of providers) {
    let result = null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    try {
      result = await withTimeout(
        provider(media, { signal: controller?.signal }),
        providerTimeoutMs,
        () => controller?.abort()
      );
    } catch {
      hadFailure = true;
      result = null;
    }
    if (Array.isArray(result?.lines) && result.lines.length > 0) {
      return { value: result, temporaryFailure: false };
    }
  }

  return { value: null, temporaryFailure: hadFailure };
}

export function lyricCacheKey(media = {}) {
  const sourceId = text(media.sourceId ?? media.source_id);
  const title = text(media.title);
  const artist = text(media.artist);
  const album = text(media.album);
  const duration = knownRoundedDuration(media);
  if (!title || !artist) return "";
  return `${sourceId}|${title}|${artist}|${album}|${duration}`.toLowerCase();
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function knownRoundedDuration(media) {
  const duration = Number(media.timeline?.status === "known" ? media.timeline.duration : media.duration);
  return Number.isFinite(duration) && duration > 0 ? String(Math.round(duration)) : "";
}

function withTimeout(promise, timeoutMs, onTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      reject(new Error("lyrics provider timed out"));
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function finitePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
