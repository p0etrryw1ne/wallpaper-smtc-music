import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOptimisticPlaybackCommand,
  applyOptimisticPlaybackOverride,
  createOptimisticPlaybackOverride,
  shouldKeepOptimisticPlaybackOverride,
} from "../src/player/optimisticPlayback.js";

test("play-pause command flips the local playback state immediately", () => {
  const paused = applyOptimisticPlaybackCommand({ playbackState: "playing" }, "play-pause");
  const playing = applyOptimisticPlaybackCommand({ playbackState: "paused" }, "play-pause");

  assert.equal(paused.playbackState, "paused");
  assert.equal(playing.playbackState, "playing");
});

test("non-toggle commands leave the snapshot object unchanged", () => {
  const snapshot = { playbackState: "playing", title: "Song" };

  assert.equal(applyOptimisticPlaybackCommand(snapshot, "next"), snapshot);
});

test("optimistic playback override temporarily masks stale playback state", () => {
  const snapshot = { sourceId: "QQMusic.exe", title: "Song", artist: "Artist", playbackState: "playing" };
  const override = createOptimisticPlaybackOverride(snapshot, "play-pause", 1000, 1500);
  const stale = { ...snapshot, playbackState: "playing" };
  const updated = applyOptimisticPlaybackOverride(stale, override, 1200);

  assert.equal(updated.playbackState, "paused");
  assert.equal(shouldKeepOptimisticPlaybackOverride(stale, override, 1200), true);
});

test("optimistic playback override expires or clears when real state catches up", () => {
  const snapshot = { sourceId: "QQMusic.exe", title: "Song", artist: "Artist", playbackState: "playing" };
  const override = createOptimisticPlaybackOverride(snapshot, "play-pause", 1000, 1500);
  const real = { ...snapshot, playbackState: "paused" };

  assert.equal(shouldKeepOptimisticPlaybackOverride(real, override, 1200), false);
  assert.equal(applyOptimisticPlaybackOverride({ ...snapshot, playbackState: "playing" }, override, 2600).playbackState, "playing");
});
