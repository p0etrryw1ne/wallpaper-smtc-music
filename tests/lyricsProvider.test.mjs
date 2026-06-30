import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fetchBridgeLyrics } from "../src/lyrics/providers/bridgeProvider.js";
import { createConfiguredLyricProvider } from "../src/lyrics/configuredLyricProvider.js";
import { createLyricProviderManager, lyricCacheKey } from "../src/lyrics/providerManager.js";

const LYRIC_API_RULES = JSON.parse(fs.readFileSync("config/lyrics-api-rules.json", "utf8"));

function lyricRules() {
  return LYRIC_API_RULES;
}

test("LRCLIB provider requests lyrics by track metadata", async () => {
  let requestedUrl = "";
  const provider = createConfiguredLyricProvider({
    rules: lyricRules(),
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        async json() {
          return {
            syncedLyrics: "[00:01.00]第一句",
            plainLyrics: "第一句",
          };
        },
      };
    },
  });
  const result = await provider(
    {
      sourceId: "spotify.exe",
      title: "Song",
      artist: "Artist",
      album: "Album",
      timeline: { duration: 120 },
    }
  );

  assert.match(requestedUrl, /^https:\/\/lrclib\.net\/api\/get\?/);
  assert.match(requestedUrl, /track_name=Song/);
  assert.match(requestedUrl, /artist_name=Artist/);
  assert.match(requestedUrl, /album_name=Album/);
  assert.match(requestedUrl, /duration=120/);
  assert.equal(result.syncedLyrics, "[00:01.00]第一句");
  assert.equal(result.lines[0].timeMs, 1000);
});

test("LRCLIB provider returns null when required media identity is missing", async () => {
  const provider = createConfiguredLyricProvider({
    rules: lyricRules(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  const result = await provider({ title: "", artist: "Artist" });

  assert.equal(result, null);
});

test("Bridge provider requests local lyrics and parses synced result", async () => {
  let requestedUrl = "";
  const result = await fetchBridgeLyrics(
    {
      sourceId: "cloudmusic.exe",
      title: "前尘愿",
      artist: "一七音乐",
      timeline: { duration: 271.7 },
    },
    async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            provider: "netease",
            synced_lyrics: "[00:09.06]前尘愿\n[00:35.37]制作人：君妄邪",
          };
        },
      };
    }
  );

  assert.match(requestedUrl, /^http:\/\/127\.0\.0\.1:18768\/v1\/lyrics\?/);
  assert.equal(new URL(requestedUrl).searchParams.get("source_id"), "cloudmusic.exe");
  assert.equal(result.provider, "netease");
  assert.deepEqual(result.lines, [
    { timeMs: 9060, text: "前尘愿" },
    { timeMs: 35370, text: "制作人：君妄邪" },
  ]);
});

test("lyric provider manager caches by source title and artist", async () => {
  let calls = 0;
  const manager = createLyricProviderManager({
    provider: async () => {
      calls += 1;
      return { lines: [{ timeMs: 0, text: "cached" }] };
    },
  });

  const media = { sourceId: "qq", title: "Song", artist: "Artist" };
  const first = await manager.fetchLyrics(media);
  const second = await manager.fetchLyrics(media);

  assert.equal(calls, 1);
  assert.equal(first, second);
});

test("lyric provider manager separates same title lyrics by album and explicit rounded duration", async () => {
  let calls = 0;
  const manager = createLyricProviderManager({
    provider: async (media) => {
      calls += 1;
      return { lines: [{ timeMs: 0, text: `${media.album}:${Math.round(media.duration)}` }] };
    },
  });

  const first = await manager.fetchLyrics({
    sourceId: "qq",
    title: "Song",
    artist: "Artist",
    album: "Album A",
    duration: 180.4,
  });
  const second = await manager.fetchLyrics({
    sourceId: "qq",
    title: "Song",
    artist: "Artist",
    album: "Album B",
    duration: 180.4,
  });
  const third = await manager.fetchLyrics({
    sourceId: "qq",
    title: "Song",
    artist: "Artist",
    album: "Album B",
    duration: 240.1,
  });

  assert.equal(calls, 3);
  assert.equal(first.lines[0].text, "Album A:180");
  assert.equal(second.lines[0].text, "Album B:180");
  assert.equal(third.lines[0].text, "Album B:240");
});

test("lyric cache key includes known timeline duration so late timeline updates can refresh lyrics", () => {
  assert.equal(
    lyricCacheKey({ sourceId: "qq", title: "Song", artist: "Artist", album: "Album" }),
    "qq|song|artist|album|"
  );
  assert.equal(
    lyricCacheKey({
      sourceId: "qq",
      title: "Song",
      artist: "Artist",
      album: "Album",
      timeline: { status: "unknown", duration: 181 },
    }),
    "qq|song|artist|album|"
  );
  assert.equal(
    lyricCacheKey({
      sourceId: "qq",
      title: "Song",
      artist: "Artist",
      album: "Album",
      timeline: { status: "known", duration: 180.4 },
    }),
    "qq|song|artist|album|180"
  );
});

