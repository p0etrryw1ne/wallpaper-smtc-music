import test from "node:test";
import assert from "node:assert/strict";
import { chooseNowPlayingInput } from "../src/media/nowPlayingStore.js";

test("uses Bridge snapshot when Bridge is healthy and has media", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Official" },
    bridge: { healthy: true, snapshot: { title: "Bridge" } },
  });

  assert.equal(result.title, "Bridge");
});

test("falls back to official media when Bridge is offline", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Official" },
    bridge: { healthy: false, snapshot: null },
  });

  assert.equal(result.title, "Official");
});

test("falls back to official media when Bridge is healthy but has no media", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Official" },
    bridge: { healthy: true, snapshot: { title: "", artist: "" } },
  });

  assert.equal(result.title, "Official");
});

test("falls back to official media when Bridge selected source is empty", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Official", artist: "System" },
    bridge: {
      healthy: true,
      snapshot: {
        selected_source_id: null,
        source: null
      }
    }
  });

  assert.deepEqual(result, { title: "Official", artist: "System" });
});

test("uses empty Bridge state instead of stale official media when Bridge reports no sources", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Old Official", artist: "System" },
    bridge: {
      healthy: true,
      snapshot: null,
      sources: []
    }
  });

  assert.deepEqual(result, {});
});

test("falls back to official media when Bridge source refresh is stale and empty", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Official", artist: "System" },
    bridge: {
      healthy: true,
      stale: true,
      error: "source refresh already in progress",
      snapshot: null,
      sources: []
    }
  });

  assert.deepEqual(result, { title: "Official", artist: "System" });
});

test("uses empty Bridge state instead of official media when every Bridge source is blocked by policy", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Edge Video", artist: "Browser" },
    bridge: {
      healthy: true,
      blockedByPolicy: true,
      snapshot: null,
      sources: [{ sourceId: "msedge.exe", title: "Edge Video" }]
    }
  });

  assert.deepEqual(result, {});
});

test("falls back to official media when Bridge has sources but no selected source", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Old Official", artist: "System" },
    bridge: {
      healthy: true,
      snapshot: null,
      sources: [{ sourceId: "QQMusic.exe", title: "Blocked Song" }]
    }
  });

  assert.deepEqual(result, { title: "Old Official", artist: "System" });
});

test("keeps stale Bridge media when it is still usable", () => {
  const result = chooseNowPlayingInput({
    official: { title: "Official Live Song", artist: "System" },
    bridge: {
      healthy: true,
      stale: true,
      snapshot: { title: "Cached Bridge Song", artist: "Old" }
    }
  });

  assert.equal(result.title, "Cached Bridge Song");
});

test("keeps stale Bridge media even when official media is empty", () => {
  const result = chooseNowPlayingInput({
    official: {},
    bridge: {
      healthy: true,
      stale: true,
      snapshot: { title: "Cached Bridge Song", artist: "Old" }
    }
  });

  assert.equal(result.title, "Cached Bridge Song");
});
