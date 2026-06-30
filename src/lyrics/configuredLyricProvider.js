import { parseLrc } from "./lrcParser.js";
import { plainLyricsToLines } from "./plainLyrics.js";
import { defaultFetchImpl, resolveProviderOptions, withFetchSignal } from "./providerOptions.js";

const VERSION_MARKER_RE = /dj|remix|伴奏|纯音乐|instrumental|accompaniment|live|翻唱|cover/i;
const DEFAULT_RULES_URL = new URL("../../config/lyrics-api-rules.json", import.meta.url).href;

export function readLyricApiRules(input = {}) {
  const sourceProviders = {};
  for (const [name, value] of Object.entries(plainObject(input.sourceProviders))) {
    sourceProviders[name] = {
      match: stringArray(value?.match),
      providers: stringArray(value?.providers),
    };
  }

  return {
    version: Number(input.version) || 1,
    commonProviders: stringArray(input.commonProviders),
    sourceProviders,
    providerDefinitions: plainObject(input.providerDefinitions),
  };
}

export function lyricProviderOrderForMedia(media = {}, rules = readLyricApiRules()) {
  const sourceText = mediaSourceText(media);
  for (const profile of Object.values(rules.sourceProviders ?? {})) {
    if (matchesSourceProfile(sourceText, profile.match)) {
      return [...profile.providers];
    }
  }
  return [...(rules.commonProviders ?? [])];
}

export function createConfiguredLyricProvider(options = {}) {
  const configuredFetch = typeof options.fetchImpl === "function" ? options.fetchImpl : defaultFetchImpl();
  const rulesPromise = options.rules
    ? Promise.resolve(readLyricApiRules(options.rules))
    : loadLyricApiRules(configuredFetch);
  return async (media = {}, providerOptions = {}) => fetchFromRules(media, await rulesPromise, {
    fetchImpl: typeof providerOptions.fetchImpl === "function" ? providerOptions.fetchImpl : configuredFetch,
    signal: providerOptions.signal,
  });
}

export async function fetchConfiguredLyrics(media = {}, optionsOrFetch = {}) {
  const { fetchImpl, signal } = resolveProviderOptions(optionsOrFetch);
  const rules = optionsOrFetch?.rules
    ? readLyricApiRules(optionsOrFetch.rules)
    : await loadLyricApiRules(fetchImpl, signal);
  return fetchFromRules(media, rules, { fetchImpl, signal });
}

export async function loadLyricApiRules(fetchImpl = defaultFetchImpl(), signal) {
  const response = await fetchImpl(DEFAULT_RULES_URL, withFetchSignal({ cache: "no-store" }, signal));
  if (!response?.ok) throw new Error("lyric API rules request failed");
  return readLyricApiRules(await response.json());
}

async function fetchFromRules(media, rules, options) {
  if (!hasIdentity(media)) return null;

  const providerNames = Array.isArray(options.providerNames)
    ? options.providerNames
    : lyricProviderOrderForMedia(media, rules);
  let hadFailure = false;

  for (const providerName of providerNames) {
    const definition = rules.providerDefinitions?.[providerName];
    if (!definition || definition.enabled === false) continue;

    try {
      const result = await withProviderTimeout(definition, options.signal, (providerSignal) => {
        return fetchByDefinition(providerName, definition, media, { ...options, signal: providerSignal });
      });
      if (Array.isArray(result?.lines) && result.lines.length > 0) {
        return result;
      }
    } catch {
      hadFailure = true;
    }
  }

  if (hadFailure) throw new Error("all configured lyric providers failed");
  return null;
}

async function withProviderTimeout(definition, parentSignal, run) {
  const timeoutMs = positiveTimeoutMs(definition.timeoutMs);
  if (!timeoutMs || typeof AbortController !== "function") {
    return run(parentSignal);
  }

  const controller = new AbortController();
  const abortProvider = () => controller.abort();
  let timer = 0;

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener?.("abort", abortProvider, { once: true });
  }

  timer = setTimeout(abortProvider, timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener?.("abort", abortProvider);
  }
}

