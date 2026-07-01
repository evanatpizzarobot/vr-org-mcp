#!/usr/bin/env node
/**
 * vr-org-mcp
 *
 * MCP server exposing VR.org's read-only VR / AR / XR content surface:
 * live news, original editorial, headset deals, buyer-guide explainers,
 * and top-game / top-app lists.
 *
 * Transport: stdio. Wire this server into any MCP-compatible client
 * (Claude Desktop, Claude Code, Cursor, Continue, etc.) and call the
 * registered tools by name.
 *
 * Security boundary: every tool input routes through src/security/validate
 * before an outbound request, and every output is sanitized and capped
 * (50 KB) before being returned. No keys, no writes, no payments.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  search_vr_news,
  get_vr_trending,
  list_vr_originals,
  get_vr_article,
  get_vr_events,
  get_vr_deals,
  compare_vr_headsets,
  get_top_vr_games,
  get_top_vr_apps,
  list_vr_sources,
  vr_explain,
  resource_news_latest,
  resource_originals_latest,
  resource_events_upcoming,
  resource_guides,
  resource_article,
  resource_article_list,
} from "./tools/content.js";
import {
  recommendHeadsetPrompt,
  thisWeekInVrPrompt,
  explainVrTopicPrompt,
} from "./prompts.js";
import { safeRun } from "./security/errors.js";
import { sanitizeValue, sanitizeString } from "./security/sanitize.js";
import { enforceResponseCap, MAX_RESPONSE_BYTES } from "./security/limits.js";
import { PACKAGE_VERSION } from "./config.js";

const server = new McpServer({
  name: "vr-org-mcp",
  version: PACKAGE_VERSION,
});

/**
 * Every tool here is read-only and depends on VR.org's live API, so all
 * three Anthropic Connectors Directory annotations apply: readOnlyHint
 * true, destructiveHint false, openWorldHint true (results come from an
 * external system).
 */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

function wrapTool<T extends Record<string, unknown>>(
  handler: (args: T) => Promise<unknown>,
) {
  return async (args: T) => {
    const raw = await safeRun(async () => handler(args));
    const sanitized = sanitizeValue(raw);
    const serialized = enforceResponseCap(sanitized, MAX_RESPONSE_BYTES);
    return { content: [{ type: "text" as const, text: serialized }] };
  };
}

const CATEGORY_DESC =
  "Optional category filter: hardware, gaming, software, enterprise, ar, or xr. Omit for all categories.";

server.registerTool(
  "search_vr_news",
  {
    title: "Search VR / AR / XR news",
    description:
      "Returns the latest VR, AR, and XR headlines from VR.org's live aggregated feed (8 VR-native sources plus filtered general tech). Optionally filter by category and match a keyword in the title or snippet.",
    inputSchema: {
      query: z.string().optional().describe("Optional keyword to match in the title or snippet."),
      category: z.string().optional().describe(CATEGORY_DESC),
      limit: z.number().optional().describe("Max results, 1-50 (default 20)."),
    },
    annotations: { ...READ_ONLY, title: "Search VR / AR / XR news" },
  },
  wrapTool((args) => search_vr_news(args)),
);

server.registerTool(
  "get_vr_trending",
  {
    title: "Get trending VR topics",
    description:
      "Returns the topics currently trending across VR.org's aggregated VR / AR / XR feed.",
    inputSchema: {},
    annotations: { ...READ_ONLY, title: "Get trending VR topics" },
  },
  wrapTool(() => get_vr_trending()),
);

server.registerTool(
  "list_vr_originals",
  {
    title: "List VR.org original articles",
    description:
      "Returns summaries of VR.org's own editorial articles (original reporting, opinion, retrospectives, and guides), newest first. Optionally filter by category.",
    inputSchema: {
      category: z.string().optional().describe(CATEGORY_DESC),
      limit: z.number().optional().describe("Max results, 1-50 (default 15)."),
    },
    annotations: { ...READ_ONLY, title: "List VR.org original articles" },
  },
  wrapTool((args) => list_vr_originals(args)),
);

