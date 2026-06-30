import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createDefaultSettings } from "../src/settings/settingsStore.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

test("settings schema is the canonical list of public Wallpaper Engine controls", () => {
  const schema = readJson("config/settings.schema.json");
  const project = readJson("project.json");
  const projectProperties = project.general.properties;
  const defaultSettings = createDefaultSettings();
  const schemaProperties = schema.properties;
  const schemaNames = Object.keys(schemaProperties);

  assert.deepEqual(schemaNames, Object.keys(defaultSettings));
  assert.deepEqual(schemaNames, Object.keys(projectProperties).filter((name) => !name.startsWith("section")));

  for (const name of schemaNames) {
    const setting = schemaProperties[name];
    const projectSetting = projectProperties[name];

    assert.equal(projectSetting.text, setting.text, `${name} text`);
    assert.equal(projectSetting.type, setting.we.type, `${name} WE type`);
    assert.equal(projectSetting.value, setting.default, `${name} project default`);
    assert.equal(defaultSettings[name], setting.default, `${name} JS default`);

    if (setting.we.fileType) {
      assert.equal(projectSetting.fileType, setting.we.fileType, `${name} file type`);
    }
    if (Array.isArray(setting.options)) {
      assert.deepEqual(projectSetting.options, setting.options, `${name} options`);
    }
    if (Number.isFinite(setting.min)) {
      assert.equal(projectSetting.min, setting.min, `${name} min`);
    }
    if (Number.isFinite(setting.max)) {
      assert.equal(projectSetting.max, setting.max, `${name} max`);
    }
  }
});

test("resource and lyric provider manifests document packaged assets and network providers", () => {
  const assets = readJson("assets/manifest.json");
  const providers = readJson("config/lyrics-providers.json");
  const rules = readJson("config/lyrics-api-rules.json");
  const project = readJson("project.json");

  assert.equal(providers.runtime, false);
  assert.equal(providers.note, "这是在线歌词来源审计清单，不是运行时排序配置；运行时 API 地址、媒体源匹配和优先级在 config/lyrics-api-rules.json 中统一配置。");
  assert.equal(rules.version, 1);
  assert.deepEqual(rules.commonProviders, ["lrclib", "vkeys.qq", "vkeys.netease"]);
  assert.deepEqual(rules.sourceProviders.qq.providers, ["vkeys.qq", "lrclib", "vkeys.netease"]);
  assert.deepEqual(rules.sourceProviders.netease.providers, ["vkeys.netease", "vkeys.qq", "lrclib"]);
  assert.deepEqual(providers.fieldNotes, {
    surface: "该歌词源由网页端、Bridge 本地服务或二者共同调用。",
    domains: "可能访问的本机地址或外部域名。",
    sends: "查询歌词时可能发送的媒体字段。",
    sourceHints: "适合优先尝试该歌词源的媒体 sourceId 关键词。",
    risk: "发布到创意工坊前需要关注的隐私、合规或稳定性风险。"
  });

  for (const assetPath of [
    project.preview,
    project.general.properties.customWallpaper.value,
    "bridge/rust-smtc/assets/icon.ico"
  ]) {
    assert.ok(assets.assets[assetPath], `${assetPath} is documented`);
    assert.ok(fs.existsSync(assetPath), `${assetPath} exists`);
    assert.equal(typeof assets.assets[assetPath].license, "string");
    assert.equal(typeof assets.assets[assetPath].redistributionRisk, "string");
  }

  assert.equal(providers.providers.netease, undefined);
  for (const provider of ["bridge", "vkeys", "lrclib"]) {
    assert.ok(providers.providers[provider], `${provider} provider is documented`);
    assert.ok(Array.isArray(providers.providers[provider].domains), `${provider} domains`);
    assert.ok(Array.isArray(providers.providers[provider].sends), `${provider} sent fields`);
    assert.equal(typeof providers.providers[provider].defaultEnabled, "boolean");
    assert.equal(typeof providers.providers[provider].risk, "string");
  }
});
