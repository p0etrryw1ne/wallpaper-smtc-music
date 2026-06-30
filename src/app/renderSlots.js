const SLOT_NAMES = ["player", "lyrics", "debug"];

export function createRenderSlotState() {
  return {
    htmlBySlot: new Map()
  };
}

export function planSlotUpdates(state, nextSlots = {}) {
  const updates = [];
  for (const name of SLOT_NAMES) {
    const html = String(nextSlots[name] ?? "");
    if (state.htmlBySlot.get(name) !== html) {
      state.htmlBySlot.set(name, html);
      updates.push({ name, html });
    }
  }
  return updates;
}

export function ensureRenderSlots(root) {
  if (!root) return {};
  let shell = root.querySelector?.(":scope > .app-slots");
  if (!shell) {
    removeLegacyDirectChildren(root);
    shell = document.createElement("div");
    shell.className = "app-slots";
    root.append(shell);
  }

  return Object.fromEntries(SLOT_NAMES.map((name) => [name, ensureSlot(shell, name)]));
}

export function applySlotUpdates(slots, updates = []) {
  for (const update of updates) {
    const slot = slots?.[update.name];
    if (slot) slot.innerHTML = update.html;
  }
}

export function slotWasUpdated(updates = [], name) {
  return updates.some((update) => update.name === name);
}

function removeLegacyDirectChildren(root) {
  for (const child of Array.from(root.children ?? [])) {
    if (child.className !== "app-slots") child.remove?.();
  }
}

function ensureSlot(shell, name) {
  let slot = shell.querySelector?.(`[data-render-slot="${name}"]`);
  if (!slot) {
    slot = document.createElement("div");
    slot.dataset.renderSlot = name;
    shell.append(slot);
  }
  return slot;
}
