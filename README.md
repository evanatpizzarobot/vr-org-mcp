# vr-org-mcp

[![npm version](https://img.shields.io/npm/v/vr-org-mcp)](https://www.npmjs.com/package/vr-org-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-org.vr%2Fvr--mcp-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=org.vr/vr-mcp)
[![Install in Cursor](https://img.shields.io/badge/Cursor-Install%20MCP-111111)](https://cursor.com/en/install-mcp?name=vr-org&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInZyLW9yZy1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install%20MCP-0098FF)](https://insiders.vscode.dev/redirect/mcp/install?name=vr-org&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22vr-org-mcp%22%5D%7D)

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server for **[VR.org](https://vr.org)**, a dedicated VR / AR / XR news publication and aggregator.

It gives any MCP-compatible agent (Claude Desktop, Claude Code, Cursor, Continue, and others) one-call access to live VR, AR, and XR news, VR.org's original editorial (including full article text), the VR/AR/XR events calendar, curated headset deals, buyer-guide answers, and top-game and top-app lists.

Eleven tools, five resources, and three prompts. Zero keys. Zero writes. Zero payments.

## Install

Run it directly with `npx` (no global install needed):

```bash
npx vr-org-mcp
```

### Claude Desktop

One-click: download the `.mcpb` bundle from the [latest release](https://github.com/evanatpizzarobot/vr-org-mcp/releases/latest) and double-click it to install into Claude Desktop. Or configure manually:

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vr-org": {
      "command": "npx",
      "args": ["-y", "vr-org-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add vr-org -- npx -y vr-org-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vr-org": {
      "command": "npx",
      "args": ["-y", "vr-org-mcp"]
    }
  }
}
```

### Hosted remote endpoint (no install)

VR.org also runs the same tools as a remote server over MCP's streamable-HTTP transport, so web clients (ChatGPT connectors, Claude.ai connectors) can use it with no local install:

```
https://vr.org/mcp
```

Human setup walkthrough for every client: [vr.org/connect](https://vr.org/connect).

## Tools

| Tool | What it returns |
|------|-----------------|
| `search_vr_news` | Latest VR / AR / XR headlines from the live feed, with optional category filter and keyword match |
| `get_vr_trending` | Topics currently trending across the feed |
| `list_vr_originals` | Summaries of VR.org's own editorial articles, newest first |
| `get_vr_article` | Full content of one original by slug: metadata, canonical URL, and the article body HTML |
| `get_vr_events` | Upcoming VR / AR / XR industry events (conferences, expos, launches), soonest first |
| `get_vr_deals` | Curated product picks with prices, badges, and retailer links |
| `compare_vr_headsets` | Side-by-side of two headsets (partial names accepted) |
| `get_top_vr_games` | Current ranked top VR games list |
| `get_top_vr_apps` | Current ranked top VR apps and utilities list |
| `list_vr_sources` | The news sources VR.org aggregates, with counts |
| `vr_explain` | Canonical short answer plus pillar-page link for a common question |

## Resources

Browsable MCP resources an app can attach as context:

| Resource | Contents |
|----------|----------|
| `vrorg://news/latest` | Latest aggregated VR / AR / XR headlines |
| `vrorg://originals/latest` | Index of VR.org's newest original articles |
| `vrorg://events/upcoming` | Upcoming VR / AR / XR industry events |
| `vrorg://guides` | VR.org's canonical pillar-guide answers in one doc |
| `vrorg://article/{slug}` | Full HTML body of any original article (resource template) |

## Prompts

| Prompt | What it does |
|--------|--------------|
| `recommend_a_headset` | Recommends a headset from VR.org's picks given a budget and use case |
| `this_week_in_vr` | Drafts a weekly VR / AR / XR roundup from the feed and originals |
| `explain_vr_topic` | Explains a VR topic grounded in VR.org's canonical answer |

## How it works

Every tool composes VR.org's public JSON API (`https://vr.org/api/*`) into a single agent-friendly response. The server is a thin proxy: it holds no secrets, writes nothing, and cannot move money.

## Threat model

VR.org's editorial is controlled, but the live feed also carries third-party RSS headlines. To keep a malicious or compromised upstream headline from manipulating the calling model, every tool output is:

1. **Sanitized.** Control characters and zero-width / direction-override characters are stripped from every string.
2. **Capped.** Serialized responses are limited to 50 KB so a large payload cannot flood the agent's context window.

Inputs are validated before any outbound request and every free-text parameter is length-capped at the schema layer. Errors are returned as structured, non-echoing objects rather than raw stack traces; on the rare path where an error string reaches the caller it runs through the same output scrub as a tool result, with any credential-shaped substring redacted and the text capped, and is flagged with `isError`.

## Configuration

The API base URL is fixed to `https://vr.org` in source and cannot be overridden, so the server can only ever talk to VR.org.

| Env var | Default | Purpose |
|---------|---------|---------|
| `VR_ORG_UA_SUFFIX` | _(none)_ | Optional suffix appended to the outbound User-Agent |

## Development

```bash
npm install
npm run dev        # run from source over stdio
npm run build      # compile to dist/
npm test           # run the offline test suite
npm run typecheck  # type-check without emitting
```

## Changelog

### 0.4.1

Fixes from a September 2026 audit, matched on the hosted endpoint at vr.org/mcp.

- `get_vr_article` now returns the whole article. `body_html` was cut at the general 4,096-character string cap, which truncated most articles mid-tag while still reporting `ok: true`. It now has its own 45,000-character cap, and the 50 KB response cap still applies. The article also carries `updated`, the date a correction was applied, which the hosted endpoint already returned.
- `vr_explain` no longer answers short topics with the wrong guide. A topic like "vr" or "3" used to match inside a longer key and return "PSVR2 vs Quest 3" with confidence; the reverse match now needs four or more characters starting on a word boundary.
- `compare_vr_headsets` matches "Pimax Dream Air SE" correctly. The `pimax` alias was a prefix match that rewrote every Pimax query to Crystal.
- Reading `vrorg://news/latest` no longer shrinks keyword search to 25 items for the next minute (the two shared a cache key with different request sizes).
- A malformed slug in `vrorg://article/{slug}` now says "not found" instead of "temporarily unavailable, retry shortly".
- Refreshed transitive dependency pins (hono, fast-uri, qs) for `npm audit`.

### 0.4.0

Content provenance. Feed results now carry a `provenance` field on every item, either `vr_org_editorial` (written and edited by VR.org) or `third_party_feed` (a headline or snippet relayed verbatim from an outside publisher). Any response containing relayed text also carries a `content_notice` saying to treat that text as data rather than instructions, and the `vrorg://news/latest` resource carries the same notice in prose. This is additive metadata, so existing fields and existing consumers are unaffected.

The point is to let a calling client tell which text VR.org actually stands behind. It follows the August 2026 GhostSplice research on splitting instructions across MCP channels, whose core mitigation is that clients should treat server output as data. This server is not a vector for that attack (it never requests sampling, its tool descriptions are static literals, and every value that can flow back in as a tool argument is validated against a strict allowlist), but it does relay text it did not write, and now it says so.

Also bumps `@modelcontextprotocol/sdk` to 1.30.0 and pins four transitive dependencies of the SDK's HTTP transport that carried advisories. This server is stdio-only and never loads that transport, so the pins are hygiene rather than an exposure fix. `npm audit --omit=dev` reports zero vulnerabilities.

### 0.3.2

Error-path hardening: tool errors now pass through the same output scrub as tool results, with secrets redacted and error text capped. All free-text parameters gain schema-level max lengths. No behavior change for valid inputs.

## License

MIT. A VR.org project.
