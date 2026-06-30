import test from "node:test";
import assert from "node:assert/strict";
import { switchToNextBridgeSource } from "../src/bridge/bridgeSourceSwitch.js";

test("switches source from a fresh frontend source list", async () => {
  const calls = [];
  const result = await switchToNextBridgeSource({
    fetchImpl: "fetch",
    settings: { lowPrioritySources: "", blockedSources: "" },
    selectNext: async (fetchImpl) => {
      calls.push(["next", fetchImpl]);
      return {
        healthy: true,
        stale: false,
        error: "",
        snapshot: { sourceId: "cloudmusic.exe", title: "Cloud Song" }
      };
    },
    selectSource: async (sourceId, fetchImpl) => {
      calls.push(["select-source", sourceId, fetchImpl]);
      return {
        healthy: true,
        stale: false,
        error: "",
        snapshot: { sourceId, title: "QQ Song" }
      };
    },
    fetchSources: async (fetchImpl, options) => {
      calls.push(["sources", fetchImpl, options]);
      return {
        healthy: true,
        stale: false,
        error: "",
        sources: [
          { sourceId: "QQMusic.exe", title: "QQ Song" },
          { sourceId: "cloudmusic.exe", title: "Cloud Song" }
        ]
      };
    }
  });

  assert.deepEqual(calls, [
    ["sources", "fetch", { fresh: true }],
    ["select-source", "QQMusic.exe", "fetch"]
  ]);
  assert.equal(result.selectedSourceId, "QQMusic.exe");
  assert.equal(result.state.snapshot.title, "QQ Song");
  assert.equal(result.state.sources.length, 2);
});

test("switches source by frontend source policy instead of Bridge internal selection", async () => {
  const calls = [];
  const result = await switchToNextBridgeSource({
    fetchImpl: "fetch",
    currentSourceId: "QQMusic.exe",
    settings: { lowPrioritySources: "", blockedSources: "" },
    selectNext: async () => {
      calls.push("next");
      return {
        healthy: true,
        stale: false,
        error: "",
        snapshot: { sourceId: "QQMusic.exe", title: "Bridge stale selection" }
      };
    },
    selectSource: async (sourceId, fetchImpl) => {
      calls.push(["select-source", sourceId, fetchImpl]);
      return {
        healthy: true,
        stale: false,
        error: "",
        snapshot: { sourceId, title: "Cloud Song" }
      };
    },
    fetchSources: async (fetchImpl, options) => {
      calls.push(["sources", fetchImpl, options]);
      return {
        healthy: true,
        stale: false,
        error: "",
        sources: [
          { sourceId: "QQMusic.exe", title: "QQ Song" },
          { sourceId: "cloudmusic.exe", title: "Cloud Song" }
        ]
      };
    }
  });

  assert.deepEqual(calls, [
    ["sources", "fetch", { fresh: true }],
    ["select-source", "cloudmusic.exe", "fetch"]
  ]);
  assert.equal(result.selectedSourceId, "cloudmusic.exe");
  assert.equal(result.state.snapshot.title, "Cloud Song");
});

test("uses Bridge selected source response as the source of truth", async () => {
  const result = await switchToNextBridgeSource({
    currentSourceId: "QQMusic.exe",
    settings: { lowPrioritySources: "", blockedSources: "" },
    fetchSources: async () => ({
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "QQMusic.exe", title: "QQ Song" },
        { sourceId: "cloudmusic.exe", title: "Local Guess" }
      ]
    }),
    selectSource: async (sourceId) => ({
      healthy: true,
      stale: false,
      error: "",
      snapshot: { sourceId, title: "Bridge Truth" }
    })
  });

  assert.equal(result.selectedSourceId, "cloudmusic.exe");
  assert.equal(result.state.snapshot.title, "Bridge Truth");
});

