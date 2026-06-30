import test from "node:test";
import assert from "node:assert/strict";
import { createRenderSlotState, ensureRenderSlots, planSlotUpdates, slotWasUpdated } from "../src/app/renderSlots.js";
import { renderLyrics } from "../src/lyrics/renderLyrics.js";

test("first render updates all named slots", () => {
  const state = createRenderSlotState();
  const updates = planSlotUpdates(state, {
    player: "<section>player</section>",
    lyrics: "<section>lyrics</section>",
    debug: ""
  });

  assert.deepEqual(updates.map((update) => update.name), ["player", "lyrics", "debug"]);
});

test("unchanged slots are not updated on later renders", () => {
  const state = createRenderSlotState();
  planSlotUpdates(state, {
    player: "<section>player</section>",
    lyrics: "<section>lyrics</section>",
    debug: ""
  });

  const updates = planSlotUpdates(state, {
    player: "<section>player</section>",
    lyrics: "<section>lyrics 2</section>",
    debug: ""
  });

  assert.deepEqual(updates, [{ name: "lyrics", html: "<section>lyrics 2</section>" }]);
});

test("timeline-only renders can preserve player and lyric DOM", () => {
  const state = createRenderSlotState();
  planSlotUpdates(state, {
    player: "<section data-title='same'>player</section>",
    lyrics: "<section data-lines='same'>lyrics</section>",
    debug: ""
  });

  const updates = planSlotUpdates(state, {
    player: "<section data-title='same'>player</section>",
    lyrics: "<section data-lines='same'>lyrics</section>",
    debug: ""
  });

  assert.deepEqual(updates, []);
});

test("active lyric line changes do not replace the lyric DOM slot", () => {
  const lines = [
    { timeMs: 1000, text: "第一句" },
    { timeMs: 3000, text: "第二句" },
    { timeMs: 5000, text: "第三句" }
  ];
  const state = createRenderSlotState();
  planSlotUpdates(state, {
    player: "<section data-title='same'>player</section>",
    lyrics: renderLyrics(lines, 0),
    debug: ""
  });

  const updates = planSlotUpdates(state, {
    player: "<section data-title='same'>player</section>",
    lyrics: renderLyrics(lines, 2),
    debug: ""
  });

  assert.deepEqual(updates, []);
});

test("slot update lists can be queried by slot name", () => {
  const updates = [
    { name: "player", html: "a" },
    { name: "debug", html: "b" }
  ];

  assert.equal(slotWasUpdated(updates, "player"), true);
  assert.equal(slotWasUpdated(updates, "lyrics"), false);
});

test("ensuring slots removes legacy direct children from the root", () => {
  const removed = [];
  const legacy = { remove: () => removed.push("legacy") };
  const root = {
    children: [legacy],
    querySelector: () => null,
    append(node) {
      this.children.push(node);
    }
  };
  globalThis.document = {
    createElement() {
      return {
        dataset: {},
        append() {},
        querySelector: () => null
      };
    }
  };

  ensureRenderSlots(root);

  assert.deepEqual(removed, ["legacy"]);
  delete globalThis.document;
});
