import test from "node:test";
import assert from "node:assert/strict";
import { renderPlayer } from "../src/player/renderPlayer.js";

test("expanded player renders stable one-line title and reserved progress slot", () => {
  const model = {
    visible: true,
    mode: "expanded",
    sourceStatus: "active",
    timelineStatus: "unknown",
    progressSlotReserved: true,
    progressVisible: false
  };
  const snapshot = {
    title: "A very very very long title",
    artist: "Artist",
    thumbnail: "cover.png",
    playbackState: "playing",
    timeline: { status: "unknown", position: null, duration: null }
  };

  const html = renderPlayer(snapshot, model);

  assert.match(html, /data-player-mode="expanded"/);
  assert.match(html, /class="track-title-mask"/);
  assert.match(html, /class="track-title" data-marquee-text="A very very very long title"/);
  assert.match(html, /data-progress-reserved="true"/);
  assert.match(html, /data-progress-visible="false"/);
  assert.match(html, /data-command="play-pause"/);
  assert.match(html, /class="transport-icon"/);
  assert.doesNotMatch(html, />⏸</);
});

test("expanded title exposes the temporary player style toggle action", () => {
  const html = renderPlayer(
    { title: "Toggle Title", artist: "Artist" },
    {
      visible: true,
      mode: "expanded",
      sourceStatus: "active",
      progressSlotReserved: true
    }
  );

  assert.match(html, /<button[^>]*class="track-title-mask"[^>]*type="button"[^>]*data-action="toggle-player-style"/);
  assert.match(html, /class="track-title" data-marquee-text="Toggle Title"/);
});

test("expanded and compact titles render duplicate marquee text for seamless scrolling", () => {
  const expanded = renderPlayer(
    { title: "A very long title", artist: "Artist" },
    { visible: true, mode: "expanded", progressSlotReserved: true }
  );
  const compact = renderPlayer(
    { title: "A very long title", artist: "Artist" },
    { visible: true, mode: "compact", progressSlotReserved: true }
  );

  assert.equal((expanded.match(/class="title-marquee-item"/g) ?? []).length, 2);
  assert.equal((compact.match(/class="title-marquee-item"/g) ?? []).length, 2);
  assert.match(expanded, /aria-hidden="true">A very long title/);
  assert.match(compact, /aria-hidden="true">A very long title/);
});

test("known progress renders formatted times and fill percentage", () => {
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      thumbnail: "",
      playbackState: "paused",
      timeline: { status: "known", position: 30, duration: 120 }
    },
    {
      visible: true,
      mode: "lyrics",
      sourceStatus: "active",
      timelineStatus: "known",
      progressSlotReserved: true,
      progressVisible: true
    }
  );

  assert.match(html, /data-player-mode="lyrics"/);
  assert.match(html, /data-progress-visible="true"/);
  assert.match(html, /0:30/);
  assert.match(html, /2:00/);
  assert.match(html, /style="--progress-percent: 25%"/);
  assert.match(html, /data-state="play"/);
});

test("idle view renders no player shell", () => {
  const html = renderPlayer({}, { visible: false, mode: "idle" });
  assert.equal(html, "");
});

test("escapes user supplied media text", () => {
  const html = renderPlayer(
    {
      title: "<script>alert(1)</script>",
      artist: "A & B",
      thumbnail: "\" onerror=\"bad",
      playbackState: "playing",
      timeline: { status: "unknown", position: null, duration: null }
    },
    {
      visible: true,
      mode: "compact",
      sourceStatus: "active",
      timelineStatus: "unknown",
      progressSlotReserved: true,
      progressVisible: false
    }
  );

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /A &amp; B/);
  assert.doesNotMatch(html, /onerror/);
  assert.doesNotMatch(html, /<img[^>]+class="album-art"/);
  assert.match(html, /mini-art-fallback/);
});

