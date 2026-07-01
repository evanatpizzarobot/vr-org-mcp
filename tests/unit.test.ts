import { describe, it, expect } from "vitest";
import { sanitizeString, sanitizeValue } from "../src/security/sanitize.js";
import { enforceResponseCap } from "../src/security/limits.js";
import {
  requireSlug,
  optionalCategory,
  clampLimit,
  requireString,
  ValidationError,
} from "../src/security/validate.js";
import { absoluteUrl } from "../src/config.js";
import { findExplainer, EXPLAINERS } from "../src/explainers.js";
import { matchHeadset } from "../src/match.js";
import { selectEvents } from "../src/events.js";

const CATALOG = [
  "Meta Quest 3S (128GB)",
  "Meta Quest 3S (256GB)",
  "Meta Quest 3 (512GB)",
  "PlayStation VR2",
  "Samsung Galaxy XR",
  "Bigscreen Beyond 2",
  "Apple Vision Pro (M5)",
];

describe("matchHeadset", () => {
  it("resolves the PSVR2 alias to PlayStation VR2", () => {
    expect(CATALOG[matchHeadset(CATALOG, "PSVR2")!]).toBe("PlayStation VR2");
  });
  it("prefers Quest 3 over the Quest 3S entries", () => {
    expect(CATALOG[matchHeadset(CATALOG, "Quest 3")!]).toBe("Meta Quest 3 (512GB)");
  });
  it("still finds Quest 3S when asked", () => {
    expect(CATALOG[matchHeadset(CATALOG, "Quest 3S")!]).toContain("Quest 3S");
  });
  it("resolves the Vision Pro alias", () => {
    expect(CATALOG[matchHeadset(CATALOG, "Vision Pro")!]).toBe("Apple Vision Pro (M5)");
  });
  it("returns null when nothing matches", () => {
    expect(matchHeadset(CATALOG, "HoloLens")).toBeNull();
  });
});

describe("sanitize", () => {
  it("strips control and zero-width characters", () => {
    const dirty = "hello​world‮";
    expect(sanitizeString(dirty)).toBe("helloworld");
  });

  it("preserves tab, newline, carriage return", () => {
    expect(sanitizeString("a\tb\nc\r")).toBe("a\tb\nc\r");
  });

  it("caps long strings", () => {
    const out = sanitizeString("x".repeat(5000), 100);
    expect(out.length).toBe(100);
    expect(out.endsWith("...[truncated]")).toBe(true);
  });

  it("walks nested structures", () => {
    const v = sanitizeValue({ a: "ok", b: [1, "two​"], c: 3 });
    expect(v).toEqual({ a: "ok", b: [1, "two"], c: 3 });
  });
});

describe("response cap", () => {
  it("passes small payloads through", () => {
    expect(enforceResponseCap({ ok: true })).toBe('{"ok":true}');
  });

  it("substitutes a stub when over the limit", () => {
    const big = { data: "x".repeat(60_000) };
    const out = JSON.parse(enforceResponseCap(big));
    expect(out.ok).toBe(false);
    expect(out.error).toBe("response_too_large");
  });
});

describe("validate", () => {
  it("accepts a clean slug", () => {
    expect(requireSlug("why-vr-is-the-perfect-horror-machine")).toBe(
      "why-vr-is-the-perfect-horror-machine",
    );
  });

  it("rejects a slug with bad characters", () => {
    expect(() => requireSlug("../etc/passwd")).toThrow(ValidationError);
    expect(() => requireSlug("Has Spaces")).toThrow(ValidationError);
  });

  it("normalizes and validates categories", () => {
    expect(optionalCategory("Hardware")).toBe("hardware");
    expect(optionalCategory("all")).toBeUndefined();
    expect(optionalCategory(undefined)).toBeUndefined();
    expect(() => optionalCategory("politics")).toThrow(ValidationError);
  });

  it("clamps limits", () => {
    expect(clampLimit(undefined, 20, 50)).toBe(20);
    expect(clampLimit(999, 20, 50)).toBe(50);
    expect(clampLimit("5", 20, 50)).toBe(5);
    expect(() => clampLimit(0, 20, 50)).toThrow(ValidationError);
  });

  it("requires non-empty strings", () => {
    expect(requireString("  hi  ", "x")).toBe("hi");
    expect(() => requireString("   ", "x")).toThrow(ValidationError);
  });
});

describe("selectEvents", () => {
  const evs = [
    { name: "Past", startDate: "2020-01-01", endDate: "2020-01-02" },
    { name: "Ongoing", startDate: "2026-06-30", endDate: "2026-07-05" },
    { name: "Future A", startDate: "2026-09-01" },
    { name: "Future B", startDate: "2026-08-01" },
    { badWithoutStart: true },
  ];

  it("drops past events, keeps a currently-running one, sorts soonest-first", () => {
    const { items, total } = selectEvents(evs, {
      today: "2026-07-01",
      includePast: false,
      limit: 10,
    });
    expect(items.map((e) => e.name)).toEqual(["Ongoing", "Future B", "Future A"]);
    expect(total).toBe(3);
  });

  it("includes past events when asked", () => {
    const { items } = selectEvents(evs, {
      today: "2026-07-01",
      includePast: true,
      limit: 10,
    });
    expect(items[0].name).toBe("Past");
    expect(items).toHaveLength(4);
  });

  it("respects the limit but still reports the true total", () => {
    const { items, total } = selectEvents(evs, {
      today: "2026-07-01",
      includePast: true,
      limit: 2,
    });
    expect(items).toHaveLength(2);
    expect(total).toBe(4);
  });

  it("maps fields to snake_case and defaults featured to false", () => {
    const { items } = selectEvents([{ name: "X", startDate: "2026-08-01", url: "https://e" }], {
      today: "2026-07-01",
      includePast: false,
      limit: 10,
    });
    expect(items[0]).toMatchObject({ name: "X", start_date: "2026-08-01", url: "https://e", featured: false });
  });

  it("returns empty for non-array input", () => {
    expect(selectEvents(null, { today: "2026-07-01", includePast: false, limit: 10 })).toEqual({
      items: [],
      total: 0,
    });
  });
});

describe("absoluteUrl", () => {
  it("passes absolute urls through", () => {
    expect(absoluteUrl("https://example.com/a")).toBe("https://example.com/a");
  });
  it("prefixes relative links with the base", () => {
    expect(absoluteUrl("/articles/foo")).toBe("https://vr.org/articles/foo");
  });
  it("returns null for non-strings", () => {
    expect(absoluteUrl(null)).toBeNull();
  });
});

describe("explainers", () => {
  it("matches common topics", () => {
    expect(findExplainer("what is vr")?.path).toBe("/what-is-vr");
    expect(findExplainer("which headset should I buy")?.path).toBe("/best-vr-headsets");
    expect(findExplainer("ar glasses")?.path).toBe("/ar-glasses");
  });
  it("returns null for unrelated topics", () => {
    expect(findExplainer("how to bake bread")).toBeNull();
  });
  it("every explainer has keys, title, path, summary", () => {
    for (const e of EXPLAINERS) {
      expect(e.keys.length).toBeGreaterThan(0);
      expect(e.title).toBeTruthy();
      expect(e.path.startsWith("/")).toBe(true);
      expect(e.summary.length).toBeGreaterThan(20);
    }
  });
});
