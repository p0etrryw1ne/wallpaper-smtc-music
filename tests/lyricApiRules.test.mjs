import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createConfiguredLyricProvider,
  fetchConfiguredLyrics,
  lyricProviderOrderForMedia,
  readLyricApiRules,
} from "../src/lyrics/configuredLyricProvider.js";

const LYRIC_API_RULES = JSON.parse(fs.readFileSync("config/lyrics-api-rules.json", "utf8"));

test("lyric API rules keep all external provider URLs in one config file", () => {
  const rules = LYRIC_API_RULES;
  const sourceFiles = [
    "src/lyrics/configuredLyricProvider.js",
    "src/lyrics/providerManager.js",
  ];

  assert.deepEqual(rules.commonProviders, ["lrclib", "vkeys.qq", "vkeys.netease"]);
  assert.deepEqual(rules.sourceProviders.qq.providers, ["vkeys.qq", "lrclib", "vkeys.netease"]);
  assert.deepEqual(rules.sourceProviders.netease.providers, ["vkeys.netease", "vkeys.qq", "lrclib"]);
  assert.match(rules.providerDefinitions["vkeys.qq"].searchUrl, /^https:\/\/api\.vkeys\.cn\/v2\/music\/tencent\/search\/song/);
  assert.match(rules.providerDefinitions.lrclib.url, /^https:\/\/lrclib\.net\/api\/get/);
  assert.match(fs.readFileSync("config/lyrics-api-rules.json", "utf8"), /https:\/\/api\.vkeys\.cn/);
  assert.equal(fs.existsSync("config/lyrics-api-rules.js"), false);
  assert.equal(rules.providerDefinitions["netease.web"], undefined);

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(content, /https:\/\/(?:api\.vkeys\.cn|lrclib\.net|music\.163\.com)/, `${file} should not hard-code lyric API URLs`);
  }

  const lyricSurfaces = [
    "config/lyrics-api-rules.json",
    "bridge/rust-smtc/src/lyrics.rs",
  ];
  for (const file of lyricSurfaces) {
    const content = fs.readFileSync(file, "utf8").replace(/\n#\[cfg\(test\)\][\s\S]*$/u, "");
    assert.doesNotMatch(content, /netease\.web|music\.163\.com/, `${file} should not use NetEase web endpoints`);
  }
});

test("source specific lyric provider order overrides common order", () => {
  const rules = readLyricApiRules({
    commonProviders: ["common.one", "common.two"],
    sourceProviders: {
      qq: { match: ["qqmusic"], providers: ["qq.one", "qq.two"] },
      netease: { match: ["cloudmusic"], providers: ["netease.one", "netease.two"] },
    },
    providerDefinitions: {},
  });

  assert.deepEqual(
    lyricProviderOrderForMedia({ sourceId: "QQMusic.exe" }, rules),
    ["qq.one", "qq.two"]
  );
  assert.deepEqual(
    lyricProviderOrderForMedia({ sourceId: "cloudmusic.exe" }, rules),
    ["netease.one", "netease.two"]
  );
  assert.deepEqual(
    lyricProviderOrderForMedia({ sourceId: "spotify.exe" }, rules),
    ["common.one", "common.two"]
  );
});

test("configured provider can fetch QQ lyrics through search then lyric rules", async () => {
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules: LYRIC_API_RULES,
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.includes("/tencent/search/song")) {
        return {
          ok: true,
          async json() {
            return { data: [{ id: 362520684, mid: "qq-mid", songmid: "qq-songmid" }] };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { data: { lrc: "[00:01.00]清零\n[00:02.00]司南" } };
        },
      };
    },
  });

  const result = await provider({
    sourceId: "QQMusic.exe",
    title: "清零",
    artist: "司南",
  });

  assert.match(requestedUrls[0], /^https:\/\/api\.vkeys\.cn\/v2\/music\/tencent\/search\/song\?/);
  assert.equal(requestedUrls[1], "https://api.vkeys.cn/v2/music/tencent/lyric?id=362520684");
  assert.equal(result.provider, "vkeys-qq");
  assert.deepEqual(result.lines, [
    { timeMs: 1000, text: "清零" },
    { timeMs: 2000, text: "司南" },
  ]);
});

