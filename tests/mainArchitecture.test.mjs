import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");

test("app command source routing uses the shared commandSource module", () => {
  assert.match(mainSource, /from "\.\.\/media\/commandSource\.js"/);
  assert.doesNotMatch(mainSource, /function commandSourceIdForSnapshot/);
});

test("Bridge refresh keeps token result shape when polling fails", () => {
  assert.match(mainSource, /catch \(error\)/);
  assert.match(mainSource, /state: bridgeOfflineState\(error\)/);
  assert.match(mainSource, /selectedSourceId: ""/);
});

test("source switching starts from the rendered snapshot before remembered Bridge selection", () => {
  assert.match(mainSource, /currentSourceId:\s*latestSnapshot\.sourceId \|\| manualBridgeSourceId \|\| selectedBridgeSourceId/);
});

test("media commands schedule fresh Bridge refresh before awaiting command completion", () => {
  assert.match(mainSource, /const acceptedPromise = invokeMediaCommand/);
  assert.match(mainSource, /scheduleBridgeRefreshBurst\(command\);\s*const accepted = await acceptedPromise/s);
  assert.match(mainSource, /fresh: options\.fresh === true/);
});

test("background-only settings bypass full player rendering", () => {
  assert.match(mainSource, /isBackgroundOnlySettingsUpdate/);
  assert.match(mainSource, /applyCurrentBackground\(\);\s*return;/s);
});

test("background rendering uses the same selected media input as the player", () => {
  assert.match(
    mainSource,
    /function applyCurrentBackground\(snapshot = latestSnapshot\)\s*\{\s*if \(!app\) return;\s*applyBackgroundState\(app, deriveBackgroundState\(snapshot, settings\)\);\s*\}/s
  );
  assert.match(mainSource, /applyCurrentBackground\(snapshot\);/);
  assert.doesNotMatch(mainSource, /function currentBackgroundSnapshot/);
});

test("ordinary Bridge polling preserves a manually selected source during the hold window", () => {
  assert.match(
    mainSource,
    /preserveMissingSelected:\s*options\.preserveMissingSelected === true \|\| selectedSourceHoldUntilMs > nowMs\(\)/s
  );
});

test("Wallpaper Engine source refresh is limited to source-policy settings", () => {
  assert.match(mainSource, /hasSourcePolicySettingsUpdate/);
  assert.match(mainSource, /if \(hasSourcePolicySettingsUpdate\(properties\)\)\s*\{\s*refreshSelectedBridgeSource\(\);\s*\}/s);
});

test("command refreshes preserve the selected source through transient misses", () => {
  assert.match(mainSource, /resolveBridgeRefreshSelection/);
  assert.match(mainSource, /selectedSourceHoldUntilMs/);
  assert.match(mainSource, /preserveMissingSelected:/);
});

test("Bridge refresh path omits removed legacy source-selection hooks", () => {
  assert.doesNotMatch(mainSource, /function pollBridgeOnce/);
  assert.doesNotMatch(mainSource, /allowFallbackSelection/);
});

test("media commands pin the Bridge selection to the actual command target", () => {
  assert.match(mainSource, /manualBridgeSourceId/);
  assert.match(mainSource, /selectedBridgeSourceId = commandSourceId;/);
  assert.match(mainSource, /holdSelectedSourceForCommandRefresh\(commandSourceId\)/);
});

test("dynamic media loop does not poll large cover image src attributes", () => {
  assert.doesNotMatch(mainSource, /function updateCoverElements/);
  assert.doesNotMatch(mainSource, /getAttribute\("src"\)/);
});

test("Wallpaper Engine media callbacks are coalesced through a frame scheduler", () => {
  assert.match(mainSource, /from "\.\/renderScheduler\.js"/);
  assert.match(mainSource, /scheduleOfficialMediaUpdate/);
});

test("temporary player style toggle stays in memory and avoids persistence or source switching", () => {
  assert.match(mainSource, /let lyricsStyleOverride = null;/);
  assert.match(mainSource, /from "\.\/playerActions\.js"/);
  assert.match(mainSource, /function effectivePlayerSettings\(\)/);
  assert.match(mainSource, /lyricsStyle: lyricsStyleOverride \|\| settings\.lyricsStyle/);
  assert.match(mainSource, /derivePlayerViewModel\(snapshot, effectiveSettings,/);
  assert.match(mainSource, /mediaRenderKey\(snapshot,\s*\{\s*mode: viewModeOverride \|\| effectiveSettings\.defaultVisibility,\s*lyricsStyle: effectiveSettings\.lyricsStyle/s);
  assert.match(mainSource, /const next = nextPlayerStyleState\(/);
  assert.match(mainSource, /viewModeOverride = next\.viewModeOverride;/);
  assert.doesNotMatch(mainSource, /localStorage|sessionStorage|indexedDB/);
});

test("display mode changes are independent from player style", () => {
  assert.match(mainSource, /if \(action === "toggle-expanded"\)\s*\{\s*viewModeOverride = "expanded";\s*render\(\);/s);
  assert.doesNotMatch(mainSource, /effectivePlayerSettings\(\)\.lyricsStyle === "immersive" \? "lyrics" : "expanded"/);
});

test("active lyric index is synchronized only after lyric slot updates are applied", () => {
  const renderBody = mainSource.match(/function render\(\) \{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? "";
  assert.match(renderBody, /const activeIndex = activeLyricIndex/);
  assert.match(renderBody, /applySlotUpdates\(slots, slotUpdates\);/);
  assert.match(renderBody, /syncRenderedLyricsState\(\{ shouldRenderLyrics, lyricsUpdated: slotWasUpdated\(slotUpdates, "lyrics"\), activeIndex, snapshot \}\);/);

  const beforeSlotApplication = renderBody.slice(0, renderBody.indexOf("applySlotUpdates(slots, slotUpdates);"));
  assert.doesNotMatch(beforeSlotApplication, /latestActiveLyricIndex\s*=/);
});

test("new lyric DOM is visually synchronized before the browser can paint a stale frame", () => {
  const setupBody = mainSource.match(/function setupLyricsVisualState\(root\) \{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? "";
  assert.match(setupBody, /syncLyricVisualState\(root\);/);
  assert.doesNotMatch(setupBody, /requestAnimationFrame/);
});
