import test from "node:test";
import assert from "node:assert/strict";
import { commandSourceIdForSnapshot } from "../src/media/commandSource.js";

test("uses Bridge source only when displayed media matches selected Bridge snapshot", () => {
  assert.equal(commandSourceIdForSnapshot(
    { sourceId: "QQMusic.exe" },
    { healthy: true, stale: false, snapshot: { sourceId: "QQMusic.exe" } }
  ), "QQMusic.exe");
});

test("does not send commands to stale Bridge source while official media is displayed", () => {
  assert.equal(commandSourceIdForSnapshot(
    { sourceId: "wallpaper-engine" },
    { healthy: true, stale: true, snapshot: { sourceId: "QQMusic.exe" } }
  ), "");
});

test("does not send commands to Bridge when displayed media differs from selected Bridge source", () => {
  assert.equal(commandSourceIdForSnapshot(
    { sourceId: "wallpaper-engine" },
    { healthy: true, stale: false, snapshot: { sourceId: "QQMusic.exe" } }
  ), "");
});
