import test from "node:test";
import assert from "node:assert/strict";
import { refreshDelaysForCommand, shouldRefreshBridgeFreshAfterCommand } from "../src/app/commandRefreshSchedule.js";

test("next and previous schedule several fast refreshes for SMTC metadata latency", () => {
  assert.deepEqual(refreshDelaysForCommand("next"), [120, 300, 700, 1200, 1800]);
  assert.deepEqual(refreshDelaysForCommand("previous"), [120, 300, 700, 1200, 1800]);
});

test("play-pause schedules near-term refreshes without waiting for the polling interval", () => {
  assert.deepEqual(refreshDelaysForCommand("play-pause"), [250, 600, 1200]);
});

test("metadata-changing commands request fresh Bridge source enumeration", () => {
  assert.equal(shouldRefreshBridgeFreshAfterCommand("next"), true);
  assert.equal(shouldRefreshBridgeFreshAfterCommand("previous"), true);
  assert.equal(shouldRefreshBridgeFreshAfterCommand("play-pause"), true);
  assert.equal(shouldRefreshBridgeFreshAfterCommand("volume-up"), false);
});