test("player artwork accepts Windows paths and spaces after shared normalization", () => {
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      thumbnail: "D:\\Music Covers\\Album Art.png",
      playbackState: "playing",
      timeline: { status: "unknown", position: null, duration: null }
    },
    {
      visible: true,
      mode: "expanded",
      sourceStatus: "active",
      progressSlotReserved: true
    }
  );

  assert.match(html, /<img class="album-art"[^>]+src="file:\/\/\/D:\/Music Covers\/Album Art\.png"/);
  assert.match(html, /class="album-art album-art-fallback"[^>]+hidden/);
});

test("player artwork preserves data image urls", () => {
  const thumbnail = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      thumbnail,
      playbackState: "playing",
      timeline: { status: "unknown", position: null, duration: null }
    },
    {
      visible: true,
      mode: "compact",
      sourceStatus: "active",
      progressSlotReserved: true
    }
  );

  assert.match(html, new RegExp(`src="${thumbnail}"`));
  assert.match(html, /class="mini-art mini-art-fallback"[^>]+hidden/);
});

test("compact artwork does not rewrite source urls containing album-art", () => {
  const thumbnail = "https://cdn.example.test/album-art/cover.png";
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      thumbnail,
      playbackState: "playing",
      timeline: { status: "unknown", position: null, duration: null }
    },
    {
      visible: true,
      mode: "compact",
      sourceStatus: "active",
      progressSlotReserved: true
    }
  );

  assert.match(html, new RegExp(`src="${thumbnail}"`));
  assert.doesNotMatch(html, /mini-art\/cover/);
});

test("compact mode renders dedicated mini player structure", () => {
  const html = renderPlayer(
    {
      title: "Compact Song",
      artist: "Compact Artist",
      thumbnail: "cover.png",
      playbackState: "playing",
      timeline: { status: "known", position: 12, duration: 100 }
    },
    {
      visible: true,
      mode: "compact",
      sourceStatus: "active",
      timelineStatus: "known",
      progressSlotReserved: true,
      progressVisible: true
    }
  );

  assert.match(html, /class="compact-player"/);
  assert.match(html, /class="mini-title"/);
  assert.match(html, /class="compact-progress"/);
  assert.match(html, /data-command="previous"/);
  assert.doesNotMatch(html, /class="player-shell"/);
});

test("compact title exposes the temporary player style toggle action", () => {
  const html = renderPlayer(
    {
      title: "Compact Toggle",
      artist: "Compact Artist",
      playbackState: "playing",
      timeline: { status: "unknown", position: null, duration: null }
    },
    {
      visible: true,
      mode: "compact",
      sourceStatus: "active",
      progressSlotReserved: true,
      progressVisible: false
    }
  );

  assert.match(html, /<button[^>]*class="compact-title-mask"[^>]*type="button"[^>]*data-action="toggle-player-style"/);
  assert.match(html, /class="mini-title" data-marquee-text="Compact Toggle"/);
});

test("Bridge-only transport controls are disabled when controls are unavailable", () => {
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      thumbnail: "cover.png",
      playbackState: "playing",
      timeline: { status: "known", position: 12, duration: 100 }
    },
    {
      visible: true,
      mode: "expanded",
      sourceStatus: "active",
      timelineStatus: "known",
      progressSlotReserved: true,
      progressVisible: true,
      controlsAvailable: false
    }
  );

  assert.match(html, /data-command="switch-source"[^>]*disabled/);
  assert.match(html, /data-command="previous"[^>]*disabled/);
  assert.match(html, /data-command="play-pause"[^>]*disabled/);
  assert.match(html, /data-command="next"[^>]*disabled/);
  assert.match(html, /data-command="volume-up"[^>]*disabled/);
  assert.doesNotMatch(html, /data-command="lyrics"[^>]*disabled/);
});