test("lyric cache key includes explicit rounded media duration", () => {
  assert.equal(
    lyricCacheKey({
      sourceId: "qq",
      title: "Song",
      artist: "Artist",
      album: "Album",
      duration: 180.4,
    }),
    "qq|song|artist|album|180"
  );
  assert.equal(
    lyricCacheKey({
      sourceId: "qq",
      title: "Song",
      artist: "Artist",
      album: "Album",
      duration: 180.49,
    }),
    "qq|song|artist|album|180"
  );
});

test("lyric provider manager tries later providers when an earlier provider misses", async () => {
  const manager = createLyricProviderManager({
    providers: [
      async () => null,
      async () => ({ provider: "fallback", lines: [{ timeMs: 0, text: "ok" }] }),
    ],
  });

  const result = await manager.fetchLyrics({ sourceId: "qq", title: "Song", artist: "Artist" });

  assert.equal(result.provider, "fallback");
  assert.equal(result.lines[0].text, "ok");
});

test("default lyric provider manager prefers configured APIs over Bridge lyrics", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).includes("lyrics-api-rules.json")) {
      return {
        ok: true,
        async json() {
          return LYRIC_API_RULES;
        },
      };
    }

    if (String(url).startsWith("http://127.0.0.1:18768/v1/lyrics")) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            provider: "bridge",
            synced_lyrics: "[00:42.96]Bridge 版本",
          };
        },
      };
    }

    if (String(url).includes("/tencent/search/song")) {
      return {
        ok: true,
        async json() {
          return {
            code: 200,
            data: [
              { id: "configured-id", name: "浮生散尽", singer: "蔡明希-不才", interval: "4分3秒" },
            ],
          };
        },
      };
    }

    if (String(url).includes("/tencent/lyric")) {
      return {
        ok: true,
        async json() {
          return {
            code: 200,
            data: {
              lrc: "[00:18.09]配置版本",
            },
          };
        },
      };
    }

    throw new Error(`unexpected url: ${url}`);
  };

  try {
    const manager = createLyricProviderManager();
    const result = await manager.fetchLyrics({
      sourceId: "QQMusic.exe",
      title: "浮生散尽",
      artist: "不才",
      duration: 243,
    });

    assert.equal(result.provider, "vkeys-qq");
    assert.deepEqual(result.lines, [{ timeMs: 18090, text: "配置版本" }]);
    assert.equal(requestedUrls.some((url) => url.startsWith("http://127.0.0.1:18768/v1/lyrics")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lyric provider manager tries later providers when an earlier provider throws", async () => {
  const manager = createLyricProviderManager({
    providers: [
      async () => {
        throw new Error("network failed");
      },
      async () => ({ provider: "fallback", lines: [{ timeMs: 0, text: "ok" }] }),
    ],
  });

  const result = await manager.fetchLyrics({ sourceId: "qq", title: "Song", artist: "Artist" });

  assert.equal(result.provider, "fallback");
  assert.equal(result.lines[0].text, "ok");
});

test("lyric provider manager times out stalled providers and tries later providers", async () => {
  const manager = createLyricProviderManager({
    providerTimeoutMs: 10,
    providers: [
      async () => new Promise(() => {}),
      async () => ({ provider: "fallback", lines: [{ timeMs: 0, text: "ok" }] }),
    ],
  });

  const result = await Promise.race([
    manager.fetchLyrics({ sourceId: "qq", title: "Song", artist: "Artist" }),
    new Promise((resolve) => setTimeout(() => resolve("timed out"), 80))
  ]);

  assert.notEqual(result, "timed out");
  assert.equal(result.provider, "fallback");
  assert.equal(result.lines[0].text, "ok");
});

test("lyric provider manager aborts timed out providers", async () => {
  let aborted = false;
  const manager = createLyricProviderManager({
    providerTimeoutMs: 10,
    providers: [
      async (_media, options = {}) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
      async () => ({ provider: "fallback", lines: [{ timeMs: 0, text: "ok" }] }),
    ],
  });

  const result = await manager.fetchLyrics({ sourceId: "qq", title: "Song", artist: "Artist" });

  assert.equal(aborted, true);
  assert.equal(result.provider, "fallback");
});

test("lyric provider manager retries after all providers throw", async () => {
  let calls = 0;
  const manager = createLyricProviderManager({
    provider: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary network failure");
      return { provider: "retry", lines: [{ timeMs: 0, text: "found" }] };
    },
  });

  const media = { sourceId: "qq", title: "Song", artist: "Artist" };
  const first = await manager.fetchLyrics(media);
  const second = await manager.fetchLyrics(media);

  assert.equal(first, null);
  assert.equal(second.provider, "retry");
  assert.equal(calls, 2);
});

