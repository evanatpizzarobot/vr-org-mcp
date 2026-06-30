/**
 * VR.org content tools. Every tool is read-only and composes VR.org's public
 * JSON API (https://vr.org/api/*) into a single agent-friendly call. No keys,
 * no writes, no payments.
 */

import { BASE_URL, absoluteUrl } from "../config.js";
import { cached, fetchJson, rateLimit, TTL } from "../http/client.js";
import {
  clampLimit,
  optionalCategory,
  optionalString,
  requireSlug,
  requireString,
} from "../security/validate.js";
import { EXPLAINERS, findExplainer } from "../explainers.js";
import { matchHeadset } from "../match.js";

const HOMEPAGE = "https://vr.org";

interface RawArticle {
  id?: string;
  source?: string;
  sourceName?: string;
  title?: string;
  snippet?: string;
  link?: string;
  slug?: string;
  author?: string;
  authorRole?: string;
  pubDate?: string;
  publishDate?: string;
  category?: string;
  tags?: string[];
}

function mapFeedArticle(a: RawArticle) {
  return {
    title: a.title ?? null,
    source: a.sourceName ?? a.source ?? null,
    url: absoluteUrl(a.link),
    author: a.author ?? null,
    published: a.pubDate ?? null,
    category: a.category ?? null,
    tags: Array.isArray(a.tags) ? a.tags : [],
    snippet: a.snippet ?? null,
  };
}

function mapOriginal(a: RawArticle) {
  const slug = a.slug ?? a.id ?? "";
  return {
    title: a.title ?? null,
    slug,
    url: slug ? `${BASE_URL}/articles/${slug}` : null,
    author: a.author ?? null,
    authorRole: a.authorRole ?? null,
    published: a.publishDate ?? a.pubDate ?? null,
    category: a.category ?? null,
    tags: Array.isArray(a.tags) ? a.tags : [],
    snippet: a.snippet ?? null,
  };
}

/** search_vr_news: live VR/AR/XR headlines, optionally filtered + text-matched. */
export async function search_vr_news(args: {
  query?: unknown;
  category?: unknown;
  limit?: unknown;
}) {
  const query = optionalString(args.query, "query", 200);
  const category = optionalCategory(args.category);
  const limit = clampLimit(args.limit, 20, 50);
  await rateLimit("search_vr_news");

  const data = (await cached(`feed:${category ?? "all"}`, TTL.FEED, () =>
    fetchJson("/api/feed", { category: category ?? "all", limit: 200 }),
  )) as { articles?: RawArticle[]; meta?: { lastUpdated?: string } };

  let articles = Array.isArray(data?.articles) ? data.articles : [];
  if (query) {
    const q = query.toLowerCase();
    articles = articles.filter((a) =>
      `${a.title ?? ""} ${a.snippet ?? ""}`.toLowerCase().includes(q),
    );
  }

  const items = articles.slice(0, limit).map(mapFeedArticle);
  return {
    ok: true as const,
    query: query ?? null,
    category: category ?? "all",
    count: items.length,
    last_updated: data?.meta?.lastUpdated ?? null,
    articles: items,
    source: HOMEPAGE,
  };
}

/** get_vr_trending: trending VR/AR/XR topics across the feed. */
export async function get_vr_trending() {
  await rateLimit("get_vr_trending");
  const data = (await cached("trending", TTL.TRENDING, () =>
    fetchJson("/api/trending"),
  )) as { topics?: unknown[]; updatedAt?: string };
  return {
    ok: true as const,
    updated_at: data?.updatedAt ?? null,
    topics: Array.isArray(data?.topics) ? data.topics : [],
    source: HOMEPAGE,
  };
}

/** list_vr_originals: VR.org's own editorial articles (summaries). */
export async function list_vr_originals(args: { category?: unknown; limit?: unknown }) {
  const category = optionalCategory(args.category);
  const limit = clampLimit(args.limit, 15, 50);
  await rateLimit("list_vr_originals");

  const data = (await cached(`originals:${category ?? "all"}`, TTL.ARTICLES, () =>
    fetchJson("/api/articles", { category }),
  )) as { articles?: RawArticle[] };

  const all = Array.isArray(data?.articles) ? data.articles : [];
  const items = all.slice(0, limit).map(mapOriginal);
  return {
    ok: true as const,
    category: category ?? "all",
    count: items.length,
    total: all.length,
    articles: items,
    source: HOMEPAGE,
  };
}

/** get_vr_article: metadata + canonical URL for one VR.org original by slug. */
export async function get_vr_article(args: { slug?: unknown }) {
  const slug = requireSlug(args.slug);
  await rateLimit("get_vr_article");

  const data = (await cached("originals:all", TTL.ARTICLES, () =>
    fetchJson("/api/articles", {}),
  )) as { articles?: RawArticle[] };

  const all = Array.isArray(data?.articles) ? data.articles : [];
  const match = all.find((a) => (a.slug ?? a.id) === slug);
  if (!match) {
    return {
      ok: false as const,
      error: "article_not_found",
      slug,
      hint: "Call list_vr_originals to see available slugs.",
    };
  }
  return {
    ok: true as const,
    article: mapOriginal(match),
    note: "Full article text is published at the canonical url.",
    source: HOMEPAGE,
  };
}

interface DealItem {
  name?: string;
  price?: string;
  description?: string;
  badge?: string;
  links?: Record<string, { url?: string; label?: string }>;
}
interface DealSection {
  id?: string;
  title?: string;
  description?: string;
  items?: DealItem[];
}

