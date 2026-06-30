import test from "node:test";
import assert from "node:assert/strict";
import { updateProgressDom } from "../src/player/progressDom.js";

test("unknown progress clears visible progress while preserving slots", () => {
  const slot = fakeProgressSlot();
  const root = {
    querySelectorAll: () => [slot],
    querySelector: () => slot.times
  };

  updateProgressDom(root, { timeline: { status: "known", position: 30, duration: 120 } });
  updateProgressDom(root, { timeline: { status: "unknown", position: null, duration: null } });

  assert.equal(slot.dataset.progressVisible, "false");
  assert.equal(slot.track.style.values.get("--progress-percent"), "0%");
  assert.equal(slot.times.children[0].textContent, "");
  assert.equal(slot.times.children[1].textContent, "");
});

test("known progress updates time labels and fill", () => {
  const slot = fakeProgressSlot();
  const root = {
    querySelectorAll: () => [slot],
    querySelector: () => slot.times
  };

  updateProgressDom(root, { timeline: { status: "known", position: 15, duration: 60 } });

  assert.equal(slot.dataset.progressVisible, "true");
  assert.equal(slot.track.style.values.get("--progress-percent"), "25%");
  assert.equal(slot.times.children[0].textContent, "0:15");
  assert.equal(slot.times.children[1].textContent, "1:00");
});

test("unchanged unknown progress does not rewrite slot style", () => {
  const writes = [];
  const slot = fakeProgressSlotWithWriteLog(writes);
  const root = {
    querySelectorAll: () => [slot],
    querySelector: () => slot.times
  };

  updateProgressDom(root, { timeline: { status: "unknown", position: null, duration: null } });
  updateProgressDom(root, { timeline: { status: "unknown", position: null, duration: null } });

  assert.deepEqual(writes, [
    ["dataset", "false"],
    ["style", "--progress-percent", "0%"],
    ["text", 0, ""],
    ["text", 1, ""]
  ]);
});

test("unchanged known progress does not rewrite slot style", () => {
  const writes = [];
  const slot = fakeProgressSlotWithWriteLog(writes);
  const root = {
    querySelectorAll: () => [slot],
    querySelector: () => slot.times
  };
  const snapshot = { timeline: { status: "known", position: 30, duration: 120 } };

  updateProgressDom(root, snapshot);
  updateProgressDom(root, snapshot);

  assert.deepEqual(writes, [
    ["dataset", "true"],
    ["style", "--progress-percent", "25%"],
    ["text", 0, "0:30"],
    ["text", 1, "2:00"]
  ]);
});

function fakeProgressSlot() {
  const track = {
    style: {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, value);
      }
    }
  };
  return {
    dataset: { progressReserved: "true", progressVisible: "true" },
    track,
    times: {
      children: [{ textContent: "old" }, { textContent: "old" }]
    },
    querySelector(selector) {
      if (selector === ".progress-track") return track;
      return null;
    }
  };
}

function fakeProgressSlotWithWriteLog(writes) {
  const dataset = {};
  Object.defineProperty(dataset, "progressVisible", {
    get() {
      return this._progressVisible;
    },
    set(value) {
      this._progressVisible = value;
      writes.push(["dataset", value]);
    }
  });

  const track = {
    style: {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, value);
        writes.push(["style", name, value]);
      }
    }
  };

  function textNode(index) {
    return {
      _textContent: "old",
      get textContent() {
        return this._textContent;
      },
      set textContent(value) {
        this._textContent = value;
        writes.push(["text", index, value]);
      }
    };
  }

  return {
    dataset,
    track,
    times: {
      children: [textNode(0), textNode(1)]
    },
    querySelector(selector) {
      if (selector === ".progress-track") return track;
      return null;
    }
  };
}
