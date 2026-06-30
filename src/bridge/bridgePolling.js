export function startBridgePolling(options = {}) {
  const {
    enabled = true,
    intervalMs = 700,
    fetchNowPlaying,
    onSnapshot,
    setTimer = setInterval,
    clearTimer = clearInterval
  } = options;

  if (!enabled || typeof fetchNowPlaying !== "function" || typeof onSnapshot !== "function") {
    return () => {};
  }

  let stopped = false;
  let inFlight = false;

  async function tick() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      onSnapshot(await fetchNowPlaying());
    } catch (error) {
      onSnapshot({
        healthy: false,
        stale: false,
        error: error instanceof Error ? error.message : String(error ?? ""),
        snapshot: null,
        sources: []
      });
    } finally {
      inFlight = false;
    }
  }

  tick();
  const timerId = setTimer(tick, intervalMs);

  return () => {
    stopped = true;
    clearTimer(timerId);
  };
}
