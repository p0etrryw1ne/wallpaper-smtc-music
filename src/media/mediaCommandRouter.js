export async function invokeMediaCommand(command, options = {}) {
  const sourceId = typeof options.sourceId === "string" ? options.sourceId.trim() : "";
  if (typeof options.sendBridgeCommand === "function" && sourceId) {
    const result = await options.sendBridgeCommand(command, options.fetch, {
      sourceId,
    });
    if (result?.ok === true) return true;
  }

  if (typeof options.officialCommand === "function") {
    return await options.officialCommand(command) === true;
  }

  return false;
}
