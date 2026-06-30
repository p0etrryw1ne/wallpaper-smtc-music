import test from "node:test";
import assert from "node:assert/strict";
import { invokeMediaCommand } from "../src/media/mediaCommandRouter.js";

test("sends media commands through Bridge", async () => {
  const commands = [];
  const result = await invokeMediaCommand("previous", {
    sourceId: "QQMusic.exe",
    sendBridgeCommand: async (command, fetchImpl, options) => {
      commands.push({ command, sourceId: options.sourceId });
      return { ok: true };
    },
  });

  assert.equal(result, true);
  assert.deepEqual(commands, [{ command: "previous", sourceId: "QQMusic.exe" }]);
});

test("returns false when Bridge command is unavailable", async () => {
  const result = await invokeMediaCommand("volume-up", {});

  assert.equal(result, false);
});

test("falls back to official command handler when Bridge is unavailable", async () => {
  const commands = [];
  const result = await invokeMediaCommand("play-pause", {
    officialCommand: async (command) => {
      commands.push(command);
      return true;
    },
  });

  assert.equal(result, true);
  assert.deepEqual(commands, ["play-pause"]);
});

test("does not send Bridge command without an explicit source id", async () => {
  let called = false;
  const result = await invokeMediaCommand("play-pause", {
    sourceId: "",
    sendBridgeCommand: async () => {
      called = true;
      return { ok: true };
    },
  });

  assert.equal(result, false);
  assert.equal(called, false);
});

test("returns false when Bridge rejects the command", async () => {
  const result = await invokeMediaCommand("next", {
    sourceId: "QQMusic.exe",
    sendBridgeCommand: async () => ({ ok: false }),
  });

  assert.equal(result, false);
});

test("falls back to official command handler when Bridge rejects the command", async () => {
  const result = await invokeMediaCommand("next", {
    sourceId: "QQMusic.exe",
    sendBridgeCommand: async () => ({ ok: false }),
    officialCommand: async (command) => command === "next",
  });

  assert.equal(result, true);
});
