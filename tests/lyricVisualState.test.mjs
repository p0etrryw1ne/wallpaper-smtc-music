import test from "node:test";
import assert from "node:assert/strict";
import { lyricVisualForDistance, syncLyricVisualState } from "../src/lyrics/lyricVisualState.js";

test("lyric visual state is brightest at the focus center", () => {
  const centered = lyricVisualForDistance(0);
  const near = lyricVisualForDistance(0.45);
  const far = lyricVisualForDistance(1.6);

  assert.equal(centered.active, true);
  assert.equal(centered.opacity, 1);
  assert.equal(centered.blurPx, 0);
  assert.ok(near.opacity < centered.opacity);
  assert.ok(near.opacity > far.opacity);
  assert.ok(near.blurPx > centered.blurPx);
  assert.ok(far.blurPx > near.blurPx);
});

test("lyric visual state keeps far lines readable instead of hard clipping", () => {
  const far = lyricVisualForDistance(3);

  assert.equal(far.active, false);
  assert.ok(far.opacity >= 0.24);
  assert.ok(far.alpha >= 0.34);
  assert.ok(far.blurPx <= 3.4);
});

test("new lyric visual sync cancels the previous animation run", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  let now = 0;
  const frames = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const panel = fakePanel();
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };

    syncLyricVisualState(root);
    panel.dataset.activeIndex = "1";
    syncLyricVisualState(root);

    now = 100;
    const queued = [...frames];
    frames.length = 0;
    for (const frame of queued) frame(now);

    assert.equal(panel.dataset.visualRun, "2");
    assert.equal(panel.appliedRuns.every((run) => run === "2"), true);
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("lyric visual sync owns scroll animation instead of browser smooth scrolling", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  let now = 0;
  const frames = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const panel = fakePanel();
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };
    syncLyricVisualState(root);
    panel.dataset.activeIndex = "2";
    syncLyricVisualState(root);

    assert.equal(panel.scrollCalls.some((call) => call.behavior === "smooth"), false);
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("active lyric line changes keep a timed animation alive across frames", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  let now = 0;
  const frames = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const panel = fakePanel(6);
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };

    syncLyricVisualState(root);
    now = 2;
    frames.shift()(now);

    panel.dataset.activeIndex = "4";
    syncLyricVisualState(root);

    now = 382;
    frames.shift()(now);

    assert.ok(frames.length > 0, "expected active line change to schedule another animation frame");
    assert.equal(panel.dataset.visualRun, "2");
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("active lyric scroll uses a balanced midpoint instead of a front-loaded jump", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  let now = 0;
  const frames = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const panel = fakePanel(12);
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };

    panel.dataset.activeIndex = "1";
    syncLyricVisualState(root);
    now = 2;
    frames.shift()(now);

    panel.dataset.activeIndex = "5";
    syncLyricVisualState(root);
    const startTop = panel.scrollTop;

    now = 382;
    frames.shift()(now);
    const midTop = panel.scrollTop;

    now = 1200;
    while (frames.length > 0) {
      frames.shift()(now);
    }
    const endTop = panel.scrollTop;
    const ratio = (midTop - startTop) / (endTop - startTop);

    assert.ok(ratio > 0.4, `expected responsive progress near the old midpoint, got ${ratio}`);
    assert.ok(ratio < 0.75, `expected midpoint not to jump near the end, got ${ratio}`);
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("lyric visual sync does not restart scroll animation for the same active line", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  let frameCount = 0;
  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = () => {
    frameCount += 1;
    return frameCount;
  };

  try {
    const panel = fakePanel();
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };

    syncLyricVisualState(root);
    syncLyricVisualState(root);

    assert.equal(frameCount, 1);
    assert.equal(panel.dataset.visualRun, "1");
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("last active lyric remains visually active even when scroll is clamped at the bottom", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = (callback) => {
    callback(2);
    return 1;
  };

  try {
    const panel = fakePanel(13);
    panel.clientHeight = 300;
    panel.dataset.activeIndex = "12";
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };

    syncLyricVisualState(root);

    assert.equal(panel.rows[12].dataset.visualActive, "true");
    assert.equal(panel.rows.filter((row) => row.dataset.visualActive === "true").length, 1);
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("lyric visual sync reserves enough edge padding for first and last lines to center", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = (callback) => {
    callback(2);
    return 1;
  };

  try {
    const panel = fakePanel(8);
    panel.clientHeight = 300;
    panel.dataset.activeIndex = "7";
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };

    syncLyricVisualState(root);

    assert.equal(panel.style.properties["--lyric-edge-padding-top"], "120px");
    assert.equal(panel.style.properties["--lyric-edge-padding-bottom"], "120px");
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("lyric visual sync centers active line above the taskbar safe area", () => {
  const originalPerformance = globalThis.performance;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = (callback) => {
    callback(2);
    return 1;
  };
  globalThis.getComputedStyle = () => ({
    getPropertyValue(name) {
      return name === "--lyric-focus-bottom-inset" ? "60px" : "";
    }
  });

  try {
    const panel = fakePanel(8);
    panel.clientHeight = 300;
    panel.dataset.activeIndex = "4";
    const root = { querySelector: (selector) => selector === ".lyrics-panel" ? panel : null };

    syncLyricVisualState(root);

    assert.equal(panel.scrollTop, 230);
    assert.equal(panel.style.properties["--lyric-edge-padding-top"], "90px");
    assert.equal(panel.style.properties["--lyric-edge-padding-bottom"], "150px");
  } finally {
    globalThis.performance = originalPerformance;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.getComputedStyle = originalGetComputedStyle;
  }
});

function fakePanel(count = 3) {
  const rows = Array.from({ length: count }, (_, index) => fakeRow(index));
  let scrollTop = 0;
  return {
    rows,
    clientHeight: 300,
    dataset: { activeIndex: "0" },
    appliedRuns: [],
    scrollCalls: [],
    style: {
      properties: {},
      setProperty(name, value) {
        this.properties[name] = value;
      }
    },
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value) {
      const maxScroll = Math.max(0, rows.at(-1).offsetTop + rows.at(-1).offsetHeight - this.clientHeight);
      scrollTop = Math.min(maxScroll, Math.max(0, Number(value) || 0));
    },
    querySelectorAll(selector) {
      return selector === ".lyric-line" ? rows : [];
    },
    scrollTo(options) {
      this.scrollCalls.push(options);
      const { top } = options;
      this.scrollTop = top;
    },
    markAppliedRun(run) {
      this.appliedRuns.push(run);
    }
  };
}

function fakeRow(index) {
  return {
    offsetTop: index * 80,
    offsetHeight: 60,
    dataset: { index: String(index) },
    style: {
      setProperty() {}
    }
  };
}
