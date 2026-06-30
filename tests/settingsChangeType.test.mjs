import test from "node:test";
import assert from "node:assert/strict";
import * as settingsChangeType from "../src/app/settingsChangeType.js";

const { isBackgroundOnlySettingsUpdate } = settingsChangeType;

test("background-only Wallpaper Engine settings can bypass player rendering", () => {
  assert.equal(isBackgroundOnlySettingsUpdate({ enableCoverBackground: { value: true } }), true);
  assert.equal(isBackgroundOnlySettingsUpdate({ customWallpaperBlur: { value: 20 } }), true);
  assert.equal(isBackgroundOnlySettingsUpdate({ coverBackgroundBlur: { value: 64 } }), true);
  assert.equal(isBackgroundOnlySettingsUpdate({ backgroundDim: { value: true } }), true);
  assert.equal(isBackgroundOnlySettingsUpdate({ customWallpaper: { value: "D:/Pictures/wallpaper.png" } }), true);
});

test("mixed or non-background settings still require a normal render", () => {
  assert.equal(isBackgroundOnlySettingsUpdate({ defaultVisibility: { value: "compact" } }), false);
  assert.equal(isBackgroundOnlySettingsUpdate({
    customWallpaperBlur: { value: 20 },
    showLyrics: { value: false },
  }), false);
  assert.equal(isBackgroundOnlySettingsUpdate({}), false);
});

test("UI-only Wallpaper Engine settings do not request Bridge source refresh", () => {
  assert.equal(typeof settingsChangeType.hasSourcePolicySettingsUpdate, "function");

  assert.equal(settingsChangeType.hasSourcePolicySettingsUpdate({
    enablePlayer: { value: false },
    defaultVisibility: { value: "compact" },
    hideWhenNoMedia: { value: false },
    lyricsStyle: { value: "immersive" },
    showLyrics: { value: false },
    enableOnlineLyrics: { value: false },
  }), false);
});

test("only source-policy Wallpaper Engine settings request Bridge source refresh", () => {
  assert.equal(typeof settingsChangeType.hasSourcePolicySettingsUpdate, "function");

  assert.equal(settingsChangeType.hasSourcePolicySettingsUpdate({ lowPrioritySources: { value: "edge" } }), true);
  assert.equal(settingsChangeType.hasSourcePolicySettingsUpdate({ blockedSources: { value: "qqmusic" } }), true);
  assert.equal(settingsChangeType.hasSourcePolicySettingsUpdate({
    customWallpaperBlur: { value: 20 },
    defaultVisibility: { value: "lyrics" },
  }), false);
});

test("mixed updates stay conservative when a source-policy setting is present", () => {
  assert.equal(typeof settingsChangeType.hasSourcePolicySettingsUpdate, "function");

  assert.equal(settingsChangeType.hasSourcePolicySettingsUpdate({
    lowPrioritySources: { value: "" },
    lyricsStyle: { value: "immersive" },
    backgroundDim: { value: true },
  }), true);
});
