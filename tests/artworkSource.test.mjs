import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanArtworkSource,
  normalizeArtworkSource,
} from "../src/media/artworkSource.js";

test("normalizes Windows artwork paths with spaces to file urls", () => {
  assert.equal(
    normalizeArtworkSource("D:\\Music Covers\\Album Art.png"),
    "file:///D:/Music Covers/Album Art.png"
  );
});

test("normalizes Wallpaper Engine embedded file urls to the real Windows path", () => {
  assert.equal(
    normalizeArtworkSource("file:///D:/Program%20Files%20(x86)/Steam/projects/we-smtc/D%3A/Music%20Covers/Album%20Art.png"),
    "file:///D:/Music Covers/Album Art.png"
  );
});

test("preserves browser-safe artwork urls including data images", () => {
  assert.equal(normalizeArtworkSource("https://example.test/cover art.png"), "https://example.test/cover art.png");
  assert.equal(normalizeArtworkSource("blob:https://example.test/id"), "blob:https://example.test/id");
  assert.equal(
    normalizeArtworkSource("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"),
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
  );
});

test("extracts nested artwork source fields shared by settings and media inputs", () => {
  assert.equal(cleanArtworkSource({ value: { path: "D:/Pictures/custom image.png" } }), "D:/Pictures/custom image.png");
  assert.equal(normalizeArtworkSource({ artwork: { url: "D:/Pictures/custom image.png" } }), "file:///D:/Pictures/custom image.png");
});

test("rejects unsafe image-like values while allowing spaces in paths", () => {
  assert.equal(normalizeArtworkSource("\" onerror=\"bad"), "");
  assert.equal(normalizeArtworkSource("javascript:alert(1)"), "");
  assert.equal(normalizeArtworkSource("cover art.png"), "cover art.png");
});
