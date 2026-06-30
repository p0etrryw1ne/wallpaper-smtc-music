import test from "node:test";
import assert from "node:assert/strict";
import { applySourcePolicy, normalizeSourceList } from "../src/bridge/sourcePolicy.js";

test("removes blocked sources", () => {
  const result = applySourcePolicy(
    [{ sourceId: "edge" }, { sourceId: "QQMusic.exe" }],
    { blockedSources: ["edge"], lowPrioritySources: [] }
  );

  assert.deepEqual(result.map((source) => source.sourceId), ["QQMusic.exe"]);
});

test("hides low priority sources while normal sources are available", () => {
  const result = applySourcePolicy(
    [{ sourceId: "edge" }, { sourceId: "cloudmusic.exe" }],
    { blockedSources: [], lowPrioritySources: ["edge"] }
  );

  assert.deepEqual(result.map((source) => source.sourceId), ["cloudmusic.exe"]);
});

test("keeps low priority sources when no normal source is available", () => {
  const result = applySourcePolicy(
    [{ sourceId: "edge" }, { sourceId: "chrome.exe" }],
    { blockedSources: [], lowPrioritySources: ["edge", "chrome"] }
  );

  assert.deepEqual(result.map((source) => source.sourceId), ["edge", "chrome.exe"]);
});

test("matches source ids case-insensitively and supports Rust snake case", () => {
  const result = applySourcePolicy(
    [{ source_id: "QQMusic.exe" }, { source_id: "cloudmusic.exe" }],
    { blockedSources: ["qqmusic"], lowPrioritySources: [] }
  );

  assert.deepEqual(result.map((source) => source.source_id), ["cloudmusic.exe"]);
});

test("normalizes source lists from strings, arrays, and empty values", () => {
  assert.deepEqual(normalizeSourceList(" Edge; CHROME\nfirefox, brave "), ["edge", "chrome", "firefox", "brave"]);
  assert.deepEqual(normalizeSourceList([" Edge ", "CHROME", "", null, "firefox"]), ["edge", "chrome", "firefox"]);
  assert.deepEqual(normalizeSourceList(null), []);
});
