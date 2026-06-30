import test from "node:test";
import assert from "node:assert/strict";
import { nextPlayerStyleState } from "../src/app/playerActions.js";

test("style toggle from standard expanded keeps the expanded view", () => {
  assert.deepEqual(nextPlayerStyleState({
    currentView: "expanded",
    currentStyle: "standard",
    defaultStyle: "standard"
  }), {
    lyricsStyleOverride: "immersive",
    viewModeOverride: "expanded"
  });
});

test("style toggle from immersive lyrics keeps the lyrics view", () => {
  assert.deepEqual(nextPlayerStyleState({
    currentView: "lyrics",
    currentStyle: "immersive",
    defaultStyle: "standard"
  }), {
    lyricsStyleOverride: "standard",
    viewModeOverride: "lyrics"
  });
});

test("style toggle from compact keeps compact view", () => {
  assert.deepEqual(nextPlayerStyleState({
    currentView: "compact",
    currentStyle: "standard",
    defaultStyle: "standard"
  }), {
    lyricsStyleOverride: "immersive",
    viewModeOverride: "compact"
  });
});

test("style toggle from an unknown view does not invent a display mode", () => {
  assert.deepEqual(nextPlayerStyleState({
    currentView: "",
    currentStyle: "standard",
    defaultStyle: "standard"
  }), {
    lyricsStyleOverride: "immersive",
    viewModeOverride: null
  });
});