async function fetchByDefinition(providerName, definition, media, options) {
  if (definition.type === "direct-text") {
    const response = await fetchTextResponse(buildUrl(definition.url, media), definition, options);
    return buildResult(providerName, definition, await response.text(), "");
  }

  if (definition.type === "direct-json") {
    const response = await fetchJsonResponse(buildUrl(definition.url, media), definition, options);
    const payload = await response.json();
    const syncedLyrics = text(readPath(payload, definition.lyricPath));
    const plainLyrics = text(readPath(payload, definition.plainLyricPath));
    return buildResult(providerName, definition, syncedLyrics, plainLyrics);
  }

  if (definition.type === "search-then-lyric") {
    const searchResponse = await fetchJsonResponse(buildUrl(definition.searchUrl, media), definition, options);
    const searchPayload = await searchResponse.json();
    const song = chooseBestCandidate(readPath(searchPayload, definition.searchResultPath), media);
    const songId = firstPathValue(song, definition.songIdPath);
    if (!songId) return null;

    const lyricResponse = await fetchJsonResponse(buildUrl(definition.lyricUrl, media, { songId }), definition, options);
    const lyricPayload = await lyricResponse.json();
    return buildResult(providerName, definition, text(readPath(lyricPayload, definition.lyricPath)), "");
  }

  return null;
}

async function fetchTextResponse(url, definition, options) {
  const response = await options.fetchImpl(url, requestOptions(definition, options.signal));
  if (!response?.ok) throw new Error("lyric text request failed");
  return response;
}

async function fetchJsonResponse(url, definition, options) {
  const response = await options.fetchImpl(url, requestOptions(definition, options.signal));
  if (!response?.ok) throw new Error("lyric json request failed");
  return response;
}

function requestOptions(definition, signal) {
  const headers = plainObject(definition.headers);
  return withFetchSignal(
    Object.keys(headers).length > 0
      ? { cache: "no-store", headers }
      : { cache: "no-store" },
    signal
  );
}

function buildResult(providerName, definition, syncedLyrics, plainLyrics) {
  const syncedText = text(syncedLyrics);
  const plainText = text(plainLyrics);
  if (!syncedText && !plainText) return null;

  return {
    provider: text(definition.resultProvider) || providerName,
    syncedLyrics: syncedText,
    plainLyrics: plainText,
    lines: syncedText ? parseLrc(syncedText).lines : plainLyricsToLines(plainText),
  };
}

function buildUrl(template, media, extra = {}) {
  return text(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    return encodeURIComponent(placeholderValue(key, media, extra));
  });
}

function placeholderValue(key, media, extra) {
  if (key === "query") return `${text(media.title)} ${text(media.artist)}`.trim();
  if (key === "title") return text(media.title);
  if (key === "artist") return text(media.artist);
  if (key === "album") return text(media.album);
  if (key === "sourceId") return text(media.sourceId ?? media.source_id);
  if (key === "duration") return durationText(media);
  if (key === "songId") return text(extra.songId);
  return "";
}

function durationText(media) {
  const duration = Number(media.timeline?.duration ?? media.duration);
  return Number.isFinite(duration) && duration > 0 ? String(Math.round(duration)) : "";
}

function readPath(value, path) {
  const parts = pathParts(path);
  if (parts.length === 0) return value;

  let current = value;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function pathParts(path) {
  if (Array.isArray(path)) return path;
  const pathText = text(path);
  return pathText ? pathText.split(".") : [];
}

function firstPathValue(value, paths) {
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const result = text(readPath(value, path));
    if (result) return result;
  }
  return "";
}

function chooseBestCandidate(value, media) {
  const candidates = flattenCandidates(value);
  if (candidates.length === 0) return null;

  return candidates
    .filter((candidate) => candidateMatchesExpectedArtist(candidate, media))
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidate(candidate, media),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.candidate ?? null;
}

function flattenCandidates(value) {
  const base = Array.isArray(value)
    ? value
    : Array.isArray(value?.list)
      ? value.list
      : Array.isArray(value?.songs)
        ? value.songs
        : value
          ? [value]
          : [];
  const candidates = [];
  for (const item of base) {
    candidates.push(item);
    if (Array.isArray(item?.grp)) candidates.push(...item.grp);
  }
  return candidates;
}

