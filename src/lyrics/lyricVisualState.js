const VISUAL_SYNC_MS = 600;

export function lyricVisualForDistance(distanceFromFocus) {
  const distance = Math.abs(Number(distanceFromFocus) || 0);
  const activeWeight = clamp(1 - distance / 0.75, 0, 1);
  const readableWeight = clamp(1 - distance / 2.8, 0, 1);

  return {
    active: activeWeight > 0.72,
    opacity: round(0.3 + readableWeight * 0.7),
    alpha: round(0.38 + readableWeight * 0.62),
    blurPx: round((1 - activeWeight) * 3),
    weight: Math.round(760 + activeWeight * 120)
  };
}

export function syncLyricVisualState(root) {
  const panel = root?.querySelector?.(".lyrics-panel");
  if (!panel) return;

  const rows = Array.from(panel.querySelectorAll(".lyric-line"));
  if (rows.length === 0) return;

  applyLyricEdgePadding(panel, rows);

  const activeIndex = Number(panel.dataset.activeIndex ?? -1);
  const activeRow = rows[activeIndex];
  const focusHeight = focusViewportHeight(panel);
  if (!Number.isFinite(activeIndex) || !activeRow || focusHeight <= 0) {
    panel.dataset.visualAnimating = "false";
    applyLyricRowStyles(panel, rows);
    return;
  }

  const targetTop = activeRow.offsetTop - focusHeight / 2 + activeRow.offsetHeight / 2;
  const previousIndex = Number(panel.dataset.visualActiveIndex ?? -1);
  if (previousIndex === activeIndex) {
    panel.dataset.visualAnimating = "false";
    applyLyricRowStyles(panel, rows, rowCenter(activeRow));
    return;
  }

  panel.dataset.visualActiveIndex = String(activeIndex);

  const run = String(Number(panel.dataset.visualRun || 0) + 1);
  panel.dataset.visualRun = run;
  const previousRow = rows[previousIndex];
  const startFocusCenter = previousRow
    ? rowCenter(previousRow)
    : panel.scrollTop + focusHeight / 2;
  const targetFocusCenter = rowCenter(activeRow);
  animateLyricScrollAndStyles(
    panel,
    rows,
    Math.max(0, targetTop),
    startFocusCenter,
    targetFocusCenter,
    previousIndex === -1 ? 1 : VISUAL_SYNC_MS,
    run
  );
}

function applyLyricRowStyles(panel, rows, focusCenterOverride = null) {
  panel.markAppliedRun?.(panel.dataset.visualRun);
  const panelCenter = Number.isFinite(focusCenterOverride)
    ? focusCenterOverride
    : fallbackFocusCenter(panel, rows);
  const focusStep = estimateFocusStep(rows);

  for (const row of rows) {
    const visual = lyricVisualForDistance((rowCenter(row) - panelCenter) / focusStep);
    row.style.setProperty("--lyric-opacity", String(visual.opacity));
    row.style.setProperty("--lyric-alpha", String(visual.alpha));
    row.style.setProperty("--lyric-blur", `${visual.blurPx}px`);
    row.style.setProperty("--lyric-weight", String(visual.weight));
    row.dataset.visualActive = visual.active ? "true" : "false";
  }

  panel.dataset.visualReady = "true";
}

function applyLyricEdgePadding(panel, rows) {
  const panelHeight = focusViewportHeight(panel);
  const bottomInset = lyricFocusBottomInset(panel);
  const maxRowHeight = rows.reduce((max, row) => Math.max(max, Number(row.offsetHeight) || 0), 0);
  if (panelHeight <= 0 || maxRowHeight <= 0) return;

  const topPadding = Math.max(0, Math.round(panelHeight / 2 - maxRowHeight / 2));
  const bottomPadding = topPadding + bottomInset;
  panel.style?.setProperty?.("--lyric-edge-padding", `${topPadding}px`);
  panel.style?.setProperty?.("--lyric-edge-padding-top", `${topPadding}px`);
  panel.style?.setProperty?.("--lyric-edge-padding-bottom", `${bottomPadding}px`);
}

function animateLyricScrollAndStyles(panel, rows, targetTop, startFocusCenter, targetFocusCenter, durationMs, run) {
  const startedAt = performance.now();
  const startTop = Number(panel.scrollTop) || 0;
  panel.dataset.visualAnimating = durationMs > 1 ? "true" : "false";

  function frame(now) {
    if (panel.dataset.visualRun !== run) return;
    const progress = durationMs <= 1 ? 1 : clamp((now - startedAt) / durationMs, 0, 1);
    const eased = smootherStep(progress);
    panel.scrollTop = startTop + (targetTop - startTop) * eased;
    applyLyricRowStyles(panel, rows, startFocusCenter + (targetFocusCenter - startFocusCenter) * eased);
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      panel.dataset.visualAnimating = "false";
    }
  }

  requestAnimationFrame(frame);
}

function smootherStep(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function estimateFocusStep(rows) {
  if (rows.length >= 2) {
    const first = rows[0];
    const second = rows[1];
    const gap = Math.abs(second.offsetTop - first.offsetTop);
    if (gap > 0) return gap;
  }

  return Math.max(1, rows[0]?.offsetHeight || 1);
}

function fallbackFocusCenter(panel, rows) {
  const activeIndex = Number(panel.dataset.visualActiveIndex ?? panel.dataset.activeIndex ?? -1);
  const activeRow = rows[activeIndex];
  if (activeRow) return rowCenter(activeRow);

  return panel.scrollTop + focusViewportHeight(panel) / 2;
}

function rowCenter(row) {
  return row.offsetTop + row.offsetHeight / 2;
}

function focusViewportHeight(panel) {
  const height = Number(panel.clientHeight) || 0;
  const bottomInset = lyricFocusBottomInset(panel);
  return Math.max(1, height - bottomInset);
}

function lyricFocusBottomInset(panel) {
  return cssPixelValue(panel, "--lyric-focus-bottom-inset");
}

function cssPixelValue(element, name) {
  if (typeof getComputedStyle !== "function") return 0;
  const parsed = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
