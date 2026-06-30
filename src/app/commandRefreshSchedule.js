export function refreshDelaysForCommand(command) {
  if (command === "previous" || command === "next") {
    return [120, 300, 700, 1200, 1800];
  }

  if (command === "play-pause") {
    return [250, 600, 1200];
  }

  return [300, 900];
}

export function shouldRefreshBridgeFreshAfterCommand(command) {
  return command === "previous" || command === "next" || command === "play-pause";
}
