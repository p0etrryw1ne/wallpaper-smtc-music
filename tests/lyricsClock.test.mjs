import test from "node:test";
import assert from "node:assert/strict";
import { activeLyricIndex } from "../src/lyrics/lyricClock.js";

const lines = [
  { timeMs: 1000, text: "one" },
  { timeMs: 3000, text: "two" },
  { timeMs: 5000, text: "three" }
];

test("uses the latest line at or before playback position", () => {
  assert.equal(activeLyricIndex(lines, 0), 0);
  assert.equal(activeLyricIndex(lines, 1000), 0);
  assert.equal(activeLyricIndex(lines, 4200), 1);
  assert.equal(activeLyricIndex(lines, 9000), 2);
});

test("applies lyric offset before picking active line", () => {
  assert.equal(activeLyricIndex(lines, 2500, { offsetMs: 600 }), 1);
  assert.equal(activeLyricIndex(lines, 2500, { offsetMs: -800 }), 0);
});

