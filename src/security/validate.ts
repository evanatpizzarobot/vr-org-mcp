/**
 * Input validators. Every MCP tool input flows through here before it is
 * used to build an upstream request. Validation failures throw ValidationError
 * and are converted to a structured, non-echoing error by safeRun.
 */

import { CATEGORIES, type Category } from "../config.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ValidationError extends Error {
  readonly field: string;
  readonly code: string;
  constructor(field: string, code: string) {
    super(`invalid ${field}: ${code}`);
    this.field = field;
    this.code = code;
    this.name = "ValidationError";
  }
}

/** A required, trimmed, length-capped free-text string. */
export function requireString(input: unknown, field: string, maxLength = 200): string {
  if (typeof input !== "string") {
    throw new ValidationError(field, "must-be-string");
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(field, "empty");
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(field, "too-long");
  }
  return trimmed;
}

/** An optional free-text string. Returns undefined when absent. */
export function optionalString(
  input: unknown,
  field: string,
  maxLength = 200,
): string | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  return requireString(input, field, maxLength);
}

/** An optional category. Returns undefined when absent or "all". */
export function optionalCategory(input: unknown): Category | undefined {
  if (input === undefined || input === null || input === "" || input === "all") {
    return undefined;
  }
  if (typeof input !== "string") {
    throw new ValidationError("category", "must-be-string");
  }
  const lower = input.trim().toLowerCase();
  if (!(CATEGORIES as readonly string[]).includes(lower)) {
    throw new ValidationError("category", "unknown-category");
  }
  return lower as Category;
}

/** A required article slug, matching the kebab-case form VR.org uses. */
export function requireSlug(input: unknown, field = "slug"): string {
  if (typeof input !== "string") {
    throw new ValidationError(field, "must-be-string");
  }
  const lower = input.trim().toLowerCase();
  if (lower.length === 0 || lower.length > 160) {
    throw new ValidationError(field, "bad-length");
  }
  if (!SLUG_RE.test(lower)) {
    throw new ValidationError(field, "malformed-slug");
  }
  return lower;
}

/** Clamp an optional limit into a sane range. */
export function clampLimit(input: unknown, fallback: number, max: number): number {
  let n: number;
  if (input === undefined || input === null || input === "") return fallback;
  if (typeof input === "number") {
    n = input;
  } else if (typeof input === "string" && /^[0-9]+$/.test(input)) {
    n = Number(input);
  } else {
    throw new ValidationError("limit", "must-be-uint");
  }
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError("limit", "out-of-range");
  }
  return Math.min(n, max);
}
