import { describe, it, expect } from "vitest";
import {
  sanitizeString,
  sanitizeValue,
  sanitizeReflectedValue,
  sanitizeErrorText,
} from "../src/security/sanitize.js";
import { enforceResponseCap } from "../src/security/limits.js";
import {
  requireSlug,
  optionalCategory,
  clampLimit,
  requireString,
  ValidationError,
} from "../src/security/validate.js";
import { absoluteUrl } from "../src/config.js";
import {
  PROVENANCE,
  RELAYED_CONTENT_NOTICE,
  RELAYED_CONTENT_NOTICE_MD,
  hasThirdParty,
  provenanceOf,
} from "../src/provenance.js";
import { findExplainer, EXPLAINERS } from "../src/explainers.js";
import { matchHeadset } from "../src/match.js";
import { selectEvents } from "../src/events.js";
import {
  formatNewsIndex,
  formatOriginalsIndex,
  formatEventsList,
  formatGuidesDoc,
  formatArticle,
} from "../src/resources.js";
import {
  recommendHeadsetPrompt,
  thisWeekInVrPrompt,
  explainVrTopicPrompt,
} from "../src/prompts.js";

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
  it("does not rewrite a full Pimax model name to the Crystal", () => {
    const pimax = ["Pimax Crystal Light", "Pimax Dream Air SE"];
    expect(pimax[matchHeadset(pimax, "Pimax Dream Air SE")!]).toBe("Pimax Dream Air SE");
    expect(pimax[matchHeadset(pimax, "pimax")!]).toBe("Pimax Crystal Light");
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

describe("sanitizeValue body_html cap", () => {
  it("leaves a full-length article body_html intact but still caps other strings", () => {
    const body = "<p>" + "x".repeat(17_000) + "</p>";
    const v = sanitizeValue({ article: { body_html: body, snippet: "y".repeat(5000) } }) as {
      article: { body_html: string; snippet: string };
    };
    expect(v.article.body_html).toBe(body);
    expect(v.article.snippet.endsWith("...[truncated]")).toBe(true);
  });
});

describe("sanitizeReflectedValue", () => {
  it("strips angle brackets from reflected caller input", () => {
    expect(sanitizeReflectedValue("<script>alert(1)</script>")).toBe("scriptalert(1)/script");
  });

  it("leaves a normal identifier unchanged", () => {
    expect(sanitizeReflectedValue("anthropic")).toBe("anthropic");
  });

  it("caps an over-long value at 120 chars ending in an ellipsis", () => {
    const out = sanitizeReflectedValue("a".repeat(500));
    expect(out.length).toBe(120);
    expect(out.charCodeAt(119)).toBe(0x2026);
  });

  it("returns an empty string for non-string input", () => {
    expect(sanitizeReflectedValue(undefined)).toBe("");
    expect(sanitizeReflectedValue(42)).toBe("");
    expect(sanitizeReflectedValue(null)).toBe("");
  });
});

describe("sanitizeErrorText", () => {
  it("redacts a caller-supplied secret", () => {
    const out = sanitizeErrorText("connect failed for supersecretvalue123", [
      "supersecretvalue123",
    ]);
    expect(out).not.toContain("supersecretvalue123");
    expect(out).toContain("[redacted]");
  });

  it("redacts token-shaped strings even when no secret is passed", () => {
    // Assemble the token at runtime so no secret-shaped literal sits in source
    // (keeps the pre-commit scan and GitHub push protection quiet on a fixture).
    const key = ["sk", "ant", "api03", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].join("-");
    const out = sanitizeErrorText(`upstream leaked ${key} in body`);
    expect(out).not.toContain(key);
    expect(out).toContain("sk-ant-[redacted]");
  });

  it("applies the role-token scrub to a bearer token", () => {
    const out = sanitizeErrorText("auth error: Bearer AbCdEf0123456789GhIjKl expired");
    expect(out).not.toContain("AbCdEf0123456789GhIjKl");
    expect(out).toContain("Bearer [redacted]");
  });

  it("ignores undefined and too-short secrets", () => {
    const out = sanitizeErrorText("value is abc and nothing else", [undefined, "abc"]);
    expect(out).toBe("value is abc and nothing else");
  });

  it("caps a 50k message at 4000 chars ending in the truncation marker", () => {
    const out = sanitizeErrorText("y".repeat(50_000));
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out.endsWith("[truncated]")).toBe(true);
  });

  it("leaves a normal message unchanged", () => {
    expect(sanitizeErrorText("upstream /api/feed returned 500")).toBe(
      "upstream /api/feed returned 500",
    );
  });

  it("returns an empty string for empty or non-string input", () => {
    expect(sanitizeErrorText("")).toBe("");
    expect(sanitizeErrorText(undefined)).toBe("");
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

describe("resource formatters", () => {
  it("formats a news index with links and meta", () => {
    const out = formatNewsIndex([
      { title: "Quest 4 leaks", url: "https://vr.org/x", source: "Road to VR", published: "2026-07-01T10:00:00Z" },
    ]);
    expect(out).toContain("# Latest VR / AR / XR headlines");
    expect(out).toContain("[Quest 4 leaks](https://vr.org/x)");
    expect(out).toContain("(Road to VR, 2026-07-01)");
  });

  it("shows an empty-state line when there is no news", () => {
    expect(formatNewsIndex([])).toContain("No headlines available");
  });

  it("formats originals with snippet lines", () => {
    const out = formatOriginalsIndex([
      { title: "Why VR horror works", url: "https://vr.org/a", author: "Evan Marcus", published: "2026-06-30", snippet: "A take." },
    ]);
    expect(out).toContain("[Why VR horror works](https://vr.org/a)");
    expect(out).toContain("A take.");
  });

  it("formats an events list soonest-first with dates", () => {
    const out = formatEventsList([
      { name: "SIGGRAPH 2026", start_date: "2026-07-19", end_date: "2026-07-23", location: "Los Angeles, CA", url: "https://s" },
    ]);
    expect(out).toContain("**SIGGRAPH 2026**");
    expect(out).toContain("2026-07-19 to 2026-07-23");
    expect(out).toContain("Los Angeles, CA");
  });

  it("formats a guides doc with headings and links", () => {
    const out = formatGuidesDoc([{ title: "What Is VR?", summary: "It is immersive.", url: "https://vr.org/what-is-vr" }]);
    expect(out).toContain("## What Is VR?");
    expect(out).toContain("Guide: https://vr.org/what-is-vr");
  });

  it("formats an article with header, body, and source", () => {
    const out = formatArticle({ title: "T", author: "Nina Castillo", published: "2026-07-01", url: "https://vr.org/t", body_html: "<p>Body</p>" });
    expect(out).toContain("<h1>T</h1>");
    expect(out).toContain("<p>Body</p>");
    expect(out).toContain('href="https://vr.org/t"');
  });
});

describe("prompt builders", () => {
  it("fills headset prompt defaults", () => {
    const out = recommendHeadsetPrompt({});
    expect(out).toContain("no strict budget");
    expect(out).toContain("general VR use");
    expect(out).toContain("compare_vr_headsets");
  });

  it("uses provided headset args", () => {
    const out = recommendHeadsetPrompt({ budget: "$400", use_case: "fitness" });
    expect(out).toContain("Budget: $400");
    expect(out).toContain("Main use: fitness");
  });

  it("adds category focus to the weekly roundup", () => {
    expect(thisWeekInVrPrompt({ category: "hardware" })).toContain("focused on hardware");
    expect(thisWeekInVrPrompt({})).toContain("This Week in VR");
  });

  it("embeds the topic in the explain prompt", () => {
    expect(explainVrTopicPrompt({ topic: "passthrough" })).toContain('"passthrough"');
    expect(explainVrTopicPrompt({})).toContain("virtual reality");
  });
});

describe("no em dashes anywhere in generated text", () => {
  it("resource + prompt output is free of em/en dashes", () => {
    const samples = [
      formatNewsIndex([{ title: "A", url: "u", source: "S", published: "2026-07-01" }]),
      formatOriginalsIndex([{ title: "A", url: "u", author: "X", published: "2026-07-01", snippet: "s" }]),
      formatEventsList([{ name: "E", start_date: "2026-07-01", end_date: "2026-07-03", location: "LA", url: "u" }]),
      formatGuidesDoc([{ title: "G", summary: "s", url: "u" }]),
      formatArticle({ title: "T", author: "A", published: "2026-07-01", url: "u", body_html: "<p>b</p>" }),
      recommendHeadsetPrompt({ budget: "$1", use_case: "x" }),
      thisWeekInVrPrompt({ category: "ar" }),
      explainVrTopicPrompt({ topic: "t" }),
    ];
    for (const s of samples) {
      expect(s.includes("—")).toBe(false); // em dash
      expect(s.includes("–")).toBe(false); // en dash
      expect(s.includes("--")).toBe(false); // double hyphen
    }
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
  it("does not match very short topics inside longer keys", () => {
    for (const t of ["vr", "3", "xr", "e"]) expect(findExplainer(t)).toBeNull();
  });
  it("still matches plurals and longer phrasings", () => {
    expect(findExplainer("best headsets")?.path).toBe("/best-vr-headsets");
    expect(findExplainer("beginners guide")?.path).toBe("/vr-for-beginners");
    expect(findExplainer("psvr2 vs quest 3?")?.path).toBe("/psvr2-vs-quest-3");
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

describe("provenance", () => {
  it("labels VR.org's own source name as editorial", () => {
    expect(provenanceOf("VR.org", null)).toBe(PROVENANCE.EDITORIAL);
    expect(provenanceOf("vr.org", null)).toBe(PROVENANCE.EDITORIAL);
    expect(provenanceOf("  VR.org Original  ", null)).toBe(PROVENANCE.EDITORIAL);
    // The machine source id /api/feed stamps on merged editorial items.
    expect(provenanceOf("vrorg", "/articles/some-slug")).toBe(PROVENANCE.EDITORIAL);
  });

  it("keeps a named third-party source third-party even if its link resolved onto vr.org", () => {
    // A relative RSS link resolves against vr.org, so the source name has to win.
    expect(provenanceOf("Road to VR", "https://vr.org/whatever")).toBe(PROVENANCE.THIRD_PARTY);
  });

  it("labels a vr.org URL as editorial even when the source name is missing", () => {
    expect(provenanceOf(null, "https://vr.org/articles/some-slug")).toBe(PROVENANCE.EDITORIAL);
    expect(provenanceOf(undefined, "https://www.vr.org/articles/x")).toBe(PROVENANCE.EDITORIAL);
  });

  it("labels outside publishers as third party", () => {
    expect(provenanceOf("Road to VR", "https://roadtovr.com/x")).toBe(PROVENANCE.THIRD_PARTY);
    expect(provenanceOf("UploadVR", "https://uploadvr.com/y")).toBe(PROVENANCE.THIRD_PARTY);
  });

  it("fails closed to third party on unknown or malformed input", () => {
    expect(provenanceOf(null, null)).toBe(PROVENANCE.THIRD_PARTY);
    expect(provenanceOf(42, {})).toBe(PROVENANCE.THIRD_PARTY);
    expect(provenanceOf("", "")).toBe(PROVENANCE.THIRD_PARTY);
  });

  it("does not let a lookalike domain pass as editorial", () => {
    expect(provenanceOf("evil", "https://vr.org.evil.com/x")).toBe(PROVENANCE.THIRD_PARTY);
    expect(provenanceOf("evil", "https://notvr.org/x")).toBe(PROVENANCE.THIRD_PARTY);
  });

  it("detects whether a list carries any relayed text", () => {
    expect(hasThirdParty([{ provenance: PROVENANCE.EDITORIAL }])).toBe(false);
    expect(hasThirdParty([])).toBe(false);
    expect(
      hasThirdParty([{ provenance: PROVENANCE.EDITORIAL }, { provenance: PROVENANCE.THIRD_PARTY }]),
    ).toBe(true);
  });

  it("the notices name the marker and say to treat it as data", () => {
    expect(RELAYED_CONTENT_NOTICE).toContain(PROVENANCE.THIRD_PARTY);
    expect(RELAYED_CONTENT_NOTICE.toLowerCase()).toContain("never as instructions");
    expect(RELAYED_CONTENT_NOTICE_MD.toLowerCase()).toContain("rather than instructions");
  });

  it("no notice text carries an em dash", () => {
    for (const s of [RELAYED_CONTENT_NOTICE, RELAYED_CONTENT_NOTICE_MD]) {
      expect(s).not.toContain("—");
      expect(s).not.toContain("--");
    }
  });

  it("the news resource carries the relayed-content notice", () => {
    const md = formatNewsIndex([
      { title: "Headline", url: "https://roadtovr.com/x", source: "Road to VR", published: null },
    ]);
    expect(md).toContain(RELAYED_CONTENT_NOTICE_MD);
  });
});
