import test from "node:test";
import assert from "node:assert/strict";
import { isLyricLookupInFlightOrExpected } from "../src/lyrics/lyricLoadingState.js";

test("expects lyric loading for a new online lyric candidate before the provider promise is pending", () => {
  assert.equal(isLyricLookupInFlightOrExpected({
    key: "Song|Artist",
    currentKey: "Song|Artist",
    loadedKey: "",
    pendingKey: "",
    missingKey: "",
    enabled: true
  }), true);
});

test("does not keep lyrics loading after the current lyric key is known missing", () => {
  assert.equal(isLyricLookupInFlightOrExpected({
    key: "Song|Artist",
    currentKey: "Song|Artist",
    loadedKey: "",
    pendingKey: "",
    missingKey: "Song|Artist",
    enabled: true
  }), false);
});

test("does not keep lyrics loading after official lyrics are loaded", () => {
  assert.equal(isLyricLookupInFlightOrExpected({
    key: "Song|Artist",
    currentKey: "Song|Artist",
    loadedKey: "Song|Artist|official",
    pendingKey: "",
    missingKey: "",
    enabled: true
  }), false);
});

test("does not keep lyrics loading during a temporary failure retry window", () => {
  assert.equal(isLyricLookupInFlightOrExpected({
    key: "Song|Artist",
    currentKey: "Song|Artist",
    loadedKey: "",
    pendingKey: "",
    missingKey: "",
    temporaryFailureKey: "Song|Artist",
    temporaryRetryAtMs: 1000,
    nowMs: 500,
    enabled: true
  }), false);
});
