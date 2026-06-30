import test from "node:test";
import assert from "node:assert/strict";
import { createMediaTimelineClock } from "../src/media/mediaTimelineClock.js";

test("advances playing timeline from a stable local clock", () => {
  let now = 1_000;
  const clock = createMediaTimelineClock({ now: () => now });
  clock.sync(snapshot({ position: 10, duration: 100, playbackState: "playing" }), "song");

  now = 3_500;
  const estimated = clock.snapshot(snapshot({ position: 10, duration: 100, playbackState: "playing" }), "song");

  assert.equal(estimated.timeline.position, 12.5);
});

test("ignores small backward timeline jitter while playing", () => {
  let now = 0;
  const clock = createMediaTimelineClock({
    now: () => now,
    jitterToleranceMs: 750,
    seekThresholdMs: 5_000
  });
  clock.sync(snapshot({ position: 20, duration: 100, playbackState: "playing" }), "song");

  now = 2_000;
  clock.sync(snapshot({ position: 20.6, duration: 100, playbackState: "playing" }), "song");
  const estimated = clock.snapshot(snapshot({ position: 20.6, duration: 100, playbackState: "playing" }), "song");

  assert.ok(estimated.timeline.position >= 21.9);
});

test("default timeline clock stays monotonic for lyric-visible backward corrections", () => {
  let now = 0;
  const clock = createMediaTimelineClock({ now: () => now });
  clock.sync(snapshot({ position: 20, duration: 100, playbackState: "playing" }), "song");

  now = 2_000;
  clock.sync(snapshot({ position: 21.45, duration: 100, playbackState: "playing" }), "song");
  const estimated = clock.snapshot(snapshot({ position: 21.45, duration: 100, playbackState: "playing" }), "song");

  assert.ok(estimated.timeline.position >= 22);
});

test("accepts large backward corrections as user seeks while playing", () => {
  let now = 0;
  const clock = createMediaTimelineClock({ now: () => now, seekThresholdMs: 5_000 });
  clock.sync(snapshot({ position: 80, duration: 100, playbackState: "playing" }), "song");

  now = 1_000;
  clock.sync(snapshot({ position: 30, duration: 100, playbackState: "playing" }), "song");
  const estimated = clock.snapshot(snapshot({ position: 30, duration: 100, playbackState: "playing" }), "song");

  assert.equal(estimated.timeline.position, 30);
});

test("accepts backward correction after playback state changes", () => {
  let now = 0;
  const clock = createMediaTimelineClock({ now: () => now, jitterToleranceMs: 750, seekThresholdMs: 5_000 });
  clock.sync(snapshot({ position: 60, duration: 100, playbackState: "playing" }), "song");

  now = 1_000;
  clock.sync(snapshot({ position: 58, duration: 100, playbackState: "paused" }), "song");
  const estimated = clock.snapshot(snapshot({ position: 58, duration: 100, playbackState: "paused" }), "song");

  assert.equal(estimated.timeline.position, 58);
});

test("resets when media identity changes", () => {
  let now = 0;
  const clock = createMediaTimelineClock({ now: () => now });
  clock.sync(snapshot({ position: 80, duration: 100, playbackState: "playing" }), "song-a");

  now = 1_000;
  clock.sync(snapshot({ position: 2, duration: 90, playbackState: "playing" }), "song-b");
  const estimated = clock.snapshot(snapshot({ position: 2, duration: 90, playbackState: "playing" }), "song-b");

  assert.equal(estimated.timeline.position, 2);
});

test("uses timeline sample time when a backend provides one", () => {
  let now = 2_000;
  const clock = createMediaTimelineClock({ now: () => now });
  clock.sync(snapshot({
    position: 10,
    duration: 100,
    playbackState: "playing",
    sampledAtMs: 1_500
  }), "song");

  const estimated = clock.snapshot(snapshot({
    position: 10,
    duration: 100,
    playbackState: "playing",
    sampledAtMs: 1_500
  }), "song");

  assert.equal(estimated.timeline.position, 10.5);
});

function snapshot({ position, duration, playbackState, sampledAtMs }) {
  return {
    sourceId: "mock",
    title: "Song",
    artist: "Artist",
    playbackState,
    timeline: {
      status: "known",
      position,
      duration,
      sampledAtMs,
    },
    hasMedia: true,
  };
}
