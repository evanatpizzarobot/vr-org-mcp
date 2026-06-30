/**
 * Error handling. Tool handlers run inside safeRun so a thrown exception
 * becomes a structured, non-echoing error result instead of crashing the
 * server or leaking a raw stack trace (which could carry attacker-controlled
 * input) back to the calling agent.
 */

import { ValidationError } from "./validate.js";

export class UpstreamError extends Error {
  readonly status: number;
  readonly resource: string;
  constructor(status: number, resource: string) {
    super(`upstream ${resource} returned ${status}`);
    this.name = "UpstreamError";
    this.status = status;
    this.resource = resource;
  }
}

export async function safeRun(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ValidationError) {
      return { ok: false, error: "invalid_input", field: e.field, code: e.code };
    }
    if (e instanceof UpstreamError) {
      return {
        ok: false,
        error: "upstream_error",
        resource: e.resource,
        status: e.status,
        hint: "VR.org's API did not return a usable response. Retry shortly.",
      };
    }
    if (e instanceof Error && e.name === "TimeoutError") {
      return { ok: false, error: "upstream_timeout" };
    }
    // Deliberately do not echo the raw message, which may contain
    // attacker-controlled input from a malformed request.
    return { ok: false, error: "internal_error" };
  }
}
