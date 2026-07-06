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

const MAX_ERROR_CHARS = 4000;

/**
 * Credential-shaped substrings to mask if they ever surface inside an error
 * string.
 *
 * vr-org-mcp is a read-only proxy: it holds no API key and attaches no auth
 * token to any request (see src/http/client.ts), so unlike a keyed server there
 * is no single project token to redact. This scrub is defense-in-depth. If a
 * credential-shaped value ever reached an error message (a misconfigured
 * environment, an upstream header echoed into a body), it is masked before the
 * text is handed to the calling model. The patterns mirror the key shapes the
 * studio already guards against (Anthropic, Google, Resend) plus bearer tokens.
 */
const TOKEN_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/gi, "Bearer [redacted]"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, "sk-ant-[redacted]"],
  [/AIza[0-9A-Za-z_-]{35}/g, "AIza[redacted]"],
  [/re_[A-Za-z0-9_-]{20,}/g, "re_[redacted]"],
];

/**
 * Scrub text destined for the calling model on the error path. A thrown error's
 * message can carry attacker-controlled input (a malformed request, an upstream
 * body), so it runs through the same output scrub as a tool result, with any
 * caller-supplied secret and any credential-shaped substring redacted first, and
 * the whole thing capped so a huge message cannot flood the agent's context.
 *
 * `secrets` is the list of literal secret values to redact (each masked only if
 * it is a string of at least 8 characters, so a short or missing value is
 * ignored). vr-org-mcp carries no secret, so callers pass an empty list; the
 * parameter exists so the same helper is correct if a keyed surface reuses it.
 */
export function sanitizeErrorText(input: unknown, secrets: unknown[] = []): string {
  if (typeof input !== "string" || input.length === 0) return "";
  let s = input;
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) {
      s = s.split(secret).join("[redacted]");
    }
  }
  for (const [pattern, replacement] of TOKEN_PATTERNS) {
    s = s.replace(pattern, replacement);
  }
  // Run the same control / zero-width scrub tool results get. Pass an effectively
  // unbounded cap so sanitizeString only strips characters; sanitizeErrorText
  // owns the error-specific length cap below.
  s = sanitizeString(s, Number.MAX_SAFE_INTEGER);
  return s.length > MAX_ERROR_CHARS
    ? s.slice(0, MAX_ERROR_CHARS - 15) + "\n...[truncated]"
    : s;
}

const MAX_REFLECTED_LEN = 120;

/**
 * Narrow hygiene for a caller-supplied identifier that gets echoed back into a
 * tool message, resource text, or prompt (a query, slug, topic, or headset name
 * that did not match). Strips angle brackets so no caller markup is reflected
 * verbatim, and caps the echo length. Runs in addition to the general output
 * sanitizer above; a valid identifier passes through unchanged.
 */
export function sanitizeReflectedValue(input: unknown): string {
  if (typeof input !== "string") return "";
  const stripped = input.replace(/[<>]/g, "");
  return stripped.length > MAX_REFLECTED_LEN
    ? stripped.slice(0, MAX_REFLECTED_LEN - 1) + "\u2026"
    : stripped;
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
