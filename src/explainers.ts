/**
 * Short answers for vr_explain and the vrorg://guides resource: one entry per
 * VR.org pillar page, with the keys that route a topic to it.
 *
 * The live list comes from https://vr.org/api/explainers (see loadExplainers in
 * src/tools/content.ts), so a pillar-page refresh on the site reaches agents
 * without a package release. This file holds the pure parts: the entry shape,
 * the validator for a fetched list, the matcher, and the built-in list that
 * answers when the fetch fails or returns nothing usable.
 */

import { BASE_URL } from "./config.js";
import { sanitizeString } from "./security/sanitize.js";

export interface Explainer {
  keys: string[];
  title: string;
  path: string;
  summary: string;
}

/**
 * Built-in fallback. A copy of the site's data/mcp-explainers.json as of
 * 2026-10-07 (34 entries), so an offline server still gives current answers.
 * Refresh it from that file on each release rather than editing it by hand.
 */
export const EXPLAINERS: Explainer[] = [
  {
    keys: ["what is vr", "virtual reality", "vr basics", "vr meaning"],
    title: "What Is Virtual Reality?",
    path: "/what-is-vr",
    summary:
      "Virtual reality is a computer-generated, fully immersive environment experienced through a head-mounted display that tracks your head and hands, replacing your view of the real world with a simulated one. Standalone headsets like the Meta Quest run VR with no PC.",
  },
  {
    keys: ["best headset", "which headset", "best vr headset", "what headset", "buy a headset"],
    title: "Best VR Headsets",
    path: "/best-vr-headsets",
    summary:
      "The best VR headset for most people in 2026 is the Meta Quest 3 ($599), with the $349 Quest 3S as the value pick. PC gamers with a big Steam library should look at Valve's Steam Frame (from $1,059, sold through a reservation queue). The PlayStation VR2 is the pick for PS5 owners, but new units have been out of stock in the US since mid September 2026. The Apple Vision Pro and Samsung Galaxy XR sit at the premium spatial-computing end.",
  },
  {
    keys: ["best games", "best vr games", "what to play", "top vr games", "vr games"],
    title: "Best VR Games",
    path: "/best-vr-games",
    summary:
      "VR.org's all-time top ten is Half-Life: Alyx, Beat Saber, Resident Evil 4 VR, Asgard's Wrath 2, Superhot VR, Boneworks and Bonelab, The Walking Dead: Saints and Sinners, Moss, Pavlov VR and No Man's Sky VR. A separate list tracks the best new games of 2026.",
  },
  {
    keys: ["best vr games 2026", "new vr games", "games of 2026", "best games 2026"],
    title: "Best VR Games of 2026",
    path: "/best-vr-games-2026",
    summary:
      "VR.org's running list of the best new VR games released in 2026 so far, plus the most anticipated upcoming titles.",
  },
  {
    keys: ["beginner", "beginners", "getting started", "first headset", "new to vr"],
    title: "VR for Beginners",
    path: "/vr-for-beginners",
    summary:
      "A first-time buyer should start with an affordable standalone headset (the Quest 3S is the usual pick), play comfort-friendly titles to build VR legs, and add a head strap and charging dock only once the basics feel good. No PC or console needed to begin.",
  },
  {
    keys: ["ar glasses", "smart glasses", "augmented reality glasses", "ray-ban meta", "xreal"],
    title: "Best AR Glasses",
    path: "/ar-glasses",
    summary:
      "VR.org's 2026 picks are Ray-Ban Meta Gen 3 ($449) for camera and audio, Rokid AI Glasses ($679) for an in-lens display, and the Xreal One Pro ($599) for a big virtual screen. Meta Ray-Ban Display ($799) adds a display to the Ray-Ban line, and XREAL's Android XR glasses, AURA, went on preorder on October 7, 2026 from $1,279.",
  },
  {
    keys: ["best apps", "vr apps", "utilities", "productivity vr"],
    title: "Best VR Apps and Utilities",
    path: "/best-vr-apps",
    summary:
      "Beyond games, the most useful VR apps are Virtual Desktop and Steam Link for wireless PC streaming, Immersed and Bigscreen for workspaces and cinema, VRChat for social VR, and Gravity Sketch and ShapesXR for 3D design.",
  },
  {
    keys: ["fitness", "workout", "exercise", "vr fitness", "supernatural", "fitxr"],
    title: "Best VR Fitness Apps",
    path: "/best-vr-fitness",
    summary:
      "FitXR is VR.org's lead pick for structured, instructor-led workouts, with Les Mills Bodycombat, Beat Saber and The Thrill of the Fight 2 for cardio. Supernatural's current app shuts down on December 3, 2026 ahead of a relaunch under the independent Supernatural Health, so do not start a new annual subscription on the old app.",
  },
  {
    keys: ["horror", "scary vr", "scary games", "halloween"],
    title: "Best VR Horror Games",
    path: "/best-vr-horror-games",
    summary:
      "VR.org's best VR horror games of 2026, sorted by headset: fourteen picks for Quest, PS VR2, PC VR and Steam Frame, with official store links and prices.",
  },
  {
    keys: ["mixed reality games", "mr games"],
    title: "Best Mixed Reality Games",
    path: "/best-mixed-reality-games",
    summary:
      "The best mixed reality games of 2026 for Quest 3 and Quest 3S, the titles that use passthrough to put the game in your own room.",
  },
  {
    keys: ["quest 3 vs quest 3s", "quest 3 or 3s", "3s vs 3"],
    title: "Quest 3 vs Quest 3S",
    path: "/quest-3-vs-quest-3s",
    summary:
      "The Quest 3 has sharper pancake lenses, higher resolution, and more storage; the Quest 3S is cheaper with older Fresnel lenses but the same chip and full game compatibility. Budget buyers are well served by the 3S.",
  },
  {
    keys: ["quest 3 vs vision pro", "vision pro vs quest", "apple vision pro vs quest"],
    title: "Quest 3 vs Apple Vision Pro",
    path: "/quest-3-vs-vision-pro",
    summary:
      "The Apple Vision Pro is a far pricier spatial computer with class-leading displays aimed at productivity and media; the Meta Quest 3 is an affordable game-first standalone. They serve different buyers more than they compete.",
  },
  {
    keys: ["psvr2 vs quest 3", "psvr2 or quest", "playstation vr2 vs quest"],
    title: "PSVR2 vs Quest 3",
    path: "/psvr2-vs-quest-3",
    summary:
      "The PlayStation VR2 offers OLED HDR, eye tracking, and headset haptics but needs a PS5; the Quest 3 is a self-contained standalone with a bigger library and mixed reality. Your existing console decides this one, with one catch: new PS VR2 units have been out of stock at PlayStation Direct in the US since mid September 2026.",
  },
  {
    keys: ["steam frame vs quest 3", "quest 3 vs steam frame", "steam frame or quest 3", "steam frame vs quest"],
    title: "Steam Frame vs Quest 3",
    path: "/steam-frame-vs-quest-3",
    summary:
      "Buy the $599 Quest 3 for standalone games and mixed reality, or Valve's $1,059 Steam Frame if you own a gaming PC and live in SteamVR. The two are close on resolution; the Frame's case is its dedicated wireless link to a PC and the Steam library.",
  },
  {
    keys: ["steam frame", "valve frame", "valve headset", "valve steam frame"],
    title: "Valve Steam Frame",
    path: "/steam-frame",
    summary:
      "Valve's Steam Frame is a standalone and PC-streaming VR headset that launched on September 14, 2026 at $1,059 (256GB) and $1,299 (1TB). It is sold through a reservation queue on Steam, with purchase emails going out in waves since September 18.",
  },
  {
    keys: ["steam frame price", "steam frame cost", "how much is the steam frame", "price of the steam frame"],
    title: "Steam Frame Price",
    path: "/steam-frame-price",
    summary:
      "The Steam Frame costs $1,059 for 256GB and $1,299 for 1TB, prices Valve set on September 14, 2026. The $29 power supply is sold separately, and VR.org lists the official prices in six currencies.",
  },
  {
    keys: ["steam frame release date", "steam frame launch", "steam frame waitlist", "steam frame reservation", "when did the steam frame"],
    title: "Steam Frame Release Date",
    path: "/steam-frame-release-date",
    summary:
      "Valve launched the Steam Frame on September 14, 2026. Reservation signups for the first allocation closed on September 17 at 10 AM Pacific, and purchase emails began on September 18.",
  },
  {
    keys: ["steam frame specs", "steam frame resolution", "steam frame battery"],
    title: "Steam Frame Specs",
    path: "/steam-frame-specs",
    summary:
      "From Valve's official sheet: 2160 by 2160 LCD per eye at 72 to 144Hz, a Snapdragon 8 Gen 3 with 16GB of memory, a 21.6Wh battery, a 185 gram visor and a 60 to 70 mm IPD range.",
  },
  {
    keys: ["steam frame games", "games on steam frame"],
    title: "Steam Frame Games",
    path: "/steam-frame-games",
    summary:
      "The Steam Frame plays PC VR streamed from a gaming PC over a dedicated 6GHz link, flatscreen Steam games through Proton, and certified titles on the headset itself. Half-Life: Alyx is included with every Frame.",
  },
  {
    keys: ["great on frame", "frame verified", "steam frame verified"],
    title: "Great on Frame",
    path: "/great-on-frame",
    summary:
      "Great on Frame is Valve's certification for games that run well on the Steam Frame itself. The list passed 200 titles in October 2026, a mix of VR and flatscreen games, and VR.org tracks every one along with what the certification requires.",
  },
  {
    keys: ["meta vr glasses", "project phoenix", "vr glasses"],
    title: "Meta VR Glasses",
    path: "/meta-vr-glasses",
    summary:
      "Meta VR Glasses (formerly Project Phoenix) cost $1,299.99 and go on sale in spring 2027. They put about 100 grams on the face, with compute, battery and storage in a tethered puck, a 70 by 66 degree field of view, and no controllers in the box.",
  },
  {
    keys: ["quest 4", "meta quest 4"],
    title: "Meta Quest 4",
    path: "/meta-quest-4",
    summary:
      "Meta did not announce a Quest 4 at Connect 2026. Reports point to late 2027 at the earliest, possibly 2028, and there is no price yet. VR.org keeps every confirmed fact, report and rumor dated on one page.",
  },
  {
    keys: ["meta connect", "connect 2026"],
    title: "Meta Connect 2026",
    path: "/meta-connect-2026",
    summary:
      "At Connect 2026 Meta announced Meta VR Glasses at $1,299.99 for spring 2027, the camera-free Ray-Ban Meta Audio at $349, and Ray-Ban Meta Gen 3 at $449. There was no new Quest headset.",
  },
  {
    keys: ["upcoming vr headsets", "upcoming headsets", "upcoming headset", "new vr headsets"],
    title: "Upcoming VR Headsets",
    path: "/upcoming-vr-headsets-2026",
    summary:
      "Valve's $1,059 Steam Frame is reaching buyers, Pico's Space Pro slipped to Q4 2026, and Meta VR Glasses ($1,299.99) and Pimax's Crystal Pro ($1,399) are both due in spring 2027.",
  },
  {
    keys: ["vr release dates", "release dates", "release date", "coming out"],
    title: "VR Release Dates",
    path: "/vr-release-dates",
    summary:
      "VR.org's release tracker lists every upcoming headset, game, accessory and pair of smart glasses in one place, each marked confirmed, expected or rumored.",
  },
  {
    keys: ["pc vr headset", "pcvr", "pc vr", "steamvr headset"],
    title: "Best PC VR Headset",
    path: "/best-pc-vr-headset",
    summary:
      "The best PC VR headset for most people in 2026 is the $599 Quest 3, streaming SteamVR wirelessly, with the Bigscreen Beyond 2 and Pimax Crystal Light for enthusiasts and Valve's Steam Frame for buyers who can get through its reservation queue.",
  },
  {
    keys: ["standalone headset", "standalone vr"],
    title: "Best Standalone VR Headset",
    path: "/best-standalone-vr-headset",
    summary:
      "The best standalone VR headset in 2026 is the $599 Quest 3. The $349 Quest 3S is the best value and the $3,699 Apple Vision Pro is the premium pick.",
  },
  {
    keys: ["budget headset", "budget vr", "cheap vr", "cheapest vr"],
    title: "Best Budget VR Headset",
    path: "/best-budget-vr-headset",
    summary:
      "The best budget VR headset in 2026 is the $349 Quest 3S. VR.org ranks the cheapest ways into VR under $400.",
  },
  {
    keys: ["best vr headset for kids", "headset for kids", "vr for kids", "kids headset", "for kids", "children"],
    title: "Best VR Headset for Kids",
    path: "/best-vr-headset-for-kids",
    summary:
      "The best VR headset for kids in 2026 is the $349 Quest 3S, with parent-managed accounts and screen-time limits. Meta's minimum age is 10.",
  },
  {
    keys: ["best vr headset for movies", "headset for movies", "movies", "watching movies", "virtual cinema"],
    title: "Best VR Headset for Movies",
    path: "/best-vr-headset-for-movies",
    summary:
      "The best VR headset for watching movies in 2026 is the Apple Vision Pro, with the $599 Meta Quest 3 the best value.",
  },
  {
    keys: ["best vr headset for sim racing", "headset for sim racing", "sim racing", "iracing", "racing sim"],
    title: "Best VR Headset for Sim Racing",
    path: "/best-vr-headset-for-sim-racing",
    summary:
      "For sim racing in 2026, VR.org picks the $599 Quest 3 for value, the Pimax Crystal Light for clarity and the Bigscreen Beyond 2 for comfort.",
  },
  {
    keys: ["highest resolution", "sharpest headset", "pixels per degree"],
    title: "Highest Resolution VR Headsets",
    path: "/highest-resolution-vr-headset",
    summary:
      "The highest resolution VR headsets you can buy in 2026 are the Samsung Galaxy XR and Apple Vision Pro, both micro-OLED at roughly 4K per eye.",
  },
  {
    keys: ["vr deals", "deals", "discount"],
    title: "VR Deals",
    path: "/deals",
    summary:
      "VR.org's deals page lists current prices for headsets, AR and XR glasses, accessories, haptics and trackers, and VR-ready gaming hardware, checked weekly. The get_vr_deals tool returns the live list.",
  },
  {
    keys: ["vr events", "events", "conferences"],
    title: "VR Events Calendar",
    path: "/events",
    summary:
      "VR.org's events calendar covers upcoming VR, AR and XR conferences, expos and launches. The get_vr_events tool returns the live list.",
  },
];

