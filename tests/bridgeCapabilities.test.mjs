import test from "node:test";
import assert from "node:assert/strict";
import { canSwitchBridgeSource } from "../src/bridge/bridgeCapabilities.js";

test("source switch can stay enabled when Bridge has a commandable selected source", () => {
  assert.equal(canSwitchBridgeSource(
    { healthy: true, stale: false, snapshot: { sourceId: "QQMusic.exe" }, sources: [] },
    "QQMusic.exe"
  ), true);
});

test("source switch is disabled for stale or mismatched Bridge state", () => {
  assert.equal(canSwitchBridgeSource(
    { healthy: true, stale: true, snapshot: { sourceId: "QQMusic.exe" }, sources: [{ sourceId: "QQMusic.exe" }] },
    "QQMusic.exe"
  ), false);
  assert.equal(canSwitchBridgeSource(
    { healthy: true, stale: false, snapshot: { sourceId: "QQMusic.exe" }, sources: [{ sourceId: "QQMusic.exe" }] },
    "cloudmusic.exe"
  ), false);
});

test("source switch is enabled when multiple policy-visible Bridge sources are available", () => {
  assert.equal(canSwitchBridgeSource(
    {
      healthy: true,
      stale: false,
      snapshot: { sourceId: "QQMusic.exe" },
      sources: [
        { sourceId: "QQMusic.exe", title: "QQ" },
        { sourceId: "cloudmusic.exe", title: "Cloud" }
      ]
    },
    "QQMusic.exe"
  ), true);
});
