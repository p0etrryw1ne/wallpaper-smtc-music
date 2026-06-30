import assert from "node:assert/strict";
import test from "node:test";
import { hasWallpaperMediaIntegration, registerWallpaperMediaIntegration } from "../src/we/wallpaperMediaIntegration.js";

test("detects Wallpaper Engine media listeners", () => {
  assert.equal(hasWallpaperMediaIntegration({}), false);
  assert.equal(hasWallpaperMediaIntegration({
    wallpaperRegisterMediaPropertiesListener() {}
  }), true);
});

test("merges Wallpaper Engine media callbacks into one media input", () => {
  const callbacks = {};
  const host = createWallpaperHost(callbacks);
  const inputs = [];

  const registered = registerWallpaperMediaIntegration({
    host,
    onMediaInput(input) {
      inputs.push(input);
    }
  });

  assert.equal(registered, true);

  callbacks.properties({
    title: "Song",
    artist: "Artist",
    albumTitle: "Album"
  });
  callbacks.thumbnail({ thumbnail: "file:///cover.png" });
  callbacks.playback({ state: 1 });
  callbacks.timeline({ position: 12.5, duration: 180 });

  assert.deepEqual(inputs.at(-1), {
    sourceId: "wallpaper-engine",
    title: "Song",
    artist: "Artist",
    album: "Album",
    thumbnail: "file:///cover.png",
    playbackState: "playing",
    position: 12.5,
    duration: 180
  });
});

test("keeps Wallpaper Engine provided lyrics on media properties", () => {
  let propertiesListener = null;
  const inputs = [];
  const host = {
    wallpaperRegisterMediaPropertiesListener(listener) {
      propertiesListener = listener;
    },
  };

  registerWallpaperMediaIntegration({
    host,
    onMediaInput(input) {
      inputs.push(input);
    },
  });

  propertiesListener({
    title: "Song",
    artist: "Artist",
    lyrics: "[00:01.00]第一句",
  });

  assert.equal(inputs[0].lyrics, "[00:01.00]第一句");
});

test("clears stale timeline and artwork when Wallpaper Engine media identity changes", () => {
  const callbacks = {};
  const host = createWallpaperHost(callbacks);
  const inputs = [];

  registerWallpaperMediaIntegration({
    host,
    onMediaInput(input) {
      inputs.push(input);
    }
  });

  callbacks.properties({ title: "Old Song", artist: "Artist", albumTitle: "Album" });
  callbacks.thumbnail({ thumbnail: "file:///old-cover.png" });
  callbacks.playback({ state: 1 });
  callbacks.timeline({ position: 88, duration: 180 });
  callbacks.properties({ title: "New Song", artist: "Artist", albumTitle: "Album" });

  assert.deepEqual(inputs.at(-1), {
    sourceId: "wallpaper-engine",
    title: "New Song",
    artist: "Artist",
    album: "Album",
    thumbnail: "",
    playbackState: "playing",
    position: null,
    duration: null
  });
});

test("keeps timeline and artwork when Wallpaper Engine repeats the same media identity", () => {
  const callbacks = {};
  const host = createWallpaperHost(callbacks);
  const inputs = [];

  registerWallpaperMediaIntegration({
    host,
    onMediaInput(input) {
      inputs.push(input);
    }
  });

  callbacks.properties({ title: "Song", artist: "Artist", albumTitle: "Album" });
  callbacks.thumbnail({ thumbnail: "file:///cover.png" });
  callbacks.playback({ state: 1 });
  callbacks.timeline({ position: 88, duration: 180 });
  callbacks.properties({ title: "Song", artist: "Artist", albumTitle: "Album" });

  assert.equal(inputs.at(-1).thumbnail, "file:///cover.png");
  assert.equal(inputs.at(-1).position, 88);
  assert.equal(inputs.at(-1).duration, 180);
});

test("keeps early Wallpaper Engine thumbnail when the next media properties arrive later", () => {
  const callbacks = {};
  const host = createWallpaperHost(callbacks);
  const inputs = [];

  registerWallpaperMediaIntegration({
    host,
    onMediaInput(input) {
      inputs.push(input);
    }
  });

  callbacks.properties({ title: "Old Song", artist: "Artist", albumTitle: "Album" });
  callbacks.thumbnail({ thumbnail: "file:///old-cover.png" });
  callbacks.playback({ state: 1 });
  callbacks.timeline({ position: 88, duration: 180 });
  callbacks.thumbnail({ thumbnail: "file:///new-cover.png" });
  callbacks.properties({ title: "New Song", artist: "Artist", albumTitle: "Album" });

  assert.deepEqual(inputs.at(-1), {
    sourceId: "wallpaper-engine",
    title: "New Song",
    artist: "Artist",
    album: "Album",
    thumbnail: "file:///new-cover.png",
    playbackState: "playing",
    position: null,
    duration: null
  });
});

test("keeps initial Wallpaper Engine thumbnail that arrives before first properties", () => {
  const callbacks = {};
  const host = createWallpaperHost(callbacks);
  const inputs = [];

  registerWallpaperMediaIntegration({
    host,
    onMediaInput(input) {
      inputs.push(input);
    }
  });

  callbacks.thumbnail({ thumbnail: "file:///first-cover.png" });
  callbacks.properties({ title: "First Song", artist: "Artist", albumTitle: "Album" });

  assert.equal(inputs.at(-1).thumbnail, "file:///first-cover.png");
});

test("clears official media input when Wallpaper Engine disables media", () => {
  const callbacks = {};
  const host = createWallpaperHost(callbacks);
  const inputs = [];

  registerWallpaperMediaIntegration({
    host,
    onMediaInput(input) {
      inputs.push(input);
    }
  });

  callbacks.properties({ title: "Song" });
  callbacks.status({ enabled: false });

  assert.deepEqual(inputs.at(-1), {});
});

function createWallpaperHost(callbacks) {
  return {
    wallpaperRegisterMediaPropertiesListener(callback) {
      callbacks.properties = callback;
    },
    wallpaperRegisterMediaThumbnailListener(callback) {
      callbacks.thumbnail = callback;
    },
    wallpaperRegisterMediaPlaybackListener(callback) {
      callbacks.playback = callback;
    },
    wallpaperRegisterMediaTimelineListener(callback) {
      callbacks.timeline = callback;
    },
    wallpaperRegisterMediaStatusListener(callback) {
      callbacks.status = callback;
    }
  };
}