function scoreCandidate(candidate, media) {
  const expectedTitle = normalizeTitle(text(media.title));
  const expectedTitleBase = normalizeTitleBase(text(media.title));
  const expectedArtist = normalizeArtist(text(media.artist));
  const expectedDuration = durationNumber(media.timeline?.duration ?? media.duration);
  const title = candidateTitle(candidate);
  const titleNormalized = normalizeTitle(title);
  const titleBase = normalizeTitleBase(title);
  const artistNormalized = normalizeArtist(candidateArtist(candidate));
  const candidateDuration = candidateDurationSeconds(candidate);

  let score = 0;
  if (expectedTitle && titleNormalized) {
    if (titleNormalized === expectedTitle) {
      score += 120;
    } else if (titleBase && titleBase === expectedTitleBase) {
      score += 60;
    } else if (titleNormalized.includes(expectedTitle) || expectedTitle.includes(titleNormalized)) {
      score += 25;
    }
  }

  if (expectedArtist && artistNormalized) {
    if (artistNormalized.includes(expectedArtist) || expectedArtist.includes(artistNormalized)) {
      score += 60;
    }
  }

  if (Number.isFinite(expectedDuration) && Number.isFinite(candidateDuration)) {
    score += Math.max(0, 40 - Math.abs(expectedDuration - candidateDuration) * 2);
  }

  if (hasUnexpectedVersionMarker(title, media.title)) {
    score -= 45;
  }

  if (text(candidate.subtitle) && !normalizeTitle(media.title).includes(normalizeTitle(candidate.subtitle))) {
    score -= 8;
  }

  return score;
}

function candidateMatchesExpectedArtist(candidate, media) {
  const expectedArtist = text(media.artist);
  const actualArtist = candidateArtist(candidate);
  if (!expectedArtist || !actualArtist) return true;

  return artistsOverlap(expectedArtist, actualArtist);
}

function artistsOverlap(left, right) {
  const leftNormalized = normalizeArtist(left);
  const rightNormalized = normalizeArtist(right);
  if (!leftNormalized || !rightNormalized) return true;
  if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) return true;

  const leftTokens = artistTokens(left);
  const rightTokens = artistTokens(right);
  return leftTokens.some((leftToken) => {
    return rightTokens.some((rightToken) => {
      return leftToken.includes(rightToken) || rightToken.includes(leftToken);
    });
  });
}

function candidateTitle(candidate) {
  return text(candidate?.name ?? candidate?.song ?? candidate?.title ?? candidate?.songname);
}

function candidateArtist(candidate) {
  return artistText(
    candidate?.singer
    ?? candidate?.artist
    ?? candidate?.artists
    ?? candidate?.singer_list
    ?? candidate?.ar
  );
}

function artistText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => artistText(item)).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return text(value.name ?? value.title ?? value.artist ?? value.singer);
  }
  return text(value);
}

function candidateDurationSeconds(candidate) {
  const direct = durationNumber(candidate?.duration ?? candidate?.dt ?? candidate?.time);
  if (Number.isFinite(direct)) return direct;

  const interval = text(candidate?.interval);
  const minuteSecond = interval.match(/(\d+)\s*分\s*(\d+)\s*秒/);
  if (minuteSecond) {
    return Number(minuteSecond[1]) * 60 + Number(minuteSecond[2]);
  }
  const colon = interval.match(/(\d+):(\d+)/);
  if (colon) {
    return Number(colon[1]) * 60 + Number(colon[2]);
  }
  return NaN;
}

function durationNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return NaN;
  return number > 1000 ? number / 1000 : number;
}

function normalizeTitle(value) {
  return text(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeTitleBase(value) {
  return normalizeTitle(value)
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, "")
    .replace(/(?:dj|remix|伴奏|纯音乐|instrumental|accompaniment|live|翻唱|cover).*/gi, "");
}

function normalizeArtist(value) {
  return text(value)
    .toLowerCase()
    .replace(/[\s/／\\|,，、&+＋·・-]+/g, "");
}

function artistTokens(value) {
  return text(value)
    .toLowerCase()
    .split(/[\s/／\\|,，、&+＋·・-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || /[a-z0-9]/i.test(token));
}

function hasUnexpectedVersionMarker(value, expectedValue) {
  const source = normalizeTitle(value);
  if (!source) return false;
  const expected = normalizeTitle(expectedValue);
  const expectedHasMarker = VERSION_MARKER_RE.test(expected);
  const sourceHasMarker = VERSION_MARKER_RE.test(source);
  return sourceHasMarker && !expectedHasMarker;
}

function matchesSourceProfile(sourceText, matchers) {
  return stringArray(matchers).some((matcher) => {
    const pattern = matcher.toLowerCase();
    return pattern === "*" || sourceText.includes(pattern);
  });
}

function mediaSourceText(media) {
  return [
    media.sourceId,
    media.source_id,
    media.sourceAppUserModelId,
  ].map(text).join(" ").toLowerCase();
}

function hasIdentity(media) {
  return Boolean(text(media.title) && text(media.artist));
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function positiveTimeoutMs(value) {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;
}

function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
