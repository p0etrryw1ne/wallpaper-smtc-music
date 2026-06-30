import test from "node:test";
import assert from "node:assert/strict";
import { startBridgePolling } from "../src/bridge/bridgePolling.js";

test("Bridge polling fetches immediately and registers retry timer", async () => {
  let timerCallback = null;
  let timerDelay = 0;
  const snapshots = [];
  let calls = 0;

  const stop = startBridgePolling({
    intervalMs: 1500,
    fetchNowPlaying: async () => ({ healthy: true, snapshot: { title: `song-${++calls}` } }),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    setTimer(callback, delay) {
      timerCallback = callback;
      timerDelay = delay;
      return 7;
    },
    clearTimer() {}
  });

  await Promise.resolve();
  assert.equal(timerDelay, 1500);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].snapshot.title, "song-1");

  await timerCallback();
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].snapshot.title, "song-2");

  stop();
});

test("Bridge polling stop clears timer and blocks further ticks", async () => {
  let timerCallback = null;
  let cleared = false;
  let calls = 0;

  const stop = startBridgePolling({
    fetchNowPlaying: async () => ({ healthy: true, calls: ++calls }),
    onSnapshot() {},
    setTimer(callback) {
      timerCallback = callback;
      return 11;
    },
    clearTimer(timerId) {
      cleared = timerId === 11;
    }
  });

  await Promise.resolve();
  stop();
  await timerCallback();

  assert.equal(cleared, true);
  assert.equal(calls, 1);
});

test("Bridge polling default interval stays below one second for responsive UI", async () => {
  let timerDelay = 0;

  startBridgePolling({
    fetchNowPlaying: async () => ({ healthy: true, snapshot: { title: "song" } }),
    onSnapshot() {},
    setTimer(_callback, delay) {
      timerDelay = delay;
      return 17;
    },
    clearTimer() {}
  });

  await Promise.resolve();

  assert.equal(timerDelay, 700);
});

test("Bridge polling does nothing when disabled", () => {
  let registered = false;
  const stop = startBridgePolling({
    enabled: false,
    fetchNowPlaying: async () => ({}),
    onSnapshot() {},
    setTimer() {
      registered = true;
    }
  });

  stop();
  assert.equal(registered, false);
});

test("Bridge polling reports offline snapshot when a refresh throws", async () => {
  const snapshots = [];

  startBridgePolling({
    fetchNowPlaying: async () => {
      throw new Error("bridge unavailable");
    },
    onSnapshot(snapshot) {
      snapshots.push(snapshot);
    },
    setTimer() {
      return 13;
    },
    clearTimer() {}
  });

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].healthy, false);
  assert.match(snapshots[0].error, /bridge unavailable/);
});
