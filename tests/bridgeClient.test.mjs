import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchBridgeNowPlaying,
  fetchBridgeSources,
  selectBridgeSourceById,
  selectNextBridgeSource,
  sendBridgeCommand
} from "../src/bridge/bridgeClient.js";

test("fetches Bridge now playing snapshot", async () => {
  const result = await fetchBridgeNowPlaying(async (url, options) => {
    assert.equal(url, "http://127.0.0.1:18768/v1/now-playing");
    assert.equal(options.cache, "no-store");
    return {
      ok: true,
      async json() {
        return {
          source_id: "QQMusic.exe",
          title: "Bridge Song",
          artist: "Artist",
          playback_state: "playing",
          timeline: { status: "known", position: 12, duration: 120, sampled_at_ms: 250 },
        };
      },
    };
  });

  assert.equal(result.healthy, true);
  assert.equal(result.snapshot.sourceId, "QQMusic.exe");
  assert.equal(result.snapshot.title, "Bridge Song");
  assert.equal(result.snapshot.playbackState, "playing");
  assert.equal(result.snapshot.position, 12);
  assert.equal(result.snapshot.duration, 120);
  assert.equal(result.snapshot.sampledAtMs, 250);
});

test("converts Bridge unix sample time onto the local performance clock", async () => {
  const originalPerformance = globalThis.performance;
  const originalDateNow = Date.now;
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => 2_000 }
  });
  Date.now = () => 10_000;

  try {
    const result = await fetchBridgeNowPlaying(async () => ({
      ok: true,
      async json() {
        return {
          source_id: "QQMusic.exe",
          title: "Bridge Song",
          playback_state: "playing",
          timeline: { status: "known", position: 12, duration: 120, sampled_at_unix_ms: 9_700 },
        };
      },
    }));

    assert.equal(result.snapshot.sampledAtMs, 1_700);
  } finally {
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: originalPerformance
    });
    Date.now = originalDateNow;
  }
});

test("returns offline state when Bridge request fails", async () => {
  const result = await fetchBridgeNowPlaying(async () => {
    throw new Error("offline");
  });

  assert.equal(result.healthy, false);
  assert.equal(result.snapshot, null);
});

test("returns offline state when Bridge responds with an error", async () => {
  const result = await fetchBridgeNowPlaying(async () => ({ ok: false }));

  assert.equal(result.healthy, false);
  assert.equal(result.snapshot, null);
});

test("handles empty Bridge now-playing payload as healthy but empty media", async () => {
  const result = await fetchBridgeNowPlaying(async () => ({
    ok: true,
    async json() {
      return null;
    },
  }));

  assert.equal(result.healthy, true);
  assert.equal(result.snapshot.title, "");
});

test("fetches and normalizes Bridge sources", async () => {
  const result = await fetchBridgeSources(async (url, options) => {
    assert.equal(url, "http://127.0.0.1:18768/v1/sources");
    assert.equal(options.cache, "no-store");
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          sources: [
            {
              source_id: "msedge.exe",
              title: "Video",
              playback_state: "playing",
              timeline: { status: "unknown" }
            }
          ]
        };
      }
    };
  });

  assert.equal(result.healthy, true);
  assert.deepEqual(result.sources.map((source) => source.sourceId), ["msedge.exe"]);
  assert.equal(result.sources[0].title, "Video");
});

test("can request fresh Bridge sources for explicit user switching", async () => {
  const result = await fetchBridgeSources(async (url, options) => {
    assert.equal(url, "http://127.0.0.1:18768/v1/sources?fresh=1");
    assert.equal(options.cache, "no-store");
    return {
      ok: true,
      async json() {
        return { ok: true, sources: [] };
      }
    };
  }, { fresh: true });

  assert.equal(result.healthy, true);
});

test("fresh Bridge source requests wait long enough for backend source refresh", async () => {
  let timeoutDelay = null;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay) => {
    timeoutDelay = delay;
    return originalSetTimeout(callback, 0);
  };
  globalThis.clearTimeout = (timer) => originalClearTimeout(timer);

  try {
    await fetchBridgeSources(async () => {
      throw new Error("manual abort");
    }, { fresh: true });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(timeoutDelay >= 1800, true);
});

