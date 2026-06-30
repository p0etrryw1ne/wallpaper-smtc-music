import test from "node:test";
import assert from "node:assert/strict";
import { showArtworkFallback } from "../src/player/artworkDom.js";

test("artwork load failure hides the broken img and reveals fallback art", () => {
  const removed = [];
  const fallback = {
    hidden: true,
    matches(selector) {
      return selector === "[data-artwork-fallback]";
    }
  };
  const image = {
    hidden: false,
    nextElementSibling: fallback,
    removeAttribute(name) {
      removed.push(name);
    }
  };

  showArtworkFallback(image);

  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false);
  assert.deepEqual(removed, ["src", "srcset"]);
});