test("configured provider picks the best search candidate instead of the first remix", async () => {
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules: {
      version: 1,
      commonProviders: ["vkeys.qq"],
      providerDefinitions: {
        "vkeys.qq": LYRIC_API_RULES.providerDefinitions["vkeys.qq"],
      },
    },
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("/tencent/search/song")) {
        return {
          ok: true,
          async json() {
            return {
              data: [
                { id: "dj-id", name: "莫妄 (DJ 阿若版)", singer: "袁莉媛", interval: "2分19秒" },
                { id: "normal-id", name: "莫妄", singer: "袁莉媛", interval: "3分26秒" },
                { id: "instrumental-id", name: "莫妄 (伴奏)", singer: "袁莉媛", interval: "3分26秒" },
              ],
            };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { data: { lrc: "[00:01.00]莫妄" } };
        },
      };
    },
  });

  const result = await provider({
    sourceId: "wallpaper-engine",
    title: "莫妄",
    artist: "袁莉媛",
    duration: 206,
  });

  assert.equal(requestedUrls[1], "https://api.vkeys.cn/v2/music/tencent/lyric?id=normal-id");
  assert.equal(result.provider, "vkeys-qq");
  assert.deepEqual(result.lines, [{ timeMs: 1000, text: "莫妄" }]);
});

test("configured provider rejects same-title candidates with a different artist and falls back", async () => {
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules: {
      version: 1,
      commonProviders: ["vkeys.qq", "vkeys.netease"],
      providerDefinitions: {
        "vkeys.qq": LYRIC_API_RULES.providerDefinitions["vkeys.qq"],
        "vkeys.netease": LYRIC_API_RULES.providerDefinitions["vkeys.netease"],
      },
    },
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("/tencent/search/song")) {
        return {
          ok: true,
          async json() {
            return {
              data: [
                { id: "wrong-qq-id", name: "游京", singer: "海伦", interval: "3分34秒" },
              ],
            };
          },
        };
      }
      if (String(url).includes("/v2/music/netease?")) {
        return {
          ok: true,
          async json() {
            return {
              data: [
                { id: "netease-id", name: "游京", artist: "7wiz" },
              ],
            };
          },
        };
      }
      if (String(url).includes("/netease/lyric")) {
        return {
          ok: true,
          async json() {
            return { data: { lrc: "[00:15.00]沉沉的暮色中" } };
          },
        };
      }
      throw new Error(`unexpected url: ${url}`);
    },
  });

  const result = await provider({
    sourceId: "wallpaper-engine",
    title: "游京",
    artist: "7Wiz",
  });

  assert.equal(result.provider, "vkeys-netease");
  assert.deepEqual(result.lines, [{ timeMs: 15000, text: "沉沉的暮色中" }]);
  assert.equal(requestedUrls.some((url) => url.includes("tencent/lyric?id=wrong-qq-id")), false);
});

test("configured provider supports array read paths without changing fallback song id paths", async () => {
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules: {
      version: 1,
      commonProviders: ["custom.array"],
      providerDefinitions: {
        "custom.array": {
          enabled: true,
          type: "search-then-lyric",
          resultProvider: "custom-array",
          searchUrl: "https://lyrics.example/search?q={query}",
          searchResultPath: ["payload", "items"],
          songIdPath: [["ids", 0], "id"],
          lyricUrl: "https://lyrics.example/lyric?id={songId}",
          lyricPath: ["payload", "lyrics", "lrc"],
        },
      },
    },
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("/search")) {
        return {
          ok: true,
          async json() {
            return {
              payload: {
                items: [
                  { ids: ["array-id"], id: "fallback-id", name: "Song", singer: "Artist" },
                ],
              },
            };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { payload: { lyrics: { lrc: "[00:01.00]array path" } } };
        },
      };
    },
  });

  const result = await provider({
    sourceId: "custom.exe",
    title: "Song",
    artist: "Artist",
  });

  assert.equal(requestedUrls[1], "https://lyrics.example/lyric?id=array-id");
  assert.equal(result.provider, "custom-array");
  assert.deepEqual(result.lines, [{ timeMs: 1000, text: "array path" }]);
});

