import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Wallpaper Engine project exposes only first-version settings", () => {
  const project = JSON.parse(fs.readFileSync("project.json", "utf8"));
  const properties = project.general.properties;
  const propertyNames = Object.keys(properties);

  assert.equal(project.title, "Wallpaper SMTC Music");
  assert.equal(project.preview, "preview.gif");
  assert.equal(project.type, "web");
  assert.equal(project.file, "index.html");
  assert.deepEqual(propertyNames.filter((name) => !name.startsWith("section")), [
    "enablePlayer",
    "defaultVisibility",
    "hideWhenNoMedia",
    "lyricsStyle",
    "showLyrics",
    "enableOnlineLyrics",
    "enableCoverBackground",
    "customWallpaper",
    "customWallpaperBlur",
    "coverBackgroundBlur",
    "backgroundDim",
    "lowPrioritySources",
    "blockedSources"
  ]);

  for (const legacyName of [
    "enableHelper",
    "enableHelperTransport",
    "enableHelperVolume",
    "enableLyricsSync",
    "mediaSourceMode",
    "controlMode",
    "preferMusicApps"
  ]) {
    assert.equal(Object.hasOwn(properties, legacyName), false);
  }
});

test("background settings use a cover-background switch and independent blur sliders", () => {
  const project = JSON.parse(fs.readFileSync("project.json", "utf8"));
  const properties = project.general.properties;

  assert.equal(properties.enableCoverBackground.text, "启用封面背景");
  assert.equal(properties.enableCoverBackground.type, "bool");
  assert.equal(properties.enableCoverBackground.value, false);
  assert.equal(properties.customWallpaperBlur.text, "自定义壁纸模糊强度");
  assert.equal(properties.customWallpaperBlur.type, "slider");
  assert.equal(properties.customWallpaperBlur.value, 0);
  assert.equal(properties.coverBackgroundBlur.text, "封面背景模糊强度");
  assert.equal(properties.coverBackgroundBlur.type, "slider");
  assert.equal(properties.coverBackgroundBlur.value, 64);
  assert.equal(Object.hasOwn(properties, "backgroundMode"), false);
  assert.equal(Object.hasOwn(properties, "backgroundBlur"), false);
});

test("player style setting lives under player section with simple A/B labels", () => {
  const project = JSON.parse(fs.readFileSync("project.json", "utf8"));
  const properties = project.general.properties;
  const style = properties.lyricsStyle;

  assert.equal(style.text, "播放器样式");
  assert.deepEqual(style.options, [
    { label: "样式A", value: "standard" },
    { label: "样式B", value: "immersive" }
  ]);
  assert.ok(style.index > properties.defaultVisibility.index);
  assert.ok(style.index < properties.sectionLyrics.index);
});

test("setting sections include user-facing explanatory notes", () => {
  const project = JSON.parse(fs.readFileSync("project.json", "utf8"));
  const schema = JSON.parse(fs.readFileSync("config/settings.schema.json", "utf8"));
  const properties = project.general.properties;

  const expectedNotes = {
    sectionPlaybackNote: "点击封面、歌名等壁纸交互只在当前运行期间临时切换，不会写回 Wallpaper Engine 设置。",
    sectionLyricsNote: "在线歌词查询会向歌词服务发送歌名、歌手等信息；关闭后不主动请求在线歌词。",
    sectionBackgroundNote: "启用封面背景时，有封面优先使用封面；无音源时回退到自定义壁纸。两个模糊强度分别控制自定义壁纸和封面背景。",
    sectionMediaSourcesNote: "媒体源规则仅在 Bridge 服务可用时生效。关键词按 sourceId 子串匹配，逗号、分号或换行分隔，大小写不敏感；低优先级源只在没有普通源时显示，屏蔽源始终隐藏。"
  };

  for (const [name, text] of Object.entries(expectedNotes)) {
    assert.equal(properties[name].type, "text", `${name} type`);
    assert.equal(properties[name].value, false, `${name} value`);
    assert.equal(properties[name].text, `<small>${text}</small>`, `${name} text`);
  }

  assert.deepEqual(schema.categoryNotes, {
    player: expectedNotes.sectionPlaybackNote,
    lyrics: expectedNotes.sectionLyricsNote,
    background: expectedNotes.sectionBackgroundNote,
    mediaSources: expectedNotes.sectionMediaSourcesNote
  });
});
