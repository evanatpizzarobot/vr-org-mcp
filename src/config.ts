/**
 * Static config for the VR.org MCP server.
 *
 * The server is a thin, read-only proxy over VR.org's public JSON API.
 * It holds no secrets and writes nothing. The only knobs are an optional
 * base-URL override (for pointing at a staging copy of the site) and an
 * optional User-Agent suffix.
 */

import { sanitizeString } from "./security/sanitize.js";

export const PACKAGE_VERSION = "0.1.0";

export const BASE_URL = (process.env.VR_ORG_BASE_URL || "https://vr.org").replace(
  /\/+$/,
  "",
);

/** Categories VR.org organizes content under, plus the "all" sentinel. */
export const CATEGORIES = [
  "hardware",
  "gaming",
  "software",
  "enterprise",
  "ar",
  "xr",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function userAgent(): string {
  const suffix = process.env.VR_ORG_UA_SUFFIX
    ? ` ${sanitizeString(process.env.VR_ORG_UA_SUFFIX, 64)}`
    : "";
  return `vr-org-mcp/${PACKAGE_VERSION} (+https://vr.org)${suffix}`;
}

/** Resolve a possibly-relative VR.org link to an absolute https URL. */
export function absoluteUrl(link: unknown): string | null {
  if (typeof link !== "string" || link.length === 0) return null;
  if (/^https?:\/\//i.test(link)) return link;
  return BASE_URL + (link.startsWith("/") ? link : "/" + link);
}
