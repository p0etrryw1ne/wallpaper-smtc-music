export function updateProgressDom(root, snapshot = {}) {
  if (!root) return;
  const known = snapshot.timeline?.status === "known";
  const percent = known && snapshot.timeline.duration > 0
    ? Math.max(0, Math.min(100, (snapshot.timeline.position / snapshot.timeline.duration) * 100))
    : 0;
  const currentTime = known ? formatTime(snapshot.timeline.position) : "";
  const durationTime = known ? formatTime(snapshot.timeline.duration) : "";

  for (const slot of root.querySelectorAll(".progress-slot, .compact-progress")) {
    setDatasetIfChanged(slot, "progressVisible", String(known));
    const track = slot.querySelector(".progress-track");
    if (track) setStylePropertyIfChanged(track, "--progress-percent", `${trimPercent(percent)}%`);
  }

  const times = root.querySelector(".progress-times");
  if (times?.children?.length >= 2) {
    setTextIfChanged(times.children[0], currentTime);
    setTextIfChanged(times.children[1], durationTime);
  }
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function setDatasetIfChanged(element, key, value) {
  if (element?.dataset && element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

function setStylePropertyIfChanged(element, name, value) {
  const cache = element.__weSmtcStylePropertyCache || new Map();
  if (cache.get(name) === value) return;

  cache.set(name, value);
  element.__weSmtcStylePropertyCache = cache;
  element.style.setProperty(name, value);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function trimPercent(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
