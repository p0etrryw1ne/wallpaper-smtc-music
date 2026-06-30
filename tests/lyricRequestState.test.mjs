import test from "node:test";
import assert from "node:assert/strict";
import { shouldRequestOnlineLyrics } from "../src/lyrics/lyricRequestState.js";

test("online lyric requests stop after a cached missing lyric result", () => {
  assert.equal(shouldRequestOnlineLyrics({
    key: "qq|song|artist",
    currentKey: "qq|song|artist",
    loadedKey: "",
    pendingKey: "",
    missingKey: "qq|song|artist",
    enabled: true,
  }), false);
});

test("online lyric requests continue for a new unresolved key", () => {
  assert.equal(shouldRequestOnlineLyrics({
    key: "qq|new-song|artist",
    currentKey: "qq|new-song|artist",
    loadedKey: "",
    pendingKey: "",
    missingKey: "qq|song|artist",
    enabled: true,
  }), true);
});

test("online lyric requests wait during a temporary failure retry window", () => {
  assert.equal(shouldRequestOnlineLyrics({
    key: "qq|song|artist",
    currentKey: "qq|song|artist",
    loadedKey: "",
    pendingKey: "",
    missingKey: "",
    temporaryFailureKey: "qq|song|artist",
    temporaryRetryAtMs: 1000,
    nowMs: 500,
    enabled: true,
  }), false);
});

test("online lyric requests resume after a temporary failure retry window expires", () => {
  assert.equal(shouldRequestOnlineLyrics({
    key: "qq|song|artist",
    currentKey: "qq|song|artist",
    loadedKey: "",
    pendingKey: "",
    missingKey: "",
    temporaryFailureKey: "qq|song|artist",
    temporaryRetryAtMs: 1000,
    nowMs: 1200,
    enabled: true,
  }), true);
});