test("Bridge source selection waits long enough for backend source refresh", async () => {
  let timeoutDelay = null;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay) => {
    timeoutDelay = delay;
    return originalSetTimeout(callback, 0);
  };
  globalThis.clearTimeout = (timer) => originalClearTimeout(timer);

  try {
    await selectBridgeSourceById("cloudmusic.exe", async () => {
      throw new Error("manual abort");
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(timeoutDelay >= 1800, true);
});

test("regular Bridge source polling remains short timeout", async () => {
  let timeoutDelay = null;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay) => {
    timeoutDelay = delay;
    return originalSetTimeout(callback, 0);
  };
  globalThis.clearTimeout = (timer) => originalClearTimeout(timer);

  try {
    await fetchBridgeSources(async () => {
      throw new Error("manual abort");
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(timeoutDelay < 1800, true);
});

test("preserves Bridge stale and error state from sources response", async () => {
  const result = await fetchBridgeSources(async () => ({
    ok: true,
    async json() {
      return {
        ok: true,
        stale: true,
        error: "source refresh already in progress",
        sources: [
          {
            source_id: "QQMusic.exe",
            title: "Cached song",
            playback_state: "playing"
          }
        ]
      };
    }
  }));

  assert.equal(result.healthy, true);
  assert.equal(result.stale, true);
  assert.equal(result.error, "source refresh already in progress");
  assert.equal(result.sources[0].sourceId, "QQMusic.exe");
});

test("sends playback command to Bridge", async () => {
  let body = "";
  const result = await sendBridgeCommand("next", async (url, options) => {
    assert.equal(url, "http://127.0.0.1:18768/v1/command");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["content-type"], "application/json");
    body = options.body;
    return {
      ok: true,
      async json() {
        return { ok: true, accepted: true };
      }
    };
  });

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(body), { command: "next" });
});

test("sends selected source id with playback command", async () => {
  let body = "";
  const result = await sendBridgeCommand("play-pause", async (_url, options) => {
    body = options.body;
    return {
      ok: true,
      async json() {
        return { ok: true, accepted: true };
      }
    };
  }, { sourceId: "cloudmusic.exe" });

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(body), { command: "play-pause", source_id: "cloudmusic.exe" });
});

test("selects next Bridge source", async () => {
  const result = await selectNextBridgeSource(async (url, options) => {
    assert.equal(url, "http://127.0.0.1:18768/v1/selection/next");
    assert.equal(options.method, "POST");
    return {
      ok: true,
      async json() {
        return {
          selected_source_id: "cloudmusic.exe",
          source: {
            source_id: "cloudmusic.exe",
            title: "Cloud Song",
            artist: "Cloud Artist",
            playback_state: "playing",
            timeline: { status: "known", position: 1, duration: 100 },
          },
        };
      },
    };
  });

  assert.equal(result.healthy, true);
  assert.equal(result.snapshot.sourceId, "cloudmusic.exe");
  assert.equal(result.snapshot.title, "Cloud Song");
});

test("selects a specific Bridge source", async () => {
  let body = "";
  const result = await selectBridgeSourceById("cloudmusic.exe", async (url, options) => {
    assert.equal(url, "http://127.0.0.1:18768/v1/selection");
    assert.equal(options.method, "POST");
    body = options.body;
    return {
      ok: true,
      json: async () => ({
        ok: true,
        selected_source_id: "cloudmusic.exe",
        source: {
          source_id: "cloudmusic.exe",
          title: "Song",
          artist: "Artist",
          playback_state: "playing",
          timeline: { position: 12, duration: 180 }
        }
      })
    };
  });

  assert.deepEqual(JSON.parse(body), { source_id: "cloudmusic.exe" });
  assert.equal(result.healthy, true);
  assert.equal(result.snapshot.sourceId, "cloudmusic.exe");
  assert.equal(result.snapshot.title, "Song");
});

test("preserves selected Bridge source stale and error state", async () => {
  const result = await selectNextBridgeSource(async () => ({
    ok: true,
    async json() {
      return {
        ok: true,
        stale: true,
        error: "source refresh already in progress",
        selected_source_id: "cloudmusic.exe",
        source: {
          source_id: "cloudmusic.exe",
          title: "Cloud Song",
          playback_state: "playing"
        }
      };
    }
  }));

  assert.equal(result.healthy, true);
  assert.equal(result.stale, true);
  assert.equal(result.error, "source refresh already in progress");
  assert.equal(result.snapshot.sourceId, "cloudmusic.exe");
});

test("failed playback command returns rejected state", async () => {
  const result = await sendBridgeCommand("next", async () => {
    throw new Error("offline");
  });

  assert.equal(result.ok, false);
});

test("unaccepted playback command returns rejected state", async () => {
  const result = await sendBridgeCommand("next", async () => ({
    ok: true,
    async json() {
      return { ok: true, accepted: false };
    }
  }));

  assert.equal(result.ok, false);
});

test("command requests use a longer timeout than source polling", async () => {
  let timeoutDelay = null;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay) => {
    timeoutDelay = delay;
    return originalSetTimeout(callback, 0);
  };
  globalThis.clearTimeout = (timer) => originalClearTimeout(timer);

  try {
    await sendBridgeCommand("next", async () => {
      throw new Error("manual abort");
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(timeoutDelay >= 1800, true);
});

test("Bridge requests pass an abort signal so hung Bridge calls can time out", async () => {
  let receivedSignal = null;
  const result = await sendBridgeCommand("next", async (_url, options) => {
    receivedSignal = options.signal;
    throw new Error("manual abort");
  });

  assert.equal(result.ok, false);
  assert.equal(typeof receivedSignal?.aborted, "boolean");
});
