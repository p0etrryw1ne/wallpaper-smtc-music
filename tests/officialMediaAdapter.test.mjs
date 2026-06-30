import test from "node:test";
import assert from "node:assert/strict";
import { fromWallpaperMedia } from "../src/we/officialMediaAdapter.js";

test("converts WE media payload into a normalized snapshot input", () => {
  const input = fromWallpaperMedia({
    title: "Song",
    artist: "Artist",
    album: "Album",
    thumbnail: "file:///cover.png",
    state: "playing",
    position: 12,
    duration: 120,
    sampledAtMs: 500,
  });

  assert.equal(input.sourceId, "wallpaper-engine");
  assert.equal(input.title, "Song");
  assert.equal(input.artist, "Artist");
  assert.equal(input.album, "Album");
  assert.equal(input.thumbnail, "file:///cover.png");
  assert.equal(input.playbackState, "playing");
  assert.equal(input.position, 12);
  assert.equal(input.duration, 120);
  assert.equal(input.sampledAtMs, 500);
});

test("normalizes numeric playback states and invalid timeline values", () => {
  const playing = fromWallpaperMedia({ state: 1, position: "bad", duration: 0 });
  const paused = fromWallpaperMedia({ state: 2 });
  const stopped = fromWallpaperMedia({ state: "unknown" });

  assert.equal(playing.playbackState, "playing");
  assert.equal(playing.position, null);
  assert.equal(playing.duration, 0);
  assert.equal(paused.playbackState, "paused");
  assert.equal(stopped.playbackState, "stopped");
});

test("normalizes string playback state case from Wallpaper Engine", () => {
  assert.equal(fromWallpaperMedia({ state: "Playing" }).playbackState, "playing");
  assert.equal(fromWallpaperMedia({ state: " PAUSED " }).playbackState, "paused");
});

test("normalizes Windows SMTC playback status strings from Wallpaper Engine", () => {
  assert.equal(
    fromWallpaperMedia({ state: "GlobalSystemMediaTransportControlsSessionPlaybackStatus(4)" }).playbackState,
    "playing"
  );
  assert.equal(
    fromWallpaperMedia({ state: "GlobalSystemMediaTransportControlsSessionPlaybackStatus(5)" }).playbackState,
    "paused"
  );
});