server.registerTool(
  "get_vr_article",
  {
    title: "Get a VR.org article by slug",
    description:
      "Returns the full content of a single VR.org original article by its slug: metadata (title, author, date, category, tags, snippet), the canonical URL, and the article body HTML.",
    inputSchema: {
      slug: z.string().describe("The article slug, e.g. 'why-vr-is-the-perfect-horror-machine'."),
    },
    annotations: { ...READ_ONLY, title: "Get a VR.org article by slug" },
  },
  wrapTool((args) => get_vr_article(args)),
);

server.registerTool(
  "get_vr_events",
  {
    title: "Get upcoming VR / AR / XR events",
    description:
      "Returns upcoming VR, AR, and XR industry events (conferences, expos, launches) from VR.org's events calendar, soonest first. Set include_past to also include events that have already ended.",
    inputSchema: {
      limit: z.number().optional().describe("Max results, 1-50 (default 10)."),
      include_past: z
        .boolean()
        .optional()
        .describe("Include events that have already ended (default false)."),
    },
    annotations: { ...READ_ONLY, title: "Get upcoming VR / AR / XR events" },
  },
  wrapTool((args) => get_vr_events(args)),
);

server.registerTool(
  "get_vr_deals",
  {
    title: "Get VR product deals and prices",
    description:
      "Returns VR.org's current curated product picks (headsets, accessories, AR glasses) with prices, badges, and retailer links. Optionally filter to one section.",
    inputSchema: {
      section: z.string().optional().describe("Optional section filter, e.g. 'headsets'."),
    },
    annotations: { ...READ_ONLY, title: "Get VR product deals and prices" },
  },
  wrapTool((args) => get_vr_deals(args)),
);

server.registerTool(
  "compare_vr_headsets",
  {
    title: "Compare two VR headsets",
    description:
      "Returns a side-by-side of two headsets (price, badge, description, retailer links) drawn from VR.org's curated catalog. Accepts partial names like 'Quest 3' or 'PSVR2'.",
    inputSchema: {
      a: z.string().describe("First headset name (partial match allowed)."),
      b: z.string().describe("Second headset name (partial match allowed)."),
    },
    annotations: { ...READ_ONLY, title: "Compare two VR headsets" },
  },
  wrapTool((args) => compare_vr_headsets(args)),
);

server.registerTool(
  "get_top_vr_games",
  {
    title: "Get the top VR games list",
    description: "Returns VR.org's current ranked list of the top VR games.",
    inputSchema: {},
    annotations: { ...READ_ONLY, title: "Get the top VR games list" },
  },
  wrapTool(() => get_top_vr_games()),
);

server.registerTool(
  "get_top_vr_apps",
  {
    title: "Get the top VR apps list",
    description:
      "Returns VR.org's current ranked list of the top VR apps and utilities.",
    inputSchema: {},
    annotations: { ...READ_ONLY, title: "Get the top VR apps list" },
  },
  wrapTool(() => get_top_vr_apps()),
);

server.registerTool(
  "list_vr_sources",
  {
    title: "List VR.org news sources",
    description:
      "Returns the news sources VR.org aggregates, with per-source article counts and status, plus aggregate totals.",
    inputSchema: {},
    annotations: { ...READ_ONLY, title: "List VR.org news sources" },
  },
  wrapTool(() => list_vr_sources()),
);

server.registerTool(
  "vr_explain",
  {
    title: "Explain a VR / AR / XR topic",
    description:
      "Returns a canonical VR.org answer and the authoritative pillar-page link for a common VR / AR / XR question (for example 'what is vr', 'best headset', 'ar glasses', 'vr for beginners').",
    inputSchema: {
      topic: z.string().describe("The topic or question, e.g. 'what is vr' or 'best vr headset'."),
    },
    annotations: { ...READ_ONLY, title: "Explain a VR / AR / XR topic" },
  },
  wrapTool((args) => vr_explain(args)),
);

/**
 * Resources: browsable VR.org content an MCP host can attach as context. Text is
 * sanitized and capped like tool output. Read failures degrade to a short notice
 * rather than throwing at the client.
 */
function resourceResult(uri: string, mimeType: string, raw: string) {
  return { contents: [{ uri, mimeType, text: sanitizeString(raw, MAX_RESPONSE_BYTES) }] };
}

function readStatic(mimeType: string, loader: () => Promise<string> | string) {
  return async (uri: URL) => {
    try {
      return resourceResult(uri.href, mimeType, await loader());
    } catch {
      return resourceResult(uri.href, "text/plain", "VR.org resource is temporarily unavailable. Retry shortly.");
    }
  };
}

