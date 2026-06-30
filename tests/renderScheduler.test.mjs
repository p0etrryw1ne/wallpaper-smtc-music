import test from "node:test";
import assert from "node:assert/strict";
import { createFrameScheduler } from "../src/app/renderScheduler.js";

test("frame scheduler coalesces repeated requests into one callback", () => {
  const frames = [];
  let calls = 0;
  const schedule = createFrameScheduler(() => {
    calls += 1;
  }, {
    requestFrame(callback) {
      frames.push(callback);
    }
  });

  schedule();
  schedule();
  schedule();

  assert.equal(calls, 0);
  assert.equal(frames.length, 1);

  frames[0]();

  assert.equal(calls, 1);
});

test("frame scheduler can schedule again after a frame runs", () => {
  const frames = [];
  let calls = 0;
  const schedule = createFrameScheduler(() => {
    calls += 1;
  }, {
    requestFrame(callback) {
      frames.push(callback);
    }
  });

  schedule();
  frames.shift()();
  schedule();
  frames.shift()();

  assert.equal(calls, 2);
});
