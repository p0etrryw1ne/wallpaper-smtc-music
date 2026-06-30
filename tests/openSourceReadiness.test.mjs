import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

test("repository has public open-source metadata", () => {
  const license = read("LICENSE");
  const readme = read("README.md");
  const pkg = readJson("package.json");
  const cargo = read("bridge/rust-smtc/Cargo.toml");

  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 p0etrryw1ne/);
  assert.equal(pkg.license, "MIT");
  assert.match(cargo, /^license = "MIT"$/m);
  assert.doesNotMatch(cargo, /wallpaper-music-bridge-poc/);
  assert.match(readme, /LICENSE/);
  assert.match(readme, /SECURITY\.md/);
  assert.match(readme, /THIRD_PARTY\.md/);
  assert.match(readme, /PRIVACY\.md/);
});

test("security, privacy, and third-party docs cover release risks", () => {
  const security = read("SECURITY.md");
  const privacy = read("PRIVACY.md");
  const thirdParty = read("THIRD_PARTY.md");

  assert.match(security, /127\.0\.0\.1:18768/);
  assert.match(security, /GitHub Security Advisories/);
  assert.match(privacy, /api\.vkeys\.cn/);
  assert.match(privacy, /lrclib\.net/);
  assert.doesNotMatch(privacy, /music\.163\.com/);
  assert.match(thirdParty, /doc\.vkeys\.cn/);
  assert.match(thirdParty, /luoyue712\/api-doc/);
  assert.match(thirdParty, /LRCLIB|lrclib\.net/);
  assert.doesNotMatch(thirdParty, /music\.163\.com/);
  assert.match(thirdParty, /assets\/default\.png/);
  assert.match(thirdParty, /未知/);
  assert.match(thirdParty, /cargo-deny|cargo about|cargo-about/);
});
