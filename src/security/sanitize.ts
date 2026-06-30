/**
 * Output sanitization. Tool responses returned to the calling MCP client
 * pass through here to strip:
 *   - C0/C1 control characters (except \n, \r, \t)
 *   - Zero-width / direction-override characters that can be used for
 *     prompt injection or visual deception
 *   - Excessively long strings
 *
 * Threat model: VR.org content is editorially controlled, but the live feed
 * also carries third-party RSS headlines and snippets. A malicious or
 * compromised upstream headline could contain text designed to manipulate
 * the calling LLM's reasoning (for example "Ignore previous instructions
 * and ..."). We cannot fully prevent content-level injection, but we can
 * strip non-printable and direction-confusing characters and cap field
 * lengths before the value reaches the agent.
 *
 * Regexes are built from explicit hex escapes via RegExp() to keep this
 * source file ASCII-clean. The character classes below cover:
 *   - U+0000-U+0008  C0 controls before TAB
 *   - U+000B-U+000C  vertical tab + form feed (TAB/LF preserved)
 *   - U+000E-U+001F  remaining C0 controls (CR preserved)
 *   - U+007F         DEL
 *   - U+0080-U+009F  C1 controls
 *   - U+200B-U+200F  zero-width chars + LRM/RLM
 *   - U+202A-U+202E  bidi embedding/override marks
 *   - U+2060-U+2064  word joiner + invisible separators
 *   - U+FEFF         zero-width no-break space (BOM)
 */

const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]",
  "g",
);

const ZERO_WIDTH = new RegExp(
  "[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]",
  "g",
);

const DEFAULT_MAX_STRING = 4096;

export function sanitizeString(
  input: string,
  maxLength: number = DEFAULT_MAX_STRING,
): string {
  let out = input.replace(CONTROL_CHARS, "").replace(ZERO_WIDTH, "");
  if (out.length > maxLength) {
    out = out.slice(0, maxLength - 14) + "...[truncated]";
  }
  return out;
}

/**
 * Walks an object/array tree and sanitizes every string. Numbers,
 * booleans, null pass through. Bigints convert to strings since they
 * are not JSON-serializable. Unsupported types collapse to a placeholder
 * rather than throw, so a single weird value cannot fail the whole
 * response.
 */
export function sanitizeValue(input: unknown, depth = 0): unknown {
  if (depth > 32) return "[max-depth-exceeded]";
  if (input === null || input === undefined) return null;
  if (typeof input === "string") return sanitizeString(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "bigint") return input.toString();
  if (Array.isArray(input)) {
    return input.slice(0, 1000).map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(input)) {
      if (count >= 200) break;
      out[sanitizeString(k, 128)] = sanitizeValue(v, depth + 1);
      count++;
    }
    return out;
  }
  return "[unsupported-type]";
}
