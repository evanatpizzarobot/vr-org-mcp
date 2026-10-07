import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeString,
  sanitizeValue,
  sanitizeReflectedValue,
  sanitizeErrorText,
} from "../src/security/sanitize.js";
import { enforceResponseCap, MAX_RESPONSE_BYTES } from "../src/security/limits.js";
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
import { findExplainer, parseExplainers, EXPLAINERS } from "../src/explainers.js";
import { vr_explain, resource_guides, loadExplainers } from "../src/tools/content.js";
import { _resetCache } from "../src/http/client.js";
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

// The three orderings the 0.4.2 list has to get right. Each topic contains a
// shorter key that belongs to a different page, so only longest-key-wins gives
// the right answer.
const PRECEDENCE: Array<{ topic: string; want: string; not: string }> = [
  { topic: "steam frame price", want: "/steam-frame-price", not: "/steam-frame" },
  { topic: "steam frame vs quest 3", want: "/steam-frame-vs-quest-3", not: "/psvr2-vs-quest-3" },
  { topic: "best vr headset for movies", want: "/best-vr-headset-for-movies", not: "/best-vr-headsets" },
];

describe("explainers: built-in list", () => {
  it("routes the longer key ahead of the shorter one it contains", () => {
    for (const { topic, want, not } of PRECEDENCE) {
      const hit = findExplainer(topic);
      expect(hit?.path, topic).toBe(want);
      expect(hit?.path, topic).not.toBe(not);
    }
  });

  it("still sends the bare product name to its hub page", () => {
    expect(findExplainer("steam frame")?.path).toBe("/steam-frame");
    expect(findExplainer("tell me about the Steam Frame")?.path).toBe("/steam-frame");
    expect(findExplainer("best vr headset")?.path).toBe("/best-vr-headsets");
  });

  it("covers the topics that used to return no_explainer", () => {
    expect(findExplainer("meta vr glasses")?.path).toBe("/meta-vr-glasses");
    expect(findExplainer("How much is the Steam Frame?")?.path).toBe("/steam-frame-price");
    expect(findExplainer("steam frame release date")?.path).toBe("/steam-frame-release-date");
    expect(findExplainer("quest 4")?.path).toBe("/meta-quest-4");
    expect(findExplainer("best vr horror games")?.path).toBe("/best-vr-horror-games");
    expect(findExplainer("vr deals")?.path).toBe("/deals");
  });

  it("never files one key under two pages", () => {
    const owner = new Map<string, string>();
    for (const e of EXPLAINERS) {
      for (const k of e.keys) {
        expect(owner.get(k), `key "${k}"`).toBeUndefined();
        owner.set(k, e.path);
      }
    }
    expect(new Set(EXPLAINERS.map((e) => e.path)).size).toBe(EXPLAINERS.length);
  });

  it("passes the same validation a fetched list goes through", () => {
    const asFeed = { explainers: EXPLAINERS.map((e) => ({ ...e, url: `https://vr.org${e.path}` })) };
    expect(parseExplainers(asFeed)).toEqual(EXPLAINERS);
  });

  it("carries no em dash, en dash, or double hyphen", () => {
    for (const e of EXPLAINERS) {
      for (const s of [e.title, e.summary, ...e.keys]) {
        expect(/[\u2013\u2014]|--/.test(s), s).toBe(false);
      }
    }
  });
});

