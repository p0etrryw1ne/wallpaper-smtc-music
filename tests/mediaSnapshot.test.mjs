import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptySnapshot,
  normalizeNowPlayingSnapshot
} from "../src/media/snapshot.js";

test("empty input produces an idle snapshot", () => {
  assert.deepEqual(createEmptySnapshot(), {
    sourceId: "",
    title: "",
    artist: "",
    album: "",
    thumbnail: null,
    playbackState: "stopped",
    timeline: {
      status: "unknown",
      position: null,
      duration: null
    },
    hasMedia: false
  });
  assert.equal(normalizeNowPlayingSnapshot({}).hasMedia, false);
});

test("title or artist input produces active media", () => {
  const snapshot = normalizeNowPlayingSnapshot({
    sourceId: "QQMusic.exe",
    title: "侧脸",
    artist: "于果",
    album: "侧脸",
    thumbnail: "cover.png",
    playbackState: "Playing"
  });

  assert.equal(snapshot.hasMedia, true);
  assert.equal(snapshot.sourceId, "QQMusic.exe");
  assert.equal(snapshot.title, "侧脸");
  assert.equal(snapshot.artist, "于果");
  assert.equal(snapshot.album, "侧脸");
  assert.equal(snapshot.thumbnail, "cover.png");
  assert.equal(snapshot.playbackState, "playing");
});

test("thumbnail alone does not make an empty media session active", () => {
  const snapshot = normalizeNowPlayingSnapshot({
    thumbnail: "data:image/jpeg;base64,abc",
    playbackState: "stopped"
  });

  assert.equal(snapshot.hasMedia, false);
});

test("timeline is known only when position and duration are valid numbers", () => {
  assert.deepEqual(
    normalizeNowPlayingSnapshot({ title: "Song", position: 12, duration: 120 }).timeline,
    { status: "known", position: 12, duration: 120 }
  );

  assert.deepEqual(
    normalizeNowPlayingSnapshot({ title: "Song", position: 12, duration: 0 }).timeline,
    { status: "unknown", position: null, duration: null }
  );

  assert.deepEqual(
    normalizeNowPlayingSnapshot({ title: "Song", position: "bad", duration: 120 }).timeline,
    { status: "unknown", position: null, duration: null }
  );
});

test("playback state falls back to stopped for unknown values", () => {
  assert.equal(normalizeNowPlayingSnapshot({ title: "Song", playbackState: "Paused" }).playbackState, "paused");
  assert.equal(normalizeNowPlayingSnapshot({ title: "Song", playbackState: "playing" }).playbackState, "playing");
  assert.equal(normalizeNowPlayingSnapshot({ title: "Song", playbackState: "opened" }).playbackState, "stopped");
});

test("timeline preserves optional sample time for local projection", () => {
  assert.deepEqual(
    normalizeNowPlayingSnapshot({ title: "Song", position: 12, duration: 120, sampledAtMs: 500 }).timeline,
    { status: "known", position: 12, duration: 120, sampledAtMs: 500 }
  );
});

test("normalizes Windows SMTC playback status strings", () => {
  assert.equal(
    normalizeNowPlayingSnapshot({
      title: "Song",
      playbackState: "GlobalSystemMediaTransportControlsSessionPlaybackStatus(4)"
    }).playbackState,
    "playing"
  );
  assert.equal(
    normalizeNowPlayingSnapshot({
      title: "Song",
      playbackState: "GlobalSystemMediaTransportControlsSessionPlaybackStatus(5)"
    }).playbackState,
    "paused"
  );
});