server.registerResource(
  "vr-news-latest",
  "vrorg://news/latest",
  {
    title: "Latest VR / AR / XR headlines",
    description: "Live aggregated VR, AR, and XR headlines from VR.org, as a markdown list.",
    mimeType: "text/markdown",
  },
  readStatic("text/markdown", resource_news_latest),
);

server.registerResource(
  "vr-originals-latest",
  "vrorg://originals/latest",
  {
    title: "Latest VR.org original articles",
    description: "Index of VR.org's newest original articles with links and snippets.",
    mimeType: "text/markdown",
  },
  readStatic("text/markdown", resource_originals_latest),
);

server.registerResource(
  "vr-events-upcoming",
  "vrorg://events/upcoming",
  {
    title: "Upcoming VR / AR / XR events",
    description: "VR.org's calendar of upcoming VR, AR, and XR industry events, soonest first.",
    mimeType: "text/markdown",
  },
  readStatic("text/markdown", resource_events_upcoming),
);

server.registerResource(
  "vr-guides",
  "vrorg://guides",
  {
    title: "VR.org guides: canonical answers",
    description: "VR.org's short authoritative answers to common VR / AR / XR questions, with guide links.",
    mimeType: "text/markdown",
  },
  readStatic("text/markdown", async () => resource_guides()),
);

server.registerResource(
  "vr-article",
  new ResourceTemplate("vrorg://article/{slug}", {
    list: async () => {
      try {
        const items = await resource_article_list();
        return {
          resources: items.map((it) => ({
            uri: `vrorg://article/${it.slug}`,
            name: it.slug,
            title: it.title ?? it.slug,
            mimeType: "text/html",
          })),
        };
      } catch {
        return { resources: [] };
      }
    },
  }),
  {
    title: "VR.org article (full text)",
    description: "Full HTML body of any VR.org original article, addressed by its slug.",
    mimeType: "text/html",
  },
  async (uri, variables) => {
    const slugVar = variables.slug;
    const slug = Array.isArray(slugVar) ? slugVar[0] ?? "" : String(slugVar ?? "");
    try {
      return resourceResult(uri.href, "text/html", await resource_article(slug));
    } catch {
      return resourceResult(uri.href, "text/plain", "VR.org article is temporarily unavailable. Retry shortly.");
    }
  },
);

/**
 * Prompts: reusable templates a user can invoke that steer the model to answer
 * using the tools and resources above.
 */
server.registerPrompt(
  "recommend_a_headset",
  {
    title: "Recommend a VR headset",
    description: "Recommend a headset from VR.org's current picks, grounded in live deals and the buyer guide.",
    argsSchema: {
      budget: z.string().optional().describe("Your budget, e.g. '$400' or 'under $1000'."),
      use_case: z.string().optional().describe("Main use, e.g. 'PC VR gaming', 'fitness', 'movies'."),
    },
  },
  ({ budget, use_case }) => ({
    messages: [{ role: "user", content: { type: "text", text: recommendHeadsetPrompt({ budget, use_case }) } }],
  }),
);

server.registerPrompt(
  "this_week_in_vr",
  {
    title: "This Week in VR",
    description: "Draft a concise weekly VR / AR / XR roundup from VR.org's news and originals.",
    argsSchema: { category: z.string().optional().describe(CATEGORY_DESC) },
  },
  ({ category }) => ({
    messages: [{ role: "user", content: { type: "text", text: thisWeekInVrPrompt({ category }) } }],
  }),
);

server.registerPrompt(
  "explain_vr_topic",
  {
    title: "Explain a VR / AR / XR topic",
    description: "Explain a VR topic for a newcomer, grounded in VR.org's canonical answer and pillar page.",
    argsSchema: { topic: z.string().describe("The topic, e.g. 'what is vr' or 'passthrough'.") },
  },
  ({ topic }) => ({
    messages: [{ role: "user", content: { type: "text", text: explainVrTopicPrompt({ topic }) } }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Once connected the SDK owns stdin/stdout; never log to stdout.
  console.error(`[vr-org-mcp] v${PACKAGE_VERSION} ready on stdio`);
}

main().catch((err) => {
  console.error("[vr-org-mcp] fatal:", err);
  process.exit(1);
});
