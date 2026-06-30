import test from "node:test";
import assert from "node:assert/strict";
import { renderLyrics } from "../src/lyrics/renderLyrics.js";

test("renders stable lyric markup independent of the active line", () => {
  const html = renderLyrics(
    [
      { timeMs: 1000, text: "第一句" },
      { timeMs: 3000, text: "第二句" },
      { timeMs: 5000, text: "第三句" }
    ],
    1
  );
  const nextHtml = renderLyrics(
    [
      { timeMs: 1000, text: "第一句" },
      { timeMs: 3000, text: "第二句" },
      { timeMs: 5000, text: "第三句" }
    ],
    2
  );

  assert.match(html, /class="lyrics-panel"/);
  assert.match(html, /data-active-index="-1"/);
  assert.equal((html.match(/data-visual-active="true"/g) || []).length, 0);
  assert.equal((html.match(/is-active/g) || []).length, 0);
  assert.match(html, /第一句/);
  assert.match(html, /第二句/);
  assert.match(html, /第三句/);
  assert.equal(nextHtml, html);
});

test("renders lyric rows without active-line visual styles before runtime measurement", () => {
  const html = renderLyrics(
    [
      { timeMs: 1000, text: "上一句" },
      { timeMs: 3000, text: "当前句" },
      { timeMs: 5000, text: "下一句" }
    ],
    1
  );

  assert.match(html, /data-visual-ready="false"/);
  assert.doesNotMatch(html, /--lyric-opacity:/);
  assert.doesNotMatch(html, /--lyric-blur:/);
});

test("escapes lyric text", () => {
  const html = renderLyrics([{ timeMs: 0, text: "<b>A & B</b>" }], 0);
  assert.match(html, /&lt;b&gt;A &amp; B&lt;\/b&gt;/);
});

test("renders a stable loading placeholder instead of blank lyrics", () => {
  const html = renderLyrics([], -1, { loading: true });

  assert.match(html, /class="lyrics-panel lyrics-panel--loading"/);
  assert.match(html, /data-lyrics-loading="true"/);
  assert.match(html, /歌词加载中/);
});
