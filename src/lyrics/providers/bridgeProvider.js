import { parseLrc } from "../lrcParser.js";
import { plainLyricsToLines } from "../plainLyrics.js";
import { resolveProviderOptions, withFetchSignal } from "../providerOptions.js";

const BRIDGE_LYRICS_URL = "http://127.0.0.1:18768/v1/lyrics";

export async function fetchBridgeLyrics(media = {}, optionsOrFetch = {}) {
  if (!hasIdentity(media)) return null;
  const { fetchImpl, signal } = resolveProviderOptions(optionsOrFetch);

  let response;
  try {
    response = await fetchImpl(buildBridgeLyricsUrl(media), withFetchSignal({ cache: "no-store" }, signal));
  } catch {
    return null;
  }

  if (!response?.ok) return null;
  const payload = await response.json();
  const syncedLyrics = text(payload.synced_lyrics ?? payload.syncedLyrics);
  const plainLyrics = text(payload.plain_lyrics ?? payload.plainLyrics);
  if (!syncedLyrics && !plainLyrics) return null;

  return {
    provider: text(payload.provider) || "bridge",
    syncedLyrics,
    plainLyrics,
    lines: syncedLyrics ? parseLrc(syncedLyrics).lines : plainLyricsToLines(plainLyrics),
  };
}

function buildBridgeLyricsUrl(media) {
  const params = new URLSearchParams({
    source_id: text(media.sourceId ?? media.source_id),
    title: text(media.title),
    artist: text(media.artist),
  });

  const duration = Number(media.timeline?.duration ?? media.duration);
  if (Number.isFinite(duration) && duration > 0) {
    params.set("duration", String(duration));
  }

  return `${BRIDGE_LYRICS_URL}?${params.toString()}`;
}

function hasIdentity(media) {
  return Boolean(text(media.title) && text(media.artist));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