describe("parseExplainers", () => {
  const good = {
    keys: ["Steam Frame", "  valve frame  "],
    title: "Valve Steam Frame",
    summary: "A standalone and PC-streaming headset.",
    url: "https://vr.org/steam-frame",
    path: "/steam-frame",
  };
  const paths = (raw: unknown) => parseExplainers(raw).map((e) => e.path);

  it("reads the /api/explainers shape and lowercases and trims the keys", () => {
    expect(parseExplainers({ explainers: [good], count: 1 })).toEqual([
      {
        keys: ["steam frame", "valve frame"],
        title: "Valve Steam Frame",
        path: "/steam-frame",
        summary: "A standalone and PC-streaming headset.",
      },
    ]);
  });

  it("also reads a bare array", () => {
    expect(paths([good])).toEqual(["/steam-frame"]);
  });

  it("accepts an entry with only a url or only a path", () => {
    const { path: _path, ...urlOnly } = good;
    const { url: _url, ...pathOnly } = good;
    expect(paths([urlOnly])).toEqual(["/steam-frame"]);
    expect(paths([pathOnly])).toEqual(["/steam-frame"]);
  });

  it("takes the page from the url when url and path disagree", () => {
    expect(paths([{ ...good, url: "https://vr.org/steam-frame-price", path: "/steam-frame" }])).toEqual([
      "/steam-frame-price",
    ]);
  });

  it("drops entries whose keys are not a non-empty array of non-empty strings", () => {
    const badKeys: unknown[] = [
      undefined,
      "steam frame",
      [],
      ["steam frame", 7],
      ["steam frame", ""],
      ["steam frame", "   "],
      ["\u200B\u200B"],
      ["x".repeat(121)],
      Array.from({ length: 51 }, (_, i) => `key ${i}`),
    ];
    for (const keys of badKeys) {
      expect(parseExplainers([{ ...good, keys }]), JSON.stringify(keys)?.slice(0, 40)).toEqual([]);
    }
  });

  it("drops entries with a missing or non-string title or summary", () => {
    expect(parseExplainers([{ ...good, title: 42 }])).toEqual([]);
    expect(parseExplainers([{ ...good, title: "   " }])).toEqual([]);
    expect(parseExplainers([{ ...good, summary: null }])).toEqual([]);
    expect(parseExplainers([{ ...good, summary: "" }])).toEqual([]);
  });

  it("drops entries that do not point at https://vr.org", () => {
    const offSite = [
      "https://evil.example/steam-frame",
      "https://vr.org.evil.example/steam-frame",
      "https://vr.org@evil.example/steam-frame",
      "https://user:pass@vr.org/steam-frame",
      "https://www.vr.org/steam-frame",
      "http://vr.org/steam-frame",
      "//evil.example/steam-frame",
      "javascript:alert(1)",
      "not a url",
      `https://vr.org/${"a".repeat(600)}`,
    ];
    for (const url of offSite) {
      // A valid path alongside does not rescue an entry whose url is wrong.
      expect(parseExplainers([{ ...good, url }]), url.slice(0, 60)).toEqual([]);
    }
  });

  it("drops entries with no usable url or path", () => {
    const { url: _url, path: _path, ...neither } = good;
    expect(parseExplainers([neither])).toEqual([]);
    expect(parseExplainers([{ ...neither, path: "steam-frame" }])).toEqual([]);
    expect(parseExplainers([{ ...neither, path: "//evil.example/x" }])).toEqual([]);
    expect(parseExplainers([{ ...neither, url: 5, path: 9 }])).toEqual([]);
  });

  it("keeps the valid entries when their neighbours are bad", () => {
    const mixed = [
      null,
      "nope",
      42,
      { ...good, url: "https://evil.example/x" },
      good,
      { ...good, keys: [] },
      { ...good, keys: ["quest 4"], title: "Meta Quest 4", url: "https://vr.org/meta-quest-4" },
    ];
    expect(paths({ explainers: mixed })).toEqual(["/steam-frame", "/meta-quest-4"]);
  });

  it("returns an empty list for anything that is not a list of entries", () => {
    for (const raw of [null, undefined, "x", 42, true, {}, { explainers: "nope" }, { explainers: {} }, []]) {
      expect(parseExplainers(raw)).toEqual([]);
    }
  });

  it("strips control and zero-width characters like other upstream text", () => {
    const [e] = parseExplainers([
      {
        ...good,
        keys: ["steam\u200B frame"],
        title: "Valve\u202E Steam Frame",
        summary: "Line one.\u0007 Line two.\uFEFF",
      },
    ]);
    expect(e).toEqual({
      keys: ["steam frame"],
      title: "Valve Steam Frame",
      path: "/steam-frame",
      summary: "Line one. Line two.",
    });
  });

  it("caps an over-long summary and an over-long list", () => {
    const [long] = parseExplainers([{ ...good, summary: "y".repeat(5000) }]);
    expect(long?.summary.length).toBe(1500);
    expect(long?.summary.endsWith("...[truncated]")).toBe(true);
    const many = Array.from({ length: 250 }, (_, i) => ({ ...good, keys: [`topic ${i}`] }));
    expect(parseExplainers(many)).toHaveLength(200);
  });
});

