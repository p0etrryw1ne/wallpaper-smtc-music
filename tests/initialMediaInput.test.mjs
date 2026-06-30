import test from "node:test";
import assert from "node:assert/strict";
import { deriveInitialMediaInput } from "../src/app/initialMediaInput.js";

test("uses mock media only when mock query is explicit", () => {
  const result = deriveInitialMediaInput(new URLSearchParams("mock=long"), {
    hasWallpaperMedia: false,
    createMockMedia: (name) => ({ title: `mock:${name}` }),
  });

  assert.deepEqual(result, { title: "mock:long" });
});

test("does not create fake media when no source is available", () => {
  const result = deriveInitialMediaInput(new URLSearchParams(""), {
    hasWallpaperMedia: false,
    createMockMedia: () => ({ title: "fake" }),
  });

  assert.deepEqual(result, {});
});

test("waits for Wallpaper Engine media when the host supports it", () => {
  const result = deriveInitialMediaInput(new URLSearchParams(""), {
    hasWallpaperMedia: true,
    createMockMedia: () => ({ title: "fake" }),
  });

  assert.deepEqual(result, {});
});
