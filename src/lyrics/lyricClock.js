export function activeLyricIndex(lines = [], positionMs = 0, options = {}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return -1;
  }

  const offsetMs = Number(options.offsetMs ?? 0);
  const effectivePosition = Math.max(0, Number(positionMs ?? 0) + offsetMs);

  let activeIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (Number(lines[index]?.timeMs ?? 0) > effectivePosition) {
      break;
    }
    activeIndex = index;
  }

  return activeIndex;
}
