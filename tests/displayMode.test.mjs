import test from "node:test";
import assert from "node:assert/strict";
import { resolveDisplayMode } from "../src/app/displayMode.js";

test("keeps lyrics mode when lyrics are available", () => {
  assert.equal(resolveDisplayMode({
    requestedMode: "lyrics",
    fallbackMode: "expanded",
    showLyrics: true,
    lyricLineCount: 3
  }), "lyrics");
});

test("falls back from lyrics mode when there are no lyric lines", () => {
  assert.equal(resolveDisplayMode({
    requestedMode: "lyrics",
    fallbackMode: "expanded",
    showLyrics: true,
    lyricLineCount: 0
  }), "expanded");
});

test("keeps lyrics mode while lyrics are loading", () => {
  assert.equal(resolveDisplayMode({
    requestedMode: "lyrics",
    fallbackMode: "expanded",
    showLyrics: true,
    lyricLineCount: 0,
    lyricsLoading: true
  }), "lyrics");
});

test("falls back from lyrics mode when lyrics are disabled", () => {
  assert.equal(resolveDisplayMode({
    requestedMode: "lyrics",
    fallbackMode: "compact",
    showLyrics: false,
    lyricLineCount: 5
  }), "compact");
});
