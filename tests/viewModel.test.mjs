import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNowPlayingSnapshot } from "../src/media/snapshot.js";
import { derivePlayerViewModel } from "../src/media/viewModel.js";

test("disabled player always renders idle state", () => {
  const media = normalizeNowPlayingSnapshot({ title: "Song", artist: "Artist" });
  const view = derivePlayerViewModel(media, { enablePlayer: false });

  assert.equal(view.visible, false);
  assert.equal(view.sourceStatus, "none");
  assert.equal(view.mode, "idle");
});

test("no media hides the player when hideWhenNoMedia is enabled", () => {
  const media = normalizeNowPlayingSnapshot({});
  const view = derivePlayerViewModel(media, { hideWhenNoMedia: true });

  assert.equal(view.visible, false);
  assert.equal(view.sourceStatus, "none");
  assert.equal(view.mode, "idle");
});

test("no media can keep the default shell visible when hiding is disabled", () => {
  const media = normalizeNowPlayingSnapshot({});
  const view = derivePlayerViewModel(media, {
    hideWhenNoMedia: false,
    defaultVisibility: "compact"
  });

  assert.equal(view.visible, true);
  assert.equal(view.sourceStatus, "none");
  assert.equal(view.mode, "compact");
});

test("active media with known timeline reserves and shows progress", () => {
  const media = normalizeNowPlayingSnapshot({ title: "Song", position: 10, duration: 100 });
  const view = derivePlayerViewModel(media, { defaultVisibility: "expanded" });

  assert.equal(view.visible, true);
  assert.equal(view.sourceStatus, "active");
  assert.equal(view.mode, "expanded");
  assert.equal(view.timelineStatus, "known");
  assert.equal(view.progressSlotReserved, true);
  assert.equal(view.progressVisible, true);
});

test("active media with unknown timeline reserves the progress slot without showing progress", () => {
  const media = normalizeNowPlayingSnapshot({ title: "Song" });
  const view = derivePlayerViewModel(media, { defaultVisibility: "lyrics" });

  assert.equal(view.visible, true);
  assert.equal(view.sourceStatus, "active");
  assert.equal(view.mode, "lyrics");
  assert.equal(view.timelineStatus, "unknown");
  assert.equal(view.progressSlotReserved, true);
  assert.equal(view.progressVisible, false);
});

test("stale runtime state is visible but marked stale", () => {
  const media = normalizeNowPlayingSnapshot({ title: "Old Song" });
  const view = derivePlayerViewModel(media, {}, { sourceStatus: "stale" });

  assert.equal(view.visible, true);
  assert.equal(view.sourceStatus, "stale");
  assert.equal(view.mode, "expanded");
});

test("source switch availability is separate from transport controls", () => {
  const media = normalizeNowPlayingSnapshot({ title: "Song", artist: "Artist" });
  const view = derivePlayerViewModel(media, {}, {
    controlsAvailable: false,
    sourceSwitchAvailable: true
  });

  assert.equal(view.controlsAvailable, false);
  assert.equal(view.sourceSwitchAvailable, true);
});

test("immersive player style does not override the requested display mode", () => {
  const media = normalizeNowPlayingSnapshot({ title: "Song", artist: "Artist" });
  const expanded = derivePlayerViewModel(media, {
    defaultVisibility: "expanded",
    lyricsStyle: "immersive"
  });
  const compact = derivePlayerViewModel(media, {
    defaultVisibility: "compact",
    lyricsStyle: "immersive"
  });

  assert.equal(expanded.lyricsStyle, "immersive");
  assert.equal(expanded.mode, "expanded");
  assert.equal(compact.lyricsStyle, "immersive");
  assert.equal(compact.mode, "compact");
});
