import test from "node:test";
import assert from "node:assert/strict";
import { applyBackgroundState, deriveBackgroundState, toCssImageUrl } from "../src/background/backgroundState.js";

test("custom wallpaper background ignores media artwork and uses custom wallpaper blur", () => {
  const state = deriveBackgroundState(
    { thumbnail: "cover.png" },
    {
      enableCoverBackground: false,
      customWallpaper: "assets/default.png",
      customWallpaperBlur: 0,
      coverBackgroundBlur: 64,
      backgroundDim: false
    }
  );

  assert.equal(state.image, "assets/default.png");
  assert.equal(state.blurPx, 0);
  assert.equal(state.dimEnabled, false);
});

test("cover background uses cover artwork and cover blur when media is present", () => {
  const state = deriveBackgroundState(
    { hasMedia: true, thumbnail: "cover.png" },
    {
      enableCoverBackground: true,
      customWallpaper: "assets/default.png",
      customWallpaperBlur: 0,
      coverBackgroundBlur: 64,
      backgroundDim: true
    }
  );

  assert.equal(state.image, "cover.png");
  assert.equal(state.blurPx, 64);
  assert.equal(state.dimEnabled, true);
});

test("cover background falls back to custom wallpaper and custom blur when there is no media", () => {
  const state = deriveBackgroundState(
    { hasMedia: false, thumbnail: "stale-cover.png" },
    {
      enableCoverBackground: true,
      customWallpaper: "D:/Pictures/wallpaper.png",
      customWallpaperBlur: 0,
      coverBackgroundBlur: 64,
      backgroundDim: false
    }
  );

  assert.equal(state.mode, "wallpaper");
  assert.equal(state.image, "D:/Pictures/wallpaper.png");
  assert.equal(state.blurPx, 0);
});

test("cover background keeps the current background while media cover is temporarily missing", () => {
  const state = deriveBackgroundState(
    { hasMedia: true, thumbnail: "" },
    {
      enableCoverBackground: true,
      customWallpaper: "D:/Pictures/wallpaper.png",
      customWallpaperBlur: 12,
      coverBackgroundBlur: 64,
      backgroundDim: false
    }
  );

  assert.equal(state, null);
});

test("missing custom wallpaper falls back to bundled default", () => {
  const state = deriveBackgroundState(
    { thumbnail: "" },
    {
      enableCoverBackground: false,
      customWallpaper: "",
      customWallpaperBlur: 18,
      coverBackgroundBlur: 64,
      backgroundDim: false
    }
  );

  assert.equal(state.image, "assets/default.png");
});

test("bundled default wallpaper resolves relative to wallpaper entry html", () => {
  assert.equal(toCssImageUrl("assets/default.png"), "./assets/default.png");
});

test("applied bundled wallpaper url resolves against the entry document, not the stylesheet", () => {
  const styleValues = new Map();
  const element = {
    ownerDocument: { baseURI: "file:///D:/Projects/WE-SMTC/index.html" },
    style: {
      setProperty(name, value) {
        styleValues.set(name, value);
      }
    },
    dataset: {}
  };

  applyBackgroundState(element, {
    mode: "wallpaper",
    image: "assets/default.png",
    blurPx: 0,
    dimEnabled: false
  });

  assert.equal(
    styleValues.get("--wallpaper-image"),
    'url("file:///D:/Projects/WE-SMTC/assets/default.png")'
  );
});

test("Windows custom wallpaper paths resolve to file urls for Wallpaper Engine web views", () => {
  assert.equal(toCssImageUrl("D:/Pictures/custom.png"), "file:///D:/Pictures/custom.png");
  assert.equal(toCssImageUrl("D:\\Pictures\\custom image.png"), "file:///D:/Pictures/custom image.png");
});

test("existing browser-safe image urls are preserved", () => {
  assert.equal(toCssImageUrl("file:///D:/Pictures/custom.png"), "file:///D:/Pictures/custom.png");
  assert.equal(toCssImageUrl("https://example.test/custom.png"), "https://example.test/custom.png");
  assert.match(toCssImageUrl("data:image/png;base64,abc"), /^data:image\/png/);
});

test("Wallpaper Engine embedded file urls normalize to the real Windows path", () => {
  assert.equal(
    toCssImageUrl("file:///D:/Projects/WE-SMTC/D:/备份/图片/wallpaper.png"),
    "file:///D:/备份/图片/wallpaper.png"
  );
});

test("Wallpaper Engine encoded custom wallpaper paths normalize to readable file urls", () => {
  const expected = "file:///D:/Downloads/极空间/245_1_120.jpg";

  assert.equal(
    toCssImageUrl("D%3A/Downloads/%E6%9E%81%E7%A9%BA%E9%97%B4/245_1_120.jpg"),
    expected
  );
  assert.equal(
    toCssImageUrl("D:/Program Files (x86)/Steam/steamapps/common/wallpaper_engine/projects/myprojects/we-smtc/D%3A/Downloads/%E6%9E%81%E7%A9%BA%E9%97%B4/245_1_120.jpg"),
    expected
  );
  assert.equal(
    toCssImageUrl("file:///D:/Program%20Files%20(x86)/Steam/steamapps/common/wallpaper_engine/projects/myprojects/we-smtc/D%3A/Downloads/%E6%9E%81%E7%A9%BA%E9%97%B4/245_1_120.jpg"),
    expected
  );
});

test("custom wallpaper object paths resolve before CSS url conversion", () => {
  assert.equal(
    toCssImageUrl({ value: { path: "D:/Pictures/custom image.png" } }),
    "file:///D:/Pictures/custom image.png"
  );
});

test("wallpaper mode does not read media artwork", () => {
  const snapshot = {};
  Object.defineProperty(snapshot, "thumbnail", {
    get() {
      throw new Error("thumbnail should not be read for wallpaper backgrounds");
    }
  });

  const state = deriveBackgroundState(snapshot, {
    enableCoverBackground: false,
    customWallpaper: "D:/Pictures/custom.png",
    customWallpaperBlur: 0,
    coverBackgroundBlur: 64,
    backgroundDim: false
  });

  assert.equal(state.image, "D:/Pictures/custom.png");
});

test("reapplying the same background state does not rewrite CSS properties", () => {
  const writes = [];
  const element = {
    ownerDocument: { baseURI: "file:///D:/Projects/WE-SMTC/index.html" },
    style: {
      setProperty(name, value) {
        writes.push([name, value]);
      }
    },
    dataset: {}
  };
  const state = {
    mode: "wallpaper",
    image: "assets/default.png",
    blurPx: 0,
    dimEnabled: false
  };

  applyBackgroundState(element, state);
  applyBackgroundState(element, state);

  assert.equal(writes.length, 2);
});