test("default configured provider loads local JSON rules at runtime", async () => {
  const requestedUrls = [];
  const result = await fetchConfiguredLyrics({
    sourceId: "QQMusic.exe",
    title: "清零",
    artist: "司南",
  }, async (url) => {
    requestedUrls.push(String(url));
    if (String(url).includes("lyrics-api-rules.json")) {
      return {
        ok: true,
        async json() {
          return LYRIC_API_RULES;
        },
      };
    }
    if (String(url).includes("/tencent/search/song")) {
      return {
        ok: true,
        async json() {
          return { data: [{ mid: "qq-mid" }] };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { data: { lrc: "[00:01.00]清零" } };
      },
    };
  });

  assert.equal(requestedUrls.some((url) => url.includes("lyrics-api-rules.json")), true);
  assert.equal(result.provider, "vkeys-qq");
  assert.deepEqual(result.lines, [{ timeMs: 1000, text: "清零" }]);
});

test("configured provider lets users add another player source with the same format", async () => {
  const rules = readLyricApiRules({
    commonProviders: ["lrclib"],
    sourceProviders: {
      spotify: {
        match: ["spotify"],
        providers: ["custom.spotify", "lrclib"],
      },
    },
    providerDefinitions: {
      "custom.spotify": {
        enabled: true,
        type: "direct-text",
        url: "https://lyrics.example/spotify?title={title}&artist={artist}&source={sourceId}",
      },
      lrclib: {
        enabled: true,
        type: "direct-text",
        url: "https://lyrics.example/common?title={title}",
      },
    },
  });
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules,
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        headers: new Map([["content-type", "text/plain"]]),
        async text() {
          return "[00:03.00]custom";
        },
      };
    },
  });

  const result = await provider({
    sourceId: "Spotify.exe",
    title: "Song A",
    artist: "Artist B",
  });

  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls[0], "https://lyrics.example/spotify?title=Song%20A&artist=Artist%20B&source=Spotify.exe");
  assert.equal(result.provider, "custom.spotify");
  assert.deepEqual(result.lines, [{ timeMs: 3000, text: "custom" }]);
});

test("configured provider can time out a stalled source and try the next source", async () => {
  const rules = readLyricApiRules({
    sourceProviders: {
      netease: {
        match: ["cloudmusic"],
        providers: ["slow.netease", "fast.fallback"],
      },
    },
    providerDefinitions: {
      "slow.netease": {
        enabled: true,
        type: "direct-json",
        resultProvider: "slow",
        url: "https://slow.example/lyrics",
        lyricPath: "syncedLyrics",
        timeoutMs: 20,
      },
      "fast.fallback": {
        enabled: true,
        type: "direct-text",
        resultProvider: "fast",
        url: "https://fast.example/lyrics",
      },
    },
  });
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules,
    fetchImpl: async (url, options = {}) => {
      requestedUrls.push(String(url));
      if (options.signal?.aborted) {
        throw new Error("request signal already aborted");
      }
      if (String(url).includes("slow.example")) {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
      return {
        ok: true,
        async text() {
          return "[00:01.00]fallback lyric";
        },
      };
    },
  });

  const result = await provider({
    sourceId: "cloudmusic.exe",
    title: "Song",
    artist: "Artist",
  }, { signal: AbortSignal.timeout(200) });

  assert.deepEqual(requestedUrls, ["https://slow.example/lyrics", "https://fast.example/lyrics"]);
  assert.equal(result.provider, "fast");
  assert.deepEqual(result.lines, [{ timeMs: 1000, text: "fallback lyric" }]);
});

test("configured provider binds the default fetch implementation to globalThis", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = function defaultHostFetch() {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve({
        ok: true,
        async json() {
          return { syncedLyrics: "[00:01.00]host fetch works" };
        },
      });
    };

    const provider = createConfiguredLyricProvider({
      rules: {
        version: 1,
        commonProviders: ["host"],
        providerDefinitions: {
          host: {
            enabled: true,
            type: "direct-json",
            resultProvider: "host",
            url: "https://example.test/lyrics?title={title}",
            lyricPath: "syncedLyrics",
          },
        },
      },
    });

    const result = await provider({ title: "Song", artist: "Artist" });

    assert.equal(result.provider, "host");
    assert.deepEqual(result.lines, [{ timeMs: 1000, text: "host fetch works" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
