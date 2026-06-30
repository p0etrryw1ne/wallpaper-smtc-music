import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultSettings,
  mergeWallpaperProperties,
  parseSourceList
} from "../src/settings/settingsStore.js";

test("default settings expose only the approved first-version controls", () => {
  assert.deepEqual(createDefaultSettings(), {
    enablePlayer: true,
    defaultVisibility: "expanded",
    hideWhenNoMedia: true,
    lyricsStyle: "standard",
    showLyrics: true,
    enableOnlineLyrics: true,
    enableCoverBackground: false,
    customWallpaper: "assets/default.png",
    customWallpaperBlur: 0,
    coverBackgroundBlur: 64,
    backgroundDim: false,
    lowPrioritySources: "edge, chrome, firefox, brave, opera, browser",
    blockedSources: ""
  });
});

test("partial Wallpaper Engine updates preserve previous values", () => {
  const previous = {
    ...createDefaultSettings(),
    defaultVisibility: "lyrics",
    customWallpaper: "D:/Pictures/wallpaper.png"
  };

  const next = mergeWallpaperProperties(previous, {
    enablePlayer: { value: false },
    customWallpaperBlur: { value: 12 }
  });

  assert.equal(next.enablePlayer, false);
  assert.equal(next.customWallpaperBlur, 12);
  assert.equal(next.coverBackgroundBlur, 64);
  assert.equal(next.defaultVisibility, "lyrics");
  assert.equal(next.customWallpaper, "D:/Pictures/wallpaper.png");
});

test("empty source lists remain empty and do not fall back to defaults", () => {
  const next = mergeWallpaperProperties(createDefaultSettings(), {
    lowPrioritySources: { value: "" },
    blockedSources: { value: "edge, chrome\nfirefox" }
  });

  assert.equal(next.lowPrioritySources, "");
  assert.deepEqual(parseSourceList(next.lowPrioritySources), []);
  assert.deepEqual(parseSourceList(next.blockedSources), ["edge", "chrome", "firefox"]);
});

test("custom wallpaper can be cleared so background falls back to default", () => {
  const previous = {
    ...createDefaultSettings(),
    customWallpaper: "D:/Pictures/wallpaper.png"
  };
  const next = mergeWallpaperProperties(previous, {
    customWallpaper: { value: "" }
  });

  assert.equal(next.customWallpaper, "");
});

test("custom wallpaper accepts Wallpaper Engine file object shapes", () => {
  const fromFileProperty = mergeWallpaperProperties(createDefaultSettings(), {
    customWallpaper: { value: { file: "D:/Pictures/custom.png" } }
  });
  const fromPathProperty = mergeWallpaperProperties(createDefaultSettings(), {
    customWallpaper: { path: "D:/Pictures/custom 2.png" }
  });

  assert.equal(fromFileProperty.customWallpaper, "D:/Pictures/custom.png");
  assert.equal(fromPathProperty.customWallpaper, "D:/Pictures/custom 2.png");
});

test("cover background and independent blur settings merge from Wallpaper Engine updates", () => {
  const next = mergeWallpaperProperties(createDefaultSettings(), {
    enableCoverBackground: { value: true },
    customWallpaperBlur: { value: 6 },
    coverBackgroundBlur: { value: 80 }
  });

  assert.equal(next.enableCoverBackground, true);
  assert.equal(next.customWallpaperBlur, 6);
  assert.equal(next.coverBackgroundBlur, 80);
});

test("legacy background settings are mapped for saved Wallpaper Engine properties", () => {
  const next = mergeWallpaperProperties(createDefaultSettings(), {
    backgroundMode: { value: "cover" },
    backgroundBlur: { value: 30 }
  });

  assert.equal(next.enableCoverBackground, true);
  assert.equal(next.coverBackgroundBlur, 30);
  assert.equal(next.customWallpaperBlur, 0);
});

test("unknown display modes and legacy background modes are ignored", () => {
  const previous = createDefaultSettings();
  const next = mergeWallpaperProperties(previous, {
    defaultVisibility: { value: "hidden" },
    backgroundMode: { value: "video" },
    lyricsStyle: { value: "poster" }
  });

  assert.equal(next.defaultVisibility, "expanded");
  assert.equal(next.enableCoverBackground, false);
  assert.equal(next.lyricsStyle, "standard");
});

test("lyrics style can switch between standard and immersive", () => {
  const next = mergeWallpaperProperties(createDefaultSettings(), {
    lyricsStyle: { value: "immersive" }
  });

  assert.equal(next.lyricsStyle, "immersive");
});
