const BRIDGE_BASE_URL = "http://127.0.0.1:18768";
const BRIDGE_QUERY_TIMEOUT_MS = 650;
const BRIDGE_FRESH_SOURCE_TIMEOUT_MS = 2200;
const BRIDGE_COMMAND_TIMEOUT_MS = 2200;

export async function fetchBridgeNowPlaying(fetchImpl = fetch) {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${BRIDGE_BASE_URL}/v1/now-playing`,
      { cache: "no-store" },
      BRIDGE_QUERY_TIMEOUT_MS
    );

    if (!response.ok) {
      return offlineBridge();
    }

    const value = await response.json();
    return {
      healthy: true,
      stale: value?.stale === true,
      error: text(value?.error),
      snapshot: normalizeBridgeSnapshot(value),
    };
  } catch {
    return offlineBridge();
  }
}

export async function fetchBridgeSources(fetchImpl = fetch, options = {}) {
  try {
    const url = options.fresh === true
      ? `${BRIDGE_BASE_URL}/v1/sources?fresh=1`
      : `${BRIDGE_BASE_URL}/v1/sources`;
    const timeoutMs = options.fresh === true ? BRIDGE_FRESH_SOURCE_TIMEOUT_MS : BRIDGE_QUERY_TIMEOUT_MS;
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      { cache: "no-store" },
      timeoutMs
    );

    if (!response.ok) {
      return { healthy: false, sources: [] };
    }

    const value = await response.json();
    const rawSources = Array.isArray(value?.sources) ? value.sources : [];
    return {
      healthy: value?.ok !== false,
      stale: value?.stale === true,
      error: text(value?.error),
      sources: rawSources.map(normalizeBridgeSnapshot),
    };
  } catch {
    return { healthy: false, stale: false, error: "", sources: [] };
  }
}

export async function sendBridgeCommand(command, fetchImpl = fetch, options = {}) {
  try {
    const sourceId = text(options.sourceId);
    const body = sourceId
      ? { command, source_id: sourceId }
      : { command };
    const response = await fetchWithTimeout(
      fetchImpl,
      `${BRIDGE_BASE_URL}/v1/command`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
      BRIDGE_COMMAND_TIMEOUT_MS
    );
    const payload = await readJson(response);

    return {
      ok: response.ok && payload?.ok === true && payload?.accepted === true,
      accepted: payload?.accepted === true,
      error: text(payload?.error),
    };
  } catch {
    return {
      ok: false,
    };
  }
}

export async function selectNextBridgeSource(fetchImpl = fetch) {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${BRIDGE_BASE_URL}/v1/selection/next`,
      { method: "POST" },
      BRIDGE_FRESH_SOURCE_TIMEOUT_MS
    );

    if (!response.ok) {
      return offlineBridge();
    }

    const value = await response.json();
    return {
      healthy: true,
      stale: value?.stale === true,
      error: text(value?.error),
      snapshot: normalizeBridgeSnapshot(value),
    };
  } catch {
    return offlineBridge();
  }
}

export async function selectBridgeSourceById(sourceId, fetchImpl = fetch) {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${BRIDGE_BASE_URL}/v1/selection`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ source_id: text(sourceId) }),
      },
      BRIDGE_FRESH_SOURCE_TIMEOUT_MS
    );

    if (!response.ok) {
      return offlineBridge();
    }

    const value = await response.json();
    return {
      healthy: true,
      stale: value?.stale === true,
      error: text(value?.error),
      snapshot: normalizeBridgeSnapshot(value),
    };
  } catch {
    return offlineBridge();
  }
}

function normalizeBridgeSnapshot(value = {}) {
  if (!value || typeof value !== "object") {
    return emptySnapshot();
  }

  const source = value.source && typeof value.source === "object" ? value.source : value;
  const receivedAtMs = nowMs();
  const receivedAtUnixMs = unixNowMs();

  const snapshot = {
    sourceId: text(source.sourceId ?? source.source_id ?? value.selected_source_id),
    title: text(source.title),
    artist: text(source.artist),
    album: text(source.album),
    thumbnail: text(source.thumbnail),
    playbackState: text(source.playbackState ?? source.playback_state),
    position: source.position ?? source.timeline?.position ?? null,
    duration: source.duration ?? source.timeline?.duration ?? null,
  };
  const sampledAtMs = source.sampledAtMs ?? source.sampled_at_ms ?? source.timeline?.sampledAtMs ?? source.timeline?.sampled_at_ms;
  const sampledAtUnixMs = source.sampledAtUnixMs ?? source.sampled_at_unix_ms ?? source.timeline?.sampledAtUnixMs ?? source.timeline?.sampled_at_unix_ms;
  if (sampledAtMs !== undefined && sampledAtMs !== null) {
    snapshot.sampledAtMs = sampledAtMs;
  } else if (sampledAtUnixMs !== undefined && sampledAtUnixMs !== null) {
    snapshot.sampledAtMs = unixMillisToPerformanceMillis(sampledAtUnixMs, receivedAtMs, receivedAtUnixMs);
  }
  return snapshot;
}

function emptySnapshot() {
  return {
    sourceId: "",
    title: "",
    artist: "",
    album: "",
    thumbnail: "",
    playbackState: "stopped",
    position: null,
    duration: null,
  };
}

function offlineBridge() {
  return {
    healthy: false,
    snapshot: null,
  };
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = BRIDGE_QUERY_TIMEOUT_MS) {
  if (typeof AbortController !== "function") {
    return fetchImpl(url, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  if (typeof response?.json !== "function") {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unixMillisToPerformanceMillis(sampledAtUnixMs, receivedAtMs, receivedAtUnixMs) {
  const sample = Number(sampledAtUnixMs);
  const received = Number(receivedAtUnixMs);
  if (!Number.isFinite(sample) || !Number.isFinite(received)) return null;
  return receivedAtMs - Math.max(0, received - sample);
}

function nowMs() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function unixNowMs() {
  return Date.now();
}
