import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("release package script keeps docs and tests out of copied payload", () => {
  const script = fs.readFileSync("scripts/package-release.ps1", "utf8");

  assert.match(script, /project\.json/);
  assert.match(script, /preview/);
  assert.match(script, /index\.html/);
  assert.match(script, /LICENSE/);
  assert.match(script, /workshop-readme\.md/);
  assert.doesNotMatch(script, /PRIVACY\.md/);
  assert.doesNotMatch(script, /THIRD_PARTY\.md/);
  assert.doesNotMatch(script, /SECURITY\.md/);
  assert.match(script, /assets/);
  assert.match(script, /manifest\.json/);
  assert.match(script, /New-Item[^\n]+\$configTarget/);
  assert.match(script, /lyrics-api-rules\.json/);
  assert.doesNotMatch(script, /Copy-Item[^\n]+"config"[^\n]+-Recurse/);
  assert.doesNotMatch(script, /lyrics-api-rules\.js(?!on)/);
  assert.doesNotMatch(script, /settings\.schema\.json/);
  assert.doesNotMatch(script, /lyrics-providers\.json/);
  assert.match(script, /src/);
  assert.doesNotMatch(script, /Copy-Item[^\n]+"tools"/);
  assert.doesNotMatch(script, /start-bridge\.cmd/);
  assert.doesNotMatch(script, /stop-bridge\.cmd/);
  assert.doesNotMatch(script, /Copy-Item[^\n]+tests/);
  assert.doesNotMatch(script, /Copy-Item[^\n]+"docs"[^\n]+-Recurse/);
  assert.doesNotMatch(script, /assets"[^\n]+-Recurse/);
  assert.doesNotMatch(script, /target\/debug/);
});

test("release package script copies the preview referenced by project json", () => {
  const script = fs.readFileSync("scripts/package-release.ps1", "utf8");

  assert.match(script, /ReadAllText/);
  assert.match(script, /Encoding\]::UTF8/);
  assert.match(script, /ConvertFrom-Json/);
  assert.match(script, /\$project\.preview/);
  assert.match(script, /Copy-Item[^\n]+\$previewSource/);
});

test("release package script rejects output paths outside repository", () => {
  const script = fs.readFileSync("scripts/package-release.ps1", "utf8");

  assert.match(script, /repoFullPathWithSeparator/);
  assert.match(script, /OrdinalIgnoreCase/);
  assert.doesNotMatch(script, /GetRelativePath/);
});

test("release package script leaves Bridge exe out of the Wallpaper Engine package", () => {
  const script = fs.readFileSync("scripts/package-release.ps1", "utf8");

  assert.match(script, /bridge\/README\.md/);
  assert.doesNotMatch(script, /AllowStaleBridge/);
  assert.doesNotMatch(script, /Bridge release exe is missing/);
  assert.doesNotMatch(script, /Copy-Item[^\n]+\$releaseBridge/);
  assert.doesNotMatch(script, /WallpaperMusicBridge\.exe/);
  assert.doesNotMatch(script, /wallpaper-music-bridge-poc\.exe/);
});
