import test from "node:test";
import assert from "node:assert/strict";
import { parseLrc } from "../src/lyrics/lrcParser.js";
import { plainLyricsToLines } from "../src/lyrics/plainLyrics.js";

test("parses timestamped LRC lines", () => {
  const lyrics = parseLrc("[00:01.50]第一句\n[01:02.03]第二句");

  assert.deepEqual(lyrics.lines, [
    { timeMs: 1500, text: "第一句" },
    { timeMs: 62030, text: "第二句" }
  ]);
});

test("sorts lines and ignores metadata or empty text", () => {
  const lyrics = parseLrc("[ar:Artist]\n[00:10.00]后一句\n[00:02.00]前一句\n[00:03.00]");

  assert.deepEqual(lyrics.lines, [
    { timeMs: 2000, text: "前一句" },
    { timeMs: 10000, text: "后一句" }
  ]);
});

test("plain lyrics helper trims text and tolerates non-string input", () => {
  assert.deepEqual(plainLyricsToLines(" 第一行 \n\n第二行 "), [
    { timeMs: 0, text: "第一行" },
    { timeMs: 4000, text: "第二行" },
  ]);
  assert.deepEqual(plainLyricsToLines(null), []);
  assert.deepEqual(plainLyricsToLines(123), []);
});
