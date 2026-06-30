import assert from "node:assert/strict";
import test from "node:test";
import { registerWallpaperSettingsIntegration } from "../src/we/wallpaperSettingsIntegration.js";

test("registers Wallpaper Engine property listener", () => {
  const host = {};
  const received = [];

  const registered = registerWallpaperSettingsIntegration({
    host,
    onSettings(properties) {
      received.push(properties);
    }
  });

  assert.equal(registered, true);
  host.wallpaperPropertyListener.applyUserProperties({
    customWallpaperBlur: { value: 0 }
  });

  assert.deepEqual(received, [
    {
      customWallpaperBlur: { value: 0 }
    }
  ]);
});

test("replays queued Wallpaper Engine properties", () => {
  const host = {
    __pendingWallpaperUserProperties: [
      {
        customWallpaper: { value: "D:/Pictures/wallpaper.png" },
        hideWhenNoMedia: { value: false }
      }
    ]
  };
  const received = [];

  registerWallpaperSettingsIntegration({
    host,
    onSettings(properties) {
      received.push(properties);
    }
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].customWallpaper.value, "D:/Pictures/wallpaper.png");
  assert.deepEqual(host.__pendingWallpaperUserProperties, []);
});
