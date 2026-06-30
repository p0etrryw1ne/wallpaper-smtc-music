import test from "node:test";
import assert from "node:assert/strict";
import { selectBridgeSource, selectNextBridgeSourceId } from "../src/bridge/bridgeSourceSelection.js";

const sources = [
  { sourceId: "msedge.exe", title: "Video" },
  { sourceId: "QQMusic.exe", title: "QQ Song" },
  { sourceId: "cloudmusic.exe", title: "Cloud Song" }
];

test("selects the first non-low-priority source when no selection exists", () => {
  const selected = selectBridgeSource(sources, "", {
    lowPrioritySources: "edge",
    blockedSources: ""
  });

  assert.equal(selected.sourceId, "QQMusic.exe");
});

test("keeps explicit selected source when it is still allowed", () => {
  const selected = selectBridgeSource(sources, "cloudmusic.exe", {
    lowPrioritySources: "edge",
    blockedSources: ""
  });

  assert.equal(selected.sourceId, "cloudmusic.exe");
});

test("blocked selected source falls back to the next allowed source", () => {
  const selected = selectBridgeSource(sources, "QQMusic.exe", {
    lowPrioritySources: "",
    blockedSources: "qqmusic"
  });

  assert.equal(selected.sourceId, "msedge.exe");
});

test("cycles source id through policy-filtered sources", () => {
  const nextId = selectNextBridgeSourceId(sources, "QQMusic.exe", {
    lowPrioritySources: "edge",
    blockedSources: ""
  });

  assert.equal(nextId, "cloudmusic.exe");
});

test("cycles from the currently displayed source when selected id is missing", () => {
  const nextId = selectNextBridgeSourceId(sources, "", {
    lowPrioritySources: "edge",
    blockedSources: "",
    currentSourceId: "QQMusic.exe"
  });

  assert.equal(nextId, "cloudmusic.exe");
});

test("cycles to the next controllable source id when duplicate sessions are present", () => {
  const nextId = selectNextBridgeSourceId([
    { sourceId: "cloudmusic.exe", title: "Cloud A", playbackState: "playing" },
    { sourceId: "cloudmusic.exe", title: "Cloud B", playbackState: "paused" },
    { sourceId: "QQMusic.exe", title: "QQ Song", playbackState: "playing" }
  ], "cloudmusic.exe", {
    lowPrioritySources: "",
    blockedSources: ""
  });

  assert.equal(nextId, "QQMusic.exe");
});

test("returns empty source id when all sources are blocked", () => {
  const nextId = selectNextBridgeSourceId(sources, "QQMusic.exe", {
    lowPrioritySources: "",
    blockedSources: "edge, qqmusic, cloudmusic"
  });

  assert.equal(nextId, "");
});