function mapDealItem(it: DealItem) {
  const links = it.links
    ? Object.entries(it.links).map(([k, v]) => ({
        retailer: v?.label ?? k,
        url: v?.url ?? null,
      }))
    : [];
  return {
    name: it.name ?? null,
    price: it.price ?? null,
    badge: it.badge ?? null,
    description: it.description ?? null,
    links,
  };
}

/** get_vr_deals: current VR.org-curated product picks and prices. */
export async function get_vr_deals(args: { section?: unknown }) {
  const section = optionalString(args.section, "section", 60);
  await rateLimit("get_vr_deals");

  const data = (await cached("deals", TTL.DEALS, () => fetchJson("/api/deals"))) as {
    lastUpdated?: string;
    disclosure?: string;
    sections?: DealSection[];
  };

  let sections = Array.isArray(data?.sections) ? data.sections : [];
  if (section) {
    const s = section.toLowerCase();
    sections = sections.filter(
      (sec) =>
        (sec.id ?? "").toLowerCase() === s ||
        (sec.title ?? "").toLowerCase().includes(s),
    );
  }

  return {
    ok: true as const,
    last_updated: data?.lastUpdated ?? null,
    disclosure: data?.disclosure ?? null,
    sections: sections.map((sec) => ({
      id: sec.id ?? null,
      title: sec.title ?? null,
      description: sec.description ?? null,
      items: Array.isArray(sec.items) ? sec.items.map(mapDealItem) : [],
    })),
    source: `${BASE_URL}/deals`,
  };
}

/** compare_vr_headsets: side-by-side of two headsets from the deals catalog. */
export async function compare_vr_headsets(args: { a?: unknown; b?: unknown }) {
  const a = requireString(args.a, "a", 80);
  const b = requireString(args.b, "b", 80);
  await rateLimit("compare_vr_headsets");

  const data = (await cached("deals", TTL.DEALS, () => fetchJson("/api/deals"))) as {
    sections?: DealSection[];
  };
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const headsetItems = sections
    .filter((s) => (s.id ?? "").toLowerCase().includes("headset") ||
      (s.title ?? "").toLowerCase().includes("headset"))
    .flatMap((s) => (Array.isArray(s.items) ? s.items : []));
  const pool = headsetItems.length > 0 ? headsetItems : sections.flatMap((s) => s.items ?? []);

  const names = pool.map((it) => it.name ?? "");
  const idxA = matchHeadset(names, a);
  const idxB = matchHeadset(names, b);
  const hitA = idxA === null ? null : pool[idxA];
  const hitB = idxB === null ? null : pool[idxB];
  if (!hitA || !hitB) {
    return {
      ok: false as const,
      error: "headset_not_found",
      missing: [!hitA ? a : null, !hitB ? b : null].filter(Boolean),
      available: pool.map((it) => it.name).filter(Boolean),
      hint: "Use one of the available names (partial match is allowed).",
    };
  }
  return {
    ok: true as const,
    comparison: [mapDealItem(hitA), mapDealItem(hitB)],
    note: "Prices and picks are VR.org's editorial selections from /deals.",
    related_guide: `${BASE_URL}/best-vr-headsets`,
    source: `${BASE_URL}/deals`,
  };
}

async function topList(key: string) {
  const data = (await cached("top-lists", TTL.TOP_LISTS, () =>
    fetchJson("/api/top-lists"),
  )) as { lists?: Record<string, unknown> };
  const lists = (data?.lists ?? {}) as Record<string, unknown>;
  return lists[key] ?? null;
}

/** get_top_vr_games: VR.org's current top VR games list. */
export async function get_top_vr_games() {
  await rateLimit("get_top_vr_games");
  const list = await topList("top-vr-games-2026");
  return {
    ok: true as const,
    list: list ?? { title: "Top VR Games 2026", items: [] },
    guide: `${BASE_URL}/best-vr-games-2026`,
    source: HOMEPAGE,
  };
}

/** get_top_vr_apps: VR.org's current top VR apps and utilities list. */
export async function get_top_vr_apps() {
  await rateLimit("get_top_vr_apps");
  const list = await topList("top-vr-apps");
  return {
    ok: true as const,
    list: list ?? { title: "Top VR Apps & Utilities", items: [] },
    guide: `${BASE_URL}/best-vr-apps`,
    source: HOMEPAGE,
  };
}

/** list_vr_sources: the news sources VR.org aggregates, with article counts. */
export async function list_vr_sources() {
  await rateLimit("list_vr_sources");
  const data = (await cached("sources", TTL.SOURCES, () =>
    fetchJson("/api/sources"),
  )) as { sources?: Record<string, unknown>; meta?: unknown };
  const sources = data?.sources ?? {};
  return {
    ok: true as const,
    count: Object.keys(sources).length,
    sources,
    meta: data?.meta ?? null,
    source: HOMEPAGE,
  };
}

/** vr_explain: a canonical VR.org answer + pillar link for a topic. */
export async function vr_explain(args: { topic?: unknown }) {
  const topic = requireString(args.topic, "topic", 120);
  const hit = findExplainer(topic);
  if (!hit) {
    return {
      ok: false as const,
      error: "no_explainer",
      topic,
      available_topics: EXPLAINERS.map((e) => e.title),
      hint: "Try a broader topic like 'what is vr', 'best headset', or 'ar glasses'.",
    };
  }
  return {
    ok: true as const,
    topic,
    title: hit.title,
    summary: hit.summary,
    url: `${BASE_URL}${hit.path}`,
    source: HOMEPAGE,
  };
}