test("lyric provider manager exposes temporary failures separately from missing lyrics", async () => {
  const manager = createLyricProviderManager({
    provider: async () => {
      throw new Error("temporary network failure");
    },
  });

  const result = await manager.fetchLyricsResult({ sourceId: "qq", title: "Song", artist: "Artist" });

  assert.equal(result.value, null);
  assert.equal(result.temporaryFailure, true);
});

test("lyric provider manager exposes definitive missing lyrics as non-temporary", async () => {
  let calls = 0;
  const manager = createLyricProviderManager({
    provider: async () => {
      calls += 1;
      return null;
    },
  });

  const media = { sourceId: "qq", title: "Song", artist: "Artist" };
  const first = await manager.fetchLyricsResult(media);
  const second = await manager.fetchLyricsResult(media);

  assert.equal(first.value, null);
  assert.equal(first.temporaryFailure, false);
  assert.equal(second.value, null);
  assert.equal(second.temporaryFailure, false);
  assert.equal(calls, 1);
});

test("lyric provider manager caches missing lyrics to avoid repeated lookups", async () => {
  let calls = 0;
  const manager = createLyricProviderManager({
    provider: async () => {
      calls += 1;
      return calls === 1 ? null : { provider: "retry", lines: [{ timeMs: 0, text: "found" }] };
    },
  });

  const media = { sourceId: "qq", title: "Song", artist: "Artist" };
  const first = await manager.fetchLyrics(media);
  const second = await manager.fetchLyrics(media);

  assert.equal(first, null);
  assert.equal(second, null);
  assert.equal(calls, 1);
});

test("VKeys provider searches QQ Music and fetches synced lyrics", async () => {
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules: lyricRules(),
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.includes("/tencent/search/song")) {
        return {
          ok: true,
          async json() {
            return {
              code: 200,
              data: [
                { id: "qq-id", mid: "qq-mid", songmid: "qq-songmid", name: "清零", singer: "司南" },
              ],
            };
          },
        };
      }

      return {
        ok: true,
        async json() {
          return {
            code: 200,
            data: {
              lrc: "[00:01.00]清零\n[00:02.00]司南",
            },
          };
        },
      };
    },
  });
  const result = await provider({
    sourceId: "QQMusic.exe",
    title: "清零",
    artist: "司南",
    duration: 240,
  });

  assert.match(requestedUrls[0], /^https:\/\/api\.vkeys\.cn\/v2\/music\/tencent\/search\/song\?/);
  assert.match(requestedUrls[1], /^https:\/\/api\.vkeys\.cn\/v2\/music\/tencent\/lyric\?/);
  assert.equal(result.provider, "vkeys-qq");
  assert.deepEqual(result.lines, [
    { timeMs: 1000, text: "清零" },
    { timeMs: 2000, text: "司南" },
  ]);
});

test("VKeys provider searches Netease and fetches synced lyrics", async () => {
  const requestedUrls = [];
  const provider = createConfiguredLyricProvider({
    rules: lyricRules(),
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.includes("/v2/music/netease?")) {
        return {
          ok: true,
          async json() {
            return {
              code: 200,
              data: [
                { id: 2721176183, name: "前尘愿", artist: "一七音乐" },
              ],
            };
          },
        };
      }

      return {
        ok: true,
        async json() {
          return {
            code: 200,
            data: {
              lrc: "[00:09.06]前尘愿",
            },
          };
        },
      };
    },
  });
  const result = await provider({
    sourceId: "cloudmusic.exe",
    title: "前尘愿",
    artist: "一七音乐",
  });

  assert.match(requestedUrls[0], /^https:\/\/api\.vkeys\.cn\/v2\/music\/netease\?/);
  assert.match(requestedUrls[1], /^https:\/\/api\.vkeys\.cn\/v2\/music\/netease\/lyric\?/);
  assert.equal(result.provider, "vkeys-netease");
  assert.deepEqual(result.lines, [
    { timeMs: 9060, text: "前尘愿" },
  ]);
});

test("lyric cache key changes when media identity changes", () => {
  assert.equal(lyricCacheKey({ sourceId: "qq", title: "Song", artist: "Artist" }), "qq|song|artist||");
  assert.equal(lyricCacheKey({ source_id: "cloudmusic.exe", title: "Song", artist: "Artist" }), "cloudmusic.exe|song|artist||");
  assert.equal(lyricCacheKey({ sourceId: "qq", title: "", artist: "Artist" }), "");
});