test("does not pretend source switched when Bridge rejects explicit selection", async () => {
  const result = await switchToNextBridgeSource({
    currentSourceId: "QQMusic.exe",
    settings: { lowPrioritySources: "", blockedSources: "" },
    fetchSources: async () => ({
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "QQMusic.exe", title: "QQ Song" },
        { sourceId: "cloudmusic.exe", title: "Local Guess" }
      ]
    }),
    selectSource: async () => ({
      healthy: false,
      error: "selected source not found",
      snapshot: null
    })
  });

  assert.equal(result.selectedSourceId, "");
  assert.equal(result.state.healthy, true);
  assert.equal(result.state.snapshot, null);
  assert.equal(result.state.error, "selected source not found");
});

test("keeps selected Bridge snapshot when fresh source refresh fails", async () => {
  const result = await switchToNextBridgeSource({
    selectNext: async () => ({
      healthy: true,
      stale: false,
      error: "",
      snapshot: { sourceId: "cloudmusic.exe", title: "Cloud Song" }
    }),
    fetchSources: async () => ({
      healthy: false,
      error: "offline",
      sources: []
    })
  });

  assert.equal(result.selectedSourceId, "cloudmusic.exe");
  assert.equal(result.state.healthy, true);
  assert.equal(result.state.snapshot.title, "Cloud Song");
  assert.deepEqual(result.state.sources, []);
});

test("does not switch from a stale frontend source list", async () => {
  const calls = [];
  const result = await switchToNextBridgeSource({
    currentSourceId: "QQMusic.exe",
    settings: { lowPrioritySources: "", blockedSources: "" },
    selectNext: async () => {
      calls.push("next");
      return {
        healthy: true,
        stale: false,
        error: "",
        snapshot: { sourceId: "QQMusic.exe", title: "Current QQ Song" }
      };
    },
    selectSource: async (sourceId) => {
      calls.push(["select-source", sourceId]);
      return {
        healthy: true,
        stale: false,
        error: "",
        snapshot: { sourceId, title: "Should Not Select" }
      };
    },
    fetchSources: async () => {
      calls.push("sources");
      return {
        healthy: true,
        stale: true,
        error: "",
        sources: [
          { sourceId: "QQMusic.exe", title: "Stale QQ Song" },
          { sourceId: "cloudmusic.exe", title: "Stale Cloud Song" }
        ]
      };
    }
  });

  assert.deepEqual(calls, ["sources", "next"]);
  assert.equal(result.selectedSourceId, "QQMusic.exe");
  assert.equal(result.state.snapshot.title, "Current QQ Song");
});

test("does not accept a Bridge internal next source that is blocked by policy", async () => {
  const result = await switchToNextBridgeSource({
    settings: { lowPrioritySources: "", blockedSources: "edge" },
    selectNext: async () => ({
      healthy: true,
      stale: false,
      error: "",
      snapshot: { sourceId: "msedge.exe", title: "Browser Video" }
    }),
    fetchSources: async () => ({
      healthy: false,
      error: "offline",
      sources: []
    })
  });

  assert.equal(result.selectedSourceId, "");
  assert.equal(result.state.healthy, true);
  assert.equal(result.state.blockedByPolicy, true);
  assert.equal(result.state.snapshot, null);
});

test("skips low-priority sources while normal sources are available", async () => {
  const result = await switchToNextBridgeSource({
    currentSourceId: "QQMusic.exe",
    settings: { lowPrioritySources: "edge", blockedSources: "" },
    selectNext: async () => ({
      healthy: true,
      stale: false,
      error: "",
      snapshot: { sourceId: "msedge.exe", title: "Browser Video" }
    }),
    selectSource: async (sourceId) => ({
      healthy: true,
      stale: false,
      error: "",
      snapshot: { sourceId, title: "QQ Song" }
    }),
    fetchSources: async () => ({
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "QQMusic.exe", title: "QQ Song" },
        { sourceId: "msedge.exe", title: "Browser Video" }
      ]
    })
  });

  assert.equal(result.selectedSourceId, "QQMusic.exe");
  assert.equal(result.state.snapshot.sourceId, "QQMusic.exe");
});