/**
 * Bounds on a fetched list. Generous next to the real feed (34 entries, six
 * keys at most, summaries under 500 characters) and tight enough that a corrupt
 * or hostile response cannot flood the calling agent's context.
 */
const MAX_EXPLAINERS = 200;
const MAX_KEYS = 50;
const MAX_KEY_CHARS = 120;
const MAX_TITLE_CHARS = 120;
const MAX_SUMMARY_CHARS = 1500;
const MAX_URL_CHARS = 500;

/** A trimmed, sanitized, length-capped string, or null when there is no text. */
function cleanText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const text = sanitizeString(value, maxChars).trim();
  return text.length > 0 ? text : null;
}

/**
 * Keys are lowercased because the matcher lowercases the topic. One bad key
 * drops the whole entry: an empty key would be "contained" in every topic and
 * hijack every answer.
 */
function cleanKeys(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_KEYS) return null;
  const keys: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return null;
    const key = sanitizeString(raw, Number.MAX_SAFE_INTEGER).trim().toLowerCase();
    if (key.length === 0 || key.length > MAX_KEY_CHARS) return null;
    keys.push(key);
  }
  return keys;
}

/**
 * The page an entry points at, as a path on vr.org. A `url` has to parse and
 * sit on https://vr.org exactly (no other host, no http, no credentials). With
 * no url, a root-relative `path` is accepted. The answer's link is always
 * rebuilt as BASE_URL + path, so no feed entry can send a reader off the site.
 */
