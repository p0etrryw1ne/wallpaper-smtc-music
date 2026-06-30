export function createFrameScheduler(callback, options = {}) {
  const requestFrame = typeof options.requestFrame === "function"
    ? options.requestFrame
    : defaultRequestFrame;
  let scheduled = false;

  return function scheduleFrame() {
    if (scheduled) return;
    scheduled = true;
    requestFrame(() => {
      scheduled = false;
      callback();
    });
  };
}

function defaultRequestFrame(callback) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }

  setTimeout(callback, 0);
}
