import test from "node:test";
import assert from "node:assert/strict";
import { resolveBridgeRefreshSelection } from "../src/bridge/bridgeRefreshSelection.js";

test("keeps the selected source during a transient command refresh miss", () => {
  const result = resolveBridgeRefreshSelection({
    sourcesResult: {
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    previousState: {
      healthy: true,
      stale: false,
      snapshot: { sourceId: "QQMusic.exe", title: "Old QQ Song", artist: "QQ Artist" },
      sources: [
        { sourceId: "QQMusic.exe", title: "Old QQ Song", artist: "QQ Artist" },
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    selectedSourceId: "QQMusic.exe",
    settings: { blockedSources: "", lowPrioritySources: "" },
    preserveMissingSelected: true
  });

  assert.equal(result.selectedSourceId, "QQMusic.exe");
  assert.equal(result.state.snapshot.sourceId, "QQMusic.exe");
  assert.equal(result.state.snapshot.title, "Old QQ Song");
  assert.equal(result.state.sources.length, 1);
});

test("falls back to another source after the selected-source hold expires", () => {
  const result = resolveBridgeRefreshSelection({
    sourcesResult: {
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    previousState: {
      healthy: true,
      stale: false,
      snapshot: { sourceId: "QQMusic.exe", title: "Old QQ Song", artist: "QQ Artist" },
      sources: []
    },
    selectedSourceId: "QQMusic.exe",
    settings: { blockedSources: "", lowPrioritySources: "" },
    preserveMissingSelected: false
  });

  assert.equal(result.selectedSourceId, "cloudmusic.exe");
  assert.equal(result.state.snapshot.sourceId, "cloudmusic.exe");
});

test("does not rewrite a manually selected source during ordinary polling", () => {
  const result = resolveBridgeRefreshSelection({
    sourcesResult: {
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "QQMusic.exe", title: "Fresh QQ Song", artist: "QQ Artist", playbackState: "paused" },
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    previousState: {
      healthy: true,
      stale: false,
      snapshot: { sourceId: "QQMusic.exe", title: "Old QQ Song", artist: "QQ Artist" },
      sources: [
        { sourceId: "QQMusic.exe", title: "Old QQ Song", artist: "QQ Artist" },
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    selectedSourceId: "QQMusic.exe",
    settings: { blockedSources: "", lowPrioritySources: "" }
  });

  assert.equal(result.selectedSourceId, "QQMusic.exe");
  assert.equal(result.state.snapshot.sourceId, "QQMusic.exe");
  assert.equal(result.state.snapshot.title, "Fresh QQ Song");
  assert.equal(result.state.sources.length, 2);
});

test("falls back when a manually selected source disappears during ordinary polling", () => {
  const result = resolveBridgeRefreshSelection({
    sourcesResult: {
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    previousState: {
      healthy: true,
      stale: false,
      snapshot: { sourceId: "QQMusic.exe", title: "Old QQ Song", artist: "QQ Artist" },
      sources: [
        { sourceId: "QQMusic.exe", title: "Old QQ Song", artist: "QQ Artist" },
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    selectedSourceId: "QQMusic.exe",
    settings: { blockedSources: "", lowPrioritySources: "" }
  });

  assert.equal(result.selectedSourceId, "cloudmusic.exe");
  assert.equal(result.state.snapshot.sourceId, "cloudmusic.exe");
});

test("does not preserve a selected source when the previous snapshot is not that source", () => {
  const result = resolveBridgeRefreshSelection({
    sourcesResult: {
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "cloudmusic.exe", title: "Cloud Song", playbackState: "playing" }
      ]
    },
    previousState: {
      healthy: true,
      stale: false,
      snapshot: { sourceId: "msedge.exe", title: "Browser Video" },
      sources: []
    },
    selectedSourceId: "QQMusic.exe",
    settings: { blockedSources: "", lowPrioritySources: "" },
    preserveMissingSelected: true
  });

  assert.equal(result.selectedSourceId, "cloudmusic.exe");
  assert.equal(result.state.snapshot.sourceId, "cloudmusic.exe");
});

test("marks Bridge state as policy-blocked when every fresh source is blocked", () => {
  const result = resolveBridgeRefreshSelection({
    sourcesResult: {
      healthy: true,
      stale: false,
      error: "",
      sources: [
        { sourceId: "msedge.exe", title: "Browser Video", playbackState: "playing" }
      ]
    },
    previousState: {
      healthy: true,
      stale: false,
      snapshot: { sourceId: "msedge.exe", title: "Browser Video" },
      sources: []
    },
    selectedSourceId: "msedge.exe",
    settings: { blockedSources: "edge", lowPrioritySources: "" },
    preserveMissingSelected: true
  });

  assert.equal(result.selectedSourceId, "");
  assert.equal(result.state.snapshot, null);
  assert.equal(result.state.blockedByPolicy, true);
});
