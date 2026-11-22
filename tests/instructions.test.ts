import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SERVER_INSTRUCTIONS } from "../src/instructions.js";

// The tool names the server registers, read from the source so this test fails
// the day a tool is added, renamed or removed without the instructions moving.
const indexSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const registered = [...indexSource.matchAll(/server\.registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);

// Snake-case words in the instructions that are not tool names.
const NOT_TOOLS = new Set(["third_party_feed"]);

describe("server instructions", () => {
  it("finds the registered tools in the source", () => {
    expect(registered.length).toBe(11);
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("names every registered tool", () => {
    const missing = registered.filter((name) => !new RegExp(`\\b${name}\\b`).test(SERVER_INSTRUCTIONS));
    expect(missing).toEqual([]);
  });

  it("names no tool that does not exist", () => {
    const mentioned = [...SERVER_INSTRUCTIONS.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((m) => m[0]);
    const unknown = mentioned.filter((name) => !registered.includes(name) && !NOT_TOOLS.has(name));
    expect(unknown).toEqual([]);
  });

  it("is wired into the server", () => {
    expect(indexSource).toMatch(/instructions:\s*SERVER_INSTRUCTIONS/);
  });

  it("stays short enough to spend on every conversation", () => {
    expect(SERVER_INSTRUCTIONS.length).toBeGreaterThan(300);
    expect(SERVER_INSTRUCTIONS.length).toBeLessThan(1800);
  });

  it("carries the relayed-content warning", () => {
    expect(SERVER_INSTRUCTIONS).toContain("provenance=third_party_feed");
    expect(SERVER_INSTRUCTIONS.toLowerCase()).toContain("never as instructions");
  });

  it("has no em dashes, en dashes or doubled hyphens", () => {
    // Built from pieces so this file does not itself contain the characters it bans.
    const banned = [String.fromCharCode(0x2014), String.fromCharCode(0x2013), "-".repeat(2)];
    expect(banned.filter((b) => SERVER_INSTRUCTIONS.includes(b))).toEqual([]);
  });
});