test("source switch can stay enabled while transport controls are unavailable", () => {
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      thumbnail: "cover.png",
      playbackState: "playing",
      timeline: { status: "known", position: 12, duration: 100 }
    },
    {
      visible: true,
      mode: "expanded",
      sourceStatus: "active",
      timelineStatus: "known",
      progressSlotReserved: true,
      progressVisible: true,
      controlsAvailable: false,
      sourceSwitchAvailable: true
    }
  );

  assert.doesNotMatch(html, /data-command="switch-source"[^>]*disabled/);
  assert.match(html, /data-command="previous"[^>]*disabled/);
  assert.match(html, /data-command="play-pause"[^>]*disabled/);
  assert.match(html, /data-command="next"[^>]*disabled/);
  assert.match(html, /data-command="volume-up"[^>]*disabled/);
});

test("compact player disables transport controls when unavailable", () => {
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      playbackState: "playing",
      timeline: { status: "unknown", position: null, duration: null }
    },
    {
      visible: true,
      mode: "compact",
      sourceStatus: "active",
      timelineStatus: "unknown",
      progressSlotReserved: true,
      progressVisible: false,
      controlsAvailable: false,
      sourceSwitchAvailable: true
    }
  );

  assert.match(html, /data-command="previous"[^>]*disabled/);
  assert.match(html, /data-command="play-pause"[^>]*disabled/);
  assert.match(html, /data-command="next"[^>]*disabled/);
});

test("Bridge transport controls are enabled when controls are available", () => {
  const html = renderPlayer(
    {
      title: "Song",
      artist: "Artist",
      thumbnail: "cover.png",
      playbackState: "playing",
      timeline: { status: "known", position: 12, duration: 100 }
    },
    {
      visible: true,
      mode: "expanded",
      sourceStatus: "active",
      timelineStatus: "known",
      progressSlotReserved: true,
      progressVisible: true,
      controlsAvailable: true
    }
  );

  assert.doesNotMatch(html, /data-command="play-pause"[^>]*disabled/);
});

test("immersive lyrics player renders cover and metadata without progress or controls", () => {
  const html = renderPlayer(
    {
      title: "Immersive Song",
      artist: "Immersive Artist",
      thumbnail: "cover.png",
      playbackState: "playing",
      timeline: { status: "known", position: 12, duration: 100 }
    },
    {
      visible: true,
      mode: "lyrics",
      lyricsStyle: "immersive",
      sourceStatus: "active",
      timelineStatus: "known",
      progressSlotReserved: true,
      progressVisible: true,
      controlsAvailable: true
    }
  );

  assert.match(html, /data-player-mode="lyrics"/);
  assert.match(html, /data-lyrics-style="immersive"/);
  assert.match(html, /Immersive Song/);
  assert.match(html, /Immersive Artist/);
  assert.match(html, /<button[^>]*class="track-title-mask"[^>]*type="button"[^>]*data-action="toggle-player-style"/);
  assert.match(html, /<img class="album-art"[^>]*data-artwork-image[^>]*><div class="album-art album-art-fallback" data-artwork-fallback hidden aria-hidden="true"><\/div>/);
  assert.doesNotMatch(html, /class="progress-slot"/);
  assert.doesNotMatch(html, /class="transport-controls"/);
  assert.doesNotMatch(html, /data-command="lyrics"/);
});

test("immersive lyrics style does not change compact player controls", () => {
  const html = renderPlayer(
    {
      title: "Mini Immersive",
      artist: "Mini Artist",
      thumbnail: "cover.png",
      playbackState: "playing",
      timeline: { status: "known", position: 12, duration: 100 }
    },
    {
      visible: true,
      mode: "compact",
      lyricsStyle: "immersive",
      sourceStatus: "active",
      progressSlotReserved: true,
      progressVisible: true,
      controlsAvailable: true
    }
  );

  assert.match(html, /class="compact-player"/);
  assert.doesNotMatch(html, /compact-player--immersive/);
  assert.match(html, /Mini Immersive/);
  assert.match(html, /Mini Artist/);
  assert.match(html, /class="compact-controls"/);
  assert.match(html, /class="compact-progress"/);
  assert.match(html, /data-command="previous"/);
  assert.match(html, /data-command="play-pause"/);
  assert.match(html, /data-command="next"/);
});
