import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("lyrics remain visible before visual state is calculated", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /lyrics-panel:not\(\[data-visual-ready="true"\]\)\s+\.lyric-line\s*\{[^}]*opacity\s*:\s*0/s);
});

test("lyric rows have transition fallback for visual state changes", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const lyricRule = css.match(/\.lyric-line\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.match(lyricRule, /transition\s*:/);
  assert.match(lyricRule, /opacity/);
  assert.match(lyricRule, /filter/);
});

test("JS-owned lyric animation disables CSS transition lag while animating", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const animatingRule = css.match(/\.lyrics-panel\[data-visual-animating="true"\]\s+\.lyric-line\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.match(animatingRule, /transition:\s*none/);
});

test("reduced motion disables expanded and compact title marquee", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const reducedMotionBlock = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(?<body>[\s\S]+?)\n\}/)?.groups?.body ?? "";

  assert.match(reducedMotionBlock, /\.track-title\[data-scroll="true"\]/);
  assert.match(reducedMotionBlock, /\.mini-title\[data-scroll="true"\]/);
});

test("title marquee starts immediately instead of showing a clipped title first", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const marqueeRule = css.match(/\.track-title\[data-scroll="true"\],\s*\n\.mini-title\[data-scroll="true"\]\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.doesNotMatch(marqueeRule, /animation-delay\s*:/);
});

test("scrolling title is block flex so it starts from the left edge of its mask", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const marqueeRule = css.match(/\.track-title\[data-scroll="true"\],\s*\n\.mini-title\[data-scroll="true"\]\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.match(marqueeRule, /display:\s*flex/);
  assert.doesNotMatch(marqueeRule, /display:\s*inline-flex/);
});

test("expanded artist line is constrained to one stable row", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const artistRule = css.match(/\.track-artist\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.match(artistRule, /max-width:\s*100%/);
  assert.match(artistRule, /overflow:\s*hidden/);
  assert.match(artistRule, /white-space:\s*nowrap/);
  assert.match(artistRule, /text-overflow:\s*ellipsis/);
});

test("lyrics panel does not use browser smooth scrolling", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const panelRule = css.match(/(?:^|\n)\.lyrics-panel\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.doesNotMatch(panelRule, /scroll-behavior:\s*smooth/);
});

test("lyrics panel extends to screen edges instead of clipping inside a short viewport", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const panelRule = css.match(/(?:^|\n)\.lyrics-panel\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.match(panelRule, /top:\s*0/);
  assert.match(panelRule, /bottom:\s*0/);
  assert.match(panelRule, /height:\s*auto/);
  assert.doesNotMatch(panelRule, /86vh/);
  assert.doesNotMatch(panelRule, /max-height\s*:/);
});

test("compact player uses a taskbar-safe bottom offset independent from full player layout", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const rootRule = css.match(/:root\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";
  const compactRule = css.match(/(?:^|\n)\.compact-player\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.match(rootRule, /--compact-safe-bottom:/);
  assert.match(compactRule, /bottom:\s*var\(--compact-safe-bottom\)/);
});

test("lyrics view only translates the standard player instead of resizing player internals", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const forbiddenInternalOverrides = [
    /\.wallpaper\[data-view="lyrics"\]\s+\.album-cover-button\s*\{/,
    /\.wallpaper\[data-view="lyrics"\]\s+\.progress-slot\s*\{/,
    /\.wallpaper\[data-view="lyrics"\]\s+\.transport-controls\s*\{/,
    /\.wallpaper\[data-view="lyrics"\]\s+\.transport-button\s*\{/
  ];

  for (const pattern of forbiddenInternalOverrides) {
    assert.doesNotMatch(css, pattern);
  }

  const lyricsShellRule = css.match(/\.wallpaper\[data-view="lyrics"\]\s+\.player-shell\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";
  assert.match(lyricsShellRule, /left:\s*var\(--lyrics-player-center-x\)/);
  assert.doesNotMatch(lyricsShellRule, /width\s*:/);
});

test("immersive lyrics player has its own larger scale variables", () => {
  const css = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const rootRule = css.match(/:root\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";
  const shellRule = css.match(/\.player-shell--immersive\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";
  const immersiveCoverRule = css.match(/\.player-shell--immersive\s+\.album-cover-button\s*\{(?<body>[^}]+)\}/s)?.groups?.body ?? "";

  assert.match(rootRule, /--immersive-art-size:/);
  assert.match(rootRule, /--immersive-player-top:/);
  assert.match(shellRule, /top:\s*var\(--immersive-player-top\)/);
  assert.match(shellRule, /width:\s*min\(max\(var\(--player-width\),\s*var\(--immersive-art-size\)\),\s*calc\(100vw\s*-\s*\(var\(--screen-pad-x\)\s*\*\s*2\)\)\)/);
  assert.match(immersiveCoverRule, /width:\s*var\(--immersive-art-size\)/);
});
