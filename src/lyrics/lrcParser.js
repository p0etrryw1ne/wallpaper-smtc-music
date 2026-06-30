const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

export function parseLrc(raw) {
  const lines = [];

  for (const sourceLine of String(raw ?? "").split(/\r?\n/)) {
    const timestamps = [...sourceLine.matchAll(TIMESTAMP_RE)];
    if (timestamps.length === 0) {
      continue;
    }

    const text = sourceLine.replace(TIMESTAMP_RE, "").trim();
    if (!text) {
      continue;
    }

    for (const match of timestamps) {
      lines.push({
        timeMs: parseTimestamp(match),
        text,
      });
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return { lines };
}

function parseTimestamp(match) {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = String(match[3] ?? "0").padEnd(3, "0").slice(0, 3);
  return minutes * 60_000 + seconds * 1_000 + Number(fraction);
}