function vrOrgPath(url: unknown, path: unknown): string | null {
  let candidate: string;
  if (typeof url === "string" && url.length > 0) {
    candidate = url;
  } else if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) {
    candidate = BASE_URL + path;
  } else {
    return null;
  }
  if (candidate.length > MAX_URL_CHARS) return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.origin !== BASE_URL || parsed.username !== "" || parsed.password !== "") return null;
  return parsed.pathname + parsed.search + parsed.hash;
}

/**
 * Validates a fetched explainer list, either `{ explainers: [...] }` (what
 * /api/explainers returns) or a bare array. Entries that fail validation are
 * dropped one by one, so a single bad row does not cost the rest. Returns an
 * empty array when nothing usable is left, and the caller falls back to
 * EXPLAINERS.
 */
export function parseExplainers(raw: unknown): Explainer[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === "object"
      ? (raw as { explainers?: unknown }).explainers
      : null;
  if (!Array.isArray(rows)) return [];
  const out: Explainer[] = [];
  for (const row of rows.slice(0, MAX_EXPLAINERS)) {
    if (row === null || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const keys = cleanKeys(entry.keys);
    const title = cleanText(entry.title, MAX_TITLE_CHARS);
    const summary = cleanText(entry.summary, MAX_SUMMARY_CHARS);
    const path = vrOrgPath(entry.url, entry.path);
    if (!keys || !title || !summary || !path) continue;
    out.push({ keys, title, path, summary });
  }
  return out;
}

// True when `needle` occurs in `hay` starting at a word boundary.
function startsAtWord(hay: string, needle: string): boolean {
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(hay[i - 1] ?? "")) return true;
  }
  return false;
}

/**
 * A key found inside the topic wins, longest key first, which is why
 * "steam frame price" lands on the price page and not the Steam Frame hub. The
 * reverse (topic found inside a key) is a weak fallback that needs 4+ chars
 * starting on a word boundary, so "vr" or "3" do not land confidently on
 * "PSVR2 vs Quest 3". Kept identical to the remote endpoint's
 * findExplainerMatch.
 */
export function findExplainer(topic: string, list: Explainer[] = EXPLAINERS): Explainer | null {
  const q = topic.toLowerCase();
  let best: { e: Explainer; score: number } | null = null;
  for (const e of list) {
    for (const k of e.keys) {
      let score = 0;
      if (q.includes(k)) score = 1000 + k.length;
      else if (q.length >= 4 && startsAtWord(k, q)) score = 1;
      if (score > 0 && (!best || score > best.score)) best = { e, score };
    }
  }
  return best ? best.e : null;
}