/** A fresh JSON Response per call, since a Response body can be read only once. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(respond: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => respond());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The built-in list in the shape /api/explainers serves, with every summary
// marked so a test can tell a fetched answer from a built-in one.
const LIVE = "LIVE FEED: ";
const liveFeed = () => ({
  explainers: EXPLAINERS.map((e) => ({
    keys: e.keys,
    title: e.title,
    summary: LIVE + e.summary,
    url: `https://vr.org${e.path}`,
    path: e.path,
  })),
  count: EXPLAINERS.length,
});

describe("vr_explain and vrorg://guides: fetched list", () => {
  beforeEach(() => _resetCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("answers from /api/explainers through the shared client", async () => {
    const fetchMock = stubFetch(() => jsonResponse(liveFeed()));
    const res = await vr_explain({ topic: "steam frame" });
    expect(res).toMatchObject({
      ok: true,
      title: "Valve Steam Frame",
      url: "https://vr.org/steam-frame",
      source: "https://vr.org",
    });
    expect(res.ok && res.summary.startsWith(LIVE)).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, { method: string; headers: Record<string, string> }];
    expect(String(url)).toBe("https://vr.org/api/explainers");
    expect(init.method).toBe("GET");
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers["User-Agent"]).toContain("vr-org-mcp/");
  });

  it("keeps key precedence on the fetched list", async () => {
    stubFetch(() => jsonResponse(liveFeed()));
    for (const { topic, want, not } of PRECEDENCE) {
      const res = await vr_explain({ topic });
      expect(res.ok && res.url, topic).toBe(`https://vr.org${want}`);
      expect(res.ok && res.url, topic).not.toBe(`https://vr.org${not}`);
      expect(res.ok && res.summary.startsWith(LIVE), topic).toBe(true);
    }
  });

  it("caches the list for ten minutes, then fetches again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const fetchMock = stubFetch(() => jsonResponse(liveFeed()));
    await vr_explain({ topic: "steam frame" });
    await vr_explain({ topic: "meta vr glasses" });
    await resource_guides();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-07T12:09:59Z"));
    await vr_explain({ topic: "steam frame" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-07T12:10:01Z"));
    await vr_explain({ topic: "steam frame" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves a page the site added after this package was released", async () => {
    const feed = liveFeed();
    feed.explainers.push({
      keys: ["pico space pro"],
      title: "Pico Space Pro",
      summary: "A page that exists only in the fetched list.",
      url: "https://vr.org/pico-space-pro",
      path: "/pico-space-pro",
    });
    stubFetch(() => jsonResponse(feed));
    expect(findExplainer("pico space pro")).toBeNull();
    expect(await vr_explain({ topic: "Pico Space Pro" })).toMatchObject({
      ok: true,
      title: "Pico Space Pro",
      url: "https://vr.org/pico-space-pro",
    });
  });

  it("uses the fetched list in place of the built-in one, not merged with it", async () => {
    stubFetch(() =>
      jsonResponse({
        explainers: [
          { keys: ["what is vr"], title: "What Is Virtual Reality?", summary: "Fetched.", url: "https://vr.org/what-is-vr" },
        ],
      }),
    );
    const res = await vr_explain({ topic: "steam frame" });
    expect(res).toMatchObject({ ok: false, error: "no_explainer", topic: "steam frame" });
    expect(!res.ok && res.available_topics).toEqual(["What Is Virtual Reality?"]);
    expect(!res.ok && res.hint).toContain("'steam frame'");
    expect(!res.ok && res.hint).not.toContain("passthrough");
  });

  it("drops invalid fetched entries and still answers from the valid ones", async () => {
    stubFetch(() =>
      jsonResponse({
        explainers: [
          { keys: ["steam frame"], title: "Spoofed", summary: "Off site.", url: "https://evil.example/steam-frame" },
          { keys: [""], title: "Catch all", summary: "Empty key.", url: "https://vr.org/catch-all" },
          { keys: ["Quest 4"], title: "Meta Quest 4", summary: "Fetched.", url: "https://vr.org/meta-quest-4" },
        ],
      }),
    );
    expect(await vr_explain({ topic: "quest 4" })).toMatchObject({ ok: true, url: "https://vr.org/meta-quest-4" });
    expect(await vr_explain({ topic: "steam frame" })).toMatchObject({ ok: false, error: "no_explainer" });
  });

  it("builds the guides resource from the fetched list", async () => {
    stubFetch(() => jsonResponse(liveFeed()));
    const doc = await resource_guides();
    expect(doc).toContain("# VR.org guides: canonical answers");
    expect(doc).toContain("## Steam Frame Price");
    expect(doc).toContain(`${LIVE}The Steam Frame costs $1,059`);
    expect(doc).toContain("Guide: https://vr.org/meta-vr-glasses");
    expect(doc.match(/^## /gm)).toHaveLength(EXPLAINERS.length);
  });
});

describe("vr_explain and vrorg://guides: fallback to the built-in list", () => {
  beforeEach(() => _resetCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const failures: Array<[string, () => Response | Promise<Response>]> = [
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a timeout", () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))],
    ["an HTTP 500", () => jsonResponse({ error: "boom" }, 500)],
    ["an HTTP 404", () => jsonResponse({ error: "not found" }, 404)],
    ["a body that is not JSON", () => new Response("<html>502 Bad Gateway</html>", { status: 200 })],
    ["an empty list", () => jsonResponse({ explainers: [], count: 0 })],
    ["a JSON body of the wrong shape", () => jsonResponse({ ok: true })],
    [
      "a list with no valid entry",
      () =>
        jsonResponse({
          explainers: [
            { keys: ["steam frame"], title: "Spoofed", summary: "Off site.", url: "https://evil.example/x" },
            { keys: [], title: "No keys", summary: "Nothing to match.", url: "https://vr.org/x" },
          ],
        }),
    ],
  ];

  for (const [name, respond] of failures) {
    it(`answers from the built-in list on ${name}`, async () => {
      const fetchMock = stubFetch(respond);
      const builtIn = findExplainer("steam frame price");
      await expect(vr_explain({ topic: "steam frame price" })).resolves.toEqual({
        ok: true,
        topic: "steam frame price",
        title: "Steam Frame Price",
        summary: builtIn?.summary,
        url: "https://vr.org/steam-frame-price",
        source: "https://vr.org",
      });
      expect(await loadExplainers()).toBe(EXPLAINERS);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  it("keeps key precedence on the built-in list when the fetch fails", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    for (const { topic, want } of PRECEDENCE) {
      const res = await vr_explain({ topic });
      expect(res.ok && res.url, topic).toBe(`https://vr.org${want}`);
    }
  });

  it("still reports no_explainer, with the built-in topics, for an unknown topic", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    const res = await vr_explain({ topic: "how to bake bread" });
    expect(res).toMatchObject({ ok: false, error: "no_explainer" });
    expect(!res.ok && res.available_topics).toEqual(EXPLAINERS.map((e) => e.title));
    expect(!res.ok && res.hint).toContain("'steam frame'");
  });

  it("remembers a failed fetch for a minute, then tries again and recovers", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    let up = false;
    const fetchMock = stubFetch(() => (up ? jsonResponse(liveFeed()) : jsonResponse({}, 503)));

    for (let i = 0; i < 5; i++) await vr_explain({ topic: "steam frame" });
    await resource_guides();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    up = true;
    vi.setSystemTime(new Date("2026-10-07T12:00:59Z"));
    const stillDown = await vr_explain({ topic: "steam frame" });
    expect(stillDown.ok && stillDown.summary.startsWith(LIVE)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-07T12:01:01Z"));
    const recovered = await vr_explain({ topic: "steam frame" });
    expect(recovered.ok && recovered.summary.startsWith(LIVE)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("builds the guides resource from the built-in list, whole and under the size cap", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    const doc = await resource_guides();
    expect(doc.match(/^## /gm)).toHaveLength(EXPLAINERS.length);
    expect(doc).toContain("## Valve Steam Frame");
    expect(doc).toContain("Guide: https://vr.org/steam-frame-price");
    expect(doc).not.toContain(LIVE);
    expect(doc.length).toBeLessThan(MAX_RESPONSE_BYTES);
    expect(/[\u2013\u2014]|--/.test(doc)).toBe(false);
  });

  it("still rejects a bad topic as invalid input before any fetch", async () => {
    const fetchMock = stubFetch(() => jsonResponse(liveFeed()));
    await expect(vr_explain({ topic: "   " })).rejects.toBeInstanceOf(ValidationError);
    await expect(vr_explain({ topic: "x".repeat(121) })).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
