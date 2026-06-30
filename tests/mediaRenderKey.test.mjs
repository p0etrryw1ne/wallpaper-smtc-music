import test from "node:test";
import assert from "node:assert/strict";
import { boundedTextFingerprint, mediaRenderKey } from "../src/media/mediaRenderKey.js";

test("media render key ignores timeline position changes", () => {
  const base = snapshot({ position: 10, playbackState: "playing" });
  const moved = snapshot({ position: 20, playbackState: "playing" });

  assert.equal(mediaRenderKey(base), mediaRenderKey(moved));
});

test("media render key changes when timeline availability changes", () => {
  const withoutTimeline = mediaRenderKey({
    hasMedia: true,
    sourceId: "QQMusic.exe",
    title: "Song",
    artist: "Artist",
    album: "",
    thumbnail: "",
    timeline: { status: "unknown" },
  }, { mode: "expanded" });
  const withTimeline = mediaRenderKey({
    hasMedia: true,
    sourceId: "QQMusic.exe",
    title: "Song",
    artist: "Artist",
    album: "",
    thumbnail: "",
    timeline: { status: "known", position: 1, duration: 100 },
  }, { mode: "expanded" });

  assert.notEqual(withoutTimeline, withTimeline);
});

test("media render key changes for visible media identity changes", () => {
  const first = snapshot({ title: "First", playbackState: "playing" });
  const second = snapshot({ title: "Second", playbackState: "playing" });

  assert.notEqual(mediaRenderKey(first), mediaRenderKey(second));
});

test("media render key changes when playback state changes", () => {
  const playing = snapshot({ playbackState: "playing" });
  const paused = snapshot({ playbackState: "paused" });

  assert.notEqual(mediaRenderKey(playing), mediaRenderKey(paused));
});

test("media render key changes when thumbnail url changes", () => {
  const first = snapshot({ thumbnail: "cover-a.png" });
  const second = snapshot({ thumbnail: "cover-b.png" });

  assert.notEqual(mediaRenderKey(first), mediaRenderKey(second));
});

test("media render key changes when official lyrics arrive later", () => {
  const withoutLyrics = snapshot({ lyrics: "" });
  const withLyrics = snapshot({ lyrics: "[00:01.00]第一句" });

  assert.notEqual(mediaRenderKey(withoutLyrics), mediaRenderKey(withLyrics));
});

test("media render key changes when lyrics style changes", () => {
  const standard = mediaRenderKey(snapshot(), { mode: "lyrics", lyricsStyle: "standard" });
  const immersive = mediaRenderKey(snapshot(), { mode: "lyrics", lyricsStyle: "immersive" });

  assert.notEqual(standard, immersive);
});

test("media render key changes when Bridge control availability changes", () => {
  const unavailable = mediaRenderKey(snapshot(), {
    mode: "expanded",
    controlsAvailable: false,
    sourceSwitchAvailable: false
  });
  const available = mediaRenderKey(snapshot(), {
    mode: "expanded",
    controlsAvailable: true,
    sourceSwitchAvailable: true
  });

  assert.notEqual(unavailable, available);
});

test("large media payload fingerprints are bounded instead of hashing full strings", () => {
  const huge = `data:image/jpeg;base64,${"a".repeat(2_000_000)}tail-a`;
  const changedTail = `data:image/jpeg;base64,${"a".repeat(2_000_000)}tail-b`;
  const key = boundedTextFingerprint(huge);

  assert.match(key, /^2000029:/);
  assert.equal(key.includes("2000000"), false);
  assert.notEqual(key, boundedTextFingerprint(changedTail));
});

function snapshot(overrides = {}) {
  return {
    sourceId: "source",
    title: overrides.title ?? "Song",
    artist: "Artist",
    album: "Album",
    thumbnail: overrides.thumbnail ?? "cover.png",
    playbackState: overrides.playbackState,
    timeline: {
      status: "known",
      position: overrides.position,
      duration: 100,
    },
    lyrics: overrides.lyrics ?? "",
    hasMedia: true,
  };
}
